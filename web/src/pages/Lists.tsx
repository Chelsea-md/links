import { useEffect, useState } from 'react';
import { api, type Link } from '../api';
import { copy, num, stripProto } from '../format';
import { ICopy, IPlus, ITag } from '../icons';
import { QrPreview } from '../QrDesigner';
import { A } from '../router';
import { Favicon, Seg, useToast } from '../ui';

function useLinks(type: 'link' | 'qr', q: string, tag: string, archived: boolean) {
  const [links, setLinks] = useState<Link[] | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api
        .links({ type, q: q || undefined, tag: tag || undefined, archived: archived ? '1' : undefined })
        .then((l) => alive && setLinks(l))
        .catch(() => alive && setLinks([]));
    }, q ? 200 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [type, q, tag, archived]);
  return links;
}

function Filters({ q, setQ, tag, setTag, archived, setArchived }: {
  q: string; setQ: (v: string) => void; tag: string; setTag: (v: string) => void; archived: boolean; setArchived: (v: boolean) => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => { api.tags().then(setTags).catch(() => {}); }, []);
  return (
    <div className="toolbar">
      <input className="input" style={{ maxWidth: 320 }} placeholder="Filter by title, back-half or URL" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
      {tags.length > 0 && (
        <select className="select" style={{ width: 'auto' }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
          <option value="">All tags</option>
          {tags.map((t) => (<option key={t}>{t}</option>))}
        </select>
      )}
      <span style={{ flex: 1 }} />
      <Seg value={archived ? 'a' : 'act'} onChange={(v) => setArchived(v === 'a')} options={[['act', 'Active'], ['a', 'Archived']]} />
    </div>
  );
}

export function LinksList({ initialQuery = '' }: { initialQuery?: string }) {
  const toast = useToast();
  const [q, setQ] = useState(initialQuery);
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);
  useEffect(() => setQ(initialQuery), [initialQuery]);
  const links = useLinks('link', q, tag, archived);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Links</h1>
        <A to="/links/new" className="btn primary"><IPlus /> Create link</A>
      </div>
      <Filters {...{ q, setQ, tag, setTag, archived, setArchived }} />
      {links === null ? null : links.length === 0 ? (
        <div className="empty">
          <h3>{q || tag || archived ? 'No links match' : 'No links yet'}</h3>
          <p>{q || tag || archived ? 'Try a different filter.' : 'Shorten your first URL on your own domain.'}</p>
          {!(q || tag || archived) && <A to="/links/new" className="btn primary">Create link</A>}
        </div>
      ) : (
        <div className="list">
          {links.map((l) => (
            <A key={l.id} to={`/links/${l.id}`} className="item">
              <Favicon url={l.destination} />
              <div style={{ minWidth: 0 }}>
                <div className="item-title">{l.title || stripProto(l.destination)}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="item-short">{stripProto(l.shortUrl)}</span>
                  <button
                    className="btn ghost sm icon-btn"
                    style={{ width: 28, height: 28 }}
                    aria-label="Copy short link"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (await copy(l.shortUrl)) toast('Copied');
                    }}
                  >
                    <ICopy size={15} />
                  </button>
                </div>
                <div className="item-dest">{l.destination}</div>
                <div className="item-meta">
                  <span>{new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  {l.qrSlug && <span className="chip">QR · {num(l.scans)} scans</span>}
                  {l.rules.length > 0 && <span className="chip">{l.rules.length} routing rule{l.rules.length > 1 ? 's' : ''}</span>}
                  {l.tags.map((t) => (<span className="chip" key={t}><ITag size={12} />{t}</span>))}
                </div>
              </div>
              <div className="item-stat">
                <b>{num(l.clicks)}</b>
                <span className="small muted">clicks · {num(l.recent)} in 7 days</span>
              </div>
            </A>
          ))}
        </div>
      )}
    </div>
  );
}

export function QrList() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);
  const links = useLinks('qr', q, tag, archived);

  return (
    <div className="page">
      <div className="page-head">
        <h1>QR codes</h1>
        <A to="/qrs/new" className="btn primary"><IPlus /> Create QR code</A>
      </div>
      <Filters {...{ q, setQ, tag, setTag, archived, setArchived }} />
      {links === null ? null : links.length === 0 ? (
        <div className="empty">
          <h3>{q || tag || archived ? 'No QR codes match' : 'No QR codes yet'}</h3>
          <p>{q || tag || archived ? 'Try a different filter.' : 'Make a styled, trackable QR code that points to your domain.'}</p>
          {!(q || tag || archived) && <A to="/qrs/new" className="btn primary">Create QR code</A>}
        </div>
      ) : (
        <div className="qr-grid">
          {links.map((l) => (
            <A key={l.id} to={`/qrs/${l.id}`} className="qr-card">
              <div className="qr-thumb"><QrPreview url={l.qrUrl!} design={l.qrDesign} size={150} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="item-title">{l.title || stripProto(l.destination)}</div>
                <div className="item-dest">{stripProto(l.destination)}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span><b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{num(l.scans)}</b> <span className="small muted">scans</span></span>
                <span className="small faint">{num(l.recent)} in 7 days</span>
              </div>
            </A>
          ))}
        </div>
      )}
    </div>
  );
}
