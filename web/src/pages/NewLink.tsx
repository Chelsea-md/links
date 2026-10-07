import { useEffect, useState } from 'react';
import { api } from '../api';
import { AdvancedSettings, ShortLinkField, advancedPayload, emptyAdvanced, normalizeUrl, useConfig } from '../editors';
import { IQr } from '../icons';
import { navigate, A } from '../router';
import { TagInput, ToggleRow, useToast } from '../ui';

export function NewLink() {
  const cfg = useConfig();
  const toast = useToast();
  const [destination, setDestination] = useState('');
  const [domain, setDomain] = useState(cfg.defaultDomain);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [qr, setQr] = useState(false);
  const [adv, setAdv] = useState(emptyAdvanced());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.tags().then(setAllTags).catch(() => {}); }, []);

  const suggestTitle = async () => {
    const url = normalizeUrl(destination);
    if (!url || titleTouched || title) return;
    const { title: t } = await api.meta(url).catch(() => ({ title: null }));
    if (t && !titleTouched) setTitle(t);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const link = await api.create({
        destination: normalizeUrl(destination),
        domain,
        slug: slug.trim() || undefined,
        title: title.trim() || null,
        tags,
        qr,
        ...advancedPayload(adv),
      });
      toast('Link created');
      navigate(`/links/${link.id}`, true);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Create a link</h1>
      </div>
      <form onSubmit={submit}>
        <section className="panel">
          <div className="panel-head"><h2>Link details</h2></div>
          <label className="field">
            <span className="label">Destination URL</span>
            <input
              className="input"
              autoFocus
              required
              placeholder="https://example.com/my-long-url"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onBlur={suggestTitle}
            />
          </label>
          <div className="field">
            <ShortLinkField domains={cfg.domains} domain={domain} onDomain={setDomain} slug={slug} onSlug={setSlug} />
          </div>
          <label className="field">
            <span className="label">Title <span className="optional">(optional)</span></span>
            <input className="input" value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} placeholder="Filled from the page title when possible" />
          </label>
          <div className="field">
            <span className="label">Tags</span>
            <TagInput value={tags} onChange={setTags} suggestions={allTags} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Sharing</h2></div>
          <ToggleRow
            icon={<IQr className="faint" />}
            title="Also make a QR code"
            desc="Scans are tracked separately from link clicks. You can style it after creating."
            checked={qr}
            onChange={setQr}
          />
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Advanced settings</h2></div>
          <AdvancedSettings value={adv} onChange={setAdv} />
        </section>

        {err && <div className="error-text" role="alert">{err}</div>}
        <div className="form-foot">
          <A to="/links" className="btn ghost">Cancel</A>
          <button className="btn primary" disabled={busy || !destination.trim()}>
            {busy ? 'Creating…' : 'Create link'}
          </button>
        </div>
      </form>
    </div>
  );
}
