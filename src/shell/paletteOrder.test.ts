import { describe, it, expect } from 'vitest';
import { orderForPalette } from './paletteOrder';
import type { Tool } from '../types';

const make = (id: string, name: string, keywords: string[] = []): Tool => ({
  id,
  name,
  keywords,
  category: 'format',
  load: async () => ({ mount: () => () => {} }),
});

const tools = [
  make('json-format', 'JSON 포맷', ['json', '포맷']),
  make('sql-format', 'SQL 포맷', ['sql', '포맷']),
  make('base64', 'Base64', ['base64']),
  make('epoch', 'Epoch 변환', ['epoch', '타임스탬프']),
];

describe('orderForPalette', () => {
  it('즐겨찾기도 최근도 없으면 registry 순서 그대로다', () => {
    expect(orderForPalette(tools, '', [], []).map((t) => t.id)).toEqual([
      'json-format',
      'sql-format',
      'base64',
      'epoch',
    ]);
  });

  it('즐겨찾기는 검색어가 없을 때 맨 위로 고정된다', () => {
    const result = orderForPalette(tools, '', ['epoch'], []);
    expect(result.map((t) => t.id)).toEqual(['epoch', 'json-format', 'sql-format', 'base64']);
  });

  it('검색어가 없으면 즐겨찾기 다음에 최근 사용을 최신순으로 보여준다', () => {
    const result = orderForPalette(tools, '', ['epoch'], ['base64', 'sql-format']);
    expect(result.map((t) => t.id)).toEqual(['epoch', 'base64', 'sql-format', 'json-format']);
  });

  it('즐겨찾기와 최근이 겹치면 즐겨찾기 쪽에만 한 번 나온다', () => {
    const result = orderForPalette(tools, '', ['epoch'], ['epoch', 'base64']);
    expect(result.map((t) => t.id)).toEqual(['epoch', 'base64', 'json-format', 'sql-format']);
  });

  it('검색어가 있으면 검색 결과 중 즐겨찾기가 맨 위로 오되 매치가 아닌 도구는 나오지 않는다', () => {
    // '포맷' 은 json-format, sql-format 만 매치한다(둘 다 이름에 포함).
    const result = orderForPalette(tools, '포맷', ['sql-format'], []);
    expect(result.map((t) => t.id)).toEqual(['sql-format', 'json-format']);
  });

  it('registry 에 없는 즐겨찾기 id 는 걸러내고 죽은 항목을 돌려주지 않는다', () => {
    const result = orderForPalette(tools, '', ['ghost-tool', 'epoch'], []);
    expect(result.map((t) => t.id)).toEqual(['epoch', 'json-format', 'sql-format', 'base64']);
    expect(result.some((t) => t.id === 'ghost-tool')).toBe(false);
  });

  it('registry 에 없는 최근 사용 id 는 걸러내고 죽은 항목을 돌려주지 않는다', () => {
    const result = orderForPalette(tools, '', [], ['ghost-tool', 'base64']);
    expect(result.map((t) => t.id)).toEqual(['base64', 'json-format', 'sql-format', 'epoch']);
    expect(result.some((t) => t.id === 'ghost-tool')).toBe(false);
  });
});
