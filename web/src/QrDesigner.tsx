import { useRef } from 'react';
import type { QrDesign } from './api';
import { DEFAULT_DESIGN, TEMPLATES, fileToLogo, useQrImage } from './qr';
import { IUpload, IX } from './icons';
import { Switch } from './ui';

const PRESET_COLORS = ['#000000', '#1A1C21', '#0A6B6B', '#1D4ED8', '#7C3AED', '#D9366F', '#DC2626', '#EA7317', '#15803D'];

const DOTS: QrDesign['dots'][] = ['square', 'rounded', 'extra-rounded', 'dots', 'classy', 'classy-rounded'];
const CORNERS: [QrDesign['cornerSquare'], QrDesign['cornerDot']][] = [
  ['square', 'square'],
  ['extra-rounded', 'square'],
  ['extra-rounded', 'dot'],
  ['dot', 'dot'],
  ['square', 'dot'],
];
const FRAMES: [QrDesign['frame'], string][] = [
  ['none', 'No frame'],
  ['border', 'Border'],
  ['label', 'Border with label'],
  ['label-solid', 'Solid label'],
];

function Thumb({ design, simple }: { design: QrDesign; simple?: boolean }) {
  // Short data = fewer, bigger modules, so pattern differences are visible at thumbnail size
  const src = useQrImage('https://see.links/sample', design, simple ? 200 : 120);
  if (!src) return null;
  // Pattern thumbs show a zoomed center crop so the module shape is visible
  return simple ? (
    <img src={src} alt="" style={{ width: '260%', maxWidth: 'none', flex: 'none' }} />
  ) : (
    <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
  );
}

function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} color picker`} />
      <input
        type="text"
        value={value}
        aria-label={`${label} hex value`}
        onChange={(e) => {
          const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v.toUpperCase());
        }}
      />
    </div>
  );
}

export function QrDesigner({ value, onChange }: { value: QrDesign; onChange: (d: QrDesign) => void }) {
  const d = { ...DEFAULT_DESIGN, ...value };
  const set = (patch: Partial<QrDesign>) => onChange({ ...d, ...patch });
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head"><h2>Start with a template</h2></div>
        <div className="opt-grid">
          {TEMPLATES.map((t) => (
            <button key={t.name} type="button" className="opt tall" title={t.name} aria-label={`Template: ${t.name}`} onClick={() => onChange({ ...t.design, logo: d.logo, centerText: d.centerText })}>
              <Thumb design={t.design} />
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Pattern and corners</h2></div>
        <span className="label">Pattern</span>
        <div className="opt-grid">
          {DOTS.map((dot) => (
            <button key={dot} type="button" className="opt" aria-pressed={d.dots === dot} aria-label={`Pattern: ${dot}`} onClick={() => set({ dots: dot })}>
              <Thumb simple design={{ ...DEFAULT_DESIGN, dots: dot }} />
            </button>
          ))}
        </div>
        <span className="label" style={{ marginTop: 18 }}>Corners</span>
        <div className="opt-grid">
          {CORNERS.map(([sq, dot]) => (
            <button
              key={sq + dot}
              type="button"
              className="opt"
              aria-pressed={d.cornerSquare === sq && d.cornerDot === dot}
              aria-label={`Corners: ${sq} with ${dot} center`}
              onClick={() => set({ cornerSquare: sq, cornerDot: dot })}
            >
              <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden>
                {sq === 'square' && <rect x="3" y="3" width="34" height="34" fill="none" stroke="#1A1C21" strokeWidth="6" />}
                {sq === 'extra-rounded' && <rect x="3" y="3" width="34" height="34" rx="11" fill="none" stroke="#1A1C21" strokeWidth="6" />}
                {sq === 'dot' && <circle cx="20" cy="20" r="17" fill="none" stroke="#1A1C21" strokeWidth="6" />}
                {dot === 'square' ? <rect x="13" y="13" width="14" height="14" fill="#1A1C21" /> : <circle cx="20" cy="20" r="7.5" fill="#1A1C21" />}
              </svg>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Colors</h2></div>
        <div className="swatches" style={{ marginBottom: 16 }}>
          {PRESET_COLORS.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={d.color.toUpperCase() === c} aria-label={`Color ${c}`} onClick={() => set({ color: c, color2: null })} />
          ))}
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <span className="label">Code</span>
            <ColorField label="Code" value={d.color} onChange={(color) => set({ color })} />
          </div>
          <div>
            <span className="label">
              Gradient to <span className="opt">(optional)</span>
            </span>
            {d.color2 ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}><ColorField label="Gradient" value={d.color2} onChange={(color2) => set({ color2 })} /></div>
                <button type="button" className="btn ghost icon-btn" aria-label="Remove gradient" onClick={() => set({ color2: null })} style={{ height: 42 }}><IX /></button>
              </div>
            ) : (
              <button type="button" className="btn" style={{ height: 42 }} onClick={() => set({ color2: '#F28C28' })}>Add gradient</button>
            )}
          </div>
          <div>
            <span className="label">Background</span>
            <ColorField label="Background" value={d.bg} onChange={(bg) => set({ bg })} />
          </div>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
          <Switch checked={!d.cornerColor} onChange={(v) => set({ cornerColor: v ? null : '#0A6B6B' })} label="Corners use code color" />
          Corners use the code color
        </label>
        {d.cornerColor && (
          <div style={{ maxWidth: 220, marginTop: 10 }}>
            <ColorField label="Corners" value={d.cornerColor} onChange={(cornerColor) => set({ cornerColor })} />
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Logo or center text</h2></div>
        <div className="opt-grid" style={{ alignItems: 'center' }}>
          <button type="button" className="opt" aria-pressed={!d.logo && !d.centerText} aria-label="No logo" onClick={() => set({ logo: null, centerText: null })}>
            <IX />
          </button>
          <button type="button" className="opt" aria-pressed={!!d.logo} aria-label="Upload logo" onClick={() => fileRef.current?.click()}>
            {d.logo ? <img src={d.logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <IUpload />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) set({ logo: await fileToLogo(f), centerText: null });
              e.target.value = '';
            }}
          />
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="Or type center text"
            maxLength={14}
            value={d.centerText || ''}
            onChange={(e) => set({ centerText: e.target.value || null, logo: e.target.value ? null : d.logo })}
          />
        </div>
        <div className="hint">PNG, JPG, SVG or WebP. Square images work best. A logo raises error correction so the code still scans.</div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Frame</h2></div>
        <div className="opt-grid">
          {FRAMES.map(([f, label]) => (
            <button key={f} type="button" className="opt tall" aria-pressed={d.frame === f} aria-label={label} title={label} onClick={() => set({ frame: f })}>
              {f === 'none' ? <IX /> : <Thumb design={{ ...DEFAULT_DESIGN, frame: f, frameText: 'Scan me' }} />}
            </button>
          ))}
        </div>
        {(d.frame === 'label' || d.frame === 'label-solid') && (
          <label className="field" style={{ maxWidth: 320 }}>
            <span className="label">Label text</span>
            <input className="input" maxLength={24} value={d.frameText || ''} onChange={(e) => set({ frameText: e.target.value })} />
          </label>
        )}
      </section>
    </div>
  );
}

export function QrPreview({ url, design, size = 260 }: { url: string; design: QrDesign | null; size?: number }) {
  const src = useQrImage(url, design, 500);
  return src ? (
    <img src={src} alt={`QR code for ${url}`} style={{ width: size, maxWidth: '100%', height: 'auto', display: 'block' }} />
  ) : (
    <div style={{ width: size, height: size }} />
  );
}
