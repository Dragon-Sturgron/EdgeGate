export const SETTINGS_KEY = "gate:settings";

export const DEFAULT_SETTINGS = {
  enabled: true,
  batchSize: 20,
  concurrency: 4,
  maxLatencyMs: 3000,
  removeAfterFailures: 2,
  staleAfterMinutes: 360,
  residentialFirst: true,
  includeDatacenter: true,
  includeUnknown: true,
  countries: [],
  edgeHosts: [],
  maxCandidates: 500
};

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(input || {}) };
  return {
    enabled: Boolean(s.enabled),
    batchSize: clampInt(s.batchSize, 1, 50, DEFAULT_SETTINGS.batchSize),
    concurrency: clampInt(s.concurrency, 1, 5, DEFAULT_SETTINGS.concurrency),
    maxLatencyMs: clampInt(s.maxLatencyMs, 200, 30000, DEFAULT_SETTINGS.maxLatencyMs),
    removeAfterFailures: clampInt(
      s.removeAfterFailures,
      1,
      10,
      DEFAULT_SETTINGS.removeAfterFailures
    ),
    staleAfterMinutes: clampInt(
      s.staleAfterMinutes,
      60,
      1440,
      DEFAULT_SETTINGS.staleAfterMinutes
    ),
    residentialFirst: Boolean(s.residentialFirst),
    includeDatacenter: Boolean(s.includeDatacenter),
    includeUnknown: Boolean(s.includeUnknown),
    countries: Array.isArray(s.countries)
      ? [...new Set(s.countries.map((x) => String(x).trim().toUpperCase()).filter(Boolean))]
      : [],
    edgeHosts: Array.isArray(s.edgeHosts)
      ? [...new Set(s.edgeHosts.map((x) => String(x).trim()).filter(Boolean))]
      : [],
    maxCandidates: clampInt(
      s.maxCandidates,
      20,
      2000,
      DEFAULT_SETTINGS.maxCandidates
    )
  };
}

export async function loadSettings(env) {
  const raw = await env.KV.get(SETTINGS_KEY, "json");
  return normalizeSettings(raw || {});
}

export async function saveSettings(env, input) {
  const value = normalizeSettings(input);
  await env.KV.put(SETTINGS_KEY, JSON.stringify(value));
  return value;
}
