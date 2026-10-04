import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

const EDGETUNNEL_COMMIT =
  process.env.EDGETUNNEL_COMMIT ||
  "af4f9837e1843e34159018713bc8749ccec3004d";

const CHECKER_COMMIT =
  process.env.CHECKER_COMMIT ||
  "2f31cf9a242444eb22905d888d4d8871b0625b3a";

const targets = [
  {
    name: "cmliu/edgetunnel",
    url: `https://raw.githubusercontent.com/cmliu/edgetunnel/${EDGETUNNEL_COMMIT}/_worker.js`,
    out: `${root}/src/vendor/edgetunnel.js`
  },
  {
    name: "lsh8848/cm-Workers-CheckSocks5",
    url: `https://raw.githubusercontent.com/lsh8848/cm-Workers-CheckSocks5/${CHECKER_COMMIT}/_worker.js`,
    out: `${root}/src/vendor/checker.js`
  }
];

await mkdir(`${root}/src/vendor`, { recursive: true });

for (const item of targets) {
  const response = await fetch(item.url, {
    headers: { "User-Agent": "EdgeGate-Upstream-Sync/0.1" }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to sync ${item.name}: HTTP ${response.status} ${response.statusText}`
    );
  }

  let source = await response.text();
  source = source.replace(/^\uFEFF/, "");
  await writeFile(item.out, source, "utf8");
  console.log(`Synced ${item.name} -> ${item.out}`);
}

console.log("Upstream sync complete.");
