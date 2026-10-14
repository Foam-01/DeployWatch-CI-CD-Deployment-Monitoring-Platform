import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP } from 'net';

/**
 * SSRF protection for user-supplied health-check and provider URLs.
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
  ['2002::', 16], // 6to4 embeds an IPv4 destination
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
    const mapped = mappedIPv4(ip);
    if (mapped) return blocked.check(mapped, 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true; // not an IP at all — refuse
}

function mappedIPv4(ip: string): string | null {
  const normalized = ip.toLowerCase();
  const finalSeparator = normalized.lastIndexOf(':');
  const possibleDotted = normalized.slice(finalSeparator + 1);
  let words: number[];
  if (possibleDotted.includes('.')) {
    const octets = possibleDotted.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255))
      return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    words = expandIPv6Words(`${normalized.slice(0, finalSeparator)}:${high}:${low}`);
  } else {
    words = expandIPv6Words(normalized);
  }
  if (words.length !== 8 || words.slice(0, 5).some((word) => word !== 0) || words[5] !== 0xffff) return null;
  const value = (words[6] << 16) | words[7];
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function expandIPv6Words(address: string): number[] {
  const halves = address.split('::');
  if (halves.length > 2) return [];
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const zeros = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array.from({ length: zeros }, () => '0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return [];
  return parts.map((part) => Number.parseInt(part, 16));
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
  if (
    isBlocked === isBlockedAddress &&
    (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
  ) {
    throw new BlockedDestinationError('internal hostname');
  }
  if (isIP(host) && isBlocked(host)) {
    throw new BlockedDestinationError(`private or reserved address ${host}`);
  }
  return url;
}

type LookupFn = typeof dns.lookup;
type SafeLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | dns.LookupAddress[],
  family?: number,
) => void;

/** DNS lookup used by the socket itself; fails the connection if any resolved address is blocked. */
export function makeSafeLookup(
  resolve: LookupFn = dns.lookup,
  isBlocked: (ip: string) => boolean = isBlockedAddress,
): LookupFn {
  return ((hostname: string, options: dns.LookupOptions, callback: SafeLookupCallback) => {
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
  headers?: Record<string, string>;
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

export interface SafeJsonGetResult extends SafeGetResult {
  body: string;
}

/** Bounded JSON-capable GET for API integrations; redirects remain disabled. */
export function safeHttpGetJson(raw: string, opts: SafeGetOptions & { maxBytes?: number }): Promise<SafeJsonGetResult> {
  const isBlocked = opts.isBlocked ?? isBlockedAddress;
  const url = assertAllowedUrl(raw, isBlocked);
  const client = url.protocol === 'https:' ? https : http;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const headers: Record<string, string> = {
    'User-Agent': 'DeployWatch/1.0',
    Accept: 'application/json',
    ...opts.headers,
  };

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      { method: 'GET', lookup: makeSafeLookup(opts.lookup, isBlocked), headers },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error(`Response exceeded ${maxBytes} bytes.`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          clearTimeout(deadline);
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
        });
        res.on('error', (err) => {
          clearTimeout(deadline);
          reject(err);
        });
      },
    );
    const deadline = setTimeout(() => req.destroy(new TimeoutError(opts.timeoutMs)), opts.timeoutMs);
    req.on('error', (err) => {
      clearTimeout(deadline);
      reject(err);
    });
    req.end();
  });
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
