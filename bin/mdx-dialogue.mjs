#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { installCopilot } from '../cli/install-copilot.mjs';

const help = `MDX Dialogue — interactive documents for Codex and Copilot

Usage:
  mdx-dialogue serve [--port 4319] [--data-dir /absolute/path]
  mdx-dialogue install copilot --user
  mdx-dialogue install copilot --project /absolute/project
  mdx-dialogue --version

serve runs a foreground loopback HTTP/MCP service for the Codex plugin.
Data defaults to ~/.mdx-dialogue/codex (override: MDX_DIALOGUE_DATA_DIR).
Existing Copilot installs are preserved. See docs/install.md for upgrades.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      port: { type: 'string' },
      'data-dir': { type: 'string' },
      user: { type: 'boolean' },
      project: { type: 'string' },
    },
  });
  if (values.help || process.argv.length === 2) console.log(help);
  else if (values.version) {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
    console.log(manifest.version);
  } else if (positionals.length === 1 && positionals[0] === 'serve') {
    if (values.user || values.project !== undefined)
      throw new Error('Install options cannot be used with serve.');
    const port = values.port ?? process.env.PORT ?? '4319';
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
      throw new Error('Port must be an integer from 1 to 65535.');
    const data =
      values['data-dir'] ??
      process.env.MDX_DIALOGUE_DATA_DIR ??
      join(homedir(), '.mdx-dialogue', 'codex');
    if (!data.trim()) throw new Error('Data directory must not be empty.');
    process.env.PORT = port;
    process.env.MDX_DIALOGUE_DATA_DIR = resolve(data);
    await import('../dist/server.mjs');
  } else if (positionals.join(' ') === 'install copilot') {
    if (values.port !== undefined || values['data-dir'] !== undefined)
      throw new Error('Service options cannot be used with install.');
    if (Boolean(values.user) === (values.project !== undefined))
      throw new Error('Choose exactly one install scope: --user or --project /absolute/project.');
    await installCopilot(values.user ? '--user' : `--project=${values.project}`);
  } else throw new Error(help);
} catch (error) {
  console.error(`MDX Dialogue: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
