import { GraphStore } from './graph/store.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DialogueStore } from './dialogue-store.js';
import { createMcpServer } from './mcp.js';
await createMcpServer(new DialogueStore(), new GraphStore()).connect(new StdioServerTransport());
