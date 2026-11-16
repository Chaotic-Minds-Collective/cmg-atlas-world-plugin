# CMG World — Implementation Plan

## Purpose
World/grid policy management for configurable gameplay rules.

## Feature scope
- Per-grid/server structure and tame limits
- Safe zones, no-collision and protected areas
- Personal/tribe ownership and claims
- Custom loot and supply/drop config
- Creature spawn profiles, caps and regions
- World/PvP/PvE rules and schedules
- Versioned config, dry-run diff and rollback

## Dependencies
- Core server registry, RBAC, audit and plugin config persistence
- ATLAS adapter: verified world/structure/tame/spawn/loot hooks
- Tribes for ownership; Sentinel for audit; GridForge for map data

## Data ownership
World owns policy docs, regions, limit snapshots, loot/spawn profiles and history. Core owns server identity, authorization and generic plugin configuration.

## Milestones
1. **Define declarative policy schema — first version completed.** `schemaVersion: 1` validates cluster/grid/server scope, observe-only mode, structure/tame limits, PvP schedules, safe-zone references and ownership metadata.
2. **Implement dry-run diff — initial read-only slice completed.** `diffWorldPolicies` requires identical scope and policy identity plus a higher revision. Import/export and audit persistence remain pending.
3. Observe structure/tame limits before enforcement — pending verified adapter telemetry.
4. Add safe zones/ownership after spatial hooks verified — pending GridForge region schema and isolated runtime hooks.
5. Add loot/spawn config with rollback — pending authoritative item/creature identifiers and verified hooks.
6. Add scheduled policies and cross-grid checks — pending Core scheduling and GridForge topology contracts.

## Technical gates and risks
- The World policy schema is CMG-owned policy data, not a guessed native ATLAS grid JSON schema.
- Collision/ownership/loot/spawn may require native hooks/client assets.
- Start observe-only; enforcement must remain disabled until exact server build and feature hooks pass isolated validation.
- No live world changes without separate approval.

## Shared engineering requirements
- Use authenticated, least-privilege Core APIs; no direct database credentials in plugins.
- Preserve provider identifiers as strings; display names are not identifiers.
- Carry cluster, grid and server context on applicable records/events.
- Use stable event IDs, idempotency keys and correlation IDs.
- Keep network work off game-critical threads; use bounded timeouts, retries and circuit breakers.
- Keep secrets out of source control and separate credentials per server/integration.
- Add unit tests, fake-adapter contract tests and isolated runtime compatibility tests.
- Gate unsupported features behind explicit capabilities; fail closed for privileged actions.
- Do not deploy to production or change live server configuration during repository planning.

## Current readiness
Versioned observe-only policy validation and read-only diff are implemented with ten offline unit tests. No ATLAS runtime hooks or policy enforcement are enabled. GridForge's authoritative map schema and isolated adapter verification remain required before spatial or gameplay features.
