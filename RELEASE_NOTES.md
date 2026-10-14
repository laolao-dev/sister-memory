# Sister Memory v0.1.0

**FINAL ARCHIVE RELEASE**

Final archive of the completed public scope as of 2026-10-14. This release does not imply future maintenance, production maturity, commercial validation or renewed development.

## Scope and limitations

Only the previously isolated Store, stdio Server, synthetic tests and dependency metadata are released. Production databases/WAL/SHM, chats/events, PCE ledger, collectors, hooks, startup configuration, credentials, backups and private Git history are excluded. Full-platform capture is PARTIAL, not completed by this core release. Production remains PARTIAL_STABLE_PARKED.

## Validation

npm ci --ignore-scripts --no-audit --no-fund and npm test: 5/5 passed, including a real stdio client/server round trip with synthetic temporary SQLite. No production database or platform capture test.

Historical evidence remains separately labeled in VALIDATION.md. Failures, INCONCLUSIVE and NOT_RUN outcomes are not promoted to PASS.

## Rights and assets

Existing MIT license and copyright notice retained. Third-party names identify compatibility/research subjects; no brand endorsement or artwork license is implied.

See RELEASE_ASSETS.md for the attached source ZIP, its SHA256 sidecar and internal file checksums. No private paths, internal batch report, private Git history or production data are released.
