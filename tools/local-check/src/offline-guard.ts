// The offline guard: a preload (`NODE_OPTIONS=--import=<this file>`) that makes
// a Node process refuse to reach any machine but its own. `pnpm check:full`
// starts `pnpm dev` with it (offline.ts), so a resource that needs the cloud,
// the network or a vendor's server fails there, not on a laptop with no
// Wi-Fi. It blocks what the app does, not every process on the machine (a
// child that is not Node, a browser): the browser has its own route.
//
// It patches the one place every Node connection passes through
// (`net.Socket.prototype.connect`, which http, https, tls and fetch's undici
// all use), `fetch` itself for a clearer error, UDP, and DNS (every way Node
// has to ask a resolver: a name looked up is a request to someone else). A refusal fails the
// call with `EOFFLINE`, and is written to stderr and to the file named by
// `ACME_OFFLINE_LOG`, which offline.ts reads, so an app that swallows the
// error still fails the run. Only erasable TypeScript: Node strips the types.
import dgram from "node:dgram";
import dns from "node:dns";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import { promisify } from "node:util";

import { isLoopbackHost } from "./loopback.ts";

const LOADED = Symbol.for("acme.offline-guard");
const loaded = globalThis as { [LOADED]?: true };

function refuse(target: string): Error {
  const line = `pid ${String(process.pid)} refused ${target}`;
  process.stderr.write(`[offline guard] ${line}\n`);
  const file = process.env.ACME_OFFLINE_LOG;
  if (file !== undefined && file !== "") appendFileSync(file, `${line}\n`);
  return Object.assign(
    new Error(`offline guard: refused a connection to ${target}; only this machine is reachable`),
    { code: "EOFFLINE" },
  );
}

// net.Socket.prototype.connect(options | port[, host] | path[, callback]),
// or the single normalised array net.connect passes on.
function connectTarget(args: unknown[]): { host: string; port: string } | undefined {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (typeof first === "object" && first !== null) {
    const options = first as { host?: unknown; path?: unknown; port?: unknown };
    if (typeof options.path === "string") return undefined; // a socket file
    const host = options.host;
    return {
      host: typeof host === "string" && host !== "" ? host : "localhost",
      port:
        typeof options.port === "number" || typeof options.port === "string"
          ? String(options.port)
          : "",
    };
  }
  // A string that is not a number is a socket file's path.
  if (typeof first === "string" && Number.isNaN(Number(first))) return undefined;
  const host = args[1];
  return {
    host: typeof host === "string" && host !== "" ? host : "localhost",
    port: String(first),
  };
}

function install(): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with its own this
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const target = connectTarget(args);
    if (target !== undefined && !isLoopbackHost(target.host)) {
      const error = refuse(`${target.host}:${target.port}`);
      process.nextTick(() => {
        this.destroy(error);
      });
      return this;
    }
    return Reflect.apply(connect, this, args) as net.Socket;
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = function (input: Parameters<typeof fetch>[0], init?: RequestInit) {
    let url: URL | undefined;
    try {
      url = new URL(input instanceof Request ? input.url : String(input));
    } catch {
      url = undefined; // fetch itself says why
    }
    if (
      url !== undefined &&
      ["http:", "https:", "ws:", "wss:"].includes(url.protocol) &&
      !isLoopbackHost(url.hostname)
    ) {
      const cause = refuse(url.host);
      return Promise.reject(new TypeError("fetch failed", { cause }));
    }
    return realFetch(input, init);
  };

  // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with its own this
  const send = dgram.Socket.prototype.send;
  dgram.Socket.prototype.send = function (this: dgram.Socket, ...args: unknown[]) {
    // send(msg[, offset, length], port, address[, callback]): without an address, loopback.
    const address = args.slice(1).findLast((one) => typeof one === "string");
    if (address !== undefined && !isLoopbackHost(address)) {
      const error = refuse(address);
      const callback = args.find((one) => typeof one === "function") as
        ((error: Error) => void) | undefined;
      process.nextTick(() => {
        if (callback === undefined) this.emit("error", error);
        else callback(error);
      });
      return;
    }
    Reflect.apply(send, this, args);
  } as typeof dgram.Socket.prototype.send;

  // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with its own this
  const connectUdp = dgram.Socket.prototype.connect;
  dgram.Socket.prototype.connect = function (this: dgram.Socket, ...args: unknown[]) {
    const address = args[1];
    if (typeof address === "string" && !isLoopbackHost(address)) {
      const error = refuse(address);
      process.nextTick(() => {
        this.emit("error", error);
      });
      return;
    }
    Reflect.apply(connectUdp, this, args);
  };
}

// Every function that asks a resolver, by its name (lookup, lookupService,
// resolve, resolve4, resolveTlsa, reverse, ...), taken from what the holder
// has, so a function a later Node adds is guarded without an edit here. Each
// takes a name (lookupService and reverse: an address) as its first argument.
const DNS_FUNCTION = /^(lookup|resolve|reverse)/;
const WRAPPED = Symbol.for("acme.offline-guard.wrapped");

const dnsFunctions = (holder: object): string[] =>
  Object.getOwnPropertyNames(holder).filter(
    (key) => DNS_FUNCTION.test(key) && typeof Reflect.get(holder, key) === "function",
  );

/**
 * Replaces each DNS function on `holder` (the module, or a Resolver's
 * prototype) with one that refuses a name off this machine: through its
 * callback, or, for the promise forms, as a rejection. A loopback name or no
 * name (lookup's "this machine") goes on to the real function.
 */
function guardDns(holder: object, style: "callback" | "promise"): void {
  for (const key of dnsFunctions(holder)) {
    const original: unknown = Reflect.get(holder, key);
    if (typeof original !== "function") continue;
    const guarded = function (this: unknown, ...args: unknown[]) {
      const name = args[0];
      if (typeof name !== "string" || name === "" || isLoopbackHost(name)) {
        return Reflect.apply(original, this, args) as unknown;
      }
      const error = refuse(name);
      if (style === "promise") return Promise.reject(error);
      const callback = args.findLast((one) => typeof one === "function") as
        ((error: Error) => void) | undefined;
      process.nextTick(() => {
        callback?.(error);
      });
      return undefined;
    };
    // util.promisify's hints (lookup's [address, family]) belong to the guard too.
    for (const symbol of Object.getOwnPropertySymbols(original)) {
      const descriptor = Object.getOwnPropertyDescriptor(original, symbol);
      if (descriptor !== undefined) Object.defineProperty(guarded, symbol, descriptor);
    }
    Object.defineProperty(guarded, "name", { value: key });
    Object.defineProperty(guarded, WRAPPED, { value: true });
    Reflect.set(holder, key, guarded);
  }
}

function installDns(): void {
  guardDns(dns.promises, "promise");
  guardDns(dns.promises.Resolver.prototype, "promise");
  guardDns(dns, "callback");
  guardDns(dns.Resolver.prototype, "callback");
  // promisify(dns.lookup) is dns.promises.lookup: the guarded one.
  for (const key of dnsFunctions(dns)) {
    const guarded: unknown = Reflect.get(dns, key);
    if (typeof guarded === "function" && promisify.custom in guarded) {
      Reflect.set(guarded, promisify.custom, Reflect.get(dns.promises, key));
    }
  }
}

if (loaded[LOADED] !== true) {
  loaded[LOADED] = true;
  install();
  installDns();
  // Named imports (`import { lookup } from "node:dns"`) see the guarded ones.
  syncBuiltinESMExports();
}
