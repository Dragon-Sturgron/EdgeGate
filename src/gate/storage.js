export const KEYS = {
  candidates: "gate:candidates",
  active: "gate:active",
  stats: "gate:stats",
  cursor: "gate:cursor",
  lastRun: "gate:last_run"
};

export async function getJson(env, key, fallback) {
  const value = await env.KV.get(key, "json");
  return value == null ? fallback : value;
}

export async function putJson(env, key, value) {
  await env.KV.put(key, JSON.stringify(value));
}
