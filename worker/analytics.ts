import { type Env, dayInTz } from './lib';

export interface AnalyticsQuery {
  linkId?: string;
  channel?: 'link' | 'qr';
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD (inclusive)
}

const DAY_MS = 86_400_000;
const toUTC = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = toUTC(from); t <= toUTC(to); t += DAY_MS) out.push(fromUTC(t));
  return out;
}

/** Resolve the requested window + the equally long window right before it. */
export function windows(env: Env, q: AnalyticsQuery) {
  const today = dayInTz(Date.now(), env.TZ || 'UTC');
  const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  let to = isDay(q.to) ? q.to! : today;
  let from = isDay(q.from) ? q.from! : fromUTC(toUTC(to) - 29 * DAY_MS);
  if (toUTC(from) > toUTC(to)) [from, to] = [to, from];
  const len = Math.round((toUTC(to) - toUTC(from)) / DAY_MS) + 1;
  const prevTo = fromUTC(toUTC(from) - DAY_MS);
  const prevFrom = fromUTC(toUTC(from) - len * DAY_MS);
  return { from, to, prevFrom, prevTo, len };
}

type Row = Record<string, unknown>;

export async function getAnalytics(env: Env, q: AnalyticsQuery) {
  const w = windows(env, q);

  // Shared filter (link + channel). Day range and bot filter are added per query.
  const scope: string[] = [];
  const scopeArgs: unknown[] = [];
  if (q.linkId) { scope.push('link_id = ?'); scopeArgs.push(q.linkId); }
  if (q.channel) { scope.push('channel = ?'); scopeArgs.push(q.channel); }
  const s = scope.length ? ` AND ${scope.join(' AND ')}` : '';

  const human = (from: string, to: string) => ({
    sql: `bot = 0 AND day BETWEEN ? AND ?${s}`,
    args: [from, to, ...scopeArgs],
  });
  const cur = human(w.from, w.to);
  const prev = human(w.prevFrom, w.prevTo);

  const stmt = (sql: string, args: unknown[]) => env.DB.prepare(sql).bind(...args);
  const breakdown = (col: string, where: { sql: string; args: unknown[] }, limit = 50) =>
    stmt(
      `SELECT COALESCE(${col}, 'Unknown') AS k, COUNT(*) AS n FROM events WHERE ${where.sql}
       GROUP BY k ORDER BY n DESC LIMIT ${limit}`,
      where.args,
    );

  const queries = [
    /* 0 all-time */ stmt(`SELECT COUNT(*) AS n FROM events WHERE bot = 0${s}`, scopeArgs),
    /* 1 period   */ stmt(`SELECT COUNT(*) AS n, COUNT(DISTINCT visitor) AS u FROM events WHERE ${cur.sql}`, cur.args),
    /* 2 prev     */ stmt(`SELECT COUNT(*) AS n, COUNT(DISTINCT visitor) AS u FROM events WHERE ${prev.sql}`, prev.args),
    /* 3 series   */ stmt(`SELECT day AS k, COUNT(*) AS n FROM events WHERE ${cur.sql} GROUP BY day`, cur.args),
    /* 4 prev ser */ stmt(`SELECT day AS k, COUNT(*) AS n FROM events WHERE ${prev.sql} GROUP BY day`, prev.args),
    /* 5 country  */ breakdown('country', cur),
    /* 6 prev c   */ breakdown('country', prev, 500),
    /* 7 city     */ stmt(
      `SELECT COALESCE(city, 'Unknown') AS k, country AS c, COUNT(*) AS n FROM events WHERE ${cur.sql}
       GROUP BY k, c ORDER BY n DESC LIMIT 50`,
      cur.args,
    ),
    /* 8 referrer */ breakdown('referrer', cur),
    /* 9 prev ref */ breakdown('referrer', prev, 500),
    /* 10 device  */ breakdown('device', cur),
    /* 11 os      */ breakdown('os', cur),
    /* 12 browser */ breakdown('browser', cur),
    /* 13 AI (incl. bot fetches) */ stmt(
      `SELECT ai AS k, SUM(CASE WHEN bot = 1 THEN 1 ELSE 0 END) AS agent, SUM(CASE WHEN bot = 0 THEN 1 ELSE 0 END) AS referral, COUNT(*) AS n
       FROM events WHERE ai IS NOT NULL AND day BETWEEN ? AND ?${s} GROUP BY ai ORDER BY n DESC`,
      [w.from, w.to, ...scopeArgs],
    ),
    /* 14 AI prev */ stmt(
      `SELECT COUNT(*) AS n FROM events WHERE ai IS NOT NULL AND day BETWEEN ? AND ?${s}`,
      [w.prevFrom, w.prevTo, ...scopeArgs],
    ),
    /* 15 channels */ breakdown('channel', cur),
    /* 16 bots filtered */ stmt(
      `SELECT COUNT(*) AS n FROM events WHERE bot = 1 AND ai IS NULL AND day BETWEEN ? AND ?${s}`,
      [w.from, w.to, ...scopeArgs],
    ),
    /* 17 top links */ stmt(
      `SELECT e.link_id AS id, l.title, l.domain, l.slug, l.destination, l.qr_slug, l.show_link, COUNT(*) AS n
       FROM events e JOIN links l ON l.id = e.link_id WHERE ${cur.sql.replace(/\b(bot|day|link_id|channel)\b/g, 'e.$1')}
       GROUP BY e.link_id ORDER BY n DESC LIMIT 10`,
      cur.args,
    ),
    /* 18 hour-of-day (in TZ offset approximated via ts) */ stmt(
      `SELECT ts FROM events WHERE ${cur.sql} ORDER BY ts DESC LIMIT 5000`,
      cur.args,
    ),
  ];

  const res = await env.DB.batch<Row>(queries);
  const rows = (i: number) => (res[i].results || []) as Row[];
  const num = (v: unknown) => Number(v || 0);

  const merge = (curRows: Row[], prevRows: Row[]) => {
    const pm = new Map(prevRows.map((r) => [String(r.k), num(r.n)]));
    const total = curRows.reduce((a, r) => a + num(r.n), 0);
    return curRows.map((r) => ({
      key: String(r.k),
      count: num(r.n),
      pct: total ? num(r.n) / total : 0,
      prev: pm.get(String(r.k)) ?? 0,
    }));
  };
  const simple = (rs: Row[]) => merge(rs, []);

  const seriesMap = new Map(rows(3).map((r) => [String(r.k), num(r.n)]));
  const prevMap = new Map(rows(4).map((r) => [String(r.k), num(r.n)]));
  const curDays = dayRange(w.from, w.to);
  const prevDays = dayRange(w.prevFrom, w.prevTo);
  const series = curDays.map((d, i) => ({
    day: d,
    count: seriesMap.get(d) ?? 0,
    prev: prevMap.get(prevDays[i]) ?? 0,
  }));

  // Hour-of-day histogram in the configured timezone
  const hours = new Array(24).fill(0);
  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: env.TZ || 'UTC', hour: 'numeric', hourCycle: 'h23' });
  for (const r of rows(18)) hours[Number(hourFmt.format(new Date(num(r.ts)))) % 24]++;

  const aiRows = rows(13);
  return {
    range: w,
    totals: {
      allTime: num(rows(0)[0]?.n),
      period: num(rows(1)[0]?.n),
      uniques: num(rows(1)[0]?.u),
      prev: num(rows(2)[0]?.n),
      prevUniques: num(rows(2)[0]?.u),
      botsFiltered: num(rows(16)[0]?.n),
    },
    series,
    countries: merge(rows(5), rows(6)),
    cities: rows(7).map((r) => ({ key: String(r.k), country: r.c as string | null, count: num(r.n) })),
    referrers: merge(rows(8), rows(9)),
    devices: simple(rows(10)),
    os: simple(rows(11)),
    browsers: simple(rows(12)),
    channels: simple(rows(15)),
    ai: {
      total: aiRows.reduce((a, r) => a + num(r.n), 0),
      prev: num(rows(14)[0]?.n),
      sources: aiRows.map((r) => ({ key: String(r.k), count: num(r.n), agent: num(r.agent), referral: num(r.referral) })),
    },
    topLinks: rows(17).map((r) => ({
      id: String(r.id),
      title: (r.title as string) || null,
      shortUrl: `https://${r.domain}/${!num(r.show_link) && r.qr_slug ? r.qr_slug : r.slug}`,
      destination: String(r.destination),
      isQrOnly: !num(r.show_link) && !!r.qr_slug,
      count: num(r.n),
    })),
    hours,
  };
}

