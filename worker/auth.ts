import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from './lib';

const COOKIE = 'sl_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function secret(env: Env): string {
  return env.SESSION_SECRET || `fallback:${env.ADMIN_PASSWORD || ''}`;
}

export async function isAuthed(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const token = getCookie(c, COOKIE);
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secret(c.env), `admin:${exp}`));
}

export async function login(c: Context<{ Bindings: Env }>) {
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  const expected = c.env.ADMIN_PASSWORD;
  if (!expected) return c.json({ error: 'ADMIN_PASSWORD is not set on the Worker.' }, 500);
  if (!password || !safeEqual(await hmac('pw', password), await hmac('pw', expected))) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return c.json({ error: 'Wrong password' }, 401);
  }
  const exp = String(Date.now() + MAX_AGE * 1000);
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, COOKIE, `${exp}.${await hmac(secret(c.env), `admin:${exp}`)}`, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return c.json({ ok: true });
}

export function logout(c: Context<{ Bindings: Env }>) {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
}

export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  if (!(await isAuthed(c))) return c.json({ error: 'Unauthorized' }, 401);
  await next();
}
