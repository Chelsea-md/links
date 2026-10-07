import { useEffect, useState, type AnchorHTMLAttributes } from 'react';

const BASE = '/admin';

export function currentPath(): string {
  const p = window.location.pathname.replace(/^\/admin/, '') || '/';
  return p.length > 1 ? p.replace(/\/$/, '') : p;
}

export function navigate(to: string, replace = false) {
  const url = BASE + (to.startsWith('/') ? to : `/${to}`);
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  window.dispatchEvent(new Event('sl:navigate'));
  window.scrollTo(0, 0);
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('popstate', on);
    window.addEventListener('sl:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('sl:navigate', on);
    };
  }, []);
  return path;
}

export function A({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={BASE + to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
