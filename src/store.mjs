import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MEMORY_KINDS = new Set([
  "preference",
  "fact",
  "project",
  "decision",
  "moment",
  "instruction",
]);

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 20);
  }
  if (typeof value === "string") {
    return parseTags(value.split(","));
  }
  return [];
}

function parseMemory(row) {
  if (!row) return null;
  return {
    id: row.id,
    namespace: row.namespace,
    content: row.content,
    kind: row.kind,
    tags: JSON.parse(row.tags_json || "[]"),
    source: row.source,
    sourceRef: row.source_ref,
    confidence: row.confidence,
    importance: row.importance,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    supersedesId: row.supersedes_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
  };
}

function ftsQuery(query) {
  const tokens = String(query ?? "").match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return tokens
    .slice(0, 16)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" OR ");
}

export class MemoryStore {
  constructor(databasePath) {
    this.path = resolve(databasePath);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.#migrate();
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL DEFAULT 'personal',
        content TEXT NOT NULL,
        normalized_content TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'fact',
        tags_json TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT 'manual',
        source_ref TEXT,
        confidence REAL NOT NULL DEFAULT 1.0,
        importance REAL NOT NULL DEFAULT 0.5,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        supersedes_id TEXT REFERENCES memories(id),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_accessed_at TEXT,
        access_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_memories_namespace_status
        ON memories(namespace, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_normalized
        ON memories(namespace, normalized_content, status);
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        id UNINDEXED,
        namespace UNINDEXED,
        content,
        tags,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  }

  close() {
    this.db.close();
  }

  #transaction(run) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  remember(input) {
    const content = String(input.content ?? "").trim();
    if (!content) throw new Error("content must not be empty");
    if (content.length > 20_000) throw new Error("content exceeds 20,000 characters");

    const namespace = String(input.namespace || "personal").trim().slice(0, 100) || "personal";
    const normalized = normalizeText(content);
    const tags = parseTags(input.tags);
    const kind = MEMORY_KINDS.has(input.kind) ? input.kind : "fact";
    const source = String(input.source || "manual").trim().slice(0, 100) || "manual";
    const sourceRef = input.sourceRef ? String(input.sourceRef).trim().slice(0, 500) : null;
    const confidence = clamp(input.confidence, 0, 1, 1);
    const importance = clamp(input.importance, 0, 1, 0.5);
    const timestamp = nowIso();

    const duplicate = this.db.prepare(`
      SELECT * FROM memories
      WHERE namespace = ? AND normalized_content = ? AND status = 'active'
      LIMIT 1
    `).get(namespace, normalized);

    if (duplicate) {
      this.db.prepare(`
        UPDATE memories
        SET tags_json = ?, source = ?, source_ref = COALESCE(?, source_ref),
            confidence = MAX(confidence, ?), importance = MAX(importance, ?), updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(tags), source, sourceRef, confidence, importance, timestamp, duplicate.id);
      this.#refreshFts(duplicate.id);
      return { memory: this.get(duplicate.id), deduplicated: true };
    }

    const id = randomUUID();
    const supersedesId = input.supersedesId ? String(input.supersedesId) : null;
    const validFrom = input.validFrom ? new Date(input.validFrom).toISOString() : timestamp;

    this.#transaction(() => {
      if (supersedesId) {
        this.db.prepare(`
          UPDATE memories
          SET status = 'superseded', valid_to = ?, updated_at = ?
          WHERE id = ? AND namespace = ? AND status = 'active'
        `).run(validFrom, timestamp, supersedesId, namespace);
      }
      this.db.prepare(`
        INSERT INTO memories (
          id, namespace, content, normalized_content, kind, tags_json, source, source_ref,
          confidence, importance, valid_from, supersedes_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, namespace, content, normalized, kind, JSON.stringify(tags), source, sourceRef,
        confidence, importance, validFrom, supersedesId, timestamp, timestamp,
      );
      this.db.prepare(`
        INSERT INTO memory_fts (id, namespace, content, tags) VALUES (?, ?, ?, ?)
      `).run(id, namespace, content, tags.join(" "));
    });

    return { memory: this.get(id), deduplicated: false };
  }

