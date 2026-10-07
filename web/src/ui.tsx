import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IX } from './icons';

// ---------- Toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const show = (m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2200);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------- Modal ----------
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon-btn" onClick={onClose} aria-label="Close">
            <IX />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Form bits ----------
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  children,
  aside,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <>
      <div className="toggle-row">
        {icon}
        <div className="t-text">
          <strong>{title}</strong>
          {desc && <span className="small muted">{desc}</span>}
        </div>
        {aside}
        <Switch checked={checked} onChange={onChange} label={title} />
      </div>
      {checked && children && <div className="toggle-body">{children}</div>}
    </>
  );
}

export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (t: string) => {
    const v = t.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span className="chip" key={t}>
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        list="tag-suggestions"
        placeholder={value.length ? '' : 'Type a tag and press Enter'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id="tag-suggestions">
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Menu({ trigger, children }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className="menu-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Favicon({ url }: { url: string }) {
  const [ok, setOk] = useState(true);
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return (
    <div className="favicon">
      {ok && host ? (
        <img src={`https://icons.duckduckgo.com/ip3/${host}.ico`} alt="" onError={() => setOk(false)} />
      ) : (
        <span className="faint">{host.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
