import edgeTunnelWorker from "./vendor/edgetunnel.js";
import { handleGateRoute } from "./gate/routes.js";
import { refreshGate } from "./gate/service.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      url.pathname === "/admin-gate" ||
      url.pathname.startsWith("/admin-gate/") ||
      url.pathname.startsWith("/api/gate/") ||
      url.pathname.startsWith("/gate/")
    ) {
      if (url.pathname === "/admin-gate") {
        return Response.redirect(new URL("/admin-gate/", request.url), 302);
      }

      if (url.pathname === "/admin-gate/" || url.pathname.startsWith("/admin-gate/")) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname =
          url.pathname === "/admin-gate/"
            ? "/admin-gate/index.html"
            : url.pathname;
        return env.ASSETS.fetch(new Request(assetUrl, request));
      }

      const gateResponse = await handleGateRoute(request, env, ctx);
      if (gateResponse) return gateResponse;
    }

    return edgeTunnelWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      refreshGate(env, ctx).catch((error) => {
        console.error("EdgeGate scheduled refresh failed:", error);
      })
    );
  }
};
