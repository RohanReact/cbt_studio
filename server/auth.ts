import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = (await scryptAsync(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const actual = (await scryptAsync(password, salt, 32)) as Buffer;
  const expected = Buffer.from(hash, 'base64url');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function newSessionId() {
  return randomBytes(32).toString('base64url');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateSignup(input: { name?: string; email?: string; password?: string }) {
  const name = input.name?.trim() ?? '';
  const email = normalizeEmail(input.email ?? '');
  const password = input.password ?? '';
  if (name.length < 2 || name.length > 80) return 'Enter your name (2–80 characters).';
  if (!EMAIL.test(email) || email.length > 120) return 'Enter a valid email address.';
  if (password.length < 8 || password.length > 200) return 'Use a password of at least 8 characters.';
  return null;
}

export function validateLogin(input: { email?: string; password?: string }) {
  const email = normalizeEmail(input.email ?? '');
  const password = input.password ?? '';
  if (!EMAIL.test(email) || password.length < 1 || password.length > 200) return 'Email or password is incorrect.';
  return null;
}
