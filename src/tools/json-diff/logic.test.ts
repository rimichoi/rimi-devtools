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

  it('길이 3 이어도 세 번째 값이 0 이 아니면 삭제로 짐작하지 않는다', () => {
    // jsondiffpatch 는 텍스트 diff(2)나 이동(3)도 길이 3 배열로 인코딩한다.
    // 삭제(0)가 아닌 다른 discriminator 를 삭제로 오인하면 안 된다.
    const result = flattenDelta({ a: ['x', 'y', 2] });
    expect(result).toEqual([
      { kind: 'unknown', path: 'a', before: '["x","y",2]' },
    ]);
    expect(result[0]?.kind).not.toBe('removed');
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

  // json-format 과 같은 입력 종류에는 같은 품질의 답을 줘야 한다. 예전에는
  // 엔진 원문("Unexpected token 'o', ... is not valid JSON")만 그대로 붙여서,
  // 같은 payload 를 JSON 포맷에 넣으면 줄/칸을 알려주는데 JSON 비교에서는
  // 위치 정보 없는 영어 메시지가 나왔다.
  it('구문 오류에 어느 쪽인지와 줄/칸 위치를 함께 알려준다', () => {
    const broken = '{\n  "a": 1,\n  "b" 2\n}';
    const r = diffJson('{"a":1}', broken);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('오른쪽');
    expect(r.error).toMatch(/3\s*번째 줄/);
    expect(r.error).toMatch(/번째 칸/);
  });

  it('한쪽이 비어 있으면 에러다', () => {
    expect(diffJson('', '{"a":1}').ok).toBe(false);
  });

  // 아래 세 케이스는 differ.diff() 가 던지지 않는다는 가정을 지키는 회귀 테스트다.
  // 라이브러리 버전이 바뀌어 이 가정이 깨지면, diffJson 의 try/catch 가 ok:false 로
  // 바꿔주더라도 이 테스트는 ok:true 를 기대하므로 실패해 신호를 보낸다.
  it('타입이 다른 값도 예외 없이 비교한다', () => {
    expect(diffJson('1', '{"a":1}').ok).toBe(true);
  });

  it('한쪽이 null 이어도 예외 없이 비교한다', () => {
    expect(diffJson('null', '{"a":1}').ok).toBe(true);
  });

  it('__proto__ 키가 있어도 예외 없이 비교한다', () => {
    expect(diffJson('{"__proto__":{"polluted":true}}', '{}').ok).toBe(true);
  });
});
