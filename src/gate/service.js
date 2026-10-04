import { fetchVpnGateRows, toSstpCandidates } from "./vpngate.js";
import { checkSstp } from "./checker.js";
import { loadSettings } from "./settings.js";
import { KEYS, getJson, putJson } from "./storage.js";

function chunkRun(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  return Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runner)
  ).then(() => results);
}

function normalizeCountryFilter(countries) {
  return new Set((countries || []).map((x) => String(x).trim().toUpperCase()));
}

function sortActive(nodes, settings) {
  const typeRank = settings.residentialFirst
    ? { residential: 0, unknown: 1, datacenter: 2 }
    : { residential: 0, datacenter: 0, unknown: 1 };

  return [...nodes].sort((a, b) => {
    const ra = typeRank[a.networkType] ?? 9;
    const rb = typeRank[b.networkType] ?? 9;
    if (ra !== rb) return ra - rb;
    return Number(a.latencyMs || 999999) - Number(b.latencyMs || 999999);
  });
}

function shouldExpose(node, settings) {
  if (!node.success) return false;
  if (node.latencyMs > settings.maxLatencyMs) return false;
  if (node.networkType === "datacenter" && !settings.includeDatacenter) return false;
  if (node.networkType === "unknown" && !settings.includeUnknown) return false;
  return true;
}

export async function refreshGate(env, ctx, { force = false } = {}) {
  const settings = await loadSettings(env);

  if (!settings.enabled && !force) {
    return { skipped: true, reason: "disabled", settings };
  }

  const fetched = await fetchVpnGateRows();
  let candidates = toSstpCandidates(fetched.rows);

  const countryFilter = normalizeCountryFilter(settings.countries);
  if (countryFilter.size) {
    candidates = candidates.filter((n) => countryFilter.has(n.countryCode));
  }

  candidates = candidates.slice(0, settings.maxCandidates);

  let cursor = Number(await env.KV.get(KEYS.cursor)) || 0;
  if (!Number.isInteger(cursor) || cursor < 0) cursor = 0;
  if (cursor >= candidates.length) cursor = 0;

  const batch = [];
  for (let i = 0; i < Math.min(settings.batchSize, candidates.length); i++) {
    batch.push(candidates[(cursor + i) % candidates.length]);
  }

  const nextCursor = candidates.length
    ? (cursor + batch.length) % candidates.length
    : 0;

  const oldActiveArray = await getJson(env, KEYS.active, []);
  const active = new Map(oldActiveArray.map((n) => [n.key, n]));

  const checked = await chunkRun(
    batch,
    settings.concurrency,
    (node) => checkSstp(node, env, ctx)
  );

  for (const result of checked) {
    const previous = active.get(result.key);

    if (result.success && result.latencyMs <= settings.maxLatencyMs) {
      active.set(result.key, {
        ...result,
        failCount: 0,
        lastSuccessAt: result.checkedAt
      });
    } else if (previous) {
      const failCount = Number(previous.failCount || 0) + 1;
      if (failCount >= settings.removeAfterFailures) {
        active.delete(result.key);
      } else {
        active.set(result.key, {
          ...previous,
          failCount,
          lastFailureAt: result.checkedAt,
          lastError: result.error || "check failed"
        });
      }
    }
  }

  const now = Date.now();
  const staleMs = settings.staleAfterMinutes * 60 * 1000;

  let activeArray = [...active.values()].filter((node) => {
    const last = Date.parse(node.lastSuccessAt || node.checkedAt || 0);
    return Number.isFinite(last) && now - last <= staleMs;
  });

  activeArray = activeArray.filter((node) => shouldExpose(node, settings));
  activeArray = sortActive(activeArray, settings);

  const stats = {
    generatedAt: new Date().toISOString(),
    source: fetched.source,
    rawNodes: fetched.rows.length,
    candidates: candidates.length,
    checkedThisRun: checked.length,
    successThisRun: checked.filter((x) => x.success).length,
    failedThisRun: checked.filter((x) => !x.success).length,
    active: activeArray.length,
    residential: activeArray.filter((x) => x.networkType === "residential").length,
    datacenter: activeArray.filter((x) => x.networkType === "datacenter").length,
    unknown: activeArray.filter((x) => x.networkType === "unknown").length,
    cursor,
    nextCursor
  };

  await Promise.all([
    putJson(env, KEYS.candidates, candidates),
    putJson(env, KEYS.active, activeArray),
    putJson(env, KEYS.stats, stats),
    env.KV.put(KEYS.cursor, String(nextCursor)),
    env.KV.put(KEYS.lastRun, stats.generatedAt)
  ]);

  return { skipped: false, stats, checked };
}

export async function readGateState(env) {
  const [settings, stats, active, candidates, lastRun] = await Promise.all([
    loadSettings(env),
    getJson(env, KEYS.stats, null),
    getJson(env, KEYS.active, []),
    getJson(env, KEYS.candidates, []),
    env.KV.get(KEYS.lastRun)
  ]);

  return {
    settings,
    stats,
    active,
    candidateCount: candidates.length,
    lastRun
  };
}

function sanitizeEdgeHost(input) {
  let value = String(input || "").trim();
  value = value.replace(/^https?:\/\//i, "");
  value = value.split("/")[0];
  if (!value) return "";
  if (!/:\d+$/.test(value)) value += ":443";
  return value;
}

export async function buildNodesText(env, request) {
  const state = await readGateState(env);
  const settings = state.settings;

  let edges = settings.edgeHosts.map(sanitizeEdgeHost).filter(Boolean);

  if (!edges.length) {
    const fallbackHost = sanitizeEdgeHost(new URL(request.url).hostname);
    if (fallbackHost) edges = [fallbackHost];
  }

  if (!edges.length) return "";

  const lines = [];
  let i = 0;

  for (const node of state.active) {
    const edge = edges[i++ % edges.length];
    const country = node.countryCode || node.country || "XX";
    const type =
      node.networkType === "residential"
        ? "住宅"
        : node.networkType === "datacenter"
          ? "机房"
          : "未知";

    const label = `${country}-${type}-${String(i).padStart(2, "0")}`;
    lines.push(
      `${edge}#${label}$sstp://vpn:vpn@${node.host}:${node.port}`
    );
  }

  return lines.join("\n") + (lines.length ? "\n" : "");
}
