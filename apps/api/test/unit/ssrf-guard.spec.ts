import * as http from 'http';
import { AddressInfo } from 'net';
import {
  BlockedDestinationError,
  TimeoutError,
  assertAllowedUrl,
  assertResolvesToPublicAddress,
  isBlockedAddress,
  safeHttpGet,
  safeHttpGetJson,
} from '../../src/health-checks/ssrf-guard';

/** Fake resolver: answers every hostname with the given addresses. */
function resolverReturning(...addresses: string[]) {
  return ((_host: string, _opts: unknown, cb: (err: Error | null, addrs?: unknown) => void) =>
    cb(
      null,
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    )) as never;
}

describe('SSRF guard', () => {
  describe('isBlockedAddress', () => {
    it.each([
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.10',
      '169.254.169.254', // AWS / GCP / Azure metadata
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1', // IPv4-mapped loopback
      '::ffff:7f00:1', // IPv4-mapped loopback in hexadecimal form
      '::ffff:169.254.169.254',
      '64:ff9b::a00:1', // NAT64 → 10.0.0.1
      'not-an-ip',
    ])('blocks %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });

    it.each(['8.8.8.8', '1.1.1.1', '140.82.112.3', '172.32.0.1', '2606:4700:4700::1111'])('allows public %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    });
  });

  describe('assertAllowedUrl', () => {
    it.each([
      ['file:///etc/passwd', /only http and https/],
      ['gopher://example.com', /only http and https/],
      ['http://user:pass@example.com', /credentials/],
      ['http://localhost:4000/health', /internal hostname/],
      ['http://api.localhost/health', /internal hostname/],
      ['http://metadata.google.internal/', /internal hostname/],
      ['http://127.0.0.1/health', /private or reserved/],
      ['http://[::1]/health', /private or reserved/],
      ['http://169.254.169.254/latest/meta-data/', /private or reserved/],
      ['not a url', /invalid URL/],
    ])('rejects %s', (url, reason) => {
      expect(() => assertAllowedUrl(url)).toThrow(reason);
    });

    it('accepts a public https URL', () => {
      expect(assertAllowedUrl('https://status.example.com/health').hostname).toBe('status.example.com');
    });
  });

  describe('DNS resolution checks', () => {
    it('rejects a public-looking hostname that resolves to a private address', async () => {
      await expect(
        assertResolvesToPublicAddress('https://evil.example.com/health', resolverReturning('10.0.0.5')),
      ).rejects.toThrow(BlockedDestinationError);
    });

    it('rejects when any one of several resolved addresses is private', async () => {
      await expect(
        assertResolvesToPublicAddress('https://mixed.example.com', resolverReturning('8.8.8.8', '127.0.0.1')),
      ).rejects.toThrow(/127\.0\.0\.1/);
    });

    it('accepts a hostname resolving only to public addresses', async () => {
      await expect(
        assertResolvesToPublicAddress('https://ok.example.com', resolverReturning('140.82.112.3')),
      ).resolves.toBeUndefined();
    });
  });

  describe('safeHttpGet', () => {
    let server: http.Server;
    let port: number;
    const allowLoopback = (ip: string) => !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (req.url === '/ok') return res.writeHead(200).end('ok');
        if (req.url === '/json')
          return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"items":[1,2]}');
        if (req.url === '/error') return res.writeHead(500).end();
        if (req.url === '/redirect') return res.writeHead(302, { Location: 'http://169.254.169.254/' }).end();
        if (req.url === '/huge') {
          res.writeHead(200);
          const chunk = Buffer.alloc(1024 * 1024, 'x');
          const write = () => res.write(chunk) && setImmediate(write);
          return write();
        }
        // /slow: never responds
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      port = (server.address() as AddressInfo).port;
    });

    afterAll(async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    });

    it('blocks loopback with the default policy, even though a server is listening', async () => {
      await expect(safeHttpGet(`http://127.0.0.1:${port}/ok`, { timeoutMs: 1000 })).rejects.toThrow(
        BlockedDestinationError,
      );
    });

    it('blocks DNS rebinding: the address is checked at connect time, not just at save time', async () => {
      await expect(
        safeHttpGet(`http://rebind.example.com:${port}/ok`, {
          timeoutMs: 1000,
          lookup: resolverReturning('127.0.0.1'),
        }),
      ).rejects.toThrow(/resolves to 127\.0\.0\.1/);
    });

    // The remaining cases use a policy that permits loopback so a local server can stand in for a remote one.
    const get = (path: string, timeoutMs = 1000) =>
      safeHttpGet(`http://local.test:${port}${path}`, {
        timeoutMs,
        lookup: resolverReturning('127.0.0.1'),
        isBlocked: allowLoopback,
      });
    const getJson = (path: string, maxBytes = 1024) =>
      safeHttpGetJson(`http://local.test:${port}${path}`, {
        timeoutMs: 1000,
        lookup: resolverReturning('127.0.0.1'),
        isBlocked: allowLoopback,
        maxBytes,
      });

    it('returns the HTTP status of a reachable endpoint', async () => {
      await expect(get('/ok')).resolves.toEqual({ status: 200 });
      await expect(get('/error')).resolves.toEqual({ status: 500 });
    });

    it('does not follow redirects (so a 302 to the metadata IP is never fetched)', async () => {
      await expect(get('/redirect')).resolves.toEqual({ status: 302 });
    });

    it('returns as soon as headers arrive without downloading an endless body', async () => {
      const started = Date.now();
      await expect(get('/huge')).resolves.toEqual({ status: 200 });
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('times out a server that never responds', async () => {
      await expect(get('/slow', 200)).rejects.toThrow(TimeoutError);
    });

    it('reads bounded JSON responses for provider API calls', async () => {
      await expect(getJson('/json')).resolves.toMatchObject({ status: 200, body: '{"items":[1,2]}' });
      await expect(getJson('/huge', 128)).rejects.toThrow(/exceeded 128 bytes/);
    });
  });
});
