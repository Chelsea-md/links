import { Hono } from 'hono';
import { type Env, RESERVED, domains, sharedDomains } from './lib';
import { api } from './api';
import { handleRedirect, notFoundPage } from './redirect';

const app = new Hono<{ Bindings: Env }>();

/*
 * Shared domains (e.g. play3.io) already host a website. The Worker runs on
 * `play3.io/*` but only answers for single-segment paths that are registered
 * short links; everything else (pages, assets, /, /admin, /api) goes untouched
 * to the original site. A same-zone fetch() from a Worker skips the Worker and
 * reaches the origin, so there is no loop.
 */
const MISS_TTL = 60_000;
const recentMisses = new Map<string, number>(); // per-isolate negative cache, saves D1 reads on normal page views

app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const host = url.hostname.toLowerCase();
  if (!sharedDomains(c.env).has(host)) return next();

  const passthrough = () => fetch(c.req.raw);
  const m = url.pathname.match(/^\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\/?$/);
  if (!m || !['GET', 'HEAD'].includes(c.req.method) || RESERVED.has(m[1].toLowerCase())) return passthrough();

  const key = `${host}/${m[1]}`;
  const missAt = recentMisses.get(key);
  if (missAt && Date.now() - missAt < MISS_TTL) return passthrough();

  return handleRedirect(c.req.raw, c.env, c.executionCtx as ExecutionContext, host, m[1], () => {
    if (recentMisses.size > 5000) recentMisses.clear();
    recentMisses.set(key, Date.now());
    return passthrough();
  });
});

app.route('/api', api);

app.get('/health', (c) => c.text('ok'));
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /admin\nDisallow: /api\n'));

// Dashboard SPA (built into dist/admin)
app.get('/admin', (c) => c.redirect('/admin/'));
app.get('/admin/*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status !== 404) return res;
  const index = new URL('/admin/index.html', c.req.url);
  const html = await c.env.ASSETS.fetch(new Request(index));
  return new Response(html.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
});

app.get('/', (c) => c.redirect(c.env.ROOT_REDIRECT || '/admin/', 302));

/** Map the incoming Host to one of the configured domains (falls back to the default, e.g. on localhost). */
function domainFor(req: Request, env: Env): string {
  const host = new URL(req.url).hostname.toLowerCase();
  const list = domains(env, req.url);
  return list.includes(host) ? host : list[0];
}

app.on(['GET', 'HEAD'], '/:slug', (c) => {
  const slug = c.req.param('slug');
  // Mistyped dashboard URLs (/Admin, /admin**, /admin.) go to the dashboard, not a 404.
  if (/^admin\W*$/i.test(slug)) return c.redirect('/admin/', 302);
  return handleRedirect(c.req.raw, c.env, c.executionCtx as ExecutionContext, domainFor(c.req.raw, c.env), slug);
});

app.notFound(() => notFoundPage());

export default app;
