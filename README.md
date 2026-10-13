# Sister Memory — local stdio core

A small local SQLite memory store and MCP stdio server. It supports remember, recall, context assembly, list/status, and soft deletion, with namespaces and source metadata.

## Install and run

Node.js 24 is recommended (minimum 22.13). In a fresh checkout:

```sh
npm ci --ignore-scripts
npm test
node src/server.mjs --stdio
```

Configure an MCP client to launch `node` with the absolute path to `src/server.mjs` and `--stdio`. Set `SISTER_MEMORY_DB` to a new disposable database path for a trial. With no override, the server creates `data/sister-memory.sqlite` inside this checkout. Never point a trial at your existing production database.

The published server only supports stdio; HTTP/dashboard code is excluded. This reduces the public snapshot's network surface. Tests use synthetic content and temporary databases, including a real MCP client/server round trip.

## Publication boundary

Only the standalone store, stdio server, two tests, package metadata and existing MIT license are included. No production SQLite files, personal memories, chats, capture logs, backups, credentials, caches, hooks or global configuration are bundled. Installed PCE, browser capture/OpenMem, global collector, and platform adapters are excluded.

This is a manual local memory core. It does **not** provide full cross-platform automatic capture or canonical PCE admission. Existing real-platform integration has unverified portions; internal tests cannot establish Desktop/browser/Claude/Hermes capture. Text supplied to the store is retained as given; callers must avoid secrets. Soft deletion is not secure erasure of SQLite pages or backups. No automatic service installation is performed.

See VALIDATION.md and THIRD_PARTY.md. Questions and bug reports are welcome in [Issues](https://github.com/laolao-dev/sister-memory/issues).
