import { useCallback, useEffect, useState } from 'react';
import { api, type Config } from './api';
import { ConfigCtx } from './editors';
import { IChart, IGear, IHome, ILink, IMenu, IPlus, IQr, ISearch, Logo } from './icons';
import { Detail } from './pages/Detail';
import { LinksList, QrList } from './pages/Lists';
import { AnalyticsPage, Home, Login, Settings } from './pages/Misc';
import { NewLink } from './pages/NewLink';
import { NewQr } from './pages/NewQr';
import { A, navigate, useRoute } from './router';
import { Modal } from './ui';

export function App() {
  const [state, setState] = useState<'loading' | 'login' | 'ready'>('loading');
  const [config, setConfig] = useState<Config | null>(null);

  const boot = useCallback(async () => {
    try {
      const me = await api.me();
      if (!me.authed) return setState('login');
      setConfig(await api.config());
      setState('ready');
    } catch {
      setState('login');
    }
  }, []);

  useEffect(() => {
    boot();
    const on = () => setState('login');
    window.addEventListener('sl:unauthorized', on);
    return () => window.removeEventListener('sl:unauthorized', on);
  }, [boot]);

  if (state === 'loading') return null;
  if (state === 'login') return <Login onDone={boot} />;
  return (
    <ConfigCtx.Provider value={config!}>
      <Shell onLogout={async () => { await api.logout(); setState('login'); }} />
    </ConfigCtx.Provider>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const path = useRoute();
  const [creating, setCreating] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => setRailOpen(false), [path]);

  // Keyboard shortcuts: L = new link, Q = new QR code (when not typing)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable) return;
      if (e.key === 'l' || e.key === 'L') { setCreating(false); navigate('/links/new'); }
      if (e.key === 'q' || e.key === 'Q') { setCreating(false); navigate('/qrs/new'); }
      if (e.key === 'c' || e.key === 'C') setCreating(true);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  let page: React.ReactNode;
  let m: RegExpMatchArray | null;
  if (path === '/') page = <Home />;
  else if (path === '/links') page = <LinksList initialQuery={new URLSearchParams(location.search).get('q') || ''} />;
  else if (path === '/links/new') page = <NewLink />;
  else if ((m = path.match(/^\/links\/([\w]+)$/))) page = <Detail key={m[1]} id={m[1]} mode="link" />;
  else if (path === '/qrs') page = <QrList />;
  else if (path === '/qrs/new') page = <NewQr />;
  else if ((m = path.match(/^\/qrs\/([\w]+)$/))) page = <Detail key={`q${m[1]}`} id={m[1]} mode="qr" />;
  else if (path === '/analytics') page = <AnalyticsPage />;
  else if (path === '/settings') page = <Settings onLogout={onLogout} />;
  else page = (
    <div className="page"><div className="empty"><h3>Page not found</h3><p>That address isn’t part of the dashboard.</p><A to="/" className="btn">Go home</A></div></div>
  );

  const nav: [string, string, React.ReactNode][] = [
    ['/', 'Home', <IHome key="h" />],
    ['/links', 'Links', <ILink key="l" />],
    ['/qrs', 'QR codes', <IQr key="q" />],
    ['/analytics', 'Analytics', <IChart key="a" />],
  ];
  const active = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

  return (
    <div className="shell">
      <nav className={`rail${railOpen ? ' open' : ''}`} aria-label="Main">
        <A to="/" className="brand"><Logo /><span className="brand-name">See Links</span></A>
        <button className="btn primary create" onClick={() => setCreating(true)}><IPlus /> Create new</button>
        {nav.map(([to, label, icon]) => (
          <A key={to} to={to} className="nav-item" aria-current={active(to) ? 'page' : undefined}>{icon}{label}</A>
        ))}
        <div className="rail-sep" />
        <A to="/settings" className="nav-item" aria-current={active('/settings') ? 'page' : undefined}><IGear />Settings</A>
        <div className="rail-foot">Press <kbd>L</kbd> for a link, <kbd>Q</kbd> for a QR code</div>
      </nav>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon-btn menu-btn" aria-label="Open menu" onClick={() => setRailOpen(true)}><IMenu /></button>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              history.pushState(null, '', `/admin/links?q=${encodeURIComponent(search)}`);
              window.dispatchEvent(new Event('sl:navigate'));
            }}
          >
            <ISearch size={16} />
            <input placeholder="Search links" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search links" />
          </form>
          <span className="spacer" />
        </header>
        <main>{page}</main>
      </div>
      {creating && (
        <Modal title="What do you want to create?" onClose={() => setCreating(false)}>
          <div className="create-grid">
            <button className="create-tile" onClick={() => { setCreating(false); navigate('/links/new'); }}>
              <ILink size={22} />
              <span className="tile-row"><span>Shorten a link</span><kbd>L</kbd></span>
            </button>
            <button className="create-tile" onClick={() => { setCreating(false); navigate('/qrs/new'); }}>
              <IQr size={22} />
              <span className="tile-row"><span>Create a QR code</span><kbd>Q</kbd></span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
