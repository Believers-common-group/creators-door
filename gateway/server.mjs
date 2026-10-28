// Optional localhost-only BFF for the Influencers Door observation contract.
// Browser credentials never reach Warden, BNR or River directly.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeObservation, integrationStatus, sessionFromRequest, GateError } from './integrations.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const FILES = new Map(Object.entries({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/src/main.js': ['src/main.js', 'text/javascript; charset=utf-8'],
  '/src/data.js': ['src/data.js', 'text/javascript; charset=utf-8'],
  '/src/influencers.js': ['src/influencers.js', 'text/javascript; charset=utf-8'],
  '/src/styles.css': ['src/styles.css', 'text/css; charset=utf-8']
}));
const HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
});
function reply(res, code, body) {
  res.writeHead(code, { ...HEADERS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
async function readRequestBody(req) {
  if (req.headers['content-type'] !== 'application/json') throw new GateError(415, 'json_required');
  const bytes = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 4096) throw new GateError(413, 'request_too_large');
    bytes.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(bytes).toString('utf8')); }
  catch { throw new GateError(400, 'invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GateError(400, 'invalid_json');
  const allowed = ['campaign_id', 'relationship_id'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new GateError(400, 'unexpected_request_field');
  return body;
}
function validateOrigin(req, env) {
  const origin = env.GENESIS_PUBLIC_ORIGIN;
  if (!origin || !/^https:\/\/[^/]+$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    throw new GateError(503, 'public_origin_not_configured');
  }
  if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') {
    throw new GateError(403, 'origin_not_allowed');
  }
}

export function createGatewayServer({ env = process.env, fetchImpl = fetch } = {}) {
  // Local process rate limit; edge deployments additionally require distributed enforcement.
  const perClient = new Map();
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url || '/', 'http://local.invalid').pathname;
      if (req.method === 'GET' && path === '/api/influencers/status') {
        return reply(res, 200, integrationStatus(env));
      }
      if (path === '/api/influencers/observe') {
        if (req.method !== 'POST') return reply(res, 405, { code: 'method_not_allowed' });
        validateOrigin(req, env);
        const ip = req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const existing = perClient.get(ip) || { until: now + 60000, count: 0 };
        if (now >= existing.until) { existing.count = 0; existing.until = now + 60000; }
        existing.count++;
        perClient.set(ip, existing);
        if (perClient.size > 2048) perClient.clear();
        if (existing.count > 12) throw new GateError(429, 'rate_limit_exceeded');
        const body = await readRequestBody(req);
        const sessionJwt = sessionFromRequest(req);
        const result = await authorizeObservation({ sessionJwt, body, env, fetchImpl });
        return reply(res, 200, result);
      }
      const file = FILES.get(path);
      if (!file || req.method !== 'GET') return reply(res, 404, { code: 'not_found' });
      const resolved = resolve(ROOT, file[0]);
      if (!resolved.startsWith(ROOT + '/')) throw new GateError(404, 'not_found');
      const metadata = await stat(resolved);
      if (!metadata.isFile() || metadata.size > 1024 * 1024) throw new GateError(404, 'not_found');
      const contents = await readFile(resolved);
      res.writeHead(200, { ...HEADERS, 'content-type': file[1] });
      res.end(contents);
    } catch (error) {
      const status = error instanceof GateError ? error.status : 503;
      reply(res, status, { code: error instanceof GateError ? error.code : 'gateway_unavailable' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bind = process.env.GATEWAY_BIND || '127.0.0.1';
  if (bind !== '127.0.0.1' && bind !== '::1') {
    throw new Error('gateway_bind_requires_loopback');
  }
  const port = Number(process.env.PORT || 4174);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_port');
  createGatewayServer().listen(port, bind, () => {
    process.stdout.write('Influencers observation gateway (local, fail-closed): http://' + bind + ':' + port + '\n');
  });
}
