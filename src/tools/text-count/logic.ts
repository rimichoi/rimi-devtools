import type { ToolResult } from '../../types';

export interface TextStats {
  /** 사람이 세는 글자수. 결합 이모지를 1로 센다 */
  graphemes: number;
  /** 유니코드 코드포인트 수. Python / Go 의 len() 이 세는 단위 */
  codePoints: number;
  /** JS 의 String.length 값. Java 의 String.length() 와 같은 단위 */
  utf16Units: number;
  /** 공백류를 제외한 글자수 (grapheme 기준) */
  charsNoSpace: number;
  bytesUtf8: number;
  lines: number;
}

/*
 * Segmenter 를 모듈 최상위에서 만들면 안 된다. `Intl.Segmenter` 가 없는 브라우저
 * (Firefox 125 미만)에서는 그 한 줄이 **청크 평가 중에** 던지고, 그러면
 * `import('./tools/text-count/index')` 자체가 실패해 main.ts 의 "청크를 받지 못함"
 * 갈래로 떨어진다 — 즉 빈 화면 + "새 버전이 배포되었습니다. 새로고침해 주세요."
 * 라는, 이 경우에는 아무 소용도 없는 안내가 영원히 뜬다(실측으로 확인했다).
 *
 * 게으르게 만들면 실패 시점이 "도구를 여는 순간" 에서 "입력을 처리하는 순간" 으로
 * 옮겨 가고, 그 자리에는 IOPane 의 backstop 이 있다 — 화면은 살아 있고 한국어
 * 오류가 뜬다.
 */
let segmenter: Intl.Segmenter | undefined;

function countGraphemes(text: string): number {
  segmenter ??= new Intl.Segmenter('ko', { granularity: 'grapheme' });
  return [...segmenter.segment(text)].length;
}

export function countText(text: string): TextStats {
  const noSpace = text.replace(/\s/g, '');

  return {
    graphemes: countGraphemes(text),
    codePoints: Array.from(text).length,
    utf16Units: text.length,
    charsNoSpace: countGraphemes(noSpace),
    bytesUtf8: new TextEncoder().encode(text).length,
    lines: text === '' ? 0 : text.replace(/\n$/, '').split('\n').length,
  };
}

/* ==========================================================================
 * EUC-KR 바이트
 *
 * `TextEncoder` 는 UTF-8 전용이고 브라우저는 레거시 인코딩용 인코더를 아예
 * 제공하지 않는다. 그런데 *디코더* 는 있다 — `TextDecoder('euc-kr')`. 그래서
 * 가능한 바이트 조합을 한 번 훑어 "디코딩 결과 문자 → 그 문자를 만든 바이트 수"
 * 역방향 표를 실행 시점에 만든다. 의존성 0, 테이블 파일 0.
 *
 * 범위: 브라우저가 `euc-kr` 이라고 부르는 것은 실제로는 windows-949(CP949)다.
 * 선두 바이트 0x81-0xFE, 후행 바이트 0x41-0xFE 로, 엄격한 EUC-KR 의
 * 0xA1-0xFE 보다 넓다(확장 한글 '뷁', '힣' 등이 이 확장 영역에 있다).
 * 0x00-0x7F 는 자기 자신으로 1바이트.
 *
 * 주의 — 실행 환경에 따라 이 표의 크기가 다르다:
 *   브라우저(WHATWG Encoding 표준)  : 17,048자 (CP949 전체)
 *   Node 22/24(ICU 컨버터)          :  8,412자 (엄격 EUC-KR = KS X 1001 만)
 * 즉 Node 에서는 '뷁' 같은 확장 한글이 "표현 불가" 로 나온다. 제품이 도는 곳은
 * 브라우저이므로 동작 자체는 옳지만, 단위 테스트(environment: 'node')는 두
 * 집합에 공통인 문자로만 값을 고정해야 한다. 확장 영역은 E2E(실제 Chromium)가 맡는다.
 * ========================================================================== */

const LEAD_MIN = 0x81;
const LEAD_MAX = 0xfe;
const TRAIL_MIN = 0x41;
const TRAIL_MAX = 0xfe;

