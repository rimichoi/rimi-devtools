/**
 * 입력 마스크 카탈로그.
 *
 * 이 제품의 스칼라 입력칸(`numberForm.ts` 가 만드는 단일 줄 필드)은 **전부** 여기
 * 있는 마스크 하나를 골라 써야 한다. `NumberFormField.mask` 가 선택 항목이 아니라
 * 필수인 이유가 그것이다 — 한때 날짜 칸 둘만 마스크를 갖고 나머지 숫자 칸은 임의의
 * 텍스트를 그대로 받았고, 그 불일치가 "왜 여기만 되냐" 는 불만이 됐다. 새 칸을
 * 추가하는 사람이 마스크를 고르지 않으면 컴파일이 실패하는 것이, 다음 라운드에
 * 같은 표류가 다시 생기지 않게 하는 유일하게 믿을 만한 장치다.
 *
 * 여기 있는 것은 전부 **순수 함수**다(DOM 을 모른다). vitest 가
 * `environment: 'node'` 로 도니 마스크의 변환 규칙은 단위 테스트로 고정할 수 있고,
 * 실제 입력칸에 붙였을 때만 생기는 문제 — 캐럿 위치, 백스페이스, IME 조합 — 는
 * `numberForm.ts` 의 `attachMask` 한 곳이 전부 맡는다. 마스크마다 손으로 쓰는
 * 핸들러를 두지 않는다.
 *
 * 모든 마스크가 지키는 규칙 셋:
 *
 *  1. **부분 입력을 통과시킨다.** 완성된 값만 받아들이는 마스크는 사용자가 값을
 *     끝까지 칠 수 없게 만든다.
 *  2. **끝에 구분자를 붙이지 않는다.** 자리수를 채우자마자 `2026-` 처럼 구분자를
 *     달아 두면, 그 구분자를 지우는 백스페이스가 마스크에 곧바로 되돌려져 캐럿이
 *     갇힌다. 구분자는 **뒤따르는 숫자가 있을 때만** 넣는다.
 *  3. **멱등이다.** 이미 정리된 값을 다시 먹여도 그대로여야 한다. 그렇지 않으면
 *     `setValue` → `apply` → 렌더 왕복에서 값이 계속 움직인다.
 *
 * 그리고 마스크는 편의지 경계가 아니다. 각 도구의 `logic.ts` 는 마스크가 무엇을
 * 걸러 주든 무관하게 스스로 방어하고 한국어 `ToolResult` 오류를 돌려준다.
 */
