import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { planById, type PlanId } from '../shared/plans.ts';
import { normalizeExams } from '../shared/exams.ts';
import { validateLogin, validateSignup, verifyPassword, hashPassword } from './auth.ts';
import {
  attemptsForPaper,
  billingFor,
  createPayment,
  createSession,
  createUser,
  deleteAttempt,
  deletePaper,
  deleteSession,
  getAttempt,
  getPaper,
  listAttempts,
  listPapers,
  listPayments,
  markPaid,
  paymentByOrder,
  publicUser,
  readFileForUser,
  saveAttempt,
  saveFile,
  savePaper,
  sweepSessions,
  updateExams,
  userByEmail,
  userById,
  userForSession,
  type BillingSnapshot,
} from './db.ts';
import { loadEnv, razorpayConfigured } from './env.ts';

loadEnv();
sweepSessions();

const PORT = Number(process.env.PORT || 8787);
// Railway and other hosts need 0.0.0.0. Local `npm run server` can stay on loopback.
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const JSON_LIMIT = 25 * 1024 * 1024;
const FILE_LIMIT = 40 * 1024 * 1024;
const ID = /^[a-zA-Z0-9_-]{4,80}$/;

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface AuthedUser {
  id: string;
  name: string;
  email: string;
  exams: string[];
}

type Ctx = { req: IncomingMessage; res: ServerResponse; url: URL; user: AuthedUser | null; params: Record<string, string> };

const loginHits = new Map<string, number[]>();

function rateLimit(ip: string) {
  const now = Date.now();
  const hits = (loginHits.get(ip) ?? []).filter((at) => now - at < 15 * 60 * 1000);
  if (hits.length >= 20) return false;
  hits.push(now);
  loginHits.set(ip, hits);
  return true;
}

function cookies(req: IncomingMessage) {
  const out: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function sessionIdFrom(req: IncomingMessage) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return cookies(req).cbt_session ?? '';
}

function currentUser(req: IncomingMessage): AuthedUser | null {
  const id = sessionIdFrom(req);
  if (!id) return null;
  const user = userForSession(id);
  return user ? publicUser(user) : null;
}