/** 문자 → EUC-KR 바이트 수. 게으르게 한 번만 만든다(키 입력마다 다시 만들지 않는다). */
let eucKrTable: Map<string, number> | null = null;
/** 표를 만들 수 없는 환경이라는 판정도 한 번만 한다. */
let eucKrUnavailable = false;

/** 표를 만드는 데 걸린 시간(ms). 실측용 — 아무도 없으면 undefined. */
let eucKrBuildMs: number | undefined;

export function getEucKrBuildMs(): number | undefined {
  return eucKrBuildMs;
}

/** 테스트 전용: 표를 버리고 다음 호출에서 다시 만들게 한다. */
export function resetEucKrTable(): void {
  eucKrTable = null;
  eucKrUnavailable = false;
  eucKrBuildMs = undefined;
}

function buildEucKrTable(): Map<string, number> | null {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder('euc-kr');
  } catch {
    return null;
  }

  // performance 는 브라우저와 Node 22+ 양쪽에서 전역이다(DOM 이 아니다).
  const started = performance.now();
  const table = new Map<string, number>();
  for (let byte = 0; byte <= 0x7f; byte++) table.set(String.fromCharCode(byte), 1);

  const pair = new Uint8Array(2);
  for (let lead = LEAD_MIN; lead <= LEAD_MAX; lead++) {
    for (let trail = TRAIL_MIN; trail <= TRAIL_MAX; trail++) {
      pair[0] = lead;
      pair[1] = trail;
      const decoded = decoder.decode(pair);
      // 유효하지 않은 조합은 치환 문자 U+FFFD 를 내고, 후행 바이트가 ASCII 면
      // 그 바이트가 뒤에 따라 나와 길이 2가 된다. 둘 다 거른다.
      if (decoded.length !== 1 || decoded === '�') continue;
      if (!table.has(decoded)) table.set(decoded, 2);
    }
  }
  eucKrBuildMs = performance.now() - started;
  return table;
}

function getEucKrTable(): Map<string, number> | null {
  if (eucKrTable) return eucKrTable;
  if (eucKrUnavailable) return null;
  const built = buildEucKrTable();
  if (!built) {
    eucKrUnavailable = true;
    return null;
  }
  eucKrTable = built;
  return built;
}

export interface EucKrUnsupportedChar {
  /** 표현할 수 없는 문자 자체 */
  char: string;
  codePoint: number;
  count: number;
}

export interface EucKrReport {
  /**
   * EUC-KR 로 인코딩했을 때의 바이트 수. 표현할 수 없는 문자는 실제 인코더가
   * 하는 것과 같이 '?' 한 바이트로 센다(Java 의 `getBytes("euc-kr")` 동작).
   */
  bytes: number;
  /** 표현할 수 없는 문자를 처음 나온 순서대로. */
  unsupported: EucKrUnsupportedChar[];
}

export function countEucKrBytes(text: string): ToolResult<EucKrReport> {
  const table = getEucKrTable();
  if (!table) {
    return { ok: false, error: '이 브라우저에는 EUC-KR 디코더가 없어 EUC-KR 바이트를 계산할 수 없습니다.' };
  }

  let bytes = 0;
  const counts = new Map<string, number>();
  for (const char of text) {
    const size = table.get(char);
    if (size === undefined) {
      bytes += 1; // 치환 문자 '?' 한 바이트
      counts.set(char, (counts.get(char) ?? 0) + 1);
      continue;
    }
    bytes += size;
  }

  return {
    ok: true,
    value: {
      bytes,
      unsupported: [...counts].map(([char, count]) => ({
        char,
        codePoint: char.codePointAt(0) ?? 0,
        count,
      })),
    },
  };
}

/* ==========================================================================
 * 보이지 않는 / JSON 을 깨뜨리는 문자
 *
 * 다른 편집기에서는 눈에 띄지 않으면서 운영 payload 를 깨뜨리는 문자들이다.
 * 이름은 **선별한 집합에만** 붙인다 — 유니코드 이름 테이블 전체를 싣는 것은
 * 이 제품이 하려는 일(작은 번들, 의존성 0)과 정면으로 어긋난다. 나머지는
 * 코드포인트 표기(U+XXXX)만으로 식별한다.
 * ========================================================================== */

