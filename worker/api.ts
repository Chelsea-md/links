import { Hono } from 'hono';
import {
  type Env,
  type LinkRow,
  type Rule,
  type UTM,
  domains,
  serializeLink,
  randomSlug,
  randomId,
  validSlug,
  validUrl,
  dayInTz,
} from './lib';
import { login, logout, requireAuth, isAuthed } from './auth';
import { getAnalytics, exportCsv, type AnalyticsQuery } from './analytics';

export const api = new Hono<{ Bindings: Env }>();

api.post('/login', login);
api.post('/logout', logout);
api.get('/me', async (c) => c.json({ authed: await isAuthed(c), passwordSet: !!c.env.ADMIN_PASSWORD }));

api.use('*', requireAuth);

api.get('/config', (c) =>
  c.json({ domains: domains(c.env), defaultDomain: domains(c.env)[0], tz: c.env.TZ || 'UTC' }),
);

// ---------- Links ----------

interface LinkInput {
  destination?: string;
  domain?: string;
  slug?: string;
  title?: string | null;
  tags?: string[];
  utm?: UTM | null;
  rules?: Rule[];
  expiresAt?: number | null;
  expiredUrl?: string | null;
  showLink?: boolean;
  qr?: boolean;
  qrDesign?: Record<string, unknown> | null;
  archived?: boolean;
}

function cleanTags(t: unknown): string[] {
  if (!Array.isArray(t)) return [];
  return [...new Set(t.map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, 40)))].slice(0, 20);
}

function cleanUtm(u: unknown): UTM | null {
  if (!u || typeof u !== 'object') return null;
  const out: UTM = {};
  for (const k of ['source', 'medium', 'campaign', 'term', 'content'] as const) {
    const v = (u as UTM)[k];
    if (v && String(v).trim()) out[k] = String(v).trim().slice(0, 200);
  }
  return Object.keys(out).length ? out : null;
}

function cleanRules(r: unknown): Rule[] | string {
  if (!Array.isArray(r)) return [];
  const out: Rule[] = [];
  for (const x of r.slice(0, 20)) {
    if (!x || !['device', 'os', 'country'].includes(x.type)) return 'Invalid rule type';
    if (!x.value) return 'Each rule needs a value';
    if (!validUrl(x.destination)) return `Invalid rule destination: ${x.destination || '(empty)'}`;
    out.push({ type: x.type, value: String(x.value).trim(), destination: String(x.destination).trim() });
  }
  return out;
}

const LIST_SQL = `
  SELECT l.*,
    (SELECT COUNT(*) FROM events e WHERE e.link_id = l.id AND e.bot = 0 AND e.channel = 'link') AS clicks,
    (SELECT COUNT(*) FROM events e WHERE e.link_id = l.id AND e.bot = 0 AND e.channel = 'qr') AS scans,
    (SELECT COUNT(*) FROM events e WHERE e.link_id = l.id AND e.bot = 0 AND e.day >= ?) AS recent
  FROM links l`;

function sevenDaysAgo(env: Env) {
  return dayInTz(Date.now() - 6 * 86_400_000, env.TZ || 'UTC');
}

api.get('/links', async (c) => {
  const q = (c.req.query('q') || '').trim();
  const tag = c.req.query('tag');
  const type = c.req.query('type'); // link | qr
  const archived = c.req.query('archived') === '1' ? 1 : 0;
  const where: string[] = ['l.archived = ?'];
  const args: unknown[] = [sevenDaysAgo(c.env), archived];
  if (type === 'qr') where.push('l.qr_slug IS NOT NULL');
  if (type === 'link') where.push('l.show_link = 1');
  if (q) {
    where.push('(l.title LIKE ? OR l.slug LIKE ? OR l.destination LIKE ? OR l.qr_slug LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(l.tags) WHERE value = ?)');
    args.push(tag);
  }
  const { results } = await c.env.DB.prepare(`${LIST_SQL} WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 500`)
    .bind(...args)
    .all<LinkRow & { clicks: number; scans: number; recent: number }>();
  return c.json({ links: (results || []).map(serializeLink) });
});

