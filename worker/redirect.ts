import { classifyUA, referrerHost, aiFromReferrer } from './ua';
import { type Env, type LinkRow, type Rule, type UTM, parseJSON, dayInTz, sha256Hex } from './lib';

/** Pick the destination for a request: expiry → dynamic routing rules → default. */
export function resolveDestination(
  link: LinkRow,
  ctx: { country: string | null; device: string; os: string; now: number },
): { url: string | null; expired: boolean } {
  if (link.expires_at && ctx.now >= link.expires_at) {
    return { url: link.expired_url || null, expired: true };
  }
  let url = link.destination;
  const rules = parseJSON<Rule[]>(link.rules, []);
  for (const r of rules) {
    const v = (r.value || '').toLowerCase();
    const hit =
      (r.type === 'device' && v === ctx.device) ||
      (r.type === 'os' && v === ctx.os.toLowerCase()) ||
      (r.type === 'country' && ctx.country && v === ctx.country.toLowerCase());
    if (hit && r.destination) {
      url = r.destination;
      break;
    }
  }
  return { url: applyUTM(url, parseJSON<UTM | null>(link.utm, null)), expired: false };
}

export function applyUTM(dest: string, utm: UTM | null): string {
  if (!utm) return dest;
  try {
    const u = new URL(dest);
    for (const k of ['source', 'medium', 'campaign', 'term', 'content'] as const) {
      const val = utm[k];
      if (val && !u.searchParams.has(`utm_${k}`)) u.searchParams.set(`utm_${k}`, val);
    }
    return u.toString();
  } catch {
    return dest;
  }
}

export async function handleRedirect(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  domain: string,
  slug: string,
): Promise<Response> {
  const hit = await env.DB.prepare(
    `SELECT l.*, s.channel AS _channel FROM slugs s JOIN links l ON l.id = s.link_id
     WHERE s.domain = ?1 AND s.slug = ?2`,
  )
    .bind(domain, slug)
    .first<LinkRow & { _channel: 'link' | 'qr' }>();

  if (!hit || hit.archived) return notFoundPage();

  const ua = req.headers.get('user-agent') || '';
  const info = classifyUA(ua);
  const cf = (req as unknown as { cf?: IncomingRequestCfProperties }).cf;
  const country = (cf?.country as string) || null;
  const now = Date.now();

  const { url, expired } = resolveDestination(hit, { country, device: info.device, os: info.os, now });

  // Record the event without delaying the redirect. HEAD requests aren't counted.
  if (req.method === 'GET') {
    ctx.waitUntil(recordEvent(env, req, hit.id, hit._channel, info, cf, now).catch(() => {}));
  }

  if (!url) return expiredPage();
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'private, no-store, max-age=0',
      'Referrer-Policy': 'unsafe-url',
      'X-Robots-Tag': 'noindex',
    },
  });
}

async function recordEvent(
  env: Env,
  req: Request,
  linkId: string,
  channel: 'link' | 'qr',
  info: ReturnType<typeof classifyUA>,
  cf: IncomingRequestCfProperties | undefined,
  now: number,
) {
  const ref = referrerHost(req.headers.get('referer'));
  const ai = info.ai ?? aiFromReferrer(ref);
  const day = dayInTz(now, env.TZ || 'UTC');
  const ip = req.headers.get('cf-connecting-ip') || '';
  // Anonymous, daily-rotating visitor id: lets us count uniques without storing IPs.
  const visitor = (
    await sha256Hex(`${env.SESSION_SECRET || 'see-links'}|${day}|${ip}|${req.headers.get('user-agent') || ''}`)
  ).slice(0, 16);

  await env.DB.prepare(
    `INSERT INTO events (link_id, channel, ts, day, country, region, city, referrer, device, os, browser, ai, bot, visitor)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
  )
    .bind(
      linkId,
      channel,
      now,
      day,
      (cf?.country as string) || null,
      (cf?.region as string) || null,
      (cf?.city as string) || null,
      ref,
      info.device,
      info.os,
      info.browser,
      ai,
      info.bot ? 1 : 0,
      visitor,
    )
    .run();
}

function page(title: string, body: string, status: number) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f6f5f1;color:#15171a}main{text-align:center;padding:24px}h1{font-size:22px;margin:0 0 6px}p{margin:0;color:#5d6168}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

export const notFoundPage = () => page('Link not found', 'This short link doesn’t exist or was turned off.', 404);
export const expiredPage = () => page('Link expired', 'This short link is no longer active.', 410);