export interface FieldMask {
  /** 임의의 입력을 허용된 모양으로 바꾼다. 부분 입력도 통과시켜야 한다. */
  apply(raw: string): string;
  /**
   * 캐럿 위치를 세는 기준 문자인지. **마스크가 끼워 넣는 구분자는 false 여야
   * 한다** — 구분자까지 세면 재포맷 뒤 캐럿이 한 칸씩 밀려 결국 사용자가
   * 글자를 엉뚱한 자리에 넣게 된다. 마스크가 버리는 문자도 false 다.
   */
  isAnchor(char: string): boolean;
  /**
   * 이 칸에 맞는 모바일 가상 키보드. 마스크가 무엇을 받아들이는지 아는 것은
   * 마스크뿐이라 여기서 함께 정한다 — numberForm 이 모든 칸에 'decimal' 을
   * 박아 두면 날짜 칸에도 소수점 키가 뜨고, 그 키는 눌러도 걸러진다.
   */
  inputMode: 'numeric' | 'decimal';
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

/** 숫자만 남기고 앞에서부터 `max` 자리까지 자른다. */
function digitsOf(raw: string, max: number): string {
  let out = '';
  for (const char of raw) {
    if (!isDigit(char)) continue;
    out += char;
    if (out.length === max) break;
  }
  return out;
}

/* ==========================================================================
 * 왼쪽부터 채우는 고정 폭 그룹 — 날짜, 날짜와 시각
 * ========================================================================== */

interface LeftFilledSpec {
  /** 왼쪽부터의 그룹 자리수. */
  widths: number[];
  /** `widths[i]` 앞에 놓는 구분자 (i >= 1). 길이는 widths.length - 1. */
  separators: string[];
}

/**
 * 첫 그룹의 자리수가 정해져 있어 왼쪽부터 채워 나가는 값. 연도가 먼저 오는
 * 날짜류가 여기 속한다 — `2`, `20`, `202`, `2026`, `2026-0` … 처럼 앞자리의 뜻이
 * 뒤에 무엇을 더 치든 바뀌지 않는다.
 */
function leftFilledMask({ widths, separators }: LeftFilledSpec): FieldMask {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return {
    inputMode: 'numeric',
    isAnchor: isDigit,
    apply(raw) {
      const digits = digitsOf(raw, total);
      let out = '';
      let at = 0;
      for (let i = 0; i < widths.length; i++) {
        const width = widths[i] ?? 0;
        const group = digits.slice(at, at + width);
        at += width;
        // 규칙 2: 뒤따르는 숫자가 없으면 구분자도 넣지 않는다.
        if (group === '') break;
        out += i === 0 ? group : (separators[i - 1] ?? '') + group;
      }
      return out;
    },
  };
}

/* ==========================================================================
 * 오른쪽부터 채우는 그룹 — 지속 시간
 * ========================================================================== */

interface RightFilledSpec {
  /** 오른쪽 끝부터의 고정 폭 그룹. 남는 앞부분이 열린 그룹이 된다. */
  tailWidths: number[];
  separator: string;
  maxDigits: number;
}

/**
 * 지속 시간(`01:30:00`)은 날짜와 반대로 **오른쪽부터** 채워야 한다. 날짜 마스크를
 * 복사해 오면 틀린다:
 *
 *  - `30:00`(MM:SS)과 `01:30:00`(HH:MM:SS) 이 **둘 다 정상 입력**이다.
 *    `parseDuration` 이 두 모양을 모두 받는다. 왼쪽부터 채우는 마스크는 앞 두
 *    자리를 늘 '시' 로 못 박아 MM:SS 를 아예 칠 수 없게 만든다.
 *  - 시는 열려 있다. `100:00:00`(100시간)은 정상이다 — 작업 시간 합계처럼 실제로
 *    쓰이는 값이다. 자리수를 2로 고정하면 이 값을 못 넣는다.
 *
 * 그래서 오른쪽 끝 두 자리가 초, 그 앞 두 자리가 분, 나머지 전부가 시다. 결과로
 * **치는 동안 이미 친 자리의 뜻이 오른쪽으로 밀린다**:
 *
 *     0 → 0 · 01 → 01 · 013 → 0:13 · 0130 → 01:30 · 01300 → 0:13:00 · 013000 → 01:30:00
 *
 * 이것은 결함이 아니라 이 값의 성질이다. 스톱워치·타이머 입력이 오래 쓰는
 * 방식이고, 무엇보다 매 순간 화면의 값이 "지금 확정하면 이 뜻" 이라는 참인 문장을
 * 유지한다. 왼쪽부터 채우려면 사용자가 먼저 "나는 MM:SS 를 칠 것인가 HH:MM:SS 를
 * 칠 것인가" 를 대답해야 하는데, 그건 이 프로젝트가 base64 의 방향 select 를
 * 없애면서 거부한 종류의 질문이다.
 */
function rightFilledMask({ tailWidths, separator, maxDigits }: RightFilledSpec): FieldMask {
  return {
    inputMode: 'numeric',
    isAnchor: isDigit,
    apply(raw) {
      const digits = digitsOf(raw, maxDigits);
      const groups: string[] = [];
      let end = digits.length;
      for (const width of tailWidths) {
        if (end <= 0) break;
        const start = Math.max(0, end - width);
        groups.unshift(digits.slice(start, end));
        end = start;
      }
      // 남은 앞부분이 열린 그룹(시)이다. 비어 있으면 그룹 자체를 만들지 않으므로
      // 규칙 2 가 자동으로 지켜진다 — 앞에 아무것도 없는 ':30:00' 이 생기지 않는다.
      if (end > 0) groups.unshift(digits.slice(0, end));
      return groups.join(separator);
    },
  };
}

/* ==========================================================================
 * 숫자
 * ========================================================================== */

interface NumberSpec {
  /** 맨 앞 '-' 하나를 허용하는가. */
  sign: boolean;
  /** 소수점 하나를 허용하는가. */
  decimal: boolean;
}

/**
 * 숫자만 남긴다. `Number('abc')` 가 NaN 이 되어 계산이 조용히 무너지는 자리를 아예
 * 만들지 않는다. 쉼표·공백·밑줄이 섞인 값(`1,700,000,000`, `1_700_000_000`)을
 * 붙여넣으면 구분 기호가 걷힌 순수한 숫자가 된다.
 *
 * '-' 는 맨 앞에 있을 때만 살린다: `5-3` 은 `53`, `--5` 는 `-5` 가 된다. 소수점은
 * 첫 번째 하나만 남기고 뒤의 숫자는 그대로 이어 붙인다(`1.2.3` → `1.23`) — 한
 * 글자씩 칠 때와 통째로 붙여넣을 때가 같은 값이 되는 쪽을 골랐다. 두 번째 소수점
 * 뒤를 잘라내는 규칙은 붙여넣기에서만 다르게 동작해 예측하기 어렵다.
 *
 * 지수 표기('1e5')는 받지 않는다. 이 칸들이 다루는 값(퍼센트, 일수, 타임스탬프)에
 * 지수 표기가 쓰이는 일이 없고, 'e' 를 통과시키면 `1e` 처럼 그 자체로는 숫자가
 * 아닌 부분 입력 상태를 하나 더 만든다.
 */
function numberMask({ sign, decimal }: NumberSpec): FieldMask {
  return {
    inputMode: decimal ? 'decimal' : 'numeric',
    isAnchor(char) {
      if (isDigit(char)) return true;
      if (char === '-') return sign;
      if (char === '.') return decimal;
      return false;
    },
    apply(raw) {
      const lead = sign && raw.startsWith('-') ? '-' : '';
      let body = '';
      let seenDot = false;
      for (const char of raw) {
        if (isDigit(char)) body += char;
        else if (decimal && char === '.' && !seenDot) {
          seenDot = true;
          body += '.';
        }
      }
      return lead + body;
    },
  };
}

/* ==========================================================================
 * 카탈로그
 * ========================================================================== */

/** `2026-08-14`. `20260814` / `2026/08/14` / `2026.08.14` 를 모두 이 모양으로 만든다. */
export const DATE_MASK: FieldMask = leftFilledMask({
  widths: [4, 2, 2],
  separators: ['-', '-'],
});

/**
 * `2023-11-15 07:13:20`. `20231115 071320`, `2023/11/15T07:13:20` 같은 표기를 모두
 * 이 모양으로 만든다(`toEpoch` 는 T 와 공백을 둘 다 받지만, 화면에는 한 가지
 * 모양만 남긴다).
 */
export const DATE_TIME_MASK: FieldMask = leftFilledMask({
  widths: [4, 2, 2, 2, 2, 2],
  separators: ['-', '-', ' ', ':', ':'],
});

/**
 * `01:30:00` / `30:00` / `100:00:00`. 오른쪽부터 채운다 — 위 `rightFilledMask` 주석
 * 참고.
 *
 * 10자리로 자른다: 시가 여섯 자리(`999999:59:59`, 약 114년)까지 들어가므로 어떤
 * 실제 지속 시간도 표현할 수 있고, 붙여넣은 긴 문자열이 칸에 통째로 남지 않는다.
 * 이 상한이 계산의 경계는 아니다 — `parseDuration` 이 안전 정수 범위를 스스로
 * 확인한다.
 */
export const DURATION_MASK: FieldMask = rightFilledMask({
  tailWidths: [2, 2],
  separator: ':',
  maxDigits: 10,
});

/** 정수. 맨 앞 '-' 하나를 허용한다. */
export const INTEGER_MASK: FieldMask = numberMask({ sign: true, decimal: false });

/** 실수. 맨 앞 '-' 하나와 소수점 하나를 허용한다. */
export const DECIMAL_MASK: FieldMask = numberMask({ sign: true, decimal: true });
