import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MemoryStore } from "../src/store.mjs";

function withStore(run) {
  const directory = mkdtempSync(join(tmpdir(), "sister-memory-"));
  const store = new MemoryStore(join(directory, "test.sqlite"));
  try {
    return run(store);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test("remember deduplicates exact normalized content", () => withStore((store) => {
  const first = store.remember({ content: "宝宝喜欢本地优先的工具", tags: ["preference"] });
  const second = store.remember({ content: "  宝宝喜欢本地优先的工具  ", importance: 0.9 });
  assert.equal(first.memory.id, second.memory.id);
  assert.equal(second.deduplicated, true);
  assert.equal(store.stats().counts.active, 1);
}));

test("search supports Chinese substring and tags", () => withStore((store) => {
  store.remember({ content: "项目代号是夜航盒子", tags: ["礼物", "项目"], kind: "project" });
  assert.equal(store.search({ query: "夜航" })[0].content, "项目代号是夜航盒子");
  assert.equal(store.search({ query: "礼物" })[0].kind, "project");
}));

test("superseding preserves history and removes the old fact from active recall", () => withStore((store) => {
  const oldFact = store.remember({ content: "界面主题是蓝色", kind: "decision" }).memory;
  const newFact = store.remember({ content: "界面主题改成暖金色", kind: "decision", supersedesId: oldFact.id }).memory;
  assert.equal(store.get(oldFact.id).status, "superseded");
  assert.equal(store.search({ query: "主题" })[0].id, newFact.id);
}));

test("forget is a soft delete and idempotent", () => withStore((store) => {
  const memory = store.remember({ content: "测试删除" }).memory;
  assert.equal(store.forget(memory.id), true);
  assert.equal(store.forget(memory.id), false);
  assert.equal(store.get(memory.id).status, "deleted");
  assert.equal(store.search({ query: "测试删除" }).length, 0);
}));
