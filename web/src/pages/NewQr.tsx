import { useEffect, useState } from 'react';
import { api, type QrDesign } from '../api';
import { AdvancedSettings, ShortLinkField, advancedPayload, emptyAdvanced, normalizeUrl, useConfig } from '../editors';
import { ILink } from '../icons';
import { DEFAULT_DESIGN } from '../qr';
import { QrDesigner, QrPreview } from '../QrDesigner';
import { A, navigate } from '../router';
import { TagInput, ToggleRow, useToast } from '../ui';

export function NewQr() {
  const cfg = useConfig();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [destination, setDestination] = useState('');
  const [domain, setDomain] = useState(cfg.defaultDomain);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [shareLink, setShareLink] = useState(false);
  const [slug, setSlug] = useState('');
  const [adv, setAdv] = useState(emptyAdvanced());
  const [design, setDesign] = useState<QrDesign>({ ...DEFAULT_DESIGN });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.tags().then(setAllTags).catch(() => {}); }, []);

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/[^\s.]+\.[^\s]+/i.test(normalizeUrl(destination))) {
      setErr('Enter a valid destination URL');
      return;
    }
    setErr(null);
    setStep(2);
    window.scrollTo(0, 0);
    if (!title) api.meta(normalizeUrl(destination)).then((r) => r.title && setTitle((t) => t || r.title!)).catch(() => {});
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const link = await api.create({
        destination: normalizeUrl(destination),
        domain,
        slug: shareLink && slug.trim() ? slug.trim() : undefined,
        title: title.trim() || null,
        tags,
        qr: true,
        showLink: shareLink,
        qrDesign: design,
        ...advancedPayload(adv),
      });
      toast('QR code created');
      navigate(`/qrs/${link.id}`, true);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="steps" aria-label="Progress">
        <span className={step === 1 ? 'on' : 'done'}><span className="dot">{step === 1 ? '1' : '✓'}</span>Set destination</span>
        <span className="bar" />
        <span className={step === 2 ? 'on' : ''}><span className="dot">2</span>Design</span>
      </div>
      <div className="page-head"><h1>Create a QR code</h1></div>

      <div className="qr-layout">
        <div>
          {step === 1 ? (
            <form onSubmit={next}>
              <section className="panel">
                <div className="panel-head"><h2>Code details</h2></div>
                <label className="field">
                  <span className="label">Destination URL</span>
                  <input className="input" autoFocus required placeholder="https://example.com/my-long-url" value={destination} onChange={(e) => setDestination(e.target.value)} />
                </label>
                {cfg.domains.length > 1 && (
                  <label className="field">
                    <span className="label">Domain</span>
                    <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)}>
                      {cfg.domains.map((d) => (<option key={d}>{d}</option>))}
                    </select>
                  </label>
                )}
                <div className="field">
                  <ToggleRow
                    icon={<ILink className="faint" />}
                    title="Also share as a short link"
                    desc="Shows up in Links too. Clicks and scans are counted separately."
                    checked={shareLink}
                    onChange={setShareLink}
                  >
                    <ShortLinkField domains={[domain]} domain={domain} onDomain={setDomain} slug={slug} onSlug={setSlug} />
                  </ToggleRow>
                </div>
                <label className="field">
                  <span className="label">Title <span className="optional">(optional)</span></span>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <div className="field">
                  <span className="label">Tags</span>
                  <TagInput value={tags} onChange={setTags} suggestions={allTags} />
                </div>
              </section>
              <section className="panel">
                <div className="panel-head"><h2>Advanced settings</h2></div>
                <AdvancedSettings value={adv} onChange={setAdv} noun="code" />
              </section>
              {err && <div className="error-text" role="alert">{err}</div>}
              <div className="form-foot">
                <A to="/qrs" className="btn ghost">Cancel</A>
                <button className="btn primary" disabled={!destination.trim()}>Design your code</button>
              </div>
            </form>
          ) : (
            <>
              <QrDesigner value={design} onChange={setDesign} />
              {err && <div className="error-text" role="alert">{err}</div>}
              <div className="form-foot">
                <A to="/qrs" className="btn ghost">Cancel</A>
                <span style={{ display: 'flex', gap: 10 }}>
                  <button className="btn" onClick={() => setStep(1)}>Back</button>
                  <button className="btn primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create QR code'}</button>
                </span>
              </div>
            </>
          )}
        </div>
        <aside className="qr-preview-col">
          <div className="qr-stage">
            <QrPreview url={`https://${domain}/preview`} design={design} size={240} />
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Preview only. The real code is generated when you create it.
          </p>
        </aside>
      </div>
    </div>
  );
}
