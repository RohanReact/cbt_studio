import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { FREE_PAPER_LIMIT, planById, type PlanId } from '../shared/plans.ts';
import { newSessionId } from './auth.ts';
import { normalizeExams } from '../shared/exams.ts';
import { razorpayConfigured } from './env.ts';

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
const fileDir = join(dataDir, 'files');
mkdirSync(fileDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'cbt.sqlite'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_papers_user ON papers(user_id, updated_at);
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, paper_id);
  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_order_id TEXT NOT NULL UNIQUE,
    provider_payment_id TEXT,
    created_at INTEGER NOT NULL
  );
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
if (!userColumns.some((column) => column.name === 'exams')) {
  db.exec("ALTER TABLE users ADD COLUMN exams TEXT NOT NULL DEFAULT '[]'");
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: number;
  exams: string;
}

export interface BillingSnapshot {
  planId: string;
  status: 'free' | 'active' | 'expired';
  endsAt: number | null;
  paperCount: number;
  paperLimit: number | null;
  canUpload: boolean;
  provider: 'razorpay' | 'test';
}

interface SubRow {
  user_id: string;
  plan_id: string;
  status: string;
  starts_at: number;
  ends_at: number;
}

interface PaymentRow {
  id: string;
  user_id: string;
  plan_id: string;
  amount_paise: number;
  status: string;
  provider: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  created_at: number;
}

const DAY = 24 * 60 * 60 * 1000;
const SESSION_MS = 30 * DAY;

function withTx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already closed */
    }
    throw error;
  }
}

function examsOf(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || '[]') as unknown;
    return normalizeExams(parsed) ?? [];
  } catch {
    return [];
  }
}

export function publicUser(user: UserRow) {
  return { id: user.id, name: user.name, email: user.email, exams: examsOf(user.exams) };
}

export function createUser(input: { id: string; name: string; email: string; passwordHash: string; exams: string[] }) {
  db.prepare('INSERT INTO users (id, name, email, password_hash, created_at, exams) VALUES (?, ?, ?, ?, ?, ?)').run(
    input.id,
    input.name,
    input.email,
    input.passwordHash,
    Date.now(),
    JSON.stringify(input.exams),
  );
}

export function updateExams(userId: string, exams: string[]) {
  db.prepare('UPDATE users SET exams = ? WHERE id = ?').run(JSON.stringify(exams), userId);
}

export function userByEmail(email: string) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function userById(id: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function createSession(userId: string) {
  const id = newSessionId();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, Date.now() + SESSION_MS);
  return id;
}

export function userForSession(sessionId: string) {
  const row = db.prepare(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?`,
  ).get(sessionId, Date.now()) as UserRow | undefined;
  return row;
}

export function deleteSession(sessionId: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function paperCount(userId: string) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM papers WHERE user_id = ?').get(userId) as { n: number };
  return row.n;
}

function subscription(userId: string) {
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as SubRow | undefined;
}

export function billingFor(userId: string): BillingSnapshot {
  const now = Date.now();
  const sub = subscription(userId);
  const active = Boolean(sub && sub.status === 'active' && sub.ends_at > now);
  if (sub && sub.status === 'active' && sub.ends_at <= now) {
    db.prepare(`UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE user_id = ?`).run(now, userId);
  }
  const count = paperCount(userId);
  return {
    planId: active && sub ? sub.plan_id : 'free',
    status: active ? 'active' : sub ? 'expired' : 'free',
    endsAt: sub?.ends_at ?? null,
    paperCount: count,
    paperLimit: active ? null : FREE_PAPER_LIMIT,
    canUpload: active || count < FREE_PAPER_LIMIT,
    provider: razorpayConfigured() ? 'razorpay' : 'test',
  };
}

export function listPapers(userId: string) {
  const rows = db.prepare('SELECT data FROM papers WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as { data: string }[];
  return rows.map((row) => JSON.parse(row.data));
}

export function getPaper(userId: string, id: string) {
  const row = db.prepare('SELECT data FROM papers WHERE id = ? AND user_id = ?').get(id, userId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}

export function savePaper(userId: string, paper: Record<string, unknown>) {
  const id = String(paper.id);
  return withTx(() => {
    const existing = db.prepare('SELECT user_id, created_at FROM papers WHERE id = ?').get(id) as
      | { user_id: string; created_at: number }
      | undefined;
    if (existing && existing.user_id !== userId) return { ok: false as const, reason: 'missing' as const };
    if (!existing && paperCount(userId) >= FREE_PAPER_LIMIT && !isPaid(userId)) {
      return { ok: false as const, reason: 'quota' as const };
    }
    const now = Date.now();
    const createdAt = existing?.created_at ?? (typeof paper.createdAt === 'number' ? paper.createdAt : now);
    const stored = { ...paper, createdAt, updatedAt: now };
    db.prepare(
      `INSERT INTO papers (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(id, userId, JSON.stringify(stored), createdAt, now);
    return { ok: true as const, paper: stored };
  });
}

function isPaid(userId: string) {
  const sub = subscription(userId);
  return Boolean(sub && sub.status === 'active' && sub.ends_at > Date.now());
}

export function deletePaper(userId: string, id: string) {
  const row = db.prepare('SELECT data FROM papers WHERE id = ? AND user_id = ?').get(id, userId) as { data: string } | undefined;
  if (!row) return false;
  const paper = JSON.parse(row.data) as { files?: { id: string }[] };
  const fileIds = (paper.files ?? []).map((file) => file.id);
  withTx(() => {
    db.prepare('DELETE FROM attempts WHERE user_id = ? AND paper_id = ?').run(userId, id);
    db.prepare('DELETE FROM papers WHERE id = ? AND user_id = ?').run(id, userId);
    for (const fileId of fileIds) db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(fileId, userId);
  });
  for (const fileId of fileIds) rmSync(filePath(userId, fileId), { force: true });
  return true;
}

