import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { serve, reviseGraph } from './http-loop.mjs';
import { runCopilotLoop } from './copilot-loop.mjs';

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, ...options });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
function digestTree(directory) {
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true }).filter((e) =>
    e.isFile(),
  );
  return entries
    .map((e) => [
      join(e.parentPath, e.name).slice(directory.length),
      createHash('sha256')
        .update(readFileSync(join(e.parentPath, e.name)))
        .digest('hex'),
    ])
    .sort();
}

test(
  'npm tarball installs, revises and restores a graph, and installs a standalone Canvas',
  { timeout: 180000 },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'mdx-release-'));
    const directory = join(temporary, 'consumer spaces # café %');
    const home = join(temporary, 'isolated-home');
    mkdirSync(directory);
    mkdirSync(home);
    const env = { ...process.env, HOME: home };
    delete env.MDX_DIALOGUE_DATA_DIR;
    delete env.PORT;
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    try {
      const tarball = process.env.MDX_RELEASE_TARBALL
        ? resolve(process.env.MDX_RELEASE_TARBALL)
        : join(
            temporary,
            JSON.parse(
              run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary]),
            )[0].filename,
          );
      const inventory = run('tar', ['-tzf', tarball]).trim().split('\n');
      for (const path of inventory)
        assert.match(
          path,
          /^package\/(package.json|README.md|LICENSE|bin\/[^/]+\.mjs|cli\/[^/]+\.mjs|dist\/(server.mjs|stdio.mjs|THIRD_PARTY_NOTICES.txt|host\/.+|widget\/widget.html|graph-widget\/graph-widget.html|copilot\/mdx-dialogue\/(extension.mjs|canvas.html|package.json|LICENSE|THIRD_PARTY_NOTICES.txt))|plugin\/(plugin.json|mcp.json)|docs\/(install.md|copilot.md|releasing.md|inspector.md))$/,
          path,
        );
      run(
        'npm',
        [
          'install',
          '--prefix',
          directory,
          '--omit=dev',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          tarball,
        ],
        { cwd: directory },
      );
      const root = join(directory, 'node_modules/@jasonbelmonti/mdx-dialogue');
      const binary = join(directory, 'node_modules/.bin/mdx-dialogue');
      const beforeBytes = digestTree(root);
      assert.equal(JSON.parse(readFileSync(join(root, 'package.json'))).license, 'MIT');
      assert.deepEqual(readFileSync(join(root, 'LICENSE')), readFileSync('LICENSE'));
      assert.equal(existsSync(join(directory, 'node_modules/tsx')), false);
      assert.equal(existsSync(join(directory, 'node_modules/vite')), false);
      assert.equal(run(binary, ['--version'], { cwd: temporary, env }).trim(), manifest.version);
      assert.match(run(binary, ['--help'], { cwd: temporary, env }), /serve/);
      for (const args of [
        ['serve', '--port', '0'],
        ['serve', '--port', '65536'],
        ['serve', '--data-dir', ''],
        ['install', 'copilot'],
        ['install', 'copilot', '--project', 'relative'],
        ['install', 'copilot', '--user', '--project', directory],
        ['serve', '--user'],
      ]) {
        assert.notEqual(
          spawnSync(binary, args, { cwd: temporary, env, timeout: 5000 }).status,
          0,
          args.join(' '),
        );
      }
      assert.equal(existsSync(join(home, '.mdx-dialogue')), false);
      const service = await serve(binary, directory, env);
      let accepted;
      try {
        assert.equal((await fetch(service.origin + '/docs/graph', { method: 'HEAD' })).status, 404);
        const init = await service.rpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'package-test', version: '1' },
        });
        assert.equal(init.serverInfo.version, manifest.version);
        for (const path of ['/', '/graphs', '/widget.html', '/graph-widget.html']) {
          const response = await fetch(service.origin + path);
          assert.equal(response.status, 200, path);
          assert.match(await response.text(), /<html/);
        }
        assert.equal(
          (await fetch(service.origin + '/mcp', { headers: { Origin: 'https://foreign.invalid' } }))
            .status,
          403,
        );
        const resources = (await service.rpc('resources/list')).resources;
        for (const uri of [
          'ui://mdx-dialogue/comparison-v4.html',
          'ui://mdx-dialogue/graph-workspace-v7.html',
        ]) {
          assert.ok(resources.some((r) => r.uri === uri));
          const resource = await service.rpc('resources/read', { uri });
          assert.match(resource.contents[0].text, /<html/);
        }
        accepted = await reviseGraph(service);
      } finally {
        await service.stop();
      }
      const data = join(home, '.mdx-dialogue/codex');
      assert.equal(JSON.parse(readFileSync(join(data, 'graphs.json'), 'utf8'))[0].id, accepted.id);
      assert.equal(existsSync(join(directory, '.data')), false);
      const restarted = await serve(binary, temporary, env);
      try {
        assert.deepEqual(
          await restarted.call('get_graph_dialogue', { documentId: accepted.id }),
          accepted,
        );
      } finally {
        await restarted.stop();
      }
      // Explicitly reusing a legacy checkout directory must also survive relocation.
      const override = await serve(
        binary,
        temporary,
        { ...env, MDX_DIALOGUE_DATA_DIR: join(temporary, 'unused') },
        ['--data-dir', data],
      );
      try {
        assert.deepEqual(
          await override.call('get_graph_dialogue', { documentId: accepted.id }),
          accepted,
        );
      } finally {
        await override.stop();
      }
      run(binary, ['install', 'copilot', '--user'], { cwd: temporary, env });
      const extension = join(home, '.copilot/extensions/mdx-dialogue');
      assert.equal(
        JSON.parse(readFileSync(join(extension, 'package.json'))).version,
        manifest.version,
      );
      assert.equal(JSON.parse(readFileSync(join(extension, 'package.json'))).license, 'MIT');
      assert.deepEqual(
        readFileSync(join(extension, 'LICENSE')),
        readFileSync(join(root, 'LICENSE')),
      );
      writeFileSync(join(extension, 'user-note.txt'), 'retain this file');
      const saved = digestTree(extension);
      const refused = spawnSync(binary, ['install', 'copilot', '--user'], {
        cwd: temporary,
        env,
        encoding: 'utf8',
      });
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /Existing installation preserved/);
      assert.deepEqual(digestTree(extension), saved);
      // The documented upgrade moves the whole old install outside discovery.
      const backup = join(home, '.copilot/mdx-dialogue-backup');
      renameSync(extension, backup);
      run(binary, ['install', 'copilot', '--user'], { cwd: temporary, env });
      assert.deepEqual(digestTree(backup), saved);
      runCopilotLoop(temporary, extension);
      assert.deepEqual(digestTree(root), beforeBytes);
      assert.equal(JSON.parse(readFileSync(join(data, 'graphs.json'), 'utf8'))[0].id, accepted.id);
      // A symlink destination must also remain untouched.
      const project = join(temporary, 'project');
      mkdirSync(join(project, '.github/extensions'), { recursive: true });
      symlinkSync(extension, join(project, '.github/extensions/mdx-dialogue'), 'dir');
      assert.notEqual(
        spawnSync(binary, ['install', 'copilot', '--project', project], { env }).status,
        0,
      );
      console.log(
        JSON.stringify({
          tarball,
          sha512: createHash('sha512').update(readFileSync(tarball)).digest('hex'),
          files: inventory.length,
          version: manifest.version,
          installedLoop: 'pass',
          restart: 'pass',
          canvas: 'pass',
          preservation: 'pass',
        }),
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);
