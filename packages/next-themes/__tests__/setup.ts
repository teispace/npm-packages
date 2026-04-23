import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
    document.cookie.split('; ').forEach((c) => {
      const name = c.split('=')[0];
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    });
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
    } catch (_e) {
      /* ignore */
    }
    try {
      window.sessionStorage.clear();
    } catch (_e) {
      /* ignore */
    }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});
