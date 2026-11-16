const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 100_000;
const PVP_MODES = new Set(["enabled", "disabled", "scheduled"]);
const SAFE_ZONE_BEHAVIORS = new Set(["pve", "no_build", "no_claim"]);

export class WorldPolicyValidationError extends TypeError {
  constructor(message, path, code = "INVALID_WORLD_POLICY") {
    super(message);
    this.name = "WorldPolicyValidationError";
    this.path = path;
    this.code = code;
  }
}

function fail(message, path, code) {
  throw new WorldPolicyValidationError(message, path, code);
}

function object(value, path, allowed, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path + " must be an object", path);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(path + " contains unsupported field " + key, path + "." + key, "UNKNOWN_FIELD");
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(path + "." + key + " is required", path + "." + key, "REQUIRED_FIELD");
  }
  return value;
}

function string(value, path, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    fail(path + " must be a string from " + min + " to " + max + " characters", path);
  }
  return value.trim();
}

function uuid(value, path) {
  const result = string(value, path, { min: 1, max: 36 });
  if (!UUID.test(result)) fail(path + " must be a UUID", path, "INVALID_UUID");
  return result.toLowerCase();
}

function integer(value, path, min = 1, max = MAX_LIMIT) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(path + " must be an integer from " + min + " to " + max, path, "INVALID_LIMIT");
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== "boolean") fail(path + " must be a boolean", path);
  return value;
}

function validateLimits(value, path) {
  object(value, path, ["structures", "tames"]);
  const result = {};
  for (const kind of ["structures", "tames"]) {
    if (!Object.hasOwn(value, kind)) continue;
    const limits = value[kind];
    object(limits, path + "." + kind, ["perPlayer", "perTribe", "perGrid"]);
    const normalized = {};
    for (const key of ["perPlayer", "perTribe", "perGrid"]) {
      if (Object.hasOwn(limits, key)) normalized[key] = integer(limits[key], path + "." + kind + "." + key);
    }
    if (Object.keys(normalized).length === 0) fail(path + "." + kind + " must define at least one limit", path + "." + kind);
    result[kind] = Object.freeze(normalized);
  }
  if (Object.keys(result).length === 0) fail(path + " must define structure or tame limits", path);
  return Object.freeze(result);
}

function validateTime(value, path) {
  const result = string(value, path, { min: 5, max: 5 });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result)) fail(path + " must use HH:MM 24-hour time", path);
  return result;
}

function validateSchedule(value, path) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    fail(path + " must be a non-empty array with at most 64 windows", path);
  }
  return Object.freeze(Array.from(value, (entry, index) => {
    const entryPath = path + "[" + index + "]";
    object(entry, entryPath, ["daysOfWeek", "startTime", "endTime", "timezone"], ["daysOfWeek", "startTime", "endTime", "timezone"]);
    if (!Array.isArray(entry.daysOfWeek) || entry.daysOfWeek.length === 0 || entry.daysOfWeek.length > 7) {
      fail(entryPath + ".daysOfWeek must contain one to seven weekdays", entryPath + ".daysOfWeek");
    }
    const days = Array.from(entry.daysOfWeek, (day, dayIndex) => integer(day, entryPath + ".daysOfWeek[" + dayIndex + "]", 0, 6));
    if (new Set(days).size !== days.length) fail(entryPath + ".daysOfWeek must not contain duplicates", entryPath + ".daysOfWeek");
    const startTime = validateTime(entry.startTime, entryPath + ".startTime");
    const endTime = validateTime(entry.endTime, entryPath + ".endTime");
    if (startTime >= endTime) fail(entryPath + " must end later on the same day; overnight windows are not supported in schema v1", entryPath);
    const timezone = string(entry.timezone, entryPath + ".timezone", { min: 1, max: 100 });
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
    catch { fail(entryPath + ".timezone must be a valid IANA time zone", entryPath + ".timezone"); }
    return Object.freeze({ daysOfWeek: Object.freeze([...days].sort()), startTime, endTime, timezone });
  }));
}

function validateWorldRules(value) {
  const path = "worldRules";
  object(value, path, ["pvpMode", "pvpSchedule"], ["pvpMode"]);
  if (typeof value.pvpMode !== "string" || !PVP_MODES.has(value.pvpMode)) {
    fail(path + ".pvpMode must be enabled, disabled, or scheduled", path + ".pvpMode");
  }
  if (value.pvpMode === "scheduled") {
    if (!Object.hasOwn(value, "pvpSchedule")) fail(path + ".pvpSchedule is required when pvpMode is scheduled", path + ".pvpSchedule", "REQUIRED_FIELD");
    return Object.freeze({ pvpMode: value.pvpMode, pvpSchedule: validateSchedule(value.pvpSchedule, path + ".pvpSchedule") });
  }
  if (Object.hasOwn(value, "pvpSchedule")) fail(path + ".pvpSchedule is only valid when pvpMode is scheduled", path + ".pvpSchedule");
  return Object.freeze({ pvpMode: value.pvpMode });
}

