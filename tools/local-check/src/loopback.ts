// Which hosts "this machine only" allows: the rule the offline guard (in
// Node) applies. The browser's copy is frontend/e2e/local-url.ts;
// loopback-parity.test.ts holds the two together.

const IPV4_LOOPBACK = /^127(?:\.(\d{1,3})){3}$/;
// ::ffff:7f00:1, how a URL spells the IPv4-mapped 127.0.0.1.
const IPV6_MAPPED_LOOPBACK = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/;

/**
 * Whether a host names this machine: `localhost` and any `*.localhost`,
 * 127.0.0.0/8, ::1 and its IPv4-mapped form. Everything else is refused,
 * including 0.0.0.0 and an address that only looks local (`127.0.0.1.example.com`).
 */
export function isLoopbackHost(host: string): boolean {
  let name = host.trim().toLowerCase();
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (IPV4_LOOPBACK.test(name)) {
    return name.split(".").every((octet) => Number(octet) <= 255);
  }
  const bare = name.startsWith("[") ? name.slice(1, -1) : name;
  if (!bare.includes(":")) return false;
  try {
    // A URL spells every IPv6 form one way.
    const spelled = new URL(`http://[${bare}]`).hostname;
    return spelled === "[::1]" || IPV6_MAPPED_LOOPBACK.test(spelled);
  } catch {
    return false;
  }
}
