export interface Rule {
  type: 'device' | 'os' | 'country';
  value: string;
  destination: string;
}
export interface UTM {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}
export interface QrDesign {
  dots: 'square' | 'dots' | 'rounded' | 'extra-rounded' | 'classy' | 'classy-rounded';
  cornerSquare: 'square' | 'extra-rounded' | 'dot';
  cornerDot: 'square' | 'dot';
  color: string;
  color2?: string | null; // gradient end
  bg: string;
  cornerColor?: string | null; // null = same as code
  logo?: string | null; // data URL
  centerText?: string | null;
  frame: 'none' | 'border' | 'label' | 'label-solid';
  frameText?: string;
}
export interface Link {
  id: string;
  domain: string;
  slug: string;
  shortUrl: string;
  destination: string;
  title: string | null;
  tags: string[];
  utm: UTM | null;
  rules: Rule[];
  expiresAt: number | null;
  expiredUrl: string | null;
  showLink: boolean;
  qrSlug: string | null;
  qrUrl: string | null;
  qrDesign: QrDesign | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  clicks: number;
  scans: number;
  recent: number;
}
export interface Bucket {
  key: string;
  count: number;
  pct: number;
  prev: number;
}
export interface Analytics {
  range: { from: string; to: string; prevFrom: string; prevTo: string; len: number };
  totals: { allTime: number; period: number; uniques: number; prev: number; prevUniques: number; botsFiltered: number };
  series: { day: string; count: number; prev: number }[];
  countries: Bucket[];
  cities: { key: string; country: string | null; count: number }[];
  referrers: Bucket[];
  devices: Bucket[];
  os: Bucket[];
  browsers: Bucket[];
  channels: Bucket[];
  ai: { total: number; prev: number; sources: { key: string; count: number; agent: number; referral: number }[] };
  topLinks: { id: string; title: string | null; shortUrl: string; destination: string; isQrOnly: boolean; count: number }[];
  hours: number[];
}
export interface Config {
  domains: string[];
  defaultDomain: string;
  tz: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/**
 * Run a create/update; if the server says the back-half would cover an existing
 * page on a shared domain, confirm with the user and retry with force.
 */
export async function withShadowConfirm<T>(run: (force: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(false);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'shadows_page' && confirm(`${e.message}\n\nUse this back-half anyway?`)) {
      return run(true);
    }
    throw e;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') window.dispatchEvent(new Event('sl:unauthorized'));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Request failed (${res.status})`, (data as { code?: string }).code);
  return data as T;
}

export const api = {
  me: () => req<{ authed: boolean; passwordSet: boolean }>('GET', '/me'),
  login: (password: string) => req<{ ok: true }>('POST', '/login', { password }),
  logout: () => req<{ ok: true }>('POST', '/logout'),
  config: () => req<Config>('GET', '/config'),
  links: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return req<{ links: Link[] }>('GET', `/links${qs ? `?${qs}` : ''}`).then((r) => r.links);
  },
  link: (id: string) => req<{ link: Link }>('GET', `/links/${id}`).then((r) => r.link),
  create: (body: Partial<Link> & { qr?: boolean; slug?: string; force?: boolean }) =>
    req<{ link: Link }>('POST', '/links', body).then((r) => r.link),
  update: (id: string, body: Partial<Link> & { qr?: boolean; force?: boolean }) =>
    req<{ link: Link }>('PATCH', `/links/${id}`, body).then((r) => r.link),
  remove: (id: string) => req<{ ok: true }>('DELETE', `/links/${id}`),
  tags: () => req<{ tags: string[] }>('GET', '/tags').then((r) => r.tags),
  meta: (url: string) => req<{ title: string | null }>('GET', `/meta?url=${encodeURIComponent(url)}`),
  analytics: (p: { link?: string; channel?: 'link' | 'qr'; from: string; to: string }) =>
    req<Analytics>('GET', `/analytics?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`),
  csvUrl: (p: { link?: string; channel?: string; from: string; to: string }) =>
    `/api/analytics.csv?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`,
};
