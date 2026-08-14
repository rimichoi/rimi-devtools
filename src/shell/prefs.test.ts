import { describe, it, expect, beforeEach } from 'vitest';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function fakeMatchMedia(matches: boolean): typeof matchMedia {
  return () => ({ matches }) as MediaQueryList;
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  globalThis.localStorage = storage;
  globalThis.matchMedia = fakeMatchMedia(false);
});

// prefs 는 매 테스트마다 새로운 globalThis.localStorage 를 바라봐야 하므로 동적으로 불러온다.
async function loadPrefs() {
  const mod = await import('./prefs');
  return mod.prefs;
}

describe('prefs.getTheme', () => {
  it('저장된 값이 없으면 시스템 설정을 따른다', async () => {
    globalThis.matchMedia = fakeMatchMedia(true);
    const prefs = await loadPrefs();
    expect(prefs.getTheme()).toBe('dark');
  });

  it('저장된 값이 없고 시스템이 라이트면 라이트다', async () => {
    globalThis.matchMedia = fakeMatchMedia(false);
    const prefs = await loadPrefs();
    expect(prefs.getTheme()).toBe('light');
  });

  it('저장된 값이 있으면 시스템 설정보다 우선한다', async () => {
    storage.setItem('rdt.theme', JSON.stringify('dark'));
    globalThis.matchMedia = fakeMatchMedia(false);
    const prefs = await loadPrefs();
    expect(prefs.getTheme()).toBe('dark');
  });

  it('setTheme 으로 저장한 값을 getTheme 이 다시 읽는다', async () => {
    const prefs = await loadPrefs();
    prefs.setTheme('dark');
    expect(prefs.getTheme()).toBe('dark');
  });

  it('손상된(JSON 이 아닌) 값은 무시하고 시스템 설정을 따른다', async () => {
    storage.setItem('rdt.theme', 'not-json{{{');
    globalThis.matchMedia = fakeMatchMedia(true);
    const prefs = await loadPrefs();
    expect(prefs.getTheme()).toBe('dark');
  });

  it('테마도 아니고 문자열도 아닌 값은 무시하고 시스템 설정을 따른다', async () => {
    storage.setItem('rdt.theme', JSON.stringify(42));
    globalThis.matchMedia = fakeMatchMedia(true);
    const prefs = await loadPrefs();
    expect(prefs.getTheme()).toBe('dark');
  });

  it('setTheme 저장이 실패해도(예: 사파리 프라이빗 모드) 예외를 던지지 않는다', async () => {
    const prefs = await loadPrefs();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => prefs.setTheme('dark')).not.toThrow();
  });
});

describe('prefs.getFavorites / toggleFavorite', () => {
  it('저장된 값이 없으면 빈 배열이다', async () => {
    const prefs = await loadPrefs();
    expect(prefs.getFavorites()).toEqual([]);
  });

  it('toggleFavorite 은 없으면 추가하고 있으면 제거한다', async () => {
    const prefs = await loadPrefs();
    expect(prefs.toggleFavorite('epoch')).toEqual(['epoch']);
    expect(prefs.toggleFavorite('base64')).toEqual(['epoch', 'base64']);
    expect(prefs.toggleFavorite('epoch')).toEqual(['base64']);
  });

  it('배열이 아닌 손상된 값이 저장돼 있으면 빈 배열로 취급한다', async () => {
    storage.setItem('rdt.favorites', JSON.stringify({ epoch: true }));
    const prefs = await loadPrefs();
    expect(prefs.getFavorites()).toEqual([]);
  });

  it('배열이 아닌 손상된 값이 있어도 toggleFavorite 은 예외 없이 새로 시작한다', async () => {
    storage.setItem('rdt.favorites', JSON.stringify({ epoch: true }));
    const prefs = await loadPrefs();
    expect(() => prefs.toggleFavorite('epoch')).not.toThrow();
    expect(prefs.getFavorites()).toEqual(['epoch']);
  });

  it('JSON 이 아닌 손상된 값이 있어도 빈 배열로 취급한다', async () => {
    storage.setItem('rdt.favorites', '{corrupt');
    const prefs = await loadPrefs();
    expect(prefs.getFavorites()).toEqual([]);
  });
});

describe('prefs.getRecent / pushRecent', () => {
  it('저장된 값이 없으면 빈 배열이다', async () => {
    const prefs = await loadPrefs();
    expect(prefs.getRecent()).toEqual([]);
  });

  it('pushRecent 는 최신 항목을 맨 앞에 놓는다', async () => {
    const prefs = await loadPrefs();
    prefs.pushRecent('json-format');
    prefs.pushRecent('epoch');
    expect(prefs.getRecent()).toEqual(['epoch', 'json-format']);
  });

  it('같은 id 를 다시 pushRecent 하면 중복 없이 맨 앞으로 옮긴다', async () => {
    const prefs = await loadPrefs();
    prefs.pushRecent('json-format');
    prefs.pushRecent('epoch');
    prefs.pushRecent('json-format');
    expect(prefs.getRecent()).toEqual(['json-format', 'epoch']);
  });

  it('최대 5개까지만 남긴다', async () => {
    const prefs = await loadPrefs();
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id) => prefs.pushRecent(id));
    expect(prefs.getRecent()).toEqual(['f', 'e', 'd', 'c', 'b']);
  });

  it('배열이 아닌 손상된 값이 저장돼 있으면 빈 배열로 취급한다', async () => {
    storage.setItem('rdt.recent', JSON.stringify('epoch'));
    const prefs = await loadPrefs();
    expect(prefs.getRecent()).toEqual([]);
  });

  it('배열이 아닌 손상된 값이 있어도 pushRecent 는 예외 없이 새로 시작한다', async () => {
    storage.setItem('rdt.recent', JSON.stringify('epoch'));
    const prefs = await loadPrefs();
    expect(() => prefs.pushRecent('json-format')).not.toThrow();
    expect(prefs.getRecent()).toEqual(['json-format']);
  });
});