function cookieSecure(req: IncomingMessage) {
  if (process.env.COOKIE_SECURE === '1') return true;
  if (process.env.COOKIE_SECURE === '0') return false;
  return req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(ctx: Ctx, token: string | null) {
  const secure = cookieSecure(ctx.req) ? '; Secure' : '';
  const value = token
    ? `cbt_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${secure}`
    : `cbt_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  ctx.res.setHeader('set-cookie', value);
}

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((item) => item.trim());
  if (origin && allowed.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'same-origin');
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBuffer(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) throw new HttpError(413, 'That file is too large. Keep each PDF under 40 MB.');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage) {
  const raw = await readBuffer(req, JSON_LIMIT);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

function requireUser(ctx: Ctx): AuthedUser {
  if (!ctx.user) throw new HttpError(401, 'Sign in to continue.', 'auth');
  return ctx.user;
}

function sessionPayload(user: AuthedUser, token?: string) {
  const billing: BillingSnapshot = billingFor(user.id);
  return { user, billing, ...(token ? { token } : {}) };
}

function assertId(id: string) {
  if (!ID.test(id)) throw new HttpError(400, 'Invalid id.');
}

function safeName(header: string | undefined) {
  const raw = decodeURIComponent(header || 'paper.pdf').split(/[/\\]/).pop() || 'paper.pdf';
  const cleaned = raw.replace(/[^\w.\- ()[\]]+/g, '').slice(0, 180);
  return cleaned || 'paper.pdf';
}

async function createRazorpayOrder(amountPaise: number, receipt: string) {
  const key = process.env.RAZORPAY_KEY_ID ?? '';
  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('Razorpay order failed', detail);
    throw new HttpError(502, 'Could not start the payment. Try again in a moment.');
  }
  const order = (await response.json()) as { id?: string };
  if (!order.id) throw new HttpError(502, 'Could not start the payment. Try again in a moment.');
  return order.id;
}

function razorpaySignature(orderId: string, paymentId: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function signaturesMatch(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const routes: { method: string; pattern: RegExp; auth?: boolean; handler: (ctx: Ctx) => Promise<void> }[] = [
  {
    method: 'GET',
    pattern: /^\/api\/health$/,
    handler: async ({ res }) => send(res, 200, { ok: true }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/me$/,
    handler: async (ctx) => {
      if (!ctx.user) return send(ctx.res, 200, { user: null, billing: null });
      send(ctx.res, 200, sessionPayload(ctx.user));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/signup$/,
    handler: async (ctx) => {
      const ip = ctx.req.socket.remoteAddress ?? 'local';
      if (!rateLimit(ip)) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
      const body = await readJson(ctx.req);
      const problem = validateSignup({
        name: typeof body.name === 'string' ? body.name : '',
        email: typeof body.email === 'string' ? body.email : '',
        password: typeof body.password === 'string' ? body.password : '',
      });
      if (problem) throw new HttpError(400, problem);
      const exams = normalizeExams(body.exams);
      if (!exams) throw new HttpError(400, 'Choose at least one exam you are preparing for.');
      const name = String(body.name).trim();
      const email = String(body.email).trim().toLowerCase();
      if (userByEmail(email)) throw new HttpError(409, 'An account with this email already exists.');
      const id = crypto.randomUUID();
      createUser({ id, name, email, passwordHash: await hashPassword(String(body.password)), exams });
      const user = userById(id);
      if (!user) throw new HttpError(500, 'Could not create the account.');
      const token = createSession(user.id);
      setSessionCookie(ctx, token);
      send(ctx.res, 201, sessionPayload(publicUser(user), token));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/login$/,
    handler: async (ctx) => {
      const ip = ctx.req.socket.remoteAddress ?? 'local';
      if (!rateLimit(ip)) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
      const body = await readJson(ctx.req);
      const email = typeof body.email === 'string' ? body.email : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (validateLogin({ email, password })) throw new HttpError(401, 'Email or password is incorrect.');
      const user = userByEmail(email.trim().toLowerCase());
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new HttpError(401, 'Email or password is incorrect.');
      }
      const token = createSession(user.id);
      setSessionCookie(ctx, token);
      send(ctx.res, 200, sessionPayload(publicUser(user), token));
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/auth\/exams$/,
    auth: true,
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const body = await readJson(ctx.req);
      const exams = normalizeExams(body.exams);
      if (!exams) throw new HttpError(400, 'Choose at least one exam you are preparing for.');
      updateExams(user.id, exams);
      const saved = userById(user.id);
      if (!saved) throw new HttpError(404, 'Account not found.');
      send(ctx.res, 200, sessionPayload(publicUser(saved)));
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout$/,
    handler: async (ctx) => {
      const token = sessionIdFrom(ctx.req);
      if (token) deleteSession(token);
      setSessionCookie(ctx, null);
      send(ctx.res, 200, { ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/papers$/,
    auth: true,
    handler: async (ctx) => send(ctx.res, 200, listPapers(requireUser(ctx).id)),
  },
  {
    method: 'GET',
    pattern: /^\/api\/papers\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      const paper = getPaper(requireUser(ctx).id, ctx.params.id);
      if (!paper) throw new HttpError(404, 'Paper not found.');
      send(ctx.res, 200, paper);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/papers\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      const body = await readJson(ctx.req);
      if (body.id !== ctx.params.id) throw new HttpError(400, 'Paper id does not match.');
      if (typeof body.name !== 'string' || !body.name.trim()) throw new HttpError(400, 'Paper name is required.');
      if (!Array.isArray(body.questions) || !Array.isArray(body.files) || !Array.isArray(body.sections)) {
        throw new HttpError(400, 'Invalid paper.');
      }
      if (body.questions.length > 2000) throw new HttpError(400, 'This paper has too many questions.');
      const saved = savePaper(requireUser(ctx).id, body);
      if (!saved.ok && saved.reason === 'quota') {
        throw new HttpError(402, 'The free plan keeps 1 paper. Upgrade to import more.', 'upgrade_required');
      }
      if (!saved.ok) throw new HttpError(404, 'Paper not found.');
      send(ctx.res, 200, saved.paper);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/papers\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      if (!deletePaper(requireUser(ctx).id, ctx.params.id)) throw new HttpError(404, 'Paper not found.');
      send(ctx.res, 200, { ok: true });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/files\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const bytes = await readBuffer(ctx.req, FILE_LIMIT);
      if (bytes.length < 5 || bytes.subarray(0, 4).toString() !== '%PDF') throw new HttpError(400, 'Upload a PDF file.');
      const saved = saveFile(user.id, ctx.params.id, safeName(ctx.req.headers['x-file-name'] as string | undefined), bytes);
      if (!saved.ok && saved.reason === 'quota') {
        throw new HttpError(402, 'The free plan keeps 1 paper. Upgrade to import more.', 'upgrade_required');
      }
      if (!saved.ok) throw new HttpError(400, 'Could not store that PDF.');
      send(ctx.res, 200, { ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/files\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      const file = readFileForUser(requireUser(ctx).id, ctx.params.id);
      if (!file || !existsSync(file.path)) throw new HttpError(404, 'PDF file is missing from storage.');
      ctx.res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
      });
      createReadStream(file.path).pipe(ctx.res);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/attempts$/,
    auth: true,
    handler: async (ctx) => send(ctx.res, 200, listAttempts(requireUser(ctx).id)),
  },
  {
    method: 'GET',
    pattern: /^\/api\/papers\/([^/]+)\/attempts$/,
    auth: true,
    handler: async (ctx) => send(ctx.res, 200, attemptsForPaper(requireUser(ctx).id, ctx.params.id)),
  },
  {
    method: 'GET',
    pattern: /^\/api\/attempts\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      const attempt = getAttempt(requireUser(ctx).id, ctx.params.id);
      if (!attempt) throw new HttpError(404, 'This attempt no longer exists.');
      send(ctx.res, 200, attempt);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/attempts\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      const body = await readJson(ctx.req);
      if (body.id !== ctx.params.id) throw new HttpError(400, 'Attempt id does not match.');
      if (typeof body.paperId !== 'string' || typeof body.status !== 'string') throw new HttpError(400, 'Invalid attempt.');
      if (!saveAttempt(requireUser(ctx).id, body)) throw new HttpError(404, 'The paper for this attempt was deleted.');
      send(ctx.res, 200, { ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/attempts\/([^/]+)$/,
    auth: true,
    handler: async (ctx) => {
      if (!deleteAttempt(requireUser(ctx).id, ctx.params.id)) throw new HttpError(404, 'This attempt no longer exists.');
      send(ctx.res, 200, { ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/billing\/payments$/,
    auth: true,
    handler: async (ctx) => send(ctx.res, 200, listPayments(requireUser(ctx).id)),
  },
  {
    method: 'POST',
    pattern: /^\/api\/billing\/checkout$/,
    auth: true,
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const body = await readJson(ctx.req);
      const plan = planById(typeof body.planId === 'string' ? body.planId : '');
      if (!plan) throw new HttpError(400, 'Choose a plan.');
      const paymentId = crypto.randomUUID();
      if (razorpayConfigured()) {
        const orderId = await createRazorpayOrder(plan.pricePaise, paymentId.slice(0, 40));
        createPayment({
          id: paymentId,
          userId: user.id,
          planId: plan.id as PlanId,
          amountPaise: plan.pricePaise,
          provider: 'razorpay',
          providerOrderId: orderId,
        });
        send(ctx.res, 200, {
          mode: 'razorpay',
          orderId,
          amountPaise: plan.pricePaise,
          currency: 'INR',
          planId: plan.id,
          keyId: process.env.RAZORPAY_KEY_ID,
        });
        return;
      }
      createPayment({
        id: paymentId,
        userId: user.id,
        planId: plan.id as PlanId,
        amountPaise: plan.pricePaise,
        provider: 'test',
        providerOrderId: paymentId,
      });
      send(ctx.res, 200, {
        mode: 'test',
        orderId: paymentId,
        amountPaise: plan.pricePaise,
        currency: 'INR',
        planId: plan.id,
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/billing\/confirm$/,
    auth: true,
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const body = await readJson(ctx.req);
      const orderId = typeof body.orderId === 'string' ? body.orderId : '';
      const payment = paymentByOrder(user.id, orderId);
      if (!payment) throw new HttpError(404, 'This checkout was not found.');
      if (payment.provider === 'razorpay') {
        const paymentId = typeof body.paymentId === 'string' ? body.paymentId : '';
        const signature = typeof body.signature === 'string' ? body.signature : '';
        if (!paymentId || !signature || !signaturesMatch(signature, razorpaySignature(orderId, paymentId))) {
          throw new HttpError(400, 'Payment could not be verified.');
        }
        const result = markPaid(user.id, orderId, paymentId);
        if (!result.ok) throw new HttpError(400, 'Payment could not be verified.');
        send(ctx.res, 200, { billing: result.billing });
        return;
      }
      if (razorpayConfigured()) throw new HttpError(400, 'Test checkout is disabled.');
      const result = markPaid(user.id, orderId, `test_${payment.id}`);
      if (!result.ok) throw new HttpError(400, 'This checkout has expired. Start it again.');
      send(ctx.res, 200, { billing: result.billing });
    },
  },
];

function matchRoute(method: string, path: string) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (!match) continue;
    return { route, params: { id: match[1] ? decodeURIComponent(match[1]) : '' } };
  }
  return null;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.bcmap': 'application/octet-stream',
};

async function serveStatic(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const dist = join(process.cwd(), 'dist');
  const requested = normalize(decodeURIComponent(url.pathname));
  const relative = requested === '/' ? 'index.html' : requested.replace(/^[/\\]+/, '');
  let file = join(dist, relative);
  if (!file.startsWith(dist)) {
    res.writeHead(400);
    res.end();
    return;
  }
  const ext = extname(file).toLowerCase();
  // Missing asset files must 404. Falling back to index.html breaks pdf.js worker imports (.mjs).
  if (!existsSync(file)) {
    if (ext) {
      send(res, 404, { error: 'Not found' });
      return;
    }
    file = join(dist, 'index.html');
  }
  if (!existsSync(file)) {
    send(res, 404, { error: 'Not found' });
    return;
  }
  const data = await readFile(file);
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    ...(type.startsWith('text/javascript') ? { 'cache-control': 'public, max-age=31536000, immutable' } : {}),
  });
  res.end(data);
}

const server = createServer(async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-headers', 'content-type, authorization, x-cbt-client, x-file-name');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 404, { error: 'Not found' });
      return;
    }
    try {
      await serveStatic(req, res, url);
    } catch (error) {
      console.error(error);
      send(res, 500, { error: 'Something went wrong' });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-cbt-client'] !== '1') {
    send(res, 403, { error: 'Missing client header.' });
    return;
  }
  const matched = req.method ? matchRoute(req.method, url.pathname) : null;
  if (!matched) {
    send(res, 404, { error: 'Not found' });
    return;
  }
  if (matched.params.id) {
    try {
      assertId(matched.params.id);
    } catch (error) {
      const err = error as HttpError;
      send(res, err.status, { error: err.message });
      return;
    }
  }
  const ctx: Ctx = { req, res, url, user: currentUser(req), params: matched.params };
  try {
    if (matched.route.auth && !ctx.user) throw new HttpError(401, 'Sign in to continue.', 'auth');
    await matched.route.handler(ctx);
  } catch (error) {
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.message, code: error.code });
      return;
    }
    console.error(error);
    send(res, 500, { error: 'Something went wrong' });
  }
});

server.listen(PORT, HOST, () => {
  const mode = razorpayConfigured() ? 'Razorpay' : 'test checkout (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for live payments)';
  console.log(`CBT Studio API on http://${HOST}:${PORT} · billing: ${mode}`);
});