api.get('/links/:id', async (c) => {
  const row = await c.env.DB.prepare(`${LIST_SQL} WHERE l.id = ?`)
    .bind(sevenDaysAgo(c.env), c.req.param('id'))
    .first<LinkRow & { clicks: number; scans: number; recent: number }>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ link: serializeLink(row) });
});

async function freeSlug(env: Env, domain: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const s = randomSlug(i < 4 ? 7 : 9);
    const hit = await env.DB.prepare('SELECT 1 FROM slugs WHERE domain = ? AND slug = ?').bind(domain, s).first();
    if (!hit) return s;
  }
  throw new Error('Could not allocate a slug');
}

async function slugTaken(env: Env, domain: string, slug: string, exceptLinkId?: string) {
  const row = await env.DB.prepare('SELECT link_id FROM slugs WHERE domain = ? AND slug = ?')
    .bind(domain, slug)
    .first<{ link_id: string }>();
  return !!row && row.link_id !== exceptLinkId;
}

api.post('/links', async (c) => {
  const body = await c.req.json<LinkInput>().catch(() => ({}) as LinkInput);
  const destination = (body.destination || '').trim();
  if (!validUrl(destination)) return c.json({ error: 'Enter a valid http(s) destination URL' }, 400);

  const doms = domains(c.env);
  const domain = (body.domain || doms[0]).toLowerCase();
  if (!doms.includes(domain)) return c.json({ error: `Unknown domain: ${domain}` }, 400);

  let slug = (body.slug || '').trim();
  if (slug) {
    if (!validSlug(slug)) return c.json({ error: 'Back-half may use letters, numbers, - and _ (max 64), and can’t be a reserved word' }, 400);
    if (await slugTaken(c.env, domain, slug)) return c.json({ error: `${domain}/${slug} is already taken` }, 409);
  } else {
    slug = await freeSlug(c.env, domain);
  }

  const rules = cleanRules(body.rules);
  if (typeof rules === 'string') return c.json({ error: rules }, 400);
  if (body.expiredUrl && !validUrl(body.expiredUrl)) return c.json({ error: 'Invalid expiration redirect URL' }, 400);

  const wantQr = !!body.qr;
  const qrSlug = wantQr ? await freeSlug(c.env, domain) : null;
  const id = randomId();
  const now = Date.now();

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO links (id, domain, slug, destination, title, tags, utm, rules, expires_at, expired_url, show_link, qr_slug, qr_design, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(
      id,
      domain,
      slug,
      destination,
      body.title?.trim() || null,
      JSON.stringify(cleanTags(body.tags)),
      JSON.stringify(cleanUtm(body.utm)),
      JSON.stringify(rules),
      body.expiresAt || null,
      body.expiredUrl || null,
      body.showLink === false && wantQr ? 0 : 1,
      qrSlug,
      body.qrDesign ? JSON.stringify(body.qrDesign) : null,
      now,
      now,
    ),
    c.env.DB.prepare('INSERT INTO slugs (domain, slug, link_id, channel) VALUES (?, ?, ?, ?)').bind(domain, slug, id, 'link'),
  ];
  if (qrSlug) {
    stmts.push(c.env.DB.prepare('INSERT INTO slugs (domain, slug, link_id, channel) VALUES (?, ?, ?, ?)').bind(domain, qrSlug, id, 'qr'));
  }
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    return c.json({ error: 'That back-half was just taken — try another' }, 409);
  }
  const row = await c.env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first<LinkRow>();
  return c.json({ link: serializeLink(row!) }, 201);
});

