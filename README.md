# CMG World

World/grid policy management for CMG ATLAS. This repository now contains the first versioned, observe-only policy schema and a read-only policy diff.

## Implemented

- Strict `schemaVersion: 1` policy validation with cluster, grid and server scope.
- Structure and tame limit definitions.
- PvP enabled/disabled/scheduled policy, including IANA time-zone schedule validation.
- Safe-zone references and player/tribe ownership policy metadata.
- Fail-closed behavior: only `mode: "observe"` is accepted.
- `diffWorldPolicies(previous, next)` produces an immutable dry-run diff and requires matching scope/policy ID plus an increasing revision.

## Not implemented

- No ATLAS world hooks, limit enforcement, safe-zone enforcement, loot/spawn mutation, config apply, or rollback.
- Safe-zone `regionRef` values are opaque references; GridForge's real map schema is still required.
- No live server configuration or world state is changed.

The schema is CMG World-owned policy data. It is **not** claimed to be the native ATLAS server-grid JSON schema. Runtime enforcement stays blocked until the API 1.71 adapter's exact server ABI and feature hooks pass isolated validation.

## Development

Requires Node.js 22 or later.

```bash
npm ci
npm run check
npm test
```

Tests are offline and do not connect to an ATLAS server.
