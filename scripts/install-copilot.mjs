import { installCopilot } from '../cli/install-copilot.mjs';
const [scope, ...rest] = process.argv.slice(2);
if (rest.length) throw new Error('Choose one install scope.');
await installCopilot(scope);
