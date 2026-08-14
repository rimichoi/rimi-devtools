import { describe, it, expect } from 'vitest';
import { flattenDelta, diffJson } from './logic';

describe('flattenDelta', () => {
  it('추가를 인식한다', () => {
    expect(flattenDelta({ a: [1] })).toEqual([
      { kind: 'added', path: 'a', after: '1' },
    ]);
  });

  it('변경을 인식한다', () => {
    expect(flattenDelta({ a: [1, 2] })).toEqual([
      { kind: 'changed', path: 'a', before: '1', after: '2' },
    ]);
  });

  it('삭제를 인식한다', () => {
    expect(flattenDelta({ a: [1, 0, 0] })).toEqual([
      { kind: 'removed', path: 'a', before: '1' },
    ]);
  });

  it('중첩 경로를 점으로 잇는다', () => {
    expect(flattenDelta({ user: { name: ['A', 'B'] } })).toEqual([
      { kind: 'changed', path: 'user.name', before: '"A"', after: '"B"' },
    ]);
  });

  it('배열 인덱스를 대괄호로 쓴다', () => {
    expect(flattenDelta({ list: { _t: 'a', 1: [9] } })).toEqual([
      { kind: 'added', path: 'list[1]', after: '9' },
    ]);
  });

  it('배열 삭제 인덱스의 언더스코어를 벗긴다', () => {
    expect(flattenDelta({ list: { _t: 'a', _0: [5, 0, 0] } })).toEqual([
      { kind: 'removed', path: 'list[0]', before: '5' },
    ]);
  });

  it('차이가 없으면 빈 배열이다', () => {
    expect(flattenDelta(undefined)).toEqual([]);
  });
});

describe('diffJson', () => {
  it('같은 JSON 이면 차이 없음을 알린다', () => {
    const r = diffJson('{"a":1}', '{"a":1}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe('두 JSON 이 같습니다.');
  });

  it('다른 값을 보고한다', () => {
    const r = diffJson('{"a":1}', '{"a":2}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('a');
    expect(r.value).toContain('1');
    expect(r.value).toContain('2');
  });

  it('왼쪽이 잘못된 JSON 이면 어느 쪽인지 알려준다', () => {
    const r = diffJson('{', '{"a":1}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('왼쪽');
  });

  it('오른쪽이 잘못된 JSON 이면 어느 쪽인지 알려준다', () => {
    const r = diffJson('{"a":1}', '{');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('오른쪽');
  });

  it('한쪽이 비어 있으면 에러다', () => {
    expect(diffJson('', '{"a":1}').ok).toBe(false);
  });
});
