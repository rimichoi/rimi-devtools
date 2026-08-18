import { describe, it, expect } from 'vitest';
import { searchTools } from './search';
import type { Tool } from '../types';

const make = (id: string, name: string, keywords: string[]): Tool => ({
  id,
  name,
  // Tool.description 은 필수지만 이 스펙의 관심사가 아니다(검색/정렬은 이름과
  // 키워드만 본다). 형태만 맞춘다.
  description: '',
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

  it('id/이름이 접두로 일치하면, registry 순서가 뒤라도 중간에 포함만 된 도구보다 위로 올린다', () => {
    // rankTools[0] 은 id 중간에 'sql' 을 포함할 뿐이라 60점(부분 포함), rankTools[1] 은
    // id 가 'sql' 로 시작해 80점(접두)이다. registry 순서만으로 정렬한다면(또는 점수
    // 체계 자체가 없다면) index 0 인 my-sql-tool 이 먼저 나와야 하지만, 점수 티어가
    // 실제로 동작한다면 접두 매치인 sql-format 이 먼저 나와야 한다.
    const rankTools = [
      make('my-sql-tool', '기타 도구', []),
      make('sql-format', 'SQL 포맷', []),
    ];
    const result = searchTools(rankTools, 'sql');
    expect(result.map((t) => t.id)).toEqual(['sql-format', 'my-sql-tool']);
  });

  it('공백을 무시한다', () => {
    expect(searchTools(tools, '  epoch  ').map((t) => t.id)).toEqual(['epoch']);
  });

  it('일치가 없으면 빈 배열이다', () => {
    expect(searchTools(tools, 'zzzz')).toEqual([]);
  });
});