const CHAR_NAMES = new Map<number, string>([
  // 제로폭
  [0x200b, '제로폭 공백 (ZWSP)'],
  [0x200c, '제로폭 비접합자 (ZWNJ)'],
  [0x200d, '제로폭 접합자 (ZWJ)'],
  [0xfeff, 'BOM / 제로폭 줄바꿈 금지 공백'],
  // 공백처럼 보이지만 \s·trim() 이 다르게 다루는 것들
  [0x00a0, '줄바꿈 없는 공백 (NBSP)'],
  [0x2000, '엔 쿼드 공백'],
  [0x2001, '엠 쿼드 공백'],
  [0x2002, '엔 공백'],
  [0x2003, '엠 공백'],
  [0x2004, '1/3 엠 공백'],
  [0x2005, '1/4 엠 공백'],
  [0x2006, '1/6 엠 공백'],
  [0x2007, '숫자 폭 공백'],
  [0x2008, '구두점 폭 공백'],
  [0x2009, '얇은 공백'],
  [0x200a, '아주 얇은 공백'],
  [0x202f, '좁은 줄바꿈 없는 공백 (NNBSP)'],
  [0x205f, '수학용 중간 공백'],
  [0x3000, '전각 공백'],
  // 방향 제어
  [0x200e, '왼쪽→오른쪽 표시 (LRM)'],
  [0x200f, '오른쪽→왼쪽 표시 (RLM)'],
  [0x202a, '왼쪽→오른쪽 삽입 시작 (LRE)'],
  [0x202b, '오른쪽→왼쪽 삽입 시작 (RLE)'],
  [0x202c, '방향 삽입 끝 (PDF)'],
  [0x202d, '왼쪽→오른쪽 강제 (LRO)'],
  [0x202e, '오른쪽→왼쪽 강제 (RLO)'],
  [0x2066, '왼쪽→오른쪽 격리 시작 (LRI)'],
  [0x2067, '오른쪽→왼쪽 격리 시작 (RLI)'],
  [0x2068, '방향 자동 격리 시작 (FSI)'],
  [0x2069, '방향 격리 끝 (PDI)'],
  // 줄/문단 구분자
  [0x2028, '줄 구분자 (LS)'],
  [0x2029, '문단 구분자 (PS)'],
  // 그 밖
  [0x00ad, '소프트 하이픈'],
  // 자주 섞여 들어오는 C0 제어문자만 이름을 준다
  [0x0000, '널 문자 (NUL)'],
  [0x0008, '백스페이스 (BS)'],
  [0x000b, '수직 탭 (VT)'],
  [0x000c, '폼 피드 (FF)'],
  [0x001b, '이스케이프 (ESC)'],
  [0x007f, '삭제 문자 (DEL)'],
]);

const LONE_SURROGATE_NAME = '짝 잃은 서로게이트 — JSON.stringify 왕복이 깨집니다';

/**
 * 신고 대상인지 판정한다. \t \n \r 은 사람이 의도해서 넣는 것이므로 제외한다 —
 * 여기 넣으면 거의 모든 입력이 "문제 있음" 이 되어 이 검사 자체가 무의미해진다.
 */
function isFlagged(codePoint: number): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return false;
  if (codePoint <= 0x1f) return true; // C0
  if (codePoint === 0x7f) return true; // DEL
  if (codePoint >= 0x80 && codePoint <= 0x9f) return true; // C1
  if (codePoint === 0x00a0 || codePoint === 0x00ad) return true;
  // 0x2000-0x200A 공백류, 0x200B-0x200D 제로폭, 0x200E-0x200F 방향 표시
  if (codePoint >= 0x2000 && codePoint <= 0x200f) return true;
  // 0x2028-0x2029 줄/문단 구분자, 0x202A-0x202E 방향 제어, 0x202F 좁은 NBSP
  if (codePoint >= 0x2028 && codePoint <= 0x202f) return true;
  if (codePoint === 0x205f) return true;
  if (codePoint >= 0x2066 && codePoint <= 0x2069) return true;
  if (codePoint === 0x3000) return true;
  if (codePoint === 0xfeff) return true;
  return false;
}

