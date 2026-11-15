// SpaceTraders HTTP client: bearer auth, client-side rate limiting, 429 retry, request log events.
import { bus, store } from './state.js';

export const BASE = 'https://api.spacetraders.io/v2';

export class ApiError extends Error {
  constructor(status, payload, path) {
    const e = payload?.error;
    super(e ? `[${e.code}] ${e.message}` : `HTTP ${status} on ${path}`);
    this.status = status;
    this.code = e?.code;
    this.data = e?.data;
    this.payload = payload;
    this.path = path;
  }
}

// Server allows 2 req/s sustained with a burst of 30 (per IP). We stay a bit under the burst
// so other tabs/scripts on the same IP still have headroom.
const RATE_PER_SEC = 2;
const BUCKET_MAX = 10;
let tokens = BUCKET_MAX;
let lastRefill = performance.now();
let pausedUntil = 0;
let timer = null;
const queue = [];
let seq = 0;

/** Latest rate-limit header values reported by the server. */
export const rl = { remaining: null, burst: null, perSecond: null, reset: null, type: null, queued: 0 };

function refill() {
  const now = performance.now();
  tokens = Math.min(BUCKET_MAX, tokens + ((now - lastRefill) / 1000) * RATE_PER_SEC);
  lastRefill = now;
}

function schedule(delay = 0) {
  if (!timer) timer = setTimeout(pump, delay);
}

function pump() {
  timer = null;
  refill();
  while (queue.length && tokens >= 1 && Date.now() >= pausedUntil) {
    tokens -= 1;
    execute(queue.shift());
  }
  if (queue.length) {
    const now = Date.now();
    const wait = now < pausedUntil ? pausedUntil - now : Math.ceil(((1 - tokens) / RATE_PER_SEC) * 1000);
    schedule(Math.max(wait, 20));
  }
  rl.queued = queue.length;
  bus.emit('ratelimit', rl);
}

function readRateHeaders(headers) {
  const n = (k) => { const v = headers.get(k); return v == null ? null : Number(v); };
  rl.remaining = n('x-ratelimit-remaining') ?? rl.remaining;
  rl.burst = n('x-ratelimit-limit-burst') ?? rl.burst;
  rl.perSecond = n('x-ratelimit-limit-per-second') ?? rl.perSecond;
  rl.reset = headers.get('x-ratelimit-reset') ?? rl.reset;
  rl.type = headers.get('x-ratelimit-type') ?? rl.type;
}

function logHttp(job, status, ms, payload, note) {
  bus.emit('log', {
    kind: 'http', id: job.id, ts: new Date(), method: job.method, path: job.path,
    status, ms, req: job.body, res: payload, note,
  });
}

async function execute(job) {
  const { method, path, body, token } = job;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (err) {
    const payload = { error: { code: 'NETWORK', message: err.message || 'network error' } };
    logHttp(job, 0, Math.round(performance.now() - t0), payload, 'network error');
    job.reject(new ApiError(0, payload, path));
    return;
  }
  readRateHeaders(res.headers);
  const text = await res.text().catch(() => '');
  let payload = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = { raw: text }; } }
  const ms = Math.round(performance.now() - t0);

  if (res.status === 429 && job.attempt < 5) {
    const retryAfter = parseFloat(res.headers.get('retry-after')) || 1;
    pausedUntil = Date.now() + retryAfter * 1000;
    job.attempt += 1;
    queue.unshift(job);
    logHttp(job, 429, ms, payload, `rate limited, retry #${job.attempt} in ${retryAfter}s`);
    schedule();
    return;
  }

  logHttp(job, res.status, ms, payload, payload?.error?.message);
  if (!res.ok) {
    const err = new ApiError(res.status, payload, path);
    if (res.status === 401 && job.agentAuth) bus.emit('unauthorized', { token, err });
    job.reject(err);
    return;
  }
  job.resolve(payload ?? {});
}

/**
 * Queue an API request.
 * opts.token  – explicit bearer token (e.g. account token for /register)
 * opts.auth   – send the stored agent token (default true)
 */
export function request(method, path, body, opts = {}) {
  const auth = opts.auth !== false;
  const token = opts.token ?? (auth ? store.token : null);
  return new Promise((resolve, reject) => {
    queue.push({
      id: ++seq, method, path, body, token, attempt: 0,
      agentAuth: auth && !opts.token && !!token, resolve, reject,
    });
    rl.queued = queue.length;
    schedule();
  });
}

export const get = (path, opts) => request('GET', path, undefined, opts);
export const post = (path, body, opts) => request('POST', path, body, opts);
export const patch = (path, body, opts) => request('PATCH', path, body, opts);

/** Fetch every page of a paginated list endpoint (limit 20 is the server max). */
export async function getAll(path, opts) {
  const out = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; page < 500; page++) {
    const r = await get(`${path}${sep}limit=20&page=${page}`, opts);
    const data = r.data || [];
    out.push(...data);
    const total = r.meta?.total ?? out.length;
    if (!data.length || out.length >= total) break;
  }
  return out;
}
