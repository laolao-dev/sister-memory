import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MemoryStore } from "./store.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes('--http')) throw new Error('This public snapshot supports stdio only');
const databasePath = process.env.SISTER_MEMORY_DB || join(root, "data", "sister-memory.sqlite");

const store = new MemoryStore(databasePath);

function textResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function errorResult(error) {
  return {
    isError: true,
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
  };
}

function createMcpServer() {
  const server = new McpServer(
    { name: "sister-memory", version: "0.1.0" },
    {
      instructions:
        "Shared local-first memory for ChatGPT and Codex. Recall before relying on user/project history. " +
        "Store concise durable facts only; never store passwords, API keys, tokens, or private keys. " +
        "Use forget_memory only after an explicit user request.",
    },
  );

  server.registerTool(
    "remember",
    {
      title: "Remember a durable fact",
      description: "Save one concise, standalone preference, fact, project decision, moment, or instruction for later ChatGPT and Codex sessions.",
      inputSchema: {
        content: z.string().min(1).max(20_000),
        namespace: z.string().min(1).max(100).default("personal"),
        kind: z.enum(["preference", "fact", "project", "decision", "moment", "instruction"]).default("fact"),
        tags: z.array(z.string().min(1).max(80)).max(20).default([]),
        source: z.string().min(1).max(100).default("assistant"),
        sourceRef: z.string().max(500).optional(),
        confidence: z.number().min(0).max(1).default(1),
        importance: z.number().min(0).max(1).default(0.5),
        validFrom: z.string().datetime().optional(),
        supersedesId: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        return textResult(store.remember(input));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "recall",
    {
      title: "Recall relevant memories",
      description: "Search active shared memories with hybrid full-text and substring retrieval.",
      inputSchema: {
        query: z.string().max(2_000).default(""),
        namespace: z.string().min(1).max(100).default("personal"),
        limit: z.number().int().min(1).max(50).default(8),
        kinds: z.array(z.enum(["preference", "fact", "project", "decision", "moment", "instruction"])).default([]),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => textResult({ memories: store.search(input) }),
  );

  server.registerTool(
    "memory_context",
    {
      title: "Build compact memory context",
      description: "Return a compact model-ready memory block for a topic, including provenance and dates.",
      inputSchema: {
        topic: z.string().max(2_000).default(""),
        namespace: z.string().min(1).max(100).default("personal"),
        limit: z.number().int().min(1).max(30).default(10),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ topic, namespace, limit }) => {
      const memories = store.search({ query: topic, namespace, limit });
      const context = memories.map((memory) =>
        `- [${memory.kind}; ${memory.validFrom}; source=${memory.source}; id=${memory.id}] ${memory.content}`,
      ).join("\n");
      return textResult({ context, memories });
    },
  );

  server.registerTool(
    "list_memories",
    {
      title: "List memories",
      description: "List memories in one namespace for review and management.",
      inputSchema: {
        namespace: z.string().min(1).max(100).default("personal"),
        status: z.enum(["active", "superseded", "deleted"]).default("active"),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => textResult({ memories: store.list(input) }),
  );

  server.registerTool(
    "forget_memory",
    {
      title: "Forget one memory",
      description: "Soft-delete one memory by exact ID. Call only after the user explicitly asks to forget it.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => textResult({ id, forgotten: store.forget(id) }),
  );

  server.registerTool(
    "memory_status",
    {
      title: "Check memory status",
      description: "Show local database status and counts without exposing memory contents.",
      inputSchema: { namespace: z.string().min(1).max(100).default("personal") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ namespace }) => textResult({ ok: true, ...store.stats(namespace) }),
  );

  return server;
}

async function startStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`sister-memory: stdio ready (${databasePath})\n`);
}

const shutdown = () => {
  try { store.close(); } catch {}
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await startStdio();