export interface CharPosition {
  /** 1부터 세는 줄 번호 */
  line: number;
  /** 1부터 세는 줄 안 위치(코드포인트 기준) */
  column: number;
}

export interface CharFinding {
  codePoint: number;
  /** 'U+200B' 같은 표기 */
  label: string;
  /** 선별한 집합에만 있는 한국어 설명. 없으면 빈 문자열 */
  name: string;
  count: number;
  /** 앞에서부터 최대 MAX_POSITIONS 개까지의 위치 */
  positions: CharPosition[];
  /** 짝을 이루지 못한 서로게이트인지 */
  loneSurrogate: boolean;
}

const MAX_POSITIONS = 5;

export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function findInvisibleChars(text: string): CharFinding[] {
  const found = new Map<number, CharFinding>();
  let line = 1;
  let column = 1;

  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const isHigh = unit >= 0xd800 && unit <= 0xdbff;
    const isLow = unit >= 0xdc00 && unit <= 0xdfff;

    let codePoint = unit;
    let width = 1;
    if (isHigh && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = (unit - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        width = 2;
      }
    }
    const loneSurrogate = width === 1 && (isHigh || isLow);

    if (loneSurrogate || isFlagged(codePoint)) {
      let entry = found.get(codePoint);
      if (!entry) {
        entry = {
          codePoint,
          label: formatCodePoint(codePoint),
          name: loneSurrogate ? LONE_SURROGATE_NAME : (CHAR_NAMES.get(codePoint) ?? ''),
          count: 0,
          positions: [],
          loneSurrogate,
        };
        found.set(codePoint, entry);
      }
      entry.count++;
      if (entry.positions.length < MAX_POSITIONS) entry.positions.push({ line, column });
    }

    // \r\n 은 줄바꿈 하나로 센다.
    const isCr = codePoint === 0x0d;
    const isCrLf = isCr && text.charCodeAt(i + 1) === 0x0a;
    if (codePoint === 0x0a || (isCr && !isCrLf)) {
      line++;
      column = 1;
    } else if (!isCr) {
      column++;
    }

    i += width - 1;
  }

  return [...found.values()];
}

/** 'U+200B' 를 뺀 나머지 — 설명 · 횟수 · 위치. ResultList 의 값 칸에 들어간다. */
export function formatFinding(finding: CharFinding): string {
  const shown = finding.positions.map((p) => `${p.line}줄 ${p.column}칸`).join(', ');
  const omitted = finding.count - finding.positions.length;
  const where = omitted > 0 ? `${shown} 외 ${omitted}곳` : shown;
  const parts = [finding.name, `${finding.count.toLocaleString('ko-KR')}회`, where];
  return parts.filter((part) => part !== '').join(' · ');
}

/**
 * EUC-KR 로 표현할 수 없는 문자를 값 칸에 넣을 문자열로 만든다.
 *
 * 문자 자체를 그대로 넣되, 그 문자가 보이지 않는/방향을 뒤집는 문자라면 넣지
 * 않는다 — U+202E(RLO) 하나가 섞이면 뒤따르는 "2회" 같은 문구까지 거꾸로
 * 그려져서, 진단 화면이 진단 대상 때문에 거짓말을 하게 된다.
 */
export function formatUnsupportedChar(entry: EucKrUnsupportedChar): string {
  const hidden = entry.char.length === 1 && (isFlagged(entry.codePoint) || isLoneSurrogateChar(entry.char));
  const shown = hidden ? '(보이지 않는 문자)' : entry.char;
  return `${shown} · ${entry.count.toLocaleString('ko-KR')}회`;
}

function isLoneSurrogateChar(char: string): boolean {
  if (char.length !== 1) return false;
  const unit = char.charCodeAt(0);
  return unit >= 0xd800 && unit <= 0xdfff;
}
