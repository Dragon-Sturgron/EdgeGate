const DC = [
  "GOOGLE","AMAZON","AWS","MICROSOFT","OVH","HETZNER","DIGITALOCEAN",
  "AKAMAI","CLOUDFLARE","FASTLY","RACKSPACE","EQUINIX","LINODE","VULTR",
  "TENCENT","ALIBABA","ALIYUN","LEASEWEB"
];

const RES = [
  "NTT","KDDI","DOCOMO","SOFTBANK","J:COM","JCOM","OCN","BIGLOBE",
  "AT&T","COMCAST","XFINITY","VERIZON","TELUS","ROGERS","BELL",
  "VODAFONE","ORANGE","DEUTSCHE TELEKOM","FASTWEB"
];

export function classifyExit(exit = {}) {
  if (exit?.is_datacenter === true) return "datacenter";

  const org = String(
    exit?.asn?.org ||
      exit?.asn?.name ||
      exit?.org ||
      ""
  ).toUpperCase();

  if (DC.some((x) => org.includes(x))) return "datacenter";
  if (RES.some((x) => org.includes(x))) return "residential";

  // Heuristic only: false hosting flag does not strictly prove a household line.
  if (exit?.is_datacenter === false && org) return "residential";

  return "unknown";
}
