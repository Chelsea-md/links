export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DOMAINS: string;
  TZ: string;
  ROOT_REDIRECT?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}

export interface Rule {
  type: 'device' | 'os' | 'country';
  value: string; // device: mobile|tablet|desktop · os: iOS|Android|... · country: ISO code (e.g. KR)
  destination: string;
}

export interface UTM {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface LinkRow {
  id: string;
  domain: string;
  slug: string;
  destination: string;
  title: string | null;
  tags: string;
  utm: string | null;
  rules: string;
  expires_at: number | null;
  expired_url: string | null;
  show_link: number;
  qr_slug: string | null;
  qr_design: string | null;
  archived: number;
  created_at: number;
  updated_at: number;
}

/**
 * Short-link domains. With DOMAINS empty (e.g. running on *.workers.dev with no
 * custom domain yet) the host the request came in on is used.
 */
export function domains(env: Env, reqUrl?: string): string[] {
  const list = (env.DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (list.length) return list;
  return [reqUrl ? new URL(reqUrl).hostname.toLowerCase() : 'localhost'];
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Public shape returned by the API. */
export function serializeLink(r: LinkRow & { clicks?: number; scans?: number; recent?: number }) {
  return {
    id: r.id,
    domain: r.domain,
    slug: r.slug,
    shortUrl: `https://${r.domain}/${r.slug}`,
    destination: r.destination,
    title: r.title,
    tags: parseJSON<string[]>(r.tags, []),
    utm: parseJSON<UTM | null>(r.utm, null),
    rules: parseJSON<Rule[]>(r.rules, []),
    expiresAt: r.expires_at,
    expiredUrl: r.expired_url,
    showLink: !!r.show_link,
    qrSlug: r.qr_slug,
    qrUrl: r.qr_slug ? `https://${r.domain}/${r.qr_slug}` : null,
    qrDesign: parseJSON<Record<string, unknown> | null>(r.qr_design, null),
    archived: !!r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    clicks: r.clicks ?? 0,
    scans: r.scans ?? 0,
    recent: r.recent ?? 0,
  };
}

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes

export function randomSlug(len = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// Paths the Worker owns; can't be used as a back-half.
export const RESERVED = new Set(['admin', 'api', 'assets', 'favicon.ico', 'robots.txt', 'health', '_']);

export function validSlug(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s) && !RESERVED.has(s.toLowerCase());
}

export function validUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Calendar day (YYYY-MM-DD) for an epoch-ms timestamp in a given IANA timezone. */
export function dayInTz(ts: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
