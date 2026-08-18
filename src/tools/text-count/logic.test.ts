import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  countText,
  countEucKrBytes,
  findInvisibleChars,
  formatCodePoint,
  formatFinding,
  formatUnsupportedChar,
  getEucKrBuildMs,
  resetEucKrTable,
} from './logic';

/*
 * 이 파일은 "눈에 보이지 않는 문자" 를 다룬다. 그래서 대상 문자를 파일에 그대로
 * 써 넣지 않고 전부 \uXXXX 이스케이프로 적는다 — 리터럴로 적으면 이 테스트
 * 자신이 어떤 문자를 검사하는지 읽는 사람이 볼 수 없고, 편집기가 조용히
 * 정규화하거나 지워도 아무도 모른다.
 */
const ZWSP = '\u200B';
const NBSP = '\u00A0';

describe('countText', () => {
  it('ASCII 를 센다', () => {
    const s = countText('hello world');
    expect(s.graphemes).toBe(11);
    expect(s.charsNoSpace).toBe(10);
    expect(s.bytesUtf8).toBe(11);
    expect(s.lines).toBe(1);
  });

  it('한글은 글자당 3바이트다', () => {
    const s = countText('안녕하세요');
    expect(s.graphemes).toBe(5);
    expect(s.codePoints).toBe(5);
    expect(s.bytesUtf8).toBe(15);
  });

  it('가족 이모지는 1글자로 센다', () => {
    const s = countText('👨‍👩‍👧');
    expect(s.graphemes).toBe(1);
    expect(s.codePoints).toBe(5);
    expect(s.utf16Units).toBe(8);
    expect(s.bytesUtf8).toBe(18);
  });

  it('줄바꿈을 센다', () => {
    const s = countText('a\nb\nc');
    expect(s.lines).toBe(3);
  });

  it('마지막이 줄바꿈으로 끝나면 빈 줄을 세지 않는다', () => {
    expect(countText('a\nb\n').lines).toBe(2);
  });

  it('빈 문자열은 전부 0 이다', () => {
    const s = countText('');
    expect(s.graphemes).toBe(0);
    expect(s.lines).toBe(0);
  });

  it('공백 제외 글자수는 모든 공백류를 뺀다', () => {
    expect(countText('a b\tc\nd').charsNoSpace).toBe(4);
  });

  /*
   * `Intl.Segmenter` 가 없는 브라우저(Firefox 125 미만)에서 이 모듈이 **평가만
   * 해도** 던지면, 동적 import 가 실패해 main.ts 의 "청크를 받지 못함" 갈래로
   * 떨어진다 — 빈 화면 + "새 버전이 배포되었습니다. 새로고침해 주세요." 라는,
   * 이 경우엔 아무 소용 없는 안내다(실측으로 확인했다). 실패는 호출 시점으로
   * 미뤄야 IOPane 의 backstop 이 받을 수 있다.
   */
  it('모듈을 평가하는 것만으로 Intl.Segmenter 를 만들지 않는다', async () => {
    const holder = Intl as unknown as { Segmenter?: typeof Intl.Segmenter };
    const real = holder.Segmenter;
    delete holder.Segmenter; // 지원하지 않는 브라우저를 흉내 낸다
    try {
      vi.resetModules();
      // 최상위에서 Segmenter 를 만들면 이 import 자체가 거부된다.
      const fresh = await import('./logic');
      // 대신 실제로 자소를 셀 때 던진다 — 그 자리에는 backstop 이 있다.
      expect(() => fresh.countText('가')).toThrow();
      // Segmenter 를 쓰지 않는 계산은 그 환경에서도 멀쩡히 돌아야 한다.
      expect(fresh.findInvisibleChars(`a${ZWSP}b`)).toHaveLength(1);
    } finally {
      holder.Segmenter = real;
      vi.resetModules();
    }
  });

  // 단어수는 뺐다. `\s+` 분할은 한국어에서 뜻이 없는 숫자를 만들고, 그 숫자를
  // 쓰는 곳도 없었다. TextStats 에 그 필드가 되살아나면 여기서 걸린다.
  it('단어수를 세지 않는다', () => {
    expect(Object.keys(countText('a b c')).sort()).toEqual(
      ['bytesUtf8', 'charsNoSpace', 'codePoints', 'graphemes', 'lines', 'utf16Units'].sort(),
    );
  });
});

