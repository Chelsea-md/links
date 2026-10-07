import { useEffect, useState } from 'react';
import { api, withShadowConfirm, type Link, type QrDesign } from '../api';
import { AnalyticsPanel } from '../AnalyticsPanel';
import { AdvancedSettings, advancedFromLink, advancedPayload, normalizeUrl } from '../editors';
import { copy, countryName, dateTime, stripProto } from '../format';
import { IArchive, IBack, ICopy, IDownload, IEdit, IExternal, IMore, IPlus, IQr, ITag, ITrash } from '../icons';
import { DEFAULT_DESIGN, download, qrPng, qrSvg } from '../qr';
import { QrDesigner, QrPreview } from '../QrDesigner';
import { A, navigate } from '../router';
import { Menu, Modal, TagInput, useToast } from '../ui';

export function Detail({ id, mode }: { id: string; mode: 'link' | 'qr' }) {
  const toast = useToast();
  const [link, setLink] = useState<Link | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [designing, setDesigning] = useState(false);

  useEffect(() => {
    setLink(null);
    api.link(id).then(setLink).catch(() => setNotFound(true));
  }, [id]);

  if (notFound)
    return (
      <div className="page">
        <div className="empty">
          <h3>This {mode === 'qr' ? 'QR code' : 'link'} doesn’t exist</h3>
          <p>It may have been deleted.</p>
          <A to={mode === 'qr' ? '/qrs' : '/links'} className="btn">Back to the list</A>
        </div>
      </div>
    );
  if (!link) return <div className="page" />;

  const update = async (patch: Parameters<typeof api.update>[1], msg: string) => {
    try {
      const l = await api.update(link.id, patch);
      setLink(l);
      toast(msg);
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    }
  };

  const fileBase = (link.title || link.slug).replace(/[^\w-]+/g, '-').slice(0, 40) || 'qr';
  const dl = async (fmt: 'png' | 'svg') => {
    if (!link.qrUrl) return;
    const design = link.qrDesign || DEFAULT_DESIGN;
    if (fmt === 'png') download(await qrPng(link.qrUrl, design), `${fileBase}.png`);
    else download(new Blob([await qrSvg(link.qrUrl, design, 1000)], { type: 'image/svg+xml' }), `${fileBase}.svg`);
  };

  const isQr = mode === 'qr';
  const name = link.title || stripProto(link.destination);
  const expired = link.expiresAt && link.expiresAt < Date.now();

  return (
    <div className="page">
      <div className="page-head">
        <A to={isQr ? '/qrs' : '/links'} className="btn ghost icon-btn" aria-label="Back"><IBack /></A>
        <h1 title={name}>{name}</h1>
        <button className="btn ghost icon-btn" aria-label="Edit" onClick={() => setEditing(true)}><IEdit /></button>
        <Menu trigger={(t) => (<button className="btn ghost icon-btn" aria-label="More actions" onClick={t}><IMore /></button>)}>
          {(close) => (
            <>
              <a href={link.destination} target="_blank" rel="noreferrer" onClick={close}><IExternal size={16} /> Open destination</a>
              <button onClick={() => { close(); update({ archived: !link.archived }, link.archived ? 'Restored' : 'Archived — the link stops redirecting'); }}>
                <IArchive size={16} /> {link.archived ? 'Restore' : 'Archive'}
              </button>
              <button
                style={{ color: 'var(--danger)' }}
                onClick={async () => {
                  close();
                  if (!confirm(`Delete ${stripProto(link.shortUrl)} and all its analytics? This can’t be undone.`)) return;
                  await api.remove(link.id);
                  toast('Deleted');
                  navigate(isQr ? '/qrs' : '/links', true);
                }}
              >
                <ITrash size={16} /> Delete
              </button>
            </>
          )}
        </Menu>
        {isQr ? (
          <Menu trigger={(t) => (<button className="btn primary" onClick={t}><IDownload /> Download</button>)}>
            {(close) => (
              <>
                <button onClick={() => { close(); dl('png'); }}>PNG (1200px)</button>
                <button onClick={() => { close(); dl('svg'); }}>SVG (vector)</button>
              </>
            )}
          </Menu>
        ) : (
          <button className="btn primary" onClick={async () => (await copy(link.shortUrl)) && toast('Copied')}><ICopy /> Copy link</button>
        )}
      </div>

      {link.archived && (
        <div className="panel" style={{ background: '#fff7e6', borderColor: '#f1d9a6', marginBottom: 16 }}>
          This {isQr ? 'code' : 'link'} is archived and shows a “not found” page. Restore it from the ⋯ menu.
        </div>
      )}

      <div className="detail-grid">
        <section className="panel">
          <div className="panel-head"><h2>Details</h2></div>
          {isQr ? (
            <>
              <dl className="kv" style={{ marginTop: 0 }}>
                <dt>Encoded URL</dt>
                <dd className="muted">{stripProto(link.qrUrl!)}</dd>
              </dl>
              {link.showLink && (
                <dl className="kv">
                  <dt>Short link</dt>
                  <dd><a className="short-big" style={{ fontSize: 22 }} href={link.shortUrl} target="_blank" rel="noreferrer">{stripProto(link.shortUrl)}</a></dd>
                </dl>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <a className="short-big" href={link.shortUrl} target="_blank" rel="noreferrer">{stripProto(link.shortUrl)}</a>
              <button className="btn ghost icon-btn" aria-label="Copy short link" onClick={async () => (await copy(link.shortUrl)) && toast('Copied')}><ICopy /></button>
            </div>
          )}
          <dl className="kv">
            <dt>Destination</dt>
            <dd>↳ <a href={link.destination} target="_blank" rel="noreferrer">{link.destination}</a></dd>
          </dl>
          <dl className="kv">
            <dt>Tags</dt>
            <dd>
              {link.tags.length ? (
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{link.tags.map((t) => (<span className="chip" key={t}><ITag size={12} />{t}</span>))}</span>
              ) : (
                <span className="muted">No tags</span>
              )}
            </dd>
          </dl>
          {link.utm && (
            <dl className="kv">
              <dt>UTM parameters</dt>
              <dd className="small">{Object.entries(link.utm).map(([k, v]) => `utm_${k}=${v}`).join('  ')}</dd>
            </dl>
          )}
          {link.expiresAt && (
            <dl className="kv">
              <dt>{expired ? 'Expired' : 'Expires'}</dt>
              <dd style={{ color: expired ? 'var(--danger)' : undefined }}>
                {dateTime(link.expiresAt)}
                {link.expiredUrl && <span className="muted"> → then {stripProto(link.expiredUrl)}</span>}
              </dd>
            </dl>
          )}
          <dl className="kv">
            <dt>Created</dt>
            <dd className="muted">{dateTime(link.createdAt)}</dd>
          </dl>
        </section>

        <section className="panel side-qr">
          {link.qrUrl ? (
            <>
              <QrPreview url={link.qrUrl} design={link.qrDesign} size={170} />
              {isQr ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn" onClick={() => setDesigning(true)}>Customize</button>
                  {!link.showLink && (
                    <button className="btn" onClick={() => update({ showLink: true }, 'Short link added to Links')}><IPlus /> Short link</button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <A to={`/qrs/${link.id}`} className="btn">View QR code</A>
                  <button className="btn icon-btn" aria-label="Download PNG" onClick={() => dl('png')}><IDownload /></button>
                </div>
              )}
            </>
          ) : (
            <>
              <IQr size={40} className="faint" />
              <div>
                <h3>No QR code yet</h3>
                <p className="small muted" style={{ margin: '4px 0 0' }}>Scans get their own stats, separate from clicks.</p>
              </div>
              <button className="btn" onClick={async () => { if (await update({ qr: true }, 'QR code created')) navigate(`/qrs/${link.id}`); }}>
                <IPlus /> Create QR code
              </button>
            </>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h2>Dynamic routing</h2>
          <button className="btn sm" onClick={() => setEditing(true)}>{link.rules.length ? 'Edit rules' : <><IPlus size={16} /> Add rules</>}</button>
        </div>
        {link.rules.length ? (
          <ul className="rules-list">
            {link.rules.map((r, i) => (
              <li key={i}>
                <span className="chip">{r.type === 'country' ? `${countryName(r.value)}` : r.value}</span>
                <span className="faint">→</span>
                <span style={{ wordBreak: 'break-all' }}>{r.destination}</span>
              </li>
            ))}
            <li><span className="chip">Everyone else</span><span className="faint">→</span><span className="muted">{link.destination}</span></li>
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Send visitors to different destinations by device, OS or country.</p>
        )}
      </section>

      <section style={{ marginTop: 36 }}>
        <div className="an-head">
          <h2 style={{ fontSize: 24 }}>{isQr ? 'Scan analytics' : 'Link analytics'}</h2>
          <span className="muted">{isQr ? 'QR code scans only' : 'Short link clicks and QR scans'}</span>
        </div>
        <AnalyticsPanel linkId={link.id} channel={isQr ? 'qr' : undefined} noun={isQr ? 'Scans' : 'Engagements'} />
      </section>

      {editing && <EditModal link={link} onClose={() => setEditing(false)} onSaved={(l) => { setLink(l); setEditing(false); toast('Saved'); }} />}
      {designing && (
        <DesignModal
          design={link.qrDesign || DEFAULT_DESIGN}
          url={link.qrUrl!}
          onClose={() => setDesigning(false)}
          onSave={async (d) => { if (await update({ qrDesign: d }, 'Design saved')) setDesigning(false); }}
        />
      )}
    </div>
  );
}

function EditModal({ link, onClose, onSaved }: { link: Link; onClose: () => void; onSaved: (l: Link) => void }) {
  const [destination, setDestination] = useState(link.destination);
  const [title, setTitle] = useState(link.title || '');
  const [slug, setSlug] = useState(link.slug);
  const [tags, setTags] = useState(link.tags);
  const [adv, setAdv] = useState(advancedFromLink(link));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      onSaved(await withShadowConfirm((force) => api.update(link.id, { force, destination: normalizeUrl(destination), title: title || null, slug, tags, ...advancedPayload(adv) })));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit" onClose={onClose} wide>
      <label className="field">
        <span className="label">Destination URL</span>
        <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} />
        <div className="hint">Changing it updates the short link and QR code everywhere — no need to reprint.</div>
      </label>
      <label className="field">
        <span className="label">Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Back-half</span>
        <div className="row">
          <span className="muted" style={{ flex: 'none', paddingBottom: 10 }}>{link.domain}/</span>
          <input className="input" value={slug} onChange={(e) => setSlug(e.target.value.replace(/\s/g, '-'))} />
        </div>
        {slug !== link.slug && <div className="hint" style={{ color: 'var(--down)' }}>The old short link {link.domain}/{link.slug} will stop working.</div>}
      </label>
      <div className="field">
        <span className="label">Tags</span>
        <TagInput value={tags} onChange={setTags} />
      </div>
      <div className="field">
        <AdvancedSettings value={adv} onChange={setAdv} />
      </div>
      {err && <div className="error-text" role="alert">{err}</div>}
      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

function DesignModal({ design, url, onClose, onSave }: { design: QrDesign; url: string; onClose: () => void; onSave: (d: QrDesign) => void }) {
  const [d, setD] = useState(design);
  return (
    <Modal title="Customize QR code" onClose={onClose} wide>
      <div className="qr-layout" style={{ gridTemplateColumns: 'minmax(0,1fr) 240px' }}>
        <QrDesigner value={d} onChange={setD} />
        <aside className="qr-preview-col" style={{ top: 0 }}>
          <div className="qr-stage"><QrPreview url={url} design={d} size={190} /></div>
          <p className="small muted">Same encoded URL — printed copies keep working.</p>
        </aside>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(d)}>Save design</button>
      </div>
    </Modal>
  );
}