export async function exportCsv(env: Env, q: AnalyticsQuery): Promise<string> {
  const w = windows(env, q);
  const where = ['e.day BETWEEN ? AND ?'];
  const args: unknown[] = [w.from, w.to];
  if (q.linkId) { where.push('e.link_id = ?'); args.push(q.linkId); }
  if (q.channel) { where.push('e.channel = ?'); args.push(q.channel); }
  const { results } = await env.DB.prepare(
    `SELECT e.ts, e.day, l.domain || '/' || l.slug AS link, e.channel, e.country, e.region, e.city, e.referrer,
            e.device, e.os, e.browser, e.ai, e.bot
     FROM events e JOIN links l ON l.id = e.link_id WHERE ${where.join(' AND ')} ORDER BY e.ts DESC LIMIT 100000`,
  )
    .bind(...args)
    .all<Row>();
  const cols = ['timestamp', 'day', 'link', 'channel', 'country', 'region', 'city', 'referrer', 'device', 'os', 'browser', 'ai', 'bot'];
  const esc = (v: unknown) => {
    const str = v == null ? '' : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [cols.join(',')];
  for (const r of results || []) {
    lines.push(
      [new Date(Number(r.ts)).toISOString(), r.day, r.link, r.channel, r.country, r.region, r.city, r.referrer, r.device, r.os, r.browser, r.ai, r.bot]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\n');
}