describe('countEucKrBytes', () => {
  /*
   * 주의: 이 테스트는 environment: 'node' 에서 돈다. Node 의 `euc-kr` 디코더는
   * ICU 의 엄격 EUC-KR(8,412자)이고 브라우저(WHATWG)의 것은 windows-949
   * (17,048자)다 — '뷁' 같은 확장 한글이 갈린다. 그래서 여기서는 **두 집합에
   * 공통인 문자로만** 값을 고정하고, 확장 영역은 e2e/text-count.spec.ts 가
   * 실제 Chromium 에서 확인한다.
   */
  afterEach(() => resetEucKrTable());

  it('ASCII 는 글자당 1바이트다', () => {
    const result = countEucKrBytes('hello');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bytes).toBe(5);
    expect(result.value.unsupported).toEqual([]);
  });

  it('한글은 글자당 2바이트다 (UTF-8 의 3바이트와 다르다)', () => {
    const result = countEucKrBytes('안녕하세요');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bytes).toBe(10);
    expect(countText('안녕하세요').bytesUtf8).toBe(15);
  });

  it('한글과 ASCII 가 섞여도 각각의 폭으로 더한다', () => {
    const result = countEucKrBytes('한글abc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bytes).toBe(7);
  });

  it('KS X 1001 에 있는 한자는 표현할 수 있다', () => {
    const result = countEucKrBytes('漢中');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bytes).toBe(4);
    expect(result.value.unsupported).toEqual([]);
  });

  it('이모지는 표현할 수 없고, 문자·코드포인트·개수를 함께 보고한다', () => {
    const result = countEucKrBytes('가\u{1F600}나\u{1F600}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 가(2) + ?(1) + 나(2) + ?(1)
    expect(result.value.bytes).toBe(6);
    expect(result.value.unsupported).toEqual([
      { char: '\u{1F600}', codePoint: 0x1f600, count: 2 },
    ]);
  });

  it('확장 한자(CJK Ext A)도 표현할 수 없는 문자로 보고한다', () => {
    const result = countEucKrBytes('㐀');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unsupported).toEqual([{ char: '㐀', codePoint: 0x3400, count: 1 }]);
  });

  it('표현할 수 없는 문자를 처음 나온 순서대로 보고한다', () => {
    const result = countEucKrBytes('㐀가\u{1F600}나㐀');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unsupported.map((item) => item.char)).toEqual(['㐀', '\u{1F600}']);
    expect(result.value.unsupported.map((item) => item.count)).toEqual([2, 1]);
  });

  it('빈 문자열은 0바이트다', () => {
    const result = countEucKrBytes('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bytes).toBe(0);
  });

  it('역방향 표를 게으르게 딱 한 번만 만든다', () => {
    resetEucKrTable();
    const real = globalThis.TextDecoder;
    let constructed = 0;
    class Counting extends real {
      constructor(...args: ConstructorParameters<typeof TextDecoder>) {
        super(...args);
        constructed++;
      }
    }
    globalThis.TextDecoder = Counting as unknown as typeof TextDecoder;
    try {
      // 모듈을 불러오는 것만으로는 표를 만들지 않는다(게으르다).
      expect(getEucKrBuildMs()).toBeUndefined();
      expect(constructed).toBe(0);

      countEucKrBytes('가나다');
      expect(constructed).toBe(1);
      const firstBuild = getEucKrBuildMs();
      expect(firstBuild).toBeTypeOf('number');

      // 키 입력마다 부르는 함수다. 두 번째·세 번째 호출에서 디코더를 다시 만들면
      // (= 표를 다시 만들면) constructed 가 늘어난다.
      countEucKrBytes('라마바');
      countEucKrBytes('사아자');
      expect(constructed).toBe(1);
      expect(getEucKrBuildMs()).toBe(firstBuild);
    } finally {
      globalThis.TextDecoder = real;
    }
  });

  it('EUC-KR 디코더가 없는 환경에서는 던지지 않고 한국어 오류를 돌려준다', () => {
    resetEucKrTable();
    const real = globalThis.TextDecoder;
    globalThis.TextDecoder = function (): never {
      throw new RangeError('The "euc-kr" encoding is not supported');
    } as unknown as typeof TextDecoder;
    try {
      const result = countEucKrBytes('안녕');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('EUC-KR');
    } finally {
      globalThis.TextDecoder = real;
    }
  });
});

