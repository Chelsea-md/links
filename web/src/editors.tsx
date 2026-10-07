import { createContext, useContext } from 'react';
import type { Config, Rule, UTM } from './api';
import { IRoute, IX } from './icons';
import { ToggleRow } from './ui';

export const ConfigCtx = createContext<Config>({ domains: [], defaultDomain: '', tz: 'UTC' });
export const useConfig = () => useContext(ConfigCtx);

export interface AdvancedState {
  utmOn: boolean;
  utm: UTM;
  expOn: boolean;
  expiresAt: string; // datetime-local value
  expiredUrl: string;
  rulesOn: boolean;
  rules: Rule[];
}

export const emptyAdvanced = (): AdvancedState => ({
  utmOn: false,
  utm: {},
  expOn: false,
  expiresAt: '',
  expiredUrl: '',
  rulesOn: false,
  rules: [],
});

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function advancedFromLink(l: { utm: UTM | null; expiresAt: number | null; expiredUrl: string | null; rules: Rule[] }): AdvancedState {
  return {
    utmOn: !!l.utm,
    utm: l.utm || {},
    expOn: !!l.expiresAt,
    expiresAt: l.expiresAt ? toLocalInput(l.expiresAt) : '',
    expiredUrl: l.expiredUrl || '',
    rulesOn: l.rules.length > 0,
    rules: l.rules,
  };
}

export function advancedPayload(a: AdvancedState) {
  return {
    utm: a.utmOn ? a.utm : null,
    expiresAt: a.expOn && a.expiresAt ? new Date(a.expiresAt).getTime() : null,
    expiredUrl: a.expOn && a.expiredUrl ? a.expiredUrl.trim() : null,
    rules: a.rulesOn ? a.rules.filter((r) => r.value || r.destination) : [],
  };
}

const UTM_FIELDS: [keyof UTM, string, string][] = [
  ['source', 'Source', 'newsletter, instagram'],
  ['medium', 'Medium', 'email, social, qr'],
  ['campaign', 'Campaign', 'autumn_launch'],
  ['term', 'Term', 'optional'],
  ['content', 'Content', 'optional'],
];

export function AdvancedSettings({ value, onChange, noun = 'link' }: { value: AdvancedState; onChange: (v: AdvancedState) => void; noun?: string }) {
  const set = (patch: Partial<AdvancedState>) => onChange({ ...value, ...patch });
  return (
    <>
      <ToggleRow
        icon={<span className="faint" style={{ fontWeight: 700, width: 18, textAlign: 'center' }}>{'{ }'}</span>}
        title="UTM parameters"
        desc="Added to the destination when someone opens the link"
        checked={value.utmOn}
        onChange={(v) => set({ utmOn: v })}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {UTM_FIELDS.map(([k, label, ph]) => (
            <label key={k}>
              <span className="label">{label}</span>
              <input className="input" placeholder={ph} value={value.utm[k] || ''} onChange={(e) => set({ utm: { ...value.utm, [k]: e.target.value } })} />
            </label>
          ))}
        </div>
      </ToggleRow>

      <ToggleRow
        icon={<span aria-hidden className="faint">◷</span>}
        title={`${noun[0].toUpperCase()}${noun.slice(1)} expiration`}
        desc="Stop redirecting after a date and time"
        checked={value.expOn}
        onChange={(v) => set({ expOn: v })}
      >
        <div className="row">
          <label>
            <span className="label">Expires at</span>
            <input className="input" type="datetime-local" value={value.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
          </label>
          <label>
            <span className="label">
              After it expires, send to <span className="opt">(optional)</span>
            </span>
            <input className="input" placeholder="https://… (blank shows an “expired” page)" value={value.expiredUrl} onChange={(e) => set({ expiredUrl: e.target.value })} />
          </label>
        </div>
      </ToggleRow>

      <ToggleRow
        icon={<IRoute className="faint" />}
        title="Dynamic routing"
        desc="Send visitors to different URLs by device, OS or country. The first matching rule wins; everyone else goes to the main destination."
        checked={value.rulesOn}
        onChange={(v) => set({ rulesOn: v, rules: v && !value.rules.length ? [{ type: 'device', value: 'mobile', destination: '' }] : value.rules })}
      >
        <RulesEditor rules={value.rules} onChange={(rules) => set({ rules })} />
      </ToggleRow>
    </>
  );
}

export function RulesEditor({ rules, onChange }: { rules: Rule[]; onChange: (r: Rule[]) => void }) {
  const update = (i: number, patch: Partial<Rule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      {rules.map((r, i) => (
        <div className="rule-row" key={i}>
          <select
            className="select"
            value={r.type}
            onChange={(e) => {
              const type = e.target.value as Rule['type'];
              update(i, { type, value: type === 'device' ? 'mobile' : type === 'os' ? 'iOS' : 'KR' });
            }}
            aria-label="Condition"
          >
            <option value="device">Device</option>
            <option value="os">OS</option>
            <option value="country">Country</option>
          </select>
          {r.type === 'device' ? (
            <select className="select" value={r.value} onChange={(e) => update(i, { value: e.target.value })} aria-label="Device">
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
              <option value="desktop">Desktop</option>
            </select>
          ) : r.type === 'os' ? (
            <select className="select" value={r.value} onChange={(e) => update(i, { value: e.target.value })} aria-label="OS">
              {['iOS', 'iPadOS', 'Android', 'Windows', 'macOS', 'Linux', 'ChromeOS'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              value={r.value}
              maxLength={2}
              placeholder="KR"
              onChange={(e) => update(i, { value: e.target.value.toUpperCase() })}
              aria-label="Country code"
              title="Two-letter country code, e.g. KR, US, JP"
            />
          )}
          <input className="input" placeholder="https://destination-for-this-rule" value={r.destination} onChange={(e) => update(i, { destination: e.target.value })} aria-label="Destination" />
          <button type="button" className="btn ghost icon-btn" aria-label="Remove rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
            <IX />
          </button>
        </div>
      ))}
      <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => onChange([...rules, { type: 'country', value: 'KR', destination: '' }])}>
        Add rule
      </button>
    </div>
  );
}

export function normalizeUrl(u: string): string {
  const v = u.trim();
  if (!v) return v;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
