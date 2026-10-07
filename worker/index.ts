import { Hono } from 'hono';
import { type Env, domains } from './lib';
import { api } from './api';
import { handleRedirect, notFoundPage } from './redirect';

const app = new Hono<{ Bindings: Env }>();

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
