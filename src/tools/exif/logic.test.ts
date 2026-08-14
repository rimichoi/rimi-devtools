import { describe, it, expect } from 'vitest';
import { toExifRows, toExifResult, extractGps, formatCoordinate } from './logic';

describe('toExifRows', () => {
  it('알려진 키를 한글 라벨로 바꾼다', () => {
    const rows = toExifRows({ Make: 'Apple', Model: 'iPhone 15' });
    expect(rows).toContainEqual({ label: '제조사', value: 'Apple' });
    expect(rows).toContainEqual({ label: '모델', value: 'iPhone 15' });
  });

  it('모르는 키는 원래 이름을 쓴다', () => {
    const rows = toExifRows({ SomethingWeird: 'x' });
    expect(rows).toContainEqual({ label: 'SomethingWeird', value: 'x' });
  });

  it('Date 를 읽기 좋게 만든다', () => {
    const date = new Date('2026-08-14T05:30:00Z');
    // 기대값은 로직과 동일한 toLocaleString('ko-KR') 호출로 직접 계산한다 — 실행
    // 환경의 시스템 타임존에 좌우되는 값이라 리터럴로 고정할 수 없다. 다만 이
    // 값은 logic.ts 의 Date 분기가 JSON.stringify 로 대체되면(ISO 문자열이 되어)
    // 확실히 달라지므로, 느슨한 /2026/ 정규식과 달리 그 변이를 실제로 잡아낸다.
    const expected = date.toLocaleString('ko-KR');
    const rows = toExifRows({ DateTimeOriginal: date });
    const row = rows.find((r) => r.label === '촬영 일시');
    expect(row?.value).toBe(expected);
  });

  it('undefined 와 null 값은 제외한다', () => {
    const rows = toExifRows({ Make: 'Apple', Model: undefined, Lens: null });
    expect(rows).toHaveLength(1);
  });

  it('배열을 쉼표로 잇는다', () => {
    const rows = toExifRows({ Components: [1, 2, 3] });
    expect(rows[0]?.value).toBe('1, 2, 3');
  });

  it('빈 객체는 빈 배열이다', () => {
    expect(toExifRows({})).toEqual([]);
  });
});

describe('toExifResult', () => {
  it('errors 키가 없으면 그대로 통과한다 (partial: false)', () => {
    const result = toExifResult({ Make: 'Apple' });
    expect(result).toEqual({
      ok: true,
      value: { rows: [{ label: '제조사', value: 'Apple' }], partial: false },
    });
  });

  it('errors 와 함께 다른 유효한 키가 있으면 errors 는 표에서 빼고 partial: true 로 알린다', () => {
    const result = toExifResult({ Make: 'Apple', errors: [new Error("Couldn't read segment")] });
    expect(result).toEqual({
      ok: true,
      value: { rows: [{ label: '제조사', value: 'Apple' }], partial: true },
    });
  });

  it('errors 뿐이고 다른 유효한 키가 없으면 ok: false 한국어 오류를 반환한다', () => {
    const result = toExifResult({ errors: [new Error("Couldn't read segment")] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/[가-힣]/);
    expect(result.error).not.toMatch(/Couldn't read segment/);
  });
});

describe('extractGps', () => {
  it('latitude/longitude 를 뽑는다', () => {
    expect(extractGps({ latitude: 37.5665, longitude: 126.978 })).toEqual({
      lat: 37.5665,
      lon: 126.978,
    });
  });

  it('GPS 가 없으면 null 이다', () => {
    expect(extractGps({ Make: 'Apple' })).toBeNull();
  });

  it('한쪽만 있으면 null 이다', () => {
    expect(extractGps({ latitude: 37.5 })).toBeNull();
  });

  it('숫자가 아니면 null 이다', () => {
    expect(extractGps({ latitude: 'x', longitude: 'y' })).toBeNull();
  });
});

describe('formatCoordinate', () => {
  it('위도 경도를 소수점 6자리로 만든다', () => {
    expect(formatCoordinate(37.5665, 126.978)).toBe('37.566500, 126.978000');
  });

  it('음수 좌표를 처리한다', () => {
    expect(formatCoordinate(-33.8688, 151.2093)).toBe('-33.868800, 151.209300');
  });
});
