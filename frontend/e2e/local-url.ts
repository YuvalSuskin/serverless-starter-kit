// Whether a URL is on this machine: the browser's half of the offline step
// (tools/local-check/src/offline.ts). The same rule as the Node guard's,
// tools/local-check/src/loopback.ts, which frontend/ cannot import: copied
// here, and tools/local-check/src/loopback-parity.test.ts fails if the two
// disagree on a host. Pages are served from one of these hosts; nothing else is
// reachable.
const LOCAL_PROTOCOLS = new Set(["about:", "blob:", "data:"]);
const IPV4_LOOPBACK = /^127(?:\.(\d{1,3})){3}$/;
// ::ffff:7f00:1, how a URL spells the IPv4-mapped 127.0.0.1.
const IPV6_MAPPED_LOOPBACK = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/;

function isLoopbackHost(host: string): boolean {
  let name = host.trim().toLowerCase();
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (IPV4_LOOPBACK.test(name)) {
    return name.split(".").every((octet) => Number(octet) <= 255);
  }
  const bare = name.startsWith("[") ? name.slice(1, -1) : name;
  if (!bare.includes(":")) return false;
  try {
    const spelled = new URL(`http://[${bare}]`).hostname;
    return spelled === "[::1]" || IPV6_MAPPED_LOOPBACK.test(spelled);
  } catch {
    return false;
  }
}

export function isLocalUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return LOCAL_PROTOCOLS.has(url.protocol) || isLoopbackHost(url.hostname);
}
