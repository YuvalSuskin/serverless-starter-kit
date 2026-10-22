/* eslint-disable sonarjs/no-hardcoded-ip -- the addresses are the subject of these tests */
// The guard is a preload (NODE_OPTIONS=--import=...), so it is tested the way
// it is used: in a child Node that imports it, never in this test's own process.
import { execFile } from "node:child_process";
import dns from "node:dns";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const GUARD = pathToFileURL(path.join(import.meta.dirname, "offline-guard.ts")).href;

let server: Server;
let port: number;
let dir: string;
let runs = 0;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "offline-guard-"));
  server = createServer((_request, response) => {
    response.end("local");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});
afterAll(() => {
  server.close();
  rmSync(dir, { force: true, recursive: true });
});

/** Runs `script` in a Node that preloaded the guard; resolves to what it printed. (Async: the local server answers from this process.) */
async function guarded(script: string): Promise<{ out: string; log: string }> {
  runs += 1;
  const log = path.join(dir, `${String(runs)}.log`);
  const { stdout } = await run(
    process.execPath,
    ["--import", GUARD, "--input-type=module", "--eval", script],
    { env: { ...process.env, ACME_OFFLINE_LOG: log }, timeout: 15_000 },
  );
  let written = "";
  try {
    written = readFileSync(log, "utf8");
  } catch {
    // Nothing was refused.
  }
  return { out: stdout.trim(), log: written };
}

// What a script prints when its connection ends: "ok", or the refusal's code.
const connect = (host: string, target: number) => `
  import net from "node:net";
  const socket = net.connect({ host: ${JSON.stringify(host)}, port: ${String(target)} });
  socket.on("connect", () => { console.log("ok"); socket.destroy(); });
  socket.on("error", (error) => { console.log(error.code ?? error.message); });
`;

