import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Source modules live in server/; packaged entry bundles live in dist/.
export const packageRoot = new URL('../', import.meta.url);
export const packageVersion: string = JSON.parse(
  readFileSync(new URL('package.json', packageRoot), 'utf8'),
).version;
export const packagePath = (path: string) => fileURLToPath(new URL(path, packageRoot));
