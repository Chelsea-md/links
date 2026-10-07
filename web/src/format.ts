const nf = new Intl.NumberFormat('en-US');
export const num = (n: number) => nf.format(n);

export const pct = (p: number) => (p > 0 && p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`);

export function delta(cur: number, prev: number): { label: string; dir: 'up' | 'down' | 'flat' } {
  if (prev === 0 && cur === 0) return { label: '—', dir: 'flat' };
  if (prev === 0) return { label: 'new', dir: 'up' };
  const d = (cur - prev) / prev;
  if (Math.abs(d) < 0.005) return { label: '0%', dir: 'flat' };
  return { label: `${Math.abs(Math.round(d * 100))}%`, dir: d > 0 ? 'up' : 'down' };
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string): string {
  if (!code || code === 'Unknown' || code.length !== 2) return code || 'Unknown';
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

export function flag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
export function shortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function longDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const stripProto = (u: string) => u.replace(/^https?:\/\//, '');

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
