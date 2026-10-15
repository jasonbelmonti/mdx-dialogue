import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import {
  graphDialogueSchema,
  graphInputSchema,
  type GraphInput,
} from '../../shared/graph/schema.js';
import { GraphStore } from '../graph/store.js';
import { snapshotStorage } from '../snapshot-storage.js';

export interface CanvasIdentity {
  sessionId: string;
  instanceId: string;
}
export interface CopilotSession {
  sessionId: string;
  send(options: { prompt: string }): Promise<string>;
}
type Instance = CanvasIdentity & {
  store: GraphStore;
  documentId: string;
  token: string;
  active: boolean;
  pendingDeliveries: number;
};

/** Each host session/instance owns one durable document and one revocable UI capability. */
export class CanvasDocuments {
  private instances = new Map<string, Instance>();
  private deliveries = new Map<string, Promise<void>>();
  constructor(
    private directory: string,
    private session: () => CopilotSession,
    private deliveryTimeoutMs = 12000,
  ) {}

  private key(identity: CanvasIdentity) {
    if (identity.sessionId !== this.session().sessionId) throw new Error('Wrong Copilot session.');
    if (!identity.instanceId || identity.instanceId.length > 200)
      throw new Error('Invalid instance.');
    return createHash('sha256')
      .update(JSON.stringify([identity.sessionId, identity.instanceId]))
      .digest('hex');
  }
  open(identity: CanvasIdentity, initial?: unknown) {
    const key = this.key(identity);
    const existing = this.instances.get(key);
    if (existing?.active) return existing;
    if ([...this.instances.values()].filter((instance) => instance.active).length >= 20)
      throw new Error('Close a Canvas before opening another.');
    if (existing) {
      existing.token = randomBytes(32).toString('hex');
      existing.active = true;
      return existing;
    }
    const storage = snapshotStorage(join(this.directory, `${key}.json`), (value) =>
      z.array(graphDialogueSchema).max(1).parse(value),
    );
    const store = new GraphStore(storage.initial, storage.save);
    const documentId = storage.initial[0]?.id ?? store.create(initial).id;
    const instance = {
      ...identity,
      store,
      documentId,
      token: randomBytes(32).toString('hex'),
      active: true,
      pendingDeliveries: 0,
    };
    this.instances.set(key, instance);
    return instance;
  }
  get(identity: CanvasIdentity) {
    const instance = this.instances.get(this.key(identity));
    if (!instance?.active) throw new Error('Open this Canvas instance first.');
    return instance;
  }
  authorize(token: string) {
    const instance = [...this.instances.values()].find(
      (value) => value.active && value.token === token,
    );
    if (!instance) throw new Error('Canvas access expired. Reopen it from Copilot.');
    return instance;
  }
  close(identity: CanvasIdentity) {
    const key = this.key(identity);
    const instance = this.instances.get(key);
    if (!instance) return;
    instance.active = false;
    this.release(key, instance);
  }
  private release(key: string, instance: Instance) {
    // A pending delivery still owns the snapshot writer; reopening must reuse it.
    if (!instance.active && instance.pendingDeliveries === 0) this.instances.delete(key);
  }
  read(identity: CanvasIdentity) {
    const { store, documentId } = this.get(identity);
    return store.read(documentId);
  }
  respond(identity: CanvasIdentity, submissionId: string, reply: unknown) {
    const { store, documentId } = this.get(identity);
    return store.complete(documentId, submissionId, reply, 'host-model');
  }
  async submit(identity: CanvasIdentity, raw: GraphInput) {
    const instance = this.get(identity);
    const input = graphInputSchema.parse(raw);
    if (input.documentId !== instance.documentId) throw new Error('Wrong Canvas document.');
    const saved = instance.store.submit(input);
    if (saved.submissions.find((s) => s.submissionId === input.submissionId)?.status === 'complete')
      return saved;
    const key = `${instance.documentId}/${input.submissionId}`;
    let delivery = this.deliveries.get(key);
    if (!delivery) {
      const instanceKey = this.key(identity);
      instance.pendingDeliveries++;
      delivery = this.send(instance, input).finally(() => {
        if (this.deliveries.get(key) === delivery) this.deliveries.delete(key);
        instance.pendingDeliveries--;
        this.release(instanceKey, instance);
      });
      this.deliveries.set(key, delivery);
    }
    await delivery;
    return instance.store.read(instance.documentId);
  }
  private async send(instance: Instance, input: GraphInput) {
    instance.store.begin(input.documentId, input.submissionId);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const delivery = this.session().send({
        prompt:
          `The user submitted an annotation in MDX Dialogue Canvas instance ${JSON.stringify(instance.instanceId)}. ` +
          `Use invoke_canvas_action for canvas mdx-dialogue, instance ${JSON.stringify(instance.instanceId)}, ` +
          `action get_document to read the saved document and selected-node annotation. ` +
          `Reply using action respond_to_graph with submissionId ${input.submissionId} and a complete reply ` +
          `(title, summary, mdx, graphs). Preserve the document's intent and apply the user's saved request. ` +
          `Use only plain Markdown and literal <FlowGraph id="view" data="GRAPH_ID" interaction="discuss" /> components. ` +
          `Graph nodes have id, label, description, kind (concept/process/decision/store); edges have id, source, target, label. ` +
          `Do not invoke Codex or create a different Canvas instance.`,
      });
      await Promise.race([
        delivery,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Copilot delivery timed out. Retry the saved request.')),
            this.deliveryTimeoutMs,
          );
        }),
      ]);
    } catch (error) {
      const sub = instance.store.submission(input.documentId, input.submissionId);
      if (sub.status === 'complete') return;
      instance.store.fail(
        input.documentId,
        input.submissionId,
        'Copilot could not receive the request. Your input is saved; retry when ready.',
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
