import QRCodeStyling, { type Options } from 'qr-code-styling';
import { useEffect, useState } from 'react';
import type { QrDesign } from './api';

export const DEFAULT_DESIGN: QrDesign = {
  dots: 'square',
  cornerSquare: 'square',
  cornerDot: 'square',
  color: '#000000',
  color2: null,
  bg: '#FFFFFF',
  cornerColor: null,
  logo: null,
  centerText: null,
  frame: 'none',
  frameText: 'Scan me',
};

export const TEMPLATES: { name: string; design: QrDesign }[] = [
  { name: 'Classic', design: { ...DEFAULT_DESIGN } },
  {
    name: 'Ink label',
    design: { ...DEFAULT_DESIGN, dots: 'rounded', cornerSquare: 'extra-rounded', cornerDot: 'dot', color: '#1A1C21', frame: 'label-solid', frameText: 'Scan me' },
  },
  {
    name: 'Teal dots',
    design: { ...DEFAULT_DESIGN, dots: 'dots', cornerSquare: 'extra-rounded', cornerDot: 'dot', color: '#0A6B6B', frame: 'label', frameText: 'Scan me' },
  },
  {
    name: 'Sunset',
    design: { ...DEFAULT_DESIGN, dots: 'classy-rounded', cornerSquare: 'extra-rounded', cornerDot: 'dot', color: '#D9366F', color2: '#F28C28', frame: 'border' },
  },
];

const centerTextCache = new Map<string, string>();
function centerTextImage(text: string, color: string): string {
  const key = `${text}|${color}`;
  const hit = centerTextCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.trim().toUpperCase().split(/\s+/).slice(0, 3);
  const size = words.length > 2 ? 56 : words.length > 1 ? 68 : Math.min(110, Math.floor(420 / Math.max(words[0].length, 3)));
  ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`;
  const lh = size * 1.05;
  words.forEach((w, i) => ctx.fillText(w, 128, 128 + (i - (words.length - 1) / 2) * lh, 236));
  const url = c.toDataURL('image/png');
  centerTextCache.set(key, url);
  return url;
}

function options(data: string, d: QrDesign, size: number): Options {
  const fill = d.color2
    ? { gradient: { type: 'linear' as const, rotation: Math.PI / 4, colorStops: [{ offset: 0, color: d.color }, { offset: 1, color: d.color2 }] } }
    : { color: d.color };
  const corner = d.cornerColor ? { color: d.cornerColor } : fill;
  const image = d.logo || (d.centerText ? centerTextImage(d.centerText, d.color) : undefined);
  return {
    width: size,
    height: size,
    type: 'svg',
    data,
    margin: 0,
    image,
    qrOptions: { errorCorrectionLevel: image ? 'H' : 'M' },
    imageOptions: { hideBackgroundDots: true, imageSize: 0.32, margin: 4, crossOrigin: 'anonymous' },
    dotsOptions: { type: d.dots, ...fill },
    cornersSquareOptions: { type: d.cornerSquare, ...corner },
    cornersDotOptions: { type: d.cornerDot, ...corner },
    backgroundOptions: { color: d.bg },
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Full SVG markup for a QR code with its frame. */
export async function qrSvg(data: string, design: QrDesign, size = 600): Promise<string> {
  const d = { ...DEFAULT_DESIGN, ...design };
  const qr = new QRCodeStyling(options(data, d, size));
  const blob = (await qr.getRawData('svg')) as Blob;
  const inner = (await blob.text()).replace(/<\?xml[^>]*\?>/, '');

  const pad = Math.round(size * 0.08);
  const frameColor = d.color;
  if (d.frame === 'none') {
    const p = Math.round(size * 0.05);
    const W = size + p * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}"><rect width="${W}" height="${W}" fill="${d.bg}"/><g transform="translate(${p} ${p})">${inner}</g></svg>`;
  }
  const label = d.frame === 'label' || d.frame === 'label-solid';
  const labelH = label ? Math.round(size * 0.2) : 0;
  const stroke = Math.max(4, Math.round(size * 0.022));
  const W = size + pad * 2;
  const H = size + pad * 2 + labelH;
  const r = Math.round(size * 0.07);
  const text = esc((d.frameText || 'Scan me').slice(0, 24));
  const fontSize = Math.round(size * 0.085);
  let labelSvg = '';
  if (d.frame === 'label') {
    labelSvg = `<text x="${W / 2}" y="${size + pad * 1.5 + labelH / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="${frameColor}">${text}</text>`;
  } else if (d.frame === 'label-solid') {
    labelSvg = `<rect x="0" y="${size + pad * 1.5}" width="${W}" height="${H - size - pad * 1.5}" fill="${frameColor}"/>
<text x="${W / 2}" y="${size + pad * 1.5 + (H - size - pad * 1.5) / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="${d.bg}">${text}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><clipPath id="fr"><rect x="${stroke / 2}" y="${stroke / 2}" width="${W - stroke}" height="${H - stroke}" rx="${r}"/></clipPath></defs>
<g clip-path="url(#fr)"><rect width="${W}" height="${H}" fill="${d.bg}"/>${labelSvg}</g>
<rect x="${stroke / 2}" y="${stroke / 2}" width="${W - stroke}" height="${H - stroke}" rx="${r}" fill="none" stroke="${frameColor}" stroke-width="${stroke}"/>
<g transform="translate(${pad} ${pad})">${inner}</g></svg>`;
}

export const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export async function qrPng(data: string, design: QrDesign, size = 1200): Promise<Blob> {
  const svg = await qrSvg(data, design, size);
  const img = new Image();
  img.src = svgToDataUrl(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** React hook: data URL of the rendered QR (re-renders when inputs change, debounced). */
export function useQrImage(data: string | null, design: QrDesign | null, size = 400): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify(design);
  useEffect(() => {
    if (!data) return;
    let alive = true;
    const t = setTimeout(() => {
      qrSvg(data, design || DEFAULT_DESIGN, size)
        .then((svg) => alive && setUrl(svgToDataUrl(svg)))
        .catch(() => {});
    }, 80);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [data, key, size]);
  return url;
}

/** Shrink an uploaded logo to a 256px PNG data URL so it stays small in the database. */
export async function fileToLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d')!;
    const scale = Math.min(s / img.naturalWidth, s / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
