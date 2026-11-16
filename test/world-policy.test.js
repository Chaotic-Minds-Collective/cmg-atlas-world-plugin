import assert from "node:assert/strict";
import test from "node:test";

import { diffWorldPolicies, validateWorldPolicy, WorldPolicyValidationError } from "../src/world-policy.js";

const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const CLUSTER_ID = "22222222-2222-4222-8222-222222222222";
const SERVER_ID = "33333333-3333-4333-8333-333333333333";
const ZONE_ID = "44444444-4444-4444-8444-444444444444";

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    policyId: POLICY_ID,
    revision: 1,
    scope: { clusterId: CLUSTER_ID, gridId: "A1", serverId: SERVER_ID },
    mode: "observe",
    limits: { structures: { perPlayer: 100, perTribe: 500 }, tames: { perPlayer: 20, perTribe: 100 } },
    worldRules: { pvpMode: "disabled" },
    ...overrides
  };
}

test("validates and freezes a versioned observe-only policy", () => {
  const result = validateWorldPolicy(policy({ safeZones: [{ id: ZONE_ID, name: "Harbor", regionRef: "gridforge:region:harbor", behavior: "no_build", enabled: true }] }));
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.mode, "observe");
  assert.equal(result.safeZones[0].regionRef, "gridforge:region:harbor");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.scope), true);
  assert.equal(Object.isFrozen(result.safeZones[0]), true);
});

test("fails closed when enforcement mode is requested", () => {
  assert.throws(() => validateWorldPolicy(policy({ mode: "enforce" })), (error) => {
    assert.ok(error instanceof WorldPolicyValidationError);
    assert.equal(error.code, "ENFORCEMENT_NOT_SUPPORTED");
    return true;
  });
});

test("rejects unsupported schema versions, unknown fields, and invalid scope", () => {
  assert.throws(() => validateWorldPolicy(policy({ schemaVersion: 2 })), /schemaVersion must equal 1/);
  assert.throws(() => validateWorldPolicy({ ...policy(), arbitrary: true }), /unsupported field arbitrary/);
  assert.throws(() => validateWorldPolicy(policy({ scope: { clusterId: "bad", gridId: "A1", serverId: SERVER_ID } })), /must be a UUID/);
});

test("validates positive structure and tame limits", () => {
  assert.throws(() => validateWorldPolicy(policy({ limits: { structures: { perPlayer: 0 } } })), /integer from 1 to/);
  assert.throws(() => validateWorldPolicy(policy({ limits: { tames: {} } })), /must define at least one limit/);
  assert.throws(() => validateWorldPolicy(policy({ limits: { unknown: { perGrid: 1 } } })), /unsupported field unknown/);
});

test("requires a valid schedule only for scheduled PvP", () => {
  const scheduled = policy({ worldRules: { pvpMode: "scheduled", pvpSchedule: [{ daysOfWeek: [1, 3, 5], startTime: "18:00", endTime: "22:00", timezone: "America/Los_Angeles" }] } });
  assert.equal(validateWorldPolicy(scheduled).worldRules.pvpSchedule.length, 1);
  assert.throws(() => validateWorldPolicy(policy({ worldRules: { pvpMode: "scheduled" } })), /pvpSchedule is required/);
  assert.throws(() => validateWorldPolicy(policy({ worldRules: { pvpMode: "enabled", pvpSchedule: [] } })), /only valid when pvpMode is scheduled/);
});

test("rejects invalid time windows, duplicate weekdays, and invalid time zones", () => {
  const base = { pvpMode: "scheduled", pvpSchedule: [{ daysOfWeek: [1], startTime: "22:00", endTime: "18:00", timezone: "UTC" }] };
  assert.throws(() => validateWorldPolicy(policy({ worldRules: base })), /must end later on the same day/);
  assert.throws(() => validateWorldPolicy(policy({ worldRules: { pvpMode: "scheduled", pvpSchedule: [{ daysOfWeek: [1, 1], startTime: "09:00", endTime: "17:00", timezone: "UTC" }] } })), /must not contain duplicates/);
  assert.throws(() => validateWorldPolicy(policy({ worldRules: { pvpMode: "scheduled", pvpSchedule: [{ daysOfWeek: [1], startTime: "09:00", endTime: "17:00", timezone: "Mars/Olympus" }] } })), /valid IANA time zone/);
});

test("validates ownership scope and its corresponding claim limit", () => {
  assert.equal(validateWorldPolicy(policy({ ownership: { enabled: true, scope: "tribe", maxClaimsPerTribe: 3 } })).ownership.maxClaimsPerTribe, 3);
  assert.throws(() => validateWorldPolicy(policy({ ownership: { enabled: true, scope: "tribe", maxClaimsPerPlayer: 3 } })), /limit for its enabled scope/);
});

test("creates a read-only diff for a higher revision in the same scope", () => {
  const before = policy();
  const after = policy({ revision: 2, limits: { structures: { perPlayer: 80, perTribe: 500 }, tames: { perPlayer: 20, perTribe: 100 } } });
  const diff = diffWorldPolicies(before, after);
  assert.equal(diff.fromRevision, 1);
  assert.equal(diff.toRevision, 2);
  assert.deepEqual(diff.changes.map((change) => change.path), ["limits.structures.perPlayer"]);
  assert.equal(Object.isFrozen(diff), true);
  assert.throws(() => diffWorldPolicies(before, policy({ revision: 2, scope: { clusterId: CLUSTER_ID, gridId: "B2", serverId: SERVER_ID } })), /same cluster, grid, and server/);
  assert.throws(() => diffWorldPolicies(before, policy({ revision: 1 })), /revision must be greater/);
});
