# Sister Memory — local stdio core

## FINAL ARCHIVE RELEASE — v0.1.0

This is the final archive of the currently completed public scope, dated 2026-10-14. It does not imply future maintenance, production maturity, commercial validation, or renewed development.

Only the previously isolated Store, stdio Server, synthetic tests and dependency metadata are released. Production databases/WAL/SHM, chats/events, PCE ledger, collectors, hooks, startup configuration, credentials, backups and private Git history are excluded. Full-platform capture is PARTIAL, not completed by this core release. Production remains PARTIAL_STABLE_PARKED.

See CHANGELOG.md, RELEASE_NOTES.md, RELEASE_ASSETS.md, PUBLIC_FILE_MANIFEST.json and SHA256SUMS for release scope, validation and integrity records.

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
