import { describe, it, expect } from 'vitest';
import { searchTools } from './search';
import type { Tool } from '../types';

const make = (id: string, name: string, keywords: string[]): Tool => ({
  id,
  name,
  keywords,
  category: 'format',
  load: async () => ({ mount: () => () => {} }),
});

const tools = [
  make('json-format', 'JSON 포맷', ['json', '포맷', 'pretty']),
  make('json-diff', 'JSON 비교', ['json', 'diff', '비교']),
  make('epoch', 'Epoch 변환', ['epoch', 'unix', '타임스탬프']),
];

describe('searchTools', () => {
  it('빈 검색어면 전체를 순서대로 돌려준다', () => {
    expect(searchTools(tools, '')).toEqual(tools);
  });

  it('id 로 찾는다', () => {
    expect(searchTools(tools, 'epoch').map((t) => t.id)).toEqual(['epoch']);
  });

  it('이름으로 찾는다', () => {
    expect(searchTools(tools, '비교').map((t) => t.id)).toEqual(['json-diff']);
  });

  it('키워드로 찾는다', () => {
    expect(searchTools(tools, 'unix').map((t) => t.id)).toEqual(['epoch']);
  });

  it('대소문자를 구분하지 않는다', () => {
    expect(searchTools(tools, 'JSON').map((t) => t.id)).toEqual(['json-format', 'json-diff']);
  });

  it('이름이 앞에서 일치하면 더 위로 올린다', () => {
    const result = searchTools(tools, 'json');
    expect(result[0]?.id).toBe('json-format');
  });

  it('공백을 무시한다', () => {
    expect(searchTools(tools, '  epoch  ').map((t) => t.id)).toEqual(['epoch']);
  });

  it('일치가 없으면 빈 배열이다', () => {
    expect(searchTools(tools, 'zzzz')).toEqual([]);
  });
});