describe('formatCodePoint', () => {
  it('네 자리 미만은 0 을 채우고, BMP 밖은 그대로 늘린다', () => {
    expect(formatCodePoint(0x0b)).toBe('U+000B');
    expect(formatCodePoint(0x200b)).toBe('U+200B');
    expect(formatCodePoint(0x1f600)).toBe('U+1F600');
  });
});

describe('findInvisibleChars', () => {
  it('평범한 텍스트에서는 아무것도 찾지 않는다', () => {
    expect(findInvisibleChars('안녕하세요 hello world')).toEqual([]);
  });

  it('탭·줄바꿈·캐리지 리턴은 신고하지 않는다', () => {
    expect(findInvisibleChars('a\tb\nc\r\nd')).toEqual([]);
  });

  it('제로폭 공백을 코드포인트·설명·개수·위치와 함께 보고한다', () => {
    const [finding, ...rest] = findInvisibleChars(`ab${ZWSP}c`);
    expect(rest).toEqual([]);
    expect(finding?.label).toBe('U+200B');
    expect(finding?.name).toBe('제로폭 공백 (ZWSP)');
    expect(finding?.count).toBe(1);
    expect(finding?.positions).toEqual([{ line: 1, column: 3 }]);
  });

  it('줄과 칸을 1부터 세고, 줄이 바뀌면 칸이 다시 1이 된다', () => {
    const [finding] = findInvisibleChars(`가나\n다${NBSP}라`);
    expect(finding?.label).toBe('U+00A0');
    expect(finding?.positions).toEqual([{ line: 2, column: 2 }]);
  });

  it('CRLF 는 줄바꿈 하나로 센다', () => {
    const [finding] = findInvisibleChars(`a\r\n${ZWSP}b`);
    expect(finding?.positions).toEqual([{ line: 2, column: 1 }]);
  });

  it('같은 문자가 여러 번 나오면 하나로 묶어 개수를 센다', () => {
    const findings = findInvisibleChars(`${ZWSP}a${ZWSP}b${ZWSP}`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.count).toBe(3);
    expect(findings[0]?.positions).toEqual([
      { line: 1, column: 1 },
      { line: 1, column: 3 },
      { line: 1, column: 5 },
    ]);
  });

  it('위치는 앞에서 다섯 개까지만 보관하고 개수는 전부 센다', () => {
    const findings = findInvisibleChars(ZWSP.repeat(8));
    expect(findings[0]?.count).toBe(8);
    expect(findings[0]?.positions).toHaveLength(5);
  });

  it('여러 종류를 처음 나온 순서대로 각각 보고한다', () => {
    const findings = findInvisibleChars(`a${NBSP}b${ZWSP}c${NBSP}`);
    expect(findings.map((f) => f.label)).toEqual(['U+00A0', 'U+200B']);
    expect(findings.map((f) => f.count)).toEqual([2, 1]);
  });

  it('요구된 부류를 모두 잡는다', () => {
    const cases: [string, string][] = [
      ['\u200C', 'U+200C'], // ZWNJ
      ['\u200D', 'U+200D'], // ZWJ
      ['\uFEFF', 'U+FEFF'], // BOM
      ['\u2000', 'U+2000'], // EN QUAD
      ['\u200A', 'U+200A'], // HAIR SPACE
      ['\u202F', 'U+202F'], // NNBSP
      ['\u205F', 'U+205F'], // MMSP
      ['\u3000', 'U+3000'], // 전각 공백
      ['\u200E', 'U+200E'], // LRM
      ['\u200F', 'U+200F'], // RLM
      ['\u202A', 'U+202A'], // LRE
      ['\u202E', 'U+202E'], // RLO
      ['\u2066', 'U+2066'], // LRI
      ['\u2069', 'U+2069'], // PDI
      ['\u2028', 'U+2028'], // 줄 구분자
      ['\u2029', 'U+2029'], // 문단 구분자
      ['\u00AD', 'U+00AD'], // 소프트 하이픈
      ['\u0000', 'U+0000'], // C0 (NUL)
      ['\u001F', 'U+001F'], // C0 끝
      ['\u007F', 'U+007F'], // DEL
      ['\u0085', 'U+0085'], // C1 (NEL)
      ['\u009F', 'U+009F'], // C1 끝
    ];
    for (const [input, label] of cases) {
      const findings = findInvisibleChars(`가${input}나`);
      expect(findings.map((f) => f.label), `${label} 를 찾지 못했습니다`).toEqual([label]);
    }
  });

  it('신고 대상 바로 바깥의 문자는 건드리지 않는다', () => {
    // 범위 경계 바로 옆. 끝을 하나씩 넓히거나 좁히는 실수가 여기서 걸린다.
    // U+0020 공백, U+0021, U+00A1, U+00AC/U+00AE, U+2010, U+2027, U+2030,
    // U+2065, U+206A, U+2FFF, U+3001.
    const outside =
      ' !¡¬®\u2010\u2027\u2030\u2065\u206A\u2FFF\u3001';
    expect(findInvisibleChars(outside)).toEqual([]);
  });

  it('짝 잃은 서로게이트를 잡고, 정상 이모지는 잡지 않는다', () => {
    const findings = findInvisibleChars('a\uD800b');
    expect(findings.map((f) => f.label)).toEqual(['U+D800']);
    expect(findings[0]?.loneSurrogate).toBe(true);
    expect(findings[0]?.name).toContain('JSON.stringify');

    // 정상적으로 짝을 이룬 서로게이트 쌍은 그냥 이모지다.
    expect(findInvisibleChars('\u{1F600}')).toEqual([]);
    // 뒤쪽(하위)만 남은 것도 잡는다.
    expect(findInvisibleChars('a\uDC00').map((f) => f.label)).toEqual(['U+DC00']);
    // 문자열 맨 끝의 상위 서로게이트 — 짝이 올 자리가 아예 없다.
    expect(findInvisibleChars('a\uD83D').map((f) => f.label)).toEqual(['U+D83D']);
  });

  it('선별하지 않은 코드포인트는 이름 없이 U+XXXX 로만 알린다', () => {
    const [finding] = findInvisibleChars('\u0001');
    expect(finding?.label).toBe('U+0001');
    expect(finding?.name).toBe('');
  });
});

