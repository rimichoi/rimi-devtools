export type Theme = 'light' | 'dark';

const KEY = {
  theme: 'rdt.theme',
  favorites: 'rdt.favorites',
  recent: 'rdt.recent',
} as const;

const RECENT_LIMIT = 5;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

// getFavorites/getRecent 는 도구 id 목록이라는 모양을 반드시 지켜야 한다. read() 는
// JSON 파싱만 하고 모양은 검사하지 않으므로, 손으로 편집되거나 잘린 값이 배열이 아닌
// 객체/문자열/숫자로 파싱돼도 그대로 돌려준다 — 그러면 이후 .includes()/.filter() 호출이
// 그대로 던져서 부팅(main.ts 의 최초 렌더링에서 pushRecent 를 호출한다)을 깨뜨린다.
// 배열이 아니거나 원소가 문자열이 아니면 빈 배열로 취급해 조용히 복구한다.
function readStringList(key: string): string[] {
  const parsed = read<unknown>(key, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 사파리 프라이빗 모드 등 저장이 막힌 환경은 조용히 넘어간다
  }
}

export const prefs = {
  getTheme(): Theme {
    const stored = read<string>(KEY.theme, '');
    if (stored === 'light' || stored === 'dark') return stored;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },

  setTheme(theme: Theme): void {
    write(KEY.theme, theme);
  },

  getFavorites(): string[] {
    return readStringList(KEY.favorites);
  },

  toggleFavorite(id: string): string[] {
    const current = prefs.getFavorites();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    write(KEY.favorites, next);
    return next;
  },

  getRecent(): string[] {
    return readStringList(KEY.recent);
  },

  pushRecent(id: string): void {
    const next = [id, ...prefs.getRecent().filter((x) => x !== id)].slice(0, RECENT_LIMIT);
    write(KEY.recent, next);
  },
};