function filePath(userId: string, fileId: string) {
  return join(fileDir, `${userId}--${fileId}.pdf`);
}

export function saveFile(userId: string, fileId: string, name: string, bytes: Buffer) {
  if (!/^[a-zA-Z0-9_-]{4,80}$/.test(fileId)) return { ok: false as const, reason: 'invalid' as const };
  const existing = db.prepare('SELECT user_id FROM files WHERE id = ?').get(fileId) as { user_id: string } | undefined;
  if (existing && existing.user_id !== userId) return { ok: false as const, reason: 'missing' as const };
  if (!existing && !billingFor(userId).canUpload) return { ok: false as const, reason: 'quota' as const };
  const path = filePath(userId, fileId);
  const partial = `${path}.partial`;
  writeFileSync(partial, bytes);
  renameSync(partial, path);
  db.prepare(
    `INSERT INTO files (id, user_id, name, bytes, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, bytes = excluded.bytes`,
  ).run(fileId, userId, name, bytes.length, Date.now());
  return { ok: true as const };
}

export function readFileForUser(userId: string, fileId: string) {
  const row = db.prepare('SELECT name FROM files WHERE id = ? AND user_id = ?').get(fileId, userId) as { name: string } | undefined;
  if (!row) return undefined;
  return { name: row.name, path: filePath(userId, fileId) };
}

export function listAttempts(userId: string) {
  const rows = db.prepare('SELECT data FROM attempts WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as { data: string }[];
  return rows.map((row) => JSON.parse(row.data));
}

export function attemptsForPaper(userId: string, paperId: string) {
  const rows = db.prepare('SELECT data FROM attempts WHERE user_id = ? AND paper_id = ? ORDER BY updated_at DESC').all(userId, paperId) as {
    data: string;
  }[];
  return rows.map((row) => JSON.parse(row.data));
}

export function getAttempt(userId: string, id: string) {
  const row = db.prepare('SELECT data FROM attempts WHERE id = ? AND user_id = ?').get(id, userId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}

export function saveAttempt(userId: string, attempt: Record<string, unknown>) {
  const paperId = String(attempt.paperId ?? '');
  const owned = db.prepare('SELECT id FROM papers WHERE id = ? AND user_id = ?').get(paperId, userId);
  if (!owned) return false;
  const now = Date.now();
  db.prepare(
    `INSERT INTO attempts (id, user_id, paper_id, data, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(String(attempt.id), userId, paperId, JSON.stringify(attempt), now);
  return true;
}

export function deleteAttempt(userId: string, id: string) {
  const result = db.prepare('DELETE FROM attempts WHERE id = ? AND user_id = ?').run(id, userId);
  return Number(result.changes) > 0;
}

export function createPayment(input: {
  id: string;
  userId: string;
  planId: PlanId;
  amountPaise: number;
  provider: 'razorpay' | 'test';
  providerOrderId: string;
}) {
  db.prepare(
    `INSERT INTO payments (id, user_id, plan_id, amount_paise, status, provider, provider_order_id, created_at)
     VALUES (?, ?, ?, ?, 'created', ?, ?, ?)`,
  ).run(input.id, input.userId, input.planId, input.amountPaise, input.provider, input.providerOrderId, Date.now());
}

export function paymentByOrder(userId: string, providerOrderId: string) {
  return db.prepare('SELECT * FROM payments WHERE user_id = ? AND provider_order_id = ?').get(userId, providerOrderId) as PaymentRow | undefined;
}

export function markPaid(userId: string, providerOrderId: string, providerPaymentId: string) {
  const payment = paymentByOrder(userId, providerOrderId);
  if (!payment) return { ok: false as const, reason: 'missing' as const };
  if (payment.status === 'paid') return { ok: true as const, billing: billingFor(userId) };
  const plan = planById(payment.plan_id);
  if (!plan || payment.amount_paise !== plan.pricePaise) return { ok: false as const, reason: 'amount' as const };
  if (Date.now() - payment.created_at > 2 * 60 * 60 * 1000) return { ok: false as const, reason: 'expired' as const };

  withTx(() => {
    db.prepare(`UPDATE payments SET status = 'paid', provider_payment_id = ? WHERE id = ?`).run(providerPaymentId, payment.id);
    const now = Date.now();
    const current = subscription(userId);
    const base = current && current.ends_at > now ? current.ends_at : now;
    const ends = base + plan.days * DAY;
    const starts = current?.starts_at && current.ends_at > now ? current.starts_at : now;
    db.prepare(
      `INSERT INTO subscriptions (user_id, plan_id, status, starts_at, ends_at, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         plan_id = excluded.plan_id,
         status = 'active',
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         updated_at = excluded.updated_at`,
    ).run(userId, plan.id, starts, ends, now);
  });
  return { ok: true as const, billing: billingFor(userId) };
}

export function listPayments(userId: string) {
  const rows = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 12').all(userId) as unknown as PaymentRow[];
  return rows.map((row) => ({
    id: row.id,
    planId: row.plan_id,
    amountPaise: row.amount_paise,
    status: row.status,
    provider: row.provider,
    createdAt: row.created_at,
  }));
}

export function sweepSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}