  #refreshFts(id) {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id);
    if (!row) return;
    this.db.prepare("DELETE FROM memory_fts WHERE id = ?").run(id);
    if (row.status === "active") {
      this.db.prepare(`
        INSERT INTO memory_fts (id, namespace, content, tags) VALUES (?, ?, ?, ?)
      `).run(row.id, row.namespace, row.content, JSON.parse(row.tags_json).join(" "));
    }
  }

  get(id) {
    return parseMemory(this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id));
  }

  search({ query, namespace = "personal", limit = 8, kinds = [] } = {}) {
    const boundedLimit = Math.min(50, Math.max(1, Number(limit) || 8));
    const kindList = Array.isArray(kinds) ? kinds.filter((kind) => MEMORY_KINDS.has(kind)) : [];
    const kindClause = kindList.length ? ` AND m.kind IN (${kindList.map(() => "?").join(",")})` : "";
    const matches = new Map();
    const fts = ftsQuery(query);

    if (fts) {
      try {
        const rows = this.db.prepare(`
          SELECT m.*, bm25(memory_fts, 0.0, 0.0, 1.0, 0.5) AS text_rank
          FROM memory_fts
          JOIN memories m ON m.id = memory_fts.id
          WHERE memory_fts MATCH ? AND m.namespace = ? AND m.status = 'active'${kindClause}
          ORDER BY text_rank ASC, m.importance DESC, m.updated_at DESC
          LIMIT ?
        `).all(fts, namespace, ...kindList, boundedLimit * 3);
        for (const row of rows) matches.set(row.id, { row, textRank: row.text_rank });
      } catch {
        // FTS can reject unusual punctuation. The LIKE fallback below is deliberately boring and safe.
      }
    }

    const like = `%${String(query ?? "").trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    if (query) {
      const rows = this.db.prepare(`
        SELECT m.* FROM memories m
        WHERE m.namespace = ? AND m.status = 'active'
          AND (m.content LIKE ? ESCAPE '\\' OR m.tags_json LIKE ? ESCAPE '\\')${kindClause}
        ORDER BY m.importance DESC, m.updated_at DESC
        LIMIT ?
      `).all(namespace, like, like, ...kindList, boundedLimit * 3);
      for (const row of rows) {
        if (!matches.has(row.id)) matches.set(row.id, { row, textRank: 0.5 });
      }
    }

    if (!query) {
      const rows = this.db.prepare(`
        SELECT m.* FROM memories m
        WHERE m.namespace = ? AND m.status = 'active'${kindClause}
        ORDER BY m.importance DESC, m.updated_at DESC
        LIMIT ?
      `).all(namespace, ...kindList, boundedLimit);
      for (const row of rows) matches.set(row.id, { row, textRank: 0 });
    }

    const results = [...matches.values()]
      .sort((a, b) => (a.textRank - b.textRank) || (b.row.importance - a.row.importance) || b.row.updated_at.localeCompare(a.row.updated_at))
      .slice(0, boundedLimit)
      .map(({ row }) => parseMemory(row));

    if (results.length) {
      const timestamp = nowIso();
      const update = this.db.prepare(`
        UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?
      `);
      this.#transaction(() => {
        for (const result of results) update.run(timestamp, result.id);
      });
    }

    return results;
  }

  list({ namespace = "personal", status = "active", limit = 100, offset = 0 } = {}) {
    const boundedLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const boundedOffset = Math.max(0, Number(offset) || 0);
    return this.db.prepare(`
      SELECT * FROM memories
      WHERE namespace = ? AND status = ?
      ORDER BY importance DESC, updated_at DESC
      LIMIT ? OFFSET ?
    `).all(namespace, status, boundedLimit, boundedOffset).map(parseMemory);
  }

  forget(id) {
    const timestamp = nowIso();
    const result = this.db.prepare(`
      UPDATE memories SET status = 'deleted', valid_to = COALESCE(valid_to, ?), updated_at = ?
      WHERE id = ? AND status != 'deleted'
    `).run(timestamp, timestamp, id);
    if (result.changes) this.db.prepare("DELETE FROM memory_fts WHERE id = ?").run(id);
    return result.changes > 0;
  }

  stats(namespace = "personal") {
    const counts = this.db.prepare(`
      SELECT status, COUNT(*) AS count FROM memories WHERE namespace = ? GROUP BY status
    `).all(namespace);
    const byKind = this.db.prepare(`
      SELECT kind, COUNT(*) AS count FROM memories
      WHERE namespace = ? AND status = 'active' GROUP BY kind ORDER BY count DESC
    `).all(namespace);
    return {
      databasePath: this.path,
      namespace,
      counts: Object.fromEntries(counts.map((row) => [row.status, row.count])),
      byKind: Object.fromEntries(byKind.map((row) => [row.kind, row.count])),
    };
  }
}
