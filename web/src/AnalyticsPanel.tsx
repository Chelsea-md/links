import { useEffect, useState } from 'react';
import { api, type Analytics } from './api';
import { BarList, HourBars, TrendChart } from './charts';
import { addDays, countryName, delta, flag, longDate, num, stripProto, todayISO } from './format';
import { IDownload } from './icons';
import { A } from './router';
import { Seg, Switch } from './ui';

type Preset = '7' | '30' | '90' | '365' | 'custom';

export function AnalyticsPanel({
  linkId,
  channel,
  noun = 'Engagements',
  showTopLinks,
  defaultPreset = '30',
}: {
  linkId?: string;
  channel?: 'link' | 'qr';
  noun?: string;
  showTopLinks?: boolean;
  defaultPreset?: Preset;
}) {
  const [preset, setPreset] = useState<Preset>(defaultPreset);
  const [to, setTo] = useState(todayISO());
  const [from, setFrom] = useState(addDays(todayISO(), -(Number(defaultPreset) - 1)));
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locTab, setLocTab] = useState<'countries' | 'cities'>('countries');
  const [devTab, setDevTab] = useState<'devices' | 'os' | 'browsers'>('devices');

  const pickPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const t = todayISO();
      setTo(t);
      setFrom(addDays(t, -(Number(p) - 1)));
    }
  };

  useEffect(() => {
    let alive = true;
    setErr(null);
    api
      .analytics({ link: linkId, channel, from, to })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [linkId, channel, from, to]);

  const lower = noun.toLowerCase();
  const r = data?.range;
  const prevLabel = r ? `Previous period (${longDate(r.prevFrom)} – ${longDate(r.prevTo)})` : 'Previous period';
  const cmp = (cur: number, prev: number) => {
    if (!compare) return null;
    const d = delta(cur, prev);
    return <span className={`delta ${d.dir}`}>{d.dir === 'up' ? '↑' : d.dir === 'down' ? '↓' : ''} {d.label}</span>;
  };

  return (
    <div>
      <div className="an-controls">
        <Seg<Preset>
          value={preset}
          onChange={pickPreset}
          options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['custom', 'Custom']]}
        />
        {preset === 'custom' && (
          <span className="date-pill">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
            <span className="faint">to</span>
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
          </span>
        )}
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginLeft: 4 }} className="small">
          <Switch checked={compare} onChange={setCompare} label="Compare to previous period" />
          Compare to previous period
        </label>
        <span style={{ flex: 1 }} />
        <a className="btn icon-btn" href={api.csvUrl({ link: linkId, channel, from, to })} title="Download CSV" aria-label="Download CSV">
          <IDownload />
        </a>
      </div>

      {err && <div className="error-text">{err}</div>}

      <div className="stats">
        <div className="stat">
          <div className="s-label">Total {lower}, all time</div>
          <div className="s-value">{data ? num(data.totals.allTime) : '–'}</div>
        </div>
        <div className="stat">
          <div className="s-label">
            {noun} {r ? `${longDate(r.from).replace(/, \d{4}$/, '')} – ${longDate(r.to).replace(/, \d{4}$/, '')}` : ''}
          </div>
          <div className="s-value">
            {data ? num(data.totals.period) : '–'}
            {data && cmp(data.totals.period, data.totals.prev)}
          </div>
        </div>
        <div className="stat">
          <div className="s-label">Unique visitors</div>
          <div className="s-value">
            {data ? num(data.totals.uniques) : '–'}
            {data && cmp(data.totals.uniques, data.totals.prevUniques)}
          </div>
        </div>
        <div className="stat">
          <div className="s-label">AI traffic</div>
          <div className="s-value">
            {data ? num(data.ai.total) : '–'}
            {data && cmp(data.ai.total, data.ai.prev)}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{noun} over time</h3>
          {data && data.totals.botsFiltered > 0 && (
            <span className="small faint">{num(data.totals.botsFiltered)} bot and preview hits not counted</span>
          )}
        </div>
        {data ? (
          <TrendChart series={data.series} showPrev={compare} label={`${noun} (${longDate(r!.from)} – ${longDate(r!.to)})`} prevLabel={prevLabel} />
        ) : (
          <div style={{ height: 260 }} />
        )}
      </div>

      {data && (
        <div className="an-grid">
          <div className="panel">
            <div className="panel-head"><h3>Locations</h3></div>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={locTab === 'countries'} onClick={() => setLocTab('countries')}>Countries</button>
              <button role="tab" aria-selected={locTab === 'cities'} onClick={() => setLocTab('cities')}>Cities</button>
            </div>
            {locTab === 'countries' ? (
              <BarList
                head="Country"
                rows={data.countries}
                showPrev={compare}
                render={(k) => (<><span aria-hidden>{flag(k)}</span>{countryName(k)}</>)}
              />
            ) : (
              <BarList
                head="City"
                rows={data.cities}
                render={(k, row) => {
                  const c = (row as { country: string | null }).country;
                  return (<><span aria-hidden>{flag(c)}</span>{k}{c && <span className="faint">{countryName(c)}</span>}</>);
                }}
              />
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Referrers</h3></div>
            <BarList head="Referrer" rows={data.referrers} showPrev={compare} render={(k) => (k === 'direct' ? 'Direct or unknown' : k)} />
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Devices</h3></div>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={devTab === 'devices'} onClick={() => setDevTab('devices')}>Device type</button>
              <button role="tab" aria-selected={devTab === 'os'} onClick={() => setDevTab('os')}>Operating system</button>
              <button role="tab" aria-selected={devTab === 'browsers'} onClick={() => setDevTab('browsers')}>Browser</button>
            </div>
            <BarList
              head={devTab === 'devices' ? 'Device' : devTab === 'os' ? 'OS' : 'Browser'}
              rows={data[devTab]}
              render={(k) => k.charAt(0).toUpperCase() + k.slice(1)}
            />
          </div>

          <div className="panel">
            <div className="panel-head"><h3>AI traffic</h3></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="ai-big">{num(data.ai.total)}</span>
              <span className="muted">visits from AI assistants</span>
            </div>
            <p className="small muted" style={{ margin: '6px 0 12px' }}>
              Includes assistants fetching the link (ChatGPT, Claude, Perplexity…) and people who clicked it inside an assistant.
              These aren’t counted as {lower}.
            </p>
            {data.ai.sources.length ? (
              <table className="blist">
                <thead><tr><th>Assistant</th><th className="n">Fetched</th><th className="n">Clicked</th></tr></thead>
                <tbody>
                  {data.ai.sources.map((s) => (
                    <tr key={s.key}><td style={{ padding: '8px 0' }}>{s.key}</td><td className="n">{num(s.agent)}</td><td className="n">{num(s.referral)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="no-data">No AI traffic in this period</div>
            )}
          </div>

          {!channel && linkId && data.channels.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h3>Short link vs QR code</h3></div>
              <BarList head="Source" rows={data.channels} render={(k) => (k === 'qr' ? 'QR code scans' : 'Short link clicks')} />
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h3>Time of day</h3></div>
            {data.totals.period ? <HourBars hours={data.hours} /> : <div className="no-data">No data for this period</div>}
          </div>

          {showTopLinks && (
            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head"><h3>Top links</h3></div>
              {data.topLinks.length ? (
                <table className="blist">
                  <thead><tr><th>Link</th><th className="n">{noun}</th></tr></thead>
                  <tbody>
                    {data.topLinks.map((t) => (
                      <tr key={t.id}>
                        <td style={{ padding: '9px 0' }}>
                          <A to={`/${t.isQrOnly ? 'qrs' : 'links'}/${t.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>
                            {t.title || stripProto(t.shortUrl)}
                          </A>
                          <div className="small faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 560 }}>
                            {stripProto(t.shortUrl)} → {stripProto(t.destination)}
                          </div>
                        </td>
                        <td className="n">{num(t.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="no-data">No {lower} in this period yet</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