api.patch('/links/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first<LinkRow>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<LinkInput>().catch(() => ({}) as LinkInput);

  const sets: string[] = [];
  const args: unknown[] = [];
  const extra: D1PreparedStatement[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); args.push(v); };

  if (body.destination !== undefined) {
    if (!validUrl(body.destination.trim())) return c.json({ error: 'Enter a valid http(s) destination URL' }, 400);
    set('destination', body.destination.trim());
  }
  if (body.title !== undefined) set('title', body.title?.trim() || null);
  if (body.tags !== undefined) set('tags', JSON.stringify(cleanTags(body.tags)));
  if (body.utm !== undefined) set('utm', JSON.stringify(cleanUtm(body.utm)));
  if (body.rules !== undefined) {
    const rules = cleanRules(body.rules);
    if (typeof rules === 'string') return c.json({ error: rules }, 400);
    set('rules', JSON.stringify(rules));
  }
  if (body.expiresAt !== undefined) set('expires_at', body.expiresAt || null);
  if (body.expiredUrl !== undefined) {
    if (body.expiredUrl && !validUrl(body.expiredUrl)) return c.json({ error: 'Invalid expiration redirect URL' }, 400);
    set('expired_url', body.expiredUrl || null);
  }
  if (body.archived !== undefined) set('archived', body.archived ? 1 : 0);
  if (body.showLink !== undefined) set('show_link', body.showLink ? 1 : 0);
  if (body.qrDesign !== undefined) set('qr_design', body.qrDesign ? JSON.stringify(body.qrDesign) : null);

  if (body.qr && !row.qr_slug) {
    const qrSlug = await freeSlug(c.env, row.domain);
    set('qr_slug', qrSlug);
    extra.push(c.env.DB.prepare('INSERT INTO slugs (domain, slug, link_id, channel) VALUES (?, ?, ?, ?)').bind(row.domain, qrSlug, id, 'qr'));
  }

  if (body.slug !== undefined && body.slug.trim() !== row.slug) {
    const slug = body.slug.trim();
    if (!validSlug(slug)) return c.json({ error: 'Back-half may use letters, numbers, - and _ (max 64)' }, 400);
    if (await slugTaken(c.env, row.domain, slug, id)) return c.json({ error: `${row.domain}/${slug} is already taken` }, 409);
    set('slug', slug);
    extra.push(
      c.env.DB.prepare(`UPDATE slugs SET slug = ? WHERE domain = ? AND link_id = ? AND channel = 'link'`).bind(slug, row.domain, id),
    );
  }

  if (!sets.length && !extra.length) return c.json({ error: 'Nothing to update' }, 400);
  set('updated_at', Date.now());
  await c.env.DB.batch([c.env.DB.prepare(`UPDATE links SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id), ...extra]);
  const updated = await c.env.DB.prepare(`${LIST_SQL} WHERE l.id = ?`)
    .bind(sevenDaysAgo(c.env), id)
    .first<LinkRow & { clicks: number; scans: number; recent: number }>();
  return c.json({ link: serializeLink(updated!) });
});

api.delete('/links/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM events WHERE link_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM slugs WHERE link_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

api.get('/tags', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT value AS tag, COUNT(*) AS n FROM links, json_each(links.tags) GROUP BY value ORDER BY n DESC`,
  ).all<{ tag: string; n: number }>();
  return c.json({ tags: (results || []).map((r) => r.tag) });
});

// Suggest a title for a destination by reading its <title>/og:title.
api.get('/meta', async (c) => {
  const url = c.req.query('url') || '';
  if (!validUrl(url)) return c.json({ title: null });
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SeeLinks/1.0; +title-fetch)', accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });
    const html = (await res.text()).slice(0, 200_000);
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const t = og || html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1];
    const title = t ? decodeEntities(t.trim()) : null;
    return c.json({ title });
  } catch {
    return c.json({ title: null });
  }
});

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// ---------- Analytics ----------

function readQuery(c: { req: { query: (k: string) => string | undefined } }): AnalyticsQuery {
  const ch = c.req.query('channel');
  return {
    linkId: c.req.query('link') || undefined,
    channel: ch === 'link' || ch === 'qr' ? ch : undefined,
    from: c.req.query('from'),
    to: c.req.query('to'),
  };
}

api.get('/analytics', async (c) => c.json(await getAnalytics(c.env, readQuery(c))));

api.get('/analytics.csv', async (c) => {
  const csv = await exportCsv(c.env, readQuery(c));
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="see-links-events.csv"`,
    },
  });
});

// Full backup of link definitions (not events).
api.get('/export.json', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM links ORDER BY created_at').all<LinkRow>();
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), links: (results || []).map(serializeLink) }, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="see-links-backup.json"' },
  });
});