function validateSafeZones(value) {
  if (!Array.isArray(value) || value.length > 500) fail("safeZones must be an array with at most 500 entries", "safeZones");
  const ids = new Set();
  return Object.freeze(Array.from(value, (entry, index) => {
    const path = "safeZones[" + index + "]";
    object(entry, path, ["id", "name", "regionRef", "behavior", "enabled"], ["id", "name", "regionRef", "behavior", "enabled"]);
    const id = uuid(entry.id, path + ".id");
    if (ids.has(id)) fail(path + ".id duplicates another safe-zone ID", path + ".id", "DUPLICATE_ID");
    ids.add(id);
    if (typeof entry.behavior !== "string" || !SAFE_ZONE_BEHAVIORS.has(entry.behavior)) {
      fail(path + ".behavior must be pve, no_build, or no_claim", path + ".behavior");
    }
    return Object.freeze({
      id,
      name: string(entry.name, path + ".name", { max: 100 }),
      regionRef: string(entry.regionRef, path + ".regionRef", { max: 200 }),
      behavior: entry.behavior,
      enabled: boolean(entry.enabled, path + ".enabled")
    });
  }));
}

function validateOwnership(value) {
  const path = "ownership";
  object(value, path, ["enabled", "scope", "maxClaimsPerPlayer", "maxClaimsPerTribe"], ["enabled", "scope"]);
  const enabled = boolean(value.enabled, path + ".enabled");
  if (value.scope !== "player" && value.scope !== "tribe") fail(path + ".scope must be player or tribe", path + ".scope");
  const result = { enabled, scope: value.scope };
  for (const key of ["maxClaimsPerPlayer", "maxClaimsPerTribe"]) {
    if (Object.hasOwn(value, key)) result[key] = integer(value[key], path + "." + key);
  }
  if (enabled && !Object.hasOwn(result, value.scope === "player" ? "maxClaimsPerPlayer" : "maxClaimsPerTribe")) {
    fail(path + " must define a limit for its enabled scope", path);
  }
  return Object.freeze(result);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function validateWorldPolicy(input) {
  object(input, "policy", ["schemaVersion", "policyId", "revision", "scope", "mode", "limits", "worldRules", "safeZones", "ownership", "notes"],
    ["schemaVersion", "policyId", "revision", "scope", "mode", "worldRules"]);
  if (input.schemaVersion !== 1) fail("policy.schemaVersion must equal 1", "policy.schemaVersion", "UNSUPPORTED_SCHEMA_VERSION");
  const policyId = uuid(input.policyId, "policy.policyId");
  const revision = integer(input.revision, "policy.revision", 1, 2_147_483_647);
  object(input.scope, "policy.scope", ["clusterId", "gridId", "serverId"], ["clusterId", "gridId", "serverId"]);
  const scope = Object.freeze({
    clusterId: uuid(input.scope.clusterId, "policy.scope.clusterId"),
    gridId: string(input.scope.gridId, "policy.scope.gridId"),
    serverId: uuid(input.scope.serverId, "policy.scope.serverId")
  });
  if (input.mode !== "observe") fail("policy.mode must be observe until runtime enforcement is verified", "policy.mode", "ENFORCEMENT_NOT_SUPPORTED");
  const result = {
    schemaVersion: 1,
    policyId,
    revision,
    scope,
    mode: "observe",
    worldRules: validateWorldRules(input.worldRules)
  };
  if (Object.hasOwn(input, "limits")) result.limits = validateLimits(input.limits, "policy.limits");
  if (Object.hasOwn(input, "safeZones")) result.safeZones = validateSafeZones(input.safeZones);
  if (Object.hasOwn(input, "ownership")) result.ownership = validateOwnership(input.ownership);
  if (Object.hasOwn(input, "notes")) result.notes = string(input.notes, "policy.notes", { min: 0, max: 2_000 });
  return deepFreeze(result);
}

function sameScope(left, right) {
  return left.clusterId === right.clusterId && left.gridId === right.gridId && left.serverId === right.serverId;
}

function collectChanges(before, after, path, changes) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const bothObjects = before && after && typeof before === "object" && typeof after === "object" &&
    !Array.isArray(before) && !Array.isArray(after);
  if (!bothObjects) {
    changes.push(Object.freeze({ path, before, after }));
    return;
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) collectChanges(before[key], after[key], path ? path + "." + key : key, changes);
}

/** Produce a read-only diff. This function never applies policy to a server. */
export function diffWorldPolicies(previousInput, nextInput) {
  const previous = validateWorldPolicy(previousInput);
  const next = validateWorldPolicy(nextInput);
  if (!sameScope(previous.scope, next.scope)) fail("Policies must target the same cluster, grid, and server", "scope", "SCOPE_MISMATCH");
  if (next.policyId !== previous.policyId) fail("Policies must share the same policyId", "policyId", "POLICY_MISMATCH");
  if (next.revision <= previous.revision) fail("next policy revision must be greater than previous revision", "revision", "REVISION_NOT_ADVANCED");
  const changes = [];
  for (const key of ["mode", "limits", "worldRules", "safeZones", "ownership", "notes"]) {
    collectChanges(previous[key], next[key], key, changes);
  }
  return deepFreeze({
    policyId: previous.policyId,
    scope: previous.scope,
    fromRevision: previous.revision,
    toRevision: next.revision,
    mode: "observe",
    changes
  });
}
