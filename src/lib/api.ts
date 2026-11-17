import type { Attempt, Paper, StoredFile } from './types';
import type { PlanId } from '../../shared/plans';

export const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8787' : '');

const TOKEN_KEY = 'cbt.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  exams: string[];
}

export interface BillingState {
  planId: string;
  status: 'free' | 'active' | 'expired';
  endsAt: number | null;
  paperCount: number;
  paperLimit: number | null;
  canUpload: boolean;
  provider: 'razorpay' | 'test';
}

export interface Session {
  user: SessionUser | null;
  billing: BillingState | null;
  token?: string;
}

export interface Checkout {
  mode: 'test' | 'razorpay';
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  planId: PlanId;
  keyId?: string;
}

export interface PaymentRecord {
  id: string;
  planId: string;
  amountPaise: number;
  status: string;
  provider: string;
  createdAt: number;
}

async function send(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('x-cbt-client', '1');
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'CBT Studio server is not reachable. Leave this tab open and run npm run dev again.');
  }
}

async function expectOk(res: Response) {
  if (res.ok) return;
  let message = res.statusText || 'Request failed';
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    if (body.error) message = body.error;
    code = body.code;
  } catch {
    /* non-json */
  }
  throw new ApiError(res.status, message, code);
}

async function json<T>(res: Response): Promise<T> {
  await expectOk(res);
  return (await res.json()) as T;
}

export const api = {
  me: () => send('/api/auth/me').then((res) => json<Session>(res)),
  signup: (body: { name: string; email: string; password: string; exams: string[] }) =>
    send('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((res) =>
      json<Session>(res),
    ),
  login: (body: { email: string; password: string }) =>
    send('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((res) =>
      json<Session>(res),
    ),
  logout: () => send('/api/auth/logout', { method: 'POST' }).then((res) => expectOk(res)),
  updateExams: (exams: string[]) =>
    send('/api/auth/exams', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exams }) }).then((res) =>
      json<Session>(res),
    ),

  papers: () => send('/api/papers').then((res) => json<Paper[]>(res)),
  paper: async (id: string) => {
    const res = await send(`/api/papers/${id}`);
    if (res.status === 404) return undefined;
    return json<Paper>(res);
  },
  savePaper: (paper: Paper) =>
    send(`/api/papers/${paper.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(paper),
    }).then((res) => json<Paper>(res)),
  deletePaper: (id: string) => send(`/api/papers/${id}`, { method: 'DELETE' }).then((res) => expectOk(res)),

  saveFile: (file: StoredFile) =>
    send(`/api/files/${file.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent(file.name) },
      body: file.data,
    }).then((res) => expectOk(res)),
  file: async (id: string) => {
    const res = await send(`/api/files/${id}`);
    if (res.status === 404) return undefined;
    await expectOk(res);
    const encoded = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
    const name = encoded ? decodeURIComponent(encoded[1]) : 'paper.pdf';
    return { id, name, data: await res.arrayBuffer() };
  },

  attempts: () => send('/api/attempts').then((res) => json<Attempt[]>(res)),
  attemptsFor: (paperId: string) => send(`/api/papers/${paperId}/attempts`).then((res) => json<Attempt[]>(res)),
  attempt: async (id: string) => {
    const res = await send(`/api/attempts/${id}`);
    if (res.status === 404) return undefined;
    return json<Attempt>(res);
  },
  saveAttempt: (attempt: Attempt) =>
    send(`/api/attempts/${attempt.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(attempt),
    }).then((res) => expectOk(res)),
  deleteAttempt: (id: string) => send(`/api/attempts/${id}`, { method: 'DELETE' }).then((res) => expectOk(res)),

  checkout: (planId: PlanId) =>
    send('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId }),
    }).then((res) => json<Checkout>(res)),
  confirm: (body: { orderId: string; paymentId?: string; signature?: string }) =>
    send('/api/billing/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => json<{ billing: BillingState }>(res)),
  payments: () => send('/api/billing/payments').then((res) => json<PaymentRecord[]>(res)),
};
