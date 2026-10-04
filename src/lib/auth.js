const COOKIE_NAME = "edgegate_gate_auth";
const MAX_AGE = 86400;

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

async function expectedToken(request, env) {
  const admin = String(env.ADMIN || "");
  if (!admin) return "";
  const ua = request.headers.get("User-Agent") || "";
  const salt = String(env.KEY || "edgegate");
  return sha256Hex(`${admin}|${salt}|${ua}|EdgeGate-Gate-Admin`);
}

export async function isGateAdmin(request, env) {
  if (!env.ADMIN) return false;
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const actual = cookies[COOKIE_NAME] || "";
  const expected = await expectedToken(request, env);
  return Boolean(actual && expected && actual === expected);
}

export async function loginGateAdmin(request, env) {
  if (!env.ADMIN) {
    return new Response(
      JSON.stringify({ success: false, error: "ADMIN environment variable is missing" }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  if (String(body?.password || "") !== String(env.ADMIN)) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid password" }),
      { status: 401, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  const token = await expectedToken(request, env);
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
  );

  return new Response(JSON.stringify({ success: true }), { headers });
}

export function logoutGateAdmin() {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    }
  });
}