describe('formatFinding', () => {
  it('설명 · 횟수 · 위치를 이어 붙인다', () => {
    const [finding] = findInvisibleChars(`ab${ZWSP}c\n${ZWSP}`);
    expect(finding && formatFinding(finding)).toBe('제로폭 공백 (ZWSP) · 2회 · 1줄 3칸, 2줄 1칸');
  });

  it('보관하지 않은 위치는 "외 N곳" 으로 알린다', () => {
    const [finding] = findInvisibleChars(ZWSP.repeat(7));
    expect(finding && formatFinding(finding)).toContain('외 2곳');
    expect(finding && formatFinding(finding)).toContain('7회');
  });

  it('이름이 없으면 설명 자리를 비우고 횟수부터 적는다', () => {
    const [finding] = findInvisibleChars('\u0001');
    expect(finding && formatFinding(finding)).toBe('1회 · 1줄 1칸');
  });
});

describe('formatUnsupportedChar', () => {
  it('문자와 횟수를 보여준다', () => {
    expect(formatUnsupportedChar({ char: '\u{1F600}', codePoint: 0x1f600, count: 3 })).toBe(
      '\u{1F600} · 3회',
    );
  });

  it('보이지 않거나 방향을 뒤집는 문자는 그대로 그리지 않는다', () => {
    // U+202E(RLO) 를 그대로 넣으면 뒤따르는 "1회" 까지 거꾸로 그려진다.
    expect(formatUnsupportedChar({ char: '\u202E', codePoint: 0x202e, count: 1 })).toBe(
      '(보이지 않는 문자) · 1회',
    );
    expect(formatUnsupportedChar({ char: '\uD800', codePoint: 0xd800, count: 1 })).toBe(
      '(보이지 않는 문자) · 1회',
    );
  });
});
