const OFFICIAL_URL = "https://www.vpngate.net/api/iphone/";
const MIRROR_URL =
  "https://raw.githubusercontent.com/fdciabdul/Vpngate-Scraper-API/main/json/data.json";

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  fields.push(current);
  return fields;
}

function parseOfficialCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) =>
    line.replace(/^#/, "").startsWith("HostName,")
  );
  if (headerIndex < 0) throw new Error("VPN Gate CSV header not found");

  const header = parseCsvLine(lines[headerIndex].replace(/^#/, ""));
  const column = Object.fromEntries(
    header.map((name, i) => [String(name).replace(/^\*/, "").toLowerCase(), i])
  );

  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.startsWith("*")) continue;
    const f = parseCsvLine(line);
    if (f.length < 7) continue;

    const host = String(f[column.hostname ?? 0] || "").trim();
    const ip = String(f[column.ip ?? 1] || "").trim();
    const countryLong = String(f[column.countrylong ?? 5] || "").trim();
    const countryShort = String(f[column.countryshort ?? 6] || "").trim();
    const configB64 = String(
      f[column.openvpn_configdata_base64 ?? (f.length - 1)] || ""
    ).trim();

    if (!host || !ip) continue;
    rows.push({ host, ip, countryLong, countryShort, configB64 });
  }

  return rows;
}

function parseMirrorJson(data) {
  const roots = Array.isArray(data) ? data : [data];
  const servers = [];

  for (const root of roots) {
    if (!root || typeof root !== "object") continue;
    if (Array.isArray(root.servers)) servers.push(...root.servers);
    else servers.push(root);
  }

  return servers
    .map((s) => ({
      host: String(s.hostname || s.host || "").trim(),
      ip: String(s.ip || "").trim(),
      countryLong: String(
        s.countrylong || s.country_long || s.country || ""
      ).trim(),
      countryShort: String(s.countryshort || s.country_short || "").trim(),
      configB64: String(
        s.openvpn_configdata_base64 || s.config_b64 || ""
      ).trim()
    }))
    .filter((x) => x.host && x.ip);
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "EdgeGate/0.1" }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 15000) {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text);
}

export async function fetchVpnGateRows() {
  const errors = [];

  try {
    const text = await fetchText(OFFICIAL_URL);
    const rows = parseOfficialCsv(text);
    if (rows.length) return { source: "vpngate-official", rows };
    throw new Error("0 rows");
  } catch (error) {
    errors.push(`official: ${error.message}`);
  }

  try {
    const data = await fetchJson(MIRROR_URL);
    const rows = parseMirrorJson(data);
    if (rows.length) return { source: "github-mirror", rows };
    throw new Error("0 rows");
  } catch (error) {
    errors.push(`mirror: ${error.message}`);
  }

  throw new Error(`VPN Gate fetch failed: ${errors.join("; ")}`);
}

function decodeBase64Utf8(b64) {
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

const PROTO_TCP = /^proto\s+(tcp|tcp4|tcp6)\b/im;
const REMOTE = /^remote\s+\S+\s+(\d+)/im;

export function toSstpCandidates(rows) {
  const out = [];
  const seen = new Set();

  for (const row of rows) {
    const config = row.configB64 ? decodeBase64Utf8(row.configB64) : "";
    if (!PROTO_TCP.test(config)) continue;

    const m = config.match(REMOTE);
    if (!m) continue;

    const port = Number(m[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue;

    let host = String(row.host || "").trim();
    if (!host) continue;
    if (!host.endsWith(".opengw.net")) host = `${host}.opengw.net`;

    const key = `${host.toLowerCase()}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      key,
      host,
      port,
      ip: row.ip,
      country: row.countryLong || "",
      countryCode: String(row.countryShort || "").toUpperCase(),
      protocol: "sstp",
      username: "vpn",
      password: "vpn"
    });
  }

  return out;
}
