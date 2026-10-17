import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  digest,
  identity,
  rangeSchema,
  taskSnapshotSchema,
} from '../../shared/inspector/schema.js';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const exportSchema = z.object({
  validation: z.object({
    status: z.literal('pass'),
    valid: z.literal(true),
    coverage: z.literal('complete'),
    sourceSha256: digest,
    analysisId: digest,
    interpretationHash: digest,
    profileId: identity,
    validationHash: digest,
  }),
  graph: z.object({
    schemaVersion: z.literal('markdown-trace.document-graph.v1'),
    analysisId: digest,
    source: z.object({
      documentId: z.string().min(1).max(4096),
      sha256: digest,
      utf8Bytes: z.int(),
      utf16Length: z.int(),
    }),
    interpretationHash: digest,
    parserVersion: identity,
    coverage: z.literal('complete'),
    identifiers: z
      .array(
        z.object({
          identifier: identity,
          entityKind: identity,
          definition: z.object({ status: z.literal('resolved'), occurrenceId: identity }),
        }),
      )
      .min(1)
      .max(128),
    occurrences: z
      .array(
        z.object({
          id: identity,
          identifier: identity,
          role: z.enum(['definition', 'reference']),
          range: rangeSchema,
          fragmentId: identity,
        }),
      )
      .max(2048),
    fragments: z
      .array(
        z.object({
          id: identity,
          range: rangeSchema,
          owner: z.object({
            status: z.enum(['owned', 'unowned']),
            identifier: identity.optional(),
          }),
          structure: identity,
          requiredContext: z.array(identity).max(2048),
        }),
      )
      .max(2048),
    relationships: z
      .array(
        z.object({
          id: identity,
          kind: identity,
          source: z.object({ status: z.literal('owned'), identifier: identity }),
          target: identity,
          occurrenceId: identity,
        }),
      )
      .max(256),
  }),
});
export function uniqueIds(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate source identity in export.');
}
export function importTrace(raw: unknown, bytes: Buffer, path: string) {
  const { graph, validation } = exportSchema.parse(raw);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const hash = sha256(bytes);
  if (
    hash !== graph.source.sha256 ||
    hash !== validation.sourceSha256 ||
    bytes.length !== graph.source.utf8Bytes ||
    text.length !== graph.source.utf16Length ||
    graph.analysisId !== validation.analysisId ||
    graph.interpretationHash !== validation.interpretationHash
  )
    throw new Error(
      'Trace export does not match the exact task source or interpretation. Re-export it.',
    );
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const excerpt = (range: z.infer<typeof rangeSchema>) => {
    for (const p of [range.start, range.end])
      if (
        p.offset > text.length ||
        lineStarts[p.line - 1] === undefined ||
        lineStarts[p.line - 1] + p.column - 1 !== p.offset ||
        (lineStarts[p.line] !== undefined && p.offset >= lineStarts[p.line])
      )
        throw new Error('Trace source range is invalid.');
    if (range.start.offset > range.end.offset) throw new Error('Trace source range is reversed.');
    return text.slice(range.start.offset, range.end.offset);
  };
  uniqueIds(graph.identifiers.map((x) => x.identifier));
  uniqueIds(graph.fragments.map((x) => x.id));
  uniqueIds(graph.occurrences.map((x) => x.id));
  uniqueIds(graph.relationships.map((x) => x.id));
  const ids = new Set(graph.identifiers.map((x) => x.identifier));
  const fragments = new Map(graph.fragments.map((x) => [x.id, x]));
  const occurrences = new Map(graph.occurrences.map((x) => [x.id, x]));
  for (const f of graph.fragments) {
    if (
      (f.owner.status === 'owned' && !ids.has(f.owner.identifier ?? '')) ||
      f.requiredContext.some((id) => !fragments.has(id))
    )
      throw new Error('Trace fragment has an unresolved owner or context.');
  }
  for (const o of graph.occurrences) {
    excerpt(o.range);
    if (!ids.has(o.identifier) || !fragments.has(o.fragmentId))
      throw new Error('Trace occurrence has an unresolved endpoint.');
    const fragment = fragments.get(o.fragmentId)!;
    if (
      o.range.start.offset < fragment.range.start.offset ||
      o.range.end.offset > fragment.range.end.offset
    )
      throw new Error('Trace occurrence is outside its source fragment.');
  }
  const entities = graph.identifiers.map((e) => {
    const def = occurrences.get(e.definition.occurrenceId);
    if (!def || def.identifier !== e.identifier || def.role !== 'definition')
      throw new Error('Trace definition is inconsistent.');
    if (fragments.get(def.fragmentId)?.owner.identifier !== e.identifier)
      throw new Error('Trace definition owner is inconsistent.');
    const label = excerpt(def.range).match(/^\[([^\]]+)\]/)?.[1] ?? e.identifier;
    return {
      id: e.identifier,
      kind: e.entityKind,
      label,
      fragmentIds: graph.fragments
        .filter((f) => f.owner.status === 'owned' && f.owner.identifier === e.identifier)
        .map((f) => f.id),
    };
  });
  const relationships = graph.relationships.map((r) => {
    const occurrence = occurrences.get(r.occurrenceId);
    if (
      !ids.has(r.source.identifier) ||
      !ids.has(r.target) ||
      occurrence?.identifier !== r.target ||
      occurrence.role !== 'reference'
    )
      throw new Error('Trace relationship has an unresolved endpoint.');
    if (fragments.get(occurrence.fragmentId)?.owner.identifier !== r.source.identifier)
      throw new Error('Trace relationship owner disagrees with its source fragment.');
    return { id: r.id, source: r.source.identifier, target: r.target, kind: r.kind };
  });
  return taskSnapshotSchema.parse({
    path,
    documentId: graph.source.documentId,
    sha256: hash,
    analysisId: graph.analysisId,
    interpretationHash: graph.interpretationHash,
    profileId: validation.profileId,
    validationHash: validation.validationHash,
    parserVersion: graph.parserVersion,
    entities,
    relationships,
    fragments: graph.fragments.map((f) => ({
      ...f,
      text: excerpt(f.range),
      owner: f.owner.status === 'owned' ? f.owner.identifier : null,
    })),
  });
}
