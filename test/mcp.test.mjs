import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("stdio MCP lists tools and shares a remembered fact with recall", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sister-memory-mcp-"));
  const databasePath = join(directory, "mcp.sqlite");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("src/server.mjs"), "--stdio"],
    env: { ...process.env, SISTER_MEMORY_DB: databasePath },
    stderr: "pipe",
  });
  const client = new Client({ name: "sister-memory-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["forget_memory", "list_memories", "memory_context", "memory_status", "recall", "remember"].sort(),
    );
    await client.callTool({
      name: "remember",
      arguments: { content: "跨端记忆测试通过", kind: "fact", tags: ["smoke"] },
    });
    const recalled = await client.callTool({ name: "recall", arguments: { query: "跨端记忆" } });
    assert.match(recalled.content[0].text, /跨端记忆测试通过/);
  } finally {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
