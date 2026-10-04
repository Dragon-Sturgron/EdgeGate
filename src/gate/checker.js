import checkerWorker from "../vendor/checker.js";
import { classifyExit } from "./classifier.js";

export async function checkSstp(candidate, env, ctx) {
  const authority = `vpn:vpn@${candidate.host}:${candidate.port}`;
  const url =
    "https://edgegate.internal/check?sstp=" +
    encodeURIComponent(authority);

  const req = new Request(url, {
    method: "GET",
    headers: { "User-Agent": "EdgeGate-Internal-Checker/0.1" }
  });

  const started = Date.now();

  try {
    const response = await checkerWorker.fetch(req, env, ctx);
    const data = await response.json();

    const success = Boolean(data?.success);
    const latencyMs = Number(data?.responseTime ?? Date.now() - started);
    const exit = data?.exit || null;

    return {
      ...candidate,
      success,
      status: success ? "success" : "failed",
      latencyMs,
      exit,
      networkType: success ? classifyExit(exit || {}) : "unknown",
      checkedAt: new Date().toISOString(),
      error: success ? null : String(data?.error || "check failed")
    };
  } catch (error) {
    return {
      ...candidate,
      success: false,
      status: "failed",
      latencyMs: Date.now() - started,
      exit: null,
      networkType: "unknown",
      checkedAt: new Date().toISOString(),
      error: String(error?.message || error)
    };
  }
}