describe("the offline guard", () => {
  it("refuses a connection to 1.1.1.1, and says so in the log", async () => {
    const { out, log } = await guarded(connect("1.1.1.1", 443));
    expect(out).toBe("EOFFLINE");
    expect(log).toContain("1.1.1.1:443");
  });

  it("allows a connection to 127.0.0.1", async () => {
    const { out, log } = await guarded(connect("127.0.0.1", port));
    expect(out).toBe("ok");
    expect(log).toBe("");
  });

  it("allows localhost by name and a path (a socket file)", async () => {
    expect((await guarded(connect("localhost", port))).out).toBe("ok");
    const { out } = await guarded(`
      import net from "node:net";
      net.connect("/nonexistent.sock").on("error", (error) => { console.log(error.code); });
    `);
    expect(out).toBe("ENOENT");
  });

  it("refuses a name before it is looked up, and a TLS connection", async () => {
    const named = await guarded(connect("example.com", 80));
    expect(named.out).toBe("EOFFLINE");
    expect(named.log).toContain("example.com:80");
    const tls = await guarded(`
      import tls from "node:tls";
      tls.connect({ host: "example.com", port: 443 }).on("error", (error) => { console.log(error.code); });
    `);
    expect(tls.out).toBe("EOFFLINE");
  });

  it("refuses a fetch to 1.1.1.1 and allows one to 127.0.0.1", async () => {
    const refused = await guarded(`
      await fetch("http://1.1.1.1/").then(() => console.log("sent"), (error) => console.log(error.cause?.code ?? error.code));
    `);
    expect(refused.out).toBe("EOFFLINE");
    expect(refused.log).toContain("1.1.1.1");
    const allowed = await guarded(`
      console.log(await (await fetch("http://127.0.0.1:${String(port)}/")).text());
    `);
    expect(allowed.out).toBe("local");
    expect(allowed.log).toBe("");
  });

  it("refuses UDP to another machine", async () => {
    const { out } = await guarded(`
      import dgram from "node:dgram";
      const socket = dgram.createSocket("udp4");
      socket.send("hi", 53, "8.8.8.8", (error) => { console.log(error?.code ?? "sent"); socket.close(); });
    `);
    expect(out).toBe("EOFFLINE");
  });

  // A name looked up is a request to someone else's DNS server, even before any
  // connection: every way Node has to ask is refused for a name off this machine.
  const dnsCases: Record<string, string> = {
    "dns.lookup": `import dns from "node:dns"; dns.lookup("example.com", (error) => console.log(error?.code ?? "answered"));`,
    "dns.lookup with options": `import dns from "node:dns"; dns.lookup("example.com", { all: true }, (error) => console.log(error?.code ?? "answered"));`,
    "util.promisify(dns.lookup)": `import dns from "node:dns"; import { promisify } from "node:util"; await promisify(dns.lookup)("example.com").then(() => console.log("answered"), (error) => console.log(error.code));`,
    "dns.resolve4": `import dns from "node:dns"; dns.resolve4("example.com", (error) => console.log(error?.code ?? "answered"));`,
    "dns.resolve (any record)": `import dns from "node:dns"; dns.resolve("example.com", "TXT", (error) => console.log(error?.code ?? "answered"));`,
    "dns.reverse": `import dns from "node:dns"; dns.reverse("8.8.8.8", (error) => console.log(error?.code ?? "answered"));`,
    "a named import": `import { resolve6 } from "node:dns"; resolve6("example.com", (error) => console.log(error?.code ?? "answered"));`,
    "dns.promises.lookup": `import dns from "node:dns"; await dns.promises.lookup("example.com").then(() => console.log("answered"), (error) => console.log(error.code));`,
    "dns.promises.resolve4": `import { resolve4 } from "node:dns/promises"; await resolve4("example.com").then(() => console.log("answered"), (error) => console.log(error.code));`,
    "dns.promises.resolveMx": `import dns from "node:dns"; await dns.promises.resolveMx("example.com").then(() => console.log("answered"), (error) => console.log(error.code));`,
    "new dns.Resolver()": `import dns from "node:dns"; new dns.Resolver().resolve4("example.com", (error) => console.log(error?.code ?? "answered"));`,
    "dns.lookupService": `import dns from "node:dns"; dns.lookupService("8.8.8.8", 53, (error) => console.log(error?.code ?? "answered"));`,
    "dns.promises.lookupService": `import dns from "node:dns"; await dns.promises.lookupService("8.8.8.8", 53).then(() => console.log("answered"), (error) => console.log(error.code));`,
    "new dns.promises.Resolver()": `import dns from "node:dns"; await new dns.promises.Resolver().resolve4("example.com").then(() => console.log("answered"), (error) => console.log(error.code));`,
  };

  for (const [name, script] of Object.entries(dnsCases)) {
    it(`refuses ${name} for a name off this machine, and logs it`, async () => {
      const { out, log } = await guarded(script);
      expect(out).toBe("EOFFLINE");
      expect(log).toMatch(/refused (example\.com|8\.8\.8\.8)$/m);
    });
  }

  // Node 24 has no TLSA lookups; later Nodes do. Skipped where the function is absent.
  const hasTlsa = typeof dns.resolveTlsa === "function";
  it.skipIf(!hasTlsa)(
    "refuses dns.resolveTlsa and Resolver#resolveTlsa for a name off this machine",
    async () => {
      const plain = await guarded(
        `import dns from "node:dns"; dns.resolveTlsa("_443._tcp.example.com", (error) => console.log(error?.code ?? "answered"));`,
      );
      const resolver = await guarded(
        `import dns from "node:dns"; new dns.Resolver().resolveTlsa("_443._tcp.example.com", (error) => console.log(error?.code ?? "answered"));`,
      );
      expect([plain.out, resolver.out]).toEqual(["EOFFLINE", "EOFFLINE"]);
    },
  );

  // The guard wraps what the module has, not a list that goes out of date with
  // the next Node: every function whose name starts lookup, resolve or reverse.
  it("wraps every lookup*, resolve* and reverse* function the module and its Resolvers have", async () => {
    const { out } = await guarded(`
      import dns from "node:dns";
      const holders = { dns, "dns.promises": dns.promises, "Resolver.prototype": dns.Resolver.prototype, "promises.Resolver.prototype": dns.promises.Resolver.prototype };
      const unwrapped = [];
      let seen = 0;
      for (const [holderName, holder] of Object.entries(holders)) {
        for (const key of Object.getOwnPropertyNames(holder)) {
          if (!/^(lookup|resolve|reverse)/.test(key) || typeof holder[key] !== "function") continue;
          seen += 1;
          if (holder[key][Symbol.for("acme.offline-guard.wrapped")] !== true) unwrapped.push(holderName + "." + key);
        }
      }
      console.log(seen > 40 ? "none:" + unwrapped.join(",") : "too few seen: " + seen);
    `);
    expect(out).toBe("none:");
  });

  it("still resolves localhost, by callback, promise and Resolver", async () => {
    const { out, log } = await guarded(`
      import dns from "node:dns";
      const a = await new Promise((resolve) => dns.lookup("localhost", (error) => resolve(error?.code ?? "ok")));
      const b = await dns.promises.lookup("localhost").then(() => "ok", (error) => error.code);
      const c = await dns.promises.lookup("127.0.0.1").then(() => "ok", (error) => error.code);
      console.log(a, b, c);
    `);
    expect(out).toBe("ok ok ok");
    expect(log).toBe("");
  });

  it("is loaded once, whatever imports it", async () => {
    const { out } = await guarded(`
      import net from "node:net";
      const before = net.Socket.prototype.connect;
      await import(${JSON.stringify(GUARD)} + "?again");
      console.log(net.Socket.prototype.connect === before ? "same" : "patched twice");
    `);
    expect(out).toBe("same");
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip -- end of the addresses */
