import { json, text } from "../lib/http.js";
import {
  isGateAdmin,
  loginGateAdmin,
  logoutGateAdmin
} from "../lib/auth.js";
import { loadSettings, saveSettings } from "./settings.js";
import { refreshGate, readGateState, buildNodesText } from "./service.js";
import { checkSstp } from "./checker.js";

export async function handleGateRoute(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/gate/login" && request.method === "POST") {
    return loginGateAdmin(request, env);
  }

  if (path === "/api/gate/logout" && request.method === "POST") {
    return logoutGateAdmin();
  }

  if (path === "/api/gate/public/stats" && request.method === "GET") {
    const state = await readGateState(env);
    return json({
      stats: state.stats,
      lastRun: state.lastRun,
      activeCount: state.active.length
    });
  }

  if (path === "/gate/nodes.txt" && request.method === "GET") {
    return text(await buildNodesText(env, request));
  }

  if (path === "/api/gate/nodes" && request.method === "GET") {
    const state = await readGateState(env);
    return json({ stats: state.stats, active: state.active });
  }

  if (path.startsWith("/api/gate/")) {
    if (!(await isGateAdmin(request, env))) {
      return json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (path === "/api/gate/state" && request.method === "GET") {
      return json(await readGateState(env));
    }

    if (path === "/api/gate/settings" && request.method === "GET") {
      return json(await loadSettings(env));
    }

    if (path === "/api/gate/settings" && request.method === "PUT") {
      const body = await request.json();
      return json(await saveSettings(env, body));
    }

    if (path === "/api/gate/refresh" && request.method === "POST") {
      return json(await refreshGate(env, ctx, { force: true }));
    }

    if (path === "/api/gate/check" && request.method === "POST") {
      const body = await request.json();
      const host = String(body?.host || "").trim();
      const port = Number(body?.port || 443);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        return json({ success: false, error: "Invalid host/port" }, { status: 400 });
      }

      return json(await checkSstp(
        {
          key: `${host.toLowerCase()}:${port}`,
          host,
          port,
          ip: "",
          country: "",
          countryCode: "",
          protocol: "sstp",
          username: "vpn",
          password: "vpn"
        },
        env,
        ctx
      ));
    }

    return json({ success: false, error: "Not found" }, { status: 404 });
  }

  return null;
}
