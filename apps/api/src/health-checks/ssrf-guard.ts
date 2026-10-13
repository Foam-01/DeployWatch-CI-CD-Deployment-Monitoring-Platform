import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP } from 'net';

/**
 * SSRF protection for user-supplied health check URLs.
 *
 * String checks on the URL are not enough: a public hostname can resolve to an
 * internal address, or re-resolve to one between validation and the request
 * (DNS rebinding). So every address is validated inside the socket's own DNS
 * lookup, i.e. on the exact IP the connection is made to.
 */

export class BlockedDestinationError extends Error {
  constructor(reason: string) {
    super(`Destination not allowed: ${reason}`);
  }
}

const blocked = new BlockList();
// IPv4 — RFC 6890 special-purpose ranges plus cloud metadata.
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, incl. 169.254.169.254 metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
// IPv6
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 can reach internal IPv4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  ['2001:db8::', 32], // documentation
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** True when `ip` is loopback, private, link-local, metadata or otherwise non-public. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true; // not an IP at all — refuse
}

/** Static checks that need no network: scheme, credentials and literal IPs. */
export function assertAllowedUrl(raw: string, isBlocked: (ip: string) => boolean = isBlockedAddress): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedDestinationError('invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedDestinationError('only http and https are allowed');
  }
  if (url.username || url.password) {
    throw new BlockedDestinationError('credentials in URL are not allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlocked === isBlockedAddress && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))) {
    throw new BlockedDestinationError('internal hostname');
  }
  if (isIP(host) && isBlocked(host)) {
    throw new BlockedDestinationError(`private or reserved address ${host}`);
  }
  return url;
}

type LookupFn = typeof dns.lookup;

/** DNS lookup used by the socket itself; fails the connection if any resolved address is blocked. */
export function makeSafeLookup(
  resolve: LookupFn = dns.lookup,
  isBlocked: (ip: string) => boolean = isBlockedAddress,
): LookupFn {
  return ((hostname: string, options: dns.LookupOptions, callback: (...args: any[]) => void) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = addresses as unknown as dns.LookupAddress[];
      const bad = list.find((a) => isBlocked(a.address));
      if (bad || list.length === 0) {
        return callback(new BlockedDestinationError(`${hostname} resolves to ${bad?.address ?? 'nothing'}`));
      }
      if (options?.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  }) as LookupFn;
}

/** Resolves a hostname up front so configuration errors surface when the service is saved. */
export async function assertResolvesToPublicAddress(raw: string, resolve: LookupFn = dns.lookup): Promise<void> {
  const url = assertAllowedUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  await new Promise<void>((ok, fail) =>
    makeSafeLookup(resolve)(host, { all: true }, (err: Error | null) => (err ? fail(err) : ok())),
  );
}

export interface SafeGetResult {
  status: number;
}

export interface SafeGetOptions {
  timeoutMs: number;
  lookup?: LookupFn;
  /** Address policy; defaults to blocking every non-public range. */
  isBlocked?: (ip: string) => boolean;
}

/**
 * GET with SSRF protection. Only the status line is read — the body is never
 * downloaded, so response size cannot exhaust memory. Redirects are not followed;
 * a 3xx is reported as-is so a public endpoint cannot bounce the checker inward.
 */
export function safeHttpGet(raw: string, opts: SafeGetOptions): Promise<SafeGetResult> {
  return safeHttpRequest(raw, { ...opts, method: 'GET' });
}

/** JSON POST with the same protections as safeHttpGet (used for outbound notifications). */
export function safeHttpPostJson(raw: string, payload: unknown, opts: SafeGetOptions): Promise<SafeGetResult> {
  return safeHttpRequest(raw, { ...opts, method: 'POST', body: JSON.stringify(payload) });
}

async function safeHttpRequest(
  raw: string,
  opts: SafeGetOptions & { method: 'GET' | 'POST'; body?: string },
): Promise<SafeGetResult> {
  const isBlocked = opts.isBlocked ?? isBlockedAddress;
  const url = assertAllowedUrl(raw, isBlocked);
  const client = url.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = { 'User-Agent': 'DeployWatch/1.0', Accept: '*/*' };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(opts.body));
  }

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: opts.method,
        lookup: makeSafeLookup(opts.lookup, isBlocked),
        headers,
      },
      (res) => {
        clearTimeout(deadline);
        resolve({ status: res.statusCode ?? 0 });
        res.destroy();
      },
    );
    // Covers DNS, connect, TLS and time-to-first-byte together.
    const deadline = setTimeout(() => req.destroy(new TimeoutError(opts.timeoutMs)), opts.timeoutMs);
    req.on('error', (err) => {
      clearTimeout(deadline);
      reject(err);
    });
    req.end(opts.body);
  });
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}
