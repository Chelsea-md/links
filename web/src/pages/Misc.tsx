import { useEffect, useState } from 'react';
import { api, type Link } from '../api';
import { AnalyticsPanel } from '../AnalyticsPanel';
import { useConfig } from '../editors';
import { num, stripProto } from '../format';
import { ILink, IQr, Logo } from '../icons';
import { A } from '../router';

export function Home() {
  const [recent, setRecent] = useState<Link[] | null>(null);
  useEffect(() => { api.links().then((l) => setRecent(l.slice(0, 6))).catch(() => setRecent([])); }, []);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      <div className="page-head"><h1>{greet}</h1></div>
      <div className="create-grid" style={{ marginBottom: 28 }}>
        <A to="/links/new" className="create-tile" style={{ textDecoration: 'none' }}>
          <ILink size={22} />
          <span className="tile-row"><span>Shorten a link</span><kbd>L</kbd></span>
        </A>
        <A to="/qrs/new" className="create-tile" style={{ textDecoration: 'none' }}>
          <IQr size={22} />
          <span className="tile-row"><span>Create a QR code</span><kbd>Q</kbd></span>
        </A>
      </div>

      <div className="an-head"><h2 style={{ fontSize: 24 }}>Last 7 days</h2><span className="muted">All links and QR codes</span></div>
      <AnalyticsPanel defaultPreset="7" />

      <section style={{ marginTop: 36 }}>
        <div className="panel-head">
          <h2>Recently created</h2>
          <A to="/links" className="btn ghost sm">View all</A>
        </div>
        {recent && recent.length === 0 && (
          <div className="empty"><h3>Nothing here yet</h3><p>Links and QR codes you create show up here.</p></div>
        )}
        <div className="list">
          {recent?.map((l) => (
            <A key={l.id} to={l.showLink ? `/links/${l.id}` : `/qrs/${l.id}`} className="item" style={{ gridTemplateColumns: '1fr auto' }}>
              <div style={{ minWidth: 0 }}>
                <div className="item-title">{l.title || stripProto(l.destination)}</div>
                <div className="item-dest">
                  <span className="item-short" style={{ marginRight: 8 }}>{stripProto(l.showLink ? l.shortUrl : l.qrUrl || l.shortUrl)}</span>
                  {stripProto(l.destination)}
                </div>
              </div>
              <div className="item-stat">
                <b>{num(l.clicks + l.scans)}</b>
                <span className="small muted">{l.showLink ? 'engagements' : 'scans'}</span>
              </div>
            </A>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AnalyticsPage() {
  return (
    <div className="page">
      <div className="page-head"><h1>Analytics</h1></div>
      <AnalyticsPanel showTopLinks />
    </div>
  );
}

export function Settings({ onLogout }: { onLogout: () => void }) {
  const cfg = useConfig();
  return (
    <div className="page narrow">
      <div className="page-head"><h1>Settings</h1></div>
      <section className="panel">
        <div className="panel-head"><h2>Domains</h2></div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {cfg.domains.map((d, i) => (
            <li key={d}><b>{d}</b>{i === 0 && <span className="muted"> (default)</span>}</li>
          ))}
        </ul>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Domains are set in <code>wrangler.jsonc</code> under <code>DOMAINS</code>, and each one needs a Custom Domain on the Worker
          in Cloudflare. See the README for the steps.
        </p>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Time zone</h2></div>
        <p style={{ margin: 0 }}>Daily charts use <b>{cfg.tz}</b>. Change <code>TZ</code> in <code>wrangler.jsonc</code> to adjust.</p>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Your data</h2></div>
        <p className="muted" style={{ marginTop: 0 }}>
          Visitor IPs are never stored. Each click keeps country, city, referrer, device, OS and browser, plus a daily-rotating anonymous id for unique counts.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn" href="/api/export.json">Download link backup (JSON)</a>
          <a className="btn" href={api.csvUrl({ from: '2000-01-01', to: '2999-12-31' })}>Download all events (CSV)</a>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Session</h2></div>
        <button className="btn danger" onClick={onLogout}>Log out</button>
      </section>
    </div>
  );
}

export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-wrap">
      <form
        className="login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            await api.login(pw);
            onDone();
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className="brand"><Logo /><span className="brand-name">See Links</span></div>
        <h1>Welcome back</h1>
        <p className="muted" style={{ marginTop: 0 }}>Enter your dashboard password.</p>
        <label className="field">
          <span className="label">Password</span>
          <input className={`input${err ? ' err' : ''}`} type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <div className="error-text" role="alert">{err}</div>}
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18, height: 44 }} disabled={busy || !pw}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
