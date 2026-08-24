import type { ToolResult } from '../../types';

/*
 * 크론 표현식의 순수 로직. DOM 을 참조하지 않고 현재 시각을 스스로 읽지 않는다
 * (`nextRuns` 가 기준 시각을 인자로 받는다).
 *
 * 이 도구가 조용히 틀릴 수 있는 지점은 하나가 아니라 여럿인데, 가장 위험한 것은
 * **일(day-of-month)과 요일(day-of-week)이 둘 다 지정됐을 때** 다.
 *
 *  - POSIX/Vixie crontab (5필드): 둘 중 하나라도 맞으면 실행한다 (OR)
 *  - Spring CronExpression (6필드): 둘 다 맞아야 실행한다 (AND)
 *
 * 추측하지 않고 실제 Spring 5.3.19 라이브러리로 확인했다. 근거와 재생성 방법은
 * tools/cron-vectors/README.md 에 있고, 그때 나온 값이 vectors.ts 다.
 *
 * 모듈 평가 시점에 throw 할 수 있는 코드를 두지 않는다 — 이 프로젝트는 top-level
 * `new Intl.Segmenter(...)` 로 청크 평가가 실패한 사고를 냈다.
 */

/** 한국 표준시는 UTC+9 고정이다. 1988년 이후 서머타임이 없어 civil 산술이 정확하다. */
export const KST_OFFSET_MS = 9 * 3600_000;

export type CronDialect = 'crontab5' | 'spring6';
export type CronSeverity = 'danger' | 'caution';

export interface CronWarning {
  severity: CronSeverity;
  message: string;
}

export type FieldKey = 'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow';

export interface CronField {
  key: FieldKey;
  label: string;
  raw: string;
  values: number[];
  /** `*` 도 `?` 도 아니면 제한된 필드다 (사람에게 보여줄 설명을 고를 때 쓴다) */
  restricted: boolean;
  /*
   * 원문이 `*` 로 시작하거나 `?` 인가. 표준 crontab 의 OR 규칙은 "제한된 값
   * 집합인가" 가 아니라 **필드 첫 글자가 `*` 인가** 로 갈린다(Vixie cron 은
   * DOM_STAR / DOW_STAR 플래그를 그렇게 세운다). 그래서 `* /2` 처럼 값은
   * 걸러내지만 `*` 로 시작하는 필드는 OR 대상이 아니다.
   *
   * 주의: 이 규칙은 Vixie 소스와 crontab(5) 문서를 근거로 한 것이고, Spring 처럼
   * 실물 오라클로 대조하지는 못했다. 6필드(Spring)는 항상 AND 라 영향이 없다.
   */
  starPrefixed: boolean;
  description: string;
}

export interface CronParsedValue {
  kind: 'parsed';
  dialect: CronDialect;
  fields: CronField[];
  secondValues: number[];
  minuteValues: number[];
  hourValues: number[];
  domValues: number[];
  monthValues: number[];
  dowValues: number[];
  domRestricted: boolean;
  dowRestricted: boolean;
  /** 일과 요일이 둘 다 `*` 로 시작하지 않아, 방언에 따라 OR/AND 가 갈리는 경우 */
  dayRuleAmbiguous: boolean;
  summary: string;
  warnings: CronWarning[];
}

export type CronOutcome = { kind: 'empty' } | CronParsedValue;

const LABEL: Record<FieldKey, string> = {
  second: '초',
  minute: '분',
  hour: '시',
  dom: '일',
  month: '월',
  dow: '요일',
};

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/*
 * 요일 이름은 **SUN = 7** 이다. 0 이 아니다.
 *
 * 처음에는 SUN=0 으로 적었고 `0 0 12 * * SUN` 같은 흔한 표현식은 우연히 맞았다.
 * 교차 리뷰가 지적해 Spring 5.3.19 에 직접 물어보니 어긋나는 곳이 셋 있었다:
 *   - `SAT-SUN` 을 6-0 으로 읽어 "범위가 거꾸로" 라며 멀쩡한 표현식을 거절했다
 *     (Spring 은 6-7 로 읽어 토·일을 낸다)
 *   - 와일드카드를 0-7 로 펼쳐서, 요일에 간격 2를 붙이면 일·화·목·토가 됐다
 *     (Spring 은 와일드카드를 1-7 로 펼쳐 월·수·금·일을 낸다)
 *   - `7-7` 을 일요일 하나로 읽었다 (Spring 은 시작 7 을 0 으로 낮춰 **매일**이 된다)
 * 셋 다 조용히 틀리는 종류였다. 아래 규칙은 전부 실측으로 확정한 것이다.
 */
const DOW_NAMES: Record<string, number> = {
  SUN: 7, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

interface FieldSpec {
  key: FieldKey;
  /** 값으로 받아들이는 범위 */
  min: number;
  max: number;
  /** `*` 가 펼쳐지는 시작. 요일만 1 이다 — Spring 실측. */
  wildcardMin: number;
  names?: Record<string, number>;
  /** `?` 를 받는가. Spring 은 일·요일 필드에서만 받고 나머지는 파싱 오류다. */
  allowsQuestion: boolean;
}

const SPEC: Record<FieldKey, FieldSpec> = {
  second: { key: 'second', min: 0, max: 59, wildcardMin: 0, allowsQuestion: false },
  minute: { key: 'minute', min: 0, max: 59, wildcardMin: 0, allowsQuestion: false },
  hour: { key: 'hour', min: 0, max: 23, wildcardMin: 0, allowsQuestion: false },
  dom: { key: 'dom', min: 1, max: 31, wildcardMin: 1, allowsQuestion: true },
  month: { key: 'month', min: 1, max: 12, wildcardMin: 1, names: MONTH_NAMES, allowsQuestion: false },
  // 0 과 7 을 모두 받고 7 을 0 으로 접어 JS 의 getUTCDay() 와 맞춘다.
  dow: { key: 'dow', min: 0, max: 7, wildcardMin: 1, names: DOW_NAMES, allowsQuestion: true },
};

/*
 * 지원하지 않는 Quartz/Spring 확장. 조용히 다르게 읽는 대신 거절한다.
 *
 * 이 검사를 필드 원문 전체에 걸면 안 된다 — 요일 이름 "WED" 안의 W 에 걸려서
 * 멀쩡한 표현식을 거절한다(Spring 실측 벡터가 이 버그를 잡았다). 이름으로도
 * 숫자로도 읽히지 않은 토큰에 대해서만 본다.
 */
const UNSUPPORTED_RE = /[LW#]/i;

function resolveName(token: string, spec: FieldSpec): number | null {
  if (spec.names === undefined) return null;
  return spec.names[token.toUpperCase()] ?? null;
}

function parseValue(token: string, spec: FieldSpec): ToolResult<number> {
  const named = resolveName(token, spec);
  if (named !== null) return { ok: true, value: named };

  if (!/^\d+$/.test(token)) {
    if (UNSUPPORTED_RE.test(token)) {
      return {
        ok: false,
        error: `L · W · # 는 지원하지 않습니다. ${LABEL[spec.key]} 필드의 "${token}" 을 다르게 적어 주세요.`,
      };
    }
    return { ok: false, error: `${LABEL[spec.key]} 필드의 "${token}" 을 읽을 수 없습니다.` };
  }
  // 앞자리 0 은 그대로 십진수로 읽는다. 사내 표현식에 08, 05 가 실제로 있다.
  const value = Number.parseInt(token, 10);
  if (value < spec.min || value > spec.max) {
    return {
      ok: false,
      error: `${LABEL[spec.key]} 필드의 "${token}" 이 범위(${spec.min}~${spec.max})를 벗어났습니다.`,
    };
  }
  return { ok: true, value };
}

/** 요일 7 을 0 으로 접는다. 그 외 필드는 그대로다. */
function fold(value: number, spec: FieldSpec): number {
  return spec.key === 'dow' && value === 7 ? 0 : value;
}

interface TermResult {
  values: number[];
  description: string;
  /** `*` 나 `?` 로만 이루어졌으면 제한이 아니다 */
  wildcard: boolean;
}

function unitOf(key: FieldKey): string {
  return LABEL[key];
}

function describeSingle(value: number, key: FieldKey): string {
  if (key === 'dow') return `${DOW_KO[value] ?? value}요일`;
  return `${value}${unitOf(key)}`;
}

function everyOf(key: FieldKey): string {
  return key === 'dow' ? '매 요일' : `매${unitOf(key)}`;
}

function parseTerm(term: string, spec: FieldSpec): ToolResult<TermResult> {
  const [body, stepText] = term.split('/') as [string, string?];
  if (term.split('/').length > 2) {
    return { ok: false, error: `${LABEL[spec.key]} 필드의 "${term}" 에 / 가 두 번 이상 있습니다.` };
  }

  let step = 1;
  if (stepText !== undefined) {
    if (!/^\d+$/.test(stepText) || Number.parseInt(stepText, 10) < 1) {
      return { ok: false, error: `${LABEL[spec.key]} 필드의 간격 "${stepText}" 은 1 이상이어야 합니다.` };
    }
    step = Number.parseInt(stepText, 10);
  }

  if (body === '?') {
    // Spring 실측: `?` 는 일·요일 필드에서만 통하고 나머지에서는 파싱이 실패한다.
    // Quartz 습관으로 월 필드에 `?` 를 쓰면 Spring 은 부팅 때 터지는데, 이 도구가
    // 조용히 받아주면 "잘 돈다" 는 틀린 신호를 준다.
    if (!spec.allowsQuestion) {
      return {
        ok: false,
        error: `? 는 일·요일 필드에서만 쓸 수 있습니다. ${LABEL[spec.key]} 필드에는 * 를 쓰세요.`,
      };
    }
    if (stepText !== undefined) {
      return { ok: false, error: `${LABEL[spec.key]} 필드의 "?" 에는 간격을 붙일 수 없습니다.` };
    }
  }

  const isWildcardBody = body === '*' || body === '?';
  let start: number;
  let end: number;

  if (isWildcardBody) {
    start = spec.wildcardMin;
    end = spec.max;
  } else if (body.includes('-')) {
    const [fromText, toText, ...rest] = body.split('-');
    if (rest.length > 0 || fromText === undefined || toText === undefined) {
      return { ok: false, error: `${LABEL[spec.key]} 필드의 범위 "${body}" 를 읽을 수 없습니다.` };
    }
    const from = parseValue(fromText, spec);
    if (!from.ok) return from;
    const to = parseValue(toText, spec);
    if (!to.ok) return to;
    // Spring 실측: 요일 범위의 **시작이 7이면 0으로 낮춘다**. 그래서 `7-0` 은
    // 일요일 하나이고 `7-7` 은 0-7, 곧 매일이 된다. 이 규칙이 없으면 `SAT-SUN`
    // (=6-7) 같은 멀쩡한 표현식과 `7-7` 의 해석이 둘 다 어긋난다.
    start = spec.key === 'dow' && from.value === 7 ? 0 : from.value;
    end = to.value;
    if (start > end) {
      return {
        ok: false,
        error: `${LABEL[spec.key]} 필드의 범위 "${body}" 가 거꾸로입니다. 시작이 끝보다 큽니다.`,
      };
    }
  } else {
    const single = parseValue(body, spec);
    if (!single.ok) return single;
    start = single.value;
    // `a/n` 은 a 부터 필드 최대값까지 n 간격이다. 스텝이 없으면 값 하나다.
    end = stepText === undefined ? single.value : spec.max;
  }

  const values: number[] = [];
  for (let v = start; v <= end; v += step) values.push(fold(v, spec));

  let description: string;
  if (stepText !== undefined) {
    if (spec.key === 'dow') {
      // 요일에 숫자를 그대로 노출하면 "1~5요일 사이 2요일마다" 같은 문장이 된다.
      description = `${values.map((v) => DOW_KO[v] ?? String(v)).join(', ')}요일`;
    } else if (isWildcardBody) description = `${step}${unitOf(spec.key)}마다`;
    else if (body.includes('-')) description = `${start}~${end}${unitOf(spec.key)} 사이 ${step}${unitOf(spec.key)}마다`;
    else description = `${start}${unitOf(spec.key)}부터 ${step}${unitOf(spec.key)}마다`;
  } else if (isWildcardBody) {
    description = everyOf(spec.key);
  } else if (body.includes('-')) {
    description =
      spec.key === 'dow'
        ? `${DOW_KO[fold(start, spec)] ?? start}~${DOW_KO[fold(end, spec)] ?? end}요일`
        : `${start}~${end}${unitOf(spec.key)}`;
  } else {
    description = describeSingle(fold(start, spec), spec.key);
  }

  return { ok: true, value: { values, description, wildcard: isWildcardBody && stepText === undefined } };
}

function parseField(raw: string, spec: FieldSpec): ToolResult<CronField> {
  const terms = raw.split(',');
  const collected = new Set<number>();
  const descriptions: string[] = [];
  let allWildcard = true;

  for (const term of terms) {
    const result = parseTerm(term, spec);
    if (!result.ok) return result;
    for (const v of result.value.values) collected.add(v);
    descriptions.push(result.value.description);
    if (!result.value.wildcard) allWildcard = false;
  }

  return {
    ok: true,
    value: {
      key: spec.key,
      label: LABEL[spec.key],
      raw,
      values: [...collected].sort((a, b) => a - b),
      restricted: !allWildcard,
      starPrefixed: raw.startsWith('*') || raw === '?',
      description: descriptions.join(', '),
    },
  };
}

function listText(values: number[], unit: string): string {
  return `${values.join(', ')}${unit}`;
}

function dowText(values: number[]): string {
  return `${values.map((v) => DOW_KO[v] ?? String(v)).join(', ')}요일`;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function buildSummary(
  dialect: CronDialect,
  byKey: Record<FieldKey, CronField | undefined>,
  secondValues: number[],
): string {
  const month = byKey.month;
  const dom = byKey.dom;
  const dow = byKey.dow;
  const hour = byKey.hour;
  const minute = byKey.minute;

  /*
   * "어느 날인가" 를 월과 독립적으로 먼저 만든다. 예전에는 월이 지정되는 순간
   * dom 만 보고 dow 를 else-if 로 밀어내서, `0 0 12 1 1 MON` 의 요약이
   * "매년 1월 1일" 이 됐다 — 이 도구가 막으려던 AND 함정 위에서 요약문 자체가
   * 요일 조건을 통째로 버렸다. 실행 목록은 AND 로 맞게 나오는데 요약만 틀려서
   * 화면 안에서 자기모순이었다.
   */
  const domOn = dom?.restricted === true;
  const dowOn = dow?.restricted === true;

  let whichDays: string;
  if (domOn && dowOn) {
    whichDays =
      dialect === 'spring6'
        ? `${listText(dom.values, '일')}이면서 ${dowText(dow.values)}인 날`
        : `${listText(dom.values, '일')} 또는 ${dowText(dow.values)}`;
  } else if (domOn) {
    whichDays = listText(dom.values, '일');
  } else if (dowOn) {
    whichDays = dowText(dow.values);
  } else {
    whichDays = '매일';
  }

  let dayPart: string;
  if (month?.restricted === true) dayPart = `매년 ${listText(month.values, '월')} ${whichDays}`;
  else if (domOn) dayPart = `매월 ${whichDays}`;
  else if (dowOn) dayPart = `매주 ${whichDays}`;
  else dayPart = '매일';

  // 초·분·시가 각각 값 하나뿐이면 사람이 읽는 시각 하나로 뭉친다. 하나라도
  // 여럿이면 뭉치지 않는다 — "매일 09:05:00" 과 "5분마다" 는 전혀 다른 소식이다.
  const single =
    secondValues.length === 1 && minute?.values.length === 1 && hour?.values.length === 1;
  if (single) {
    return `${dayPart} ${pad(hour.values[0] as number)}:${pad(minute.values[0] as number)}:${pad(secondValues[0] as number)}`;
  }

  const secondText = byKey.second?.description ?? '0초';
  return `${dayPart} ${hour?.description ?? ''} ${minute?.description ?? ''} ${secondText}`.replace(/\s+/g, ' ').trim();
}

export function parseCron(input: string): ToolResult<CronOutcome> {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, value: { kind: 'empty' } };

  const parts = trimmed.split(/\s+/);
  if (parts.length === 7) {
    return { ok: false, error: '필드가 7개입니다. Quartz 의 연도 필드는 지원하지 않습니다.' };
  }
  if (parts.length !== 5 && parts.length !== 6) {
    return {
      ok: false,
      error: `필드가 ${parts.length}개입니다. 표준 crontab 은 5개, Spring 은 6개입니다.`,
    };
  }

  const dialect: CronDialect = parts.length === 6 ? 'spring6' : 'crontab5';
  const keys: FieldKey[] =
    dialect === 'spring6'
      ? ['second', 'minute', 'hour', 'dom', 'month', 'dow']
      : ['minute', 'hour', 'dom', 'month', 'dow'];

  const fields: CronField[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as FieldKey;
    const result = parseField(parts[i] as string, SPEC[key]);
    if (!result.ok) return result;
    fields.push(result.value);
  }

  const byKey = Object.fromEntries(fields.map((f) => [f.key, f])) as Record<
    FieldKey,
    CronField | undefined
  >;
  // 5필드에는 초 필드가 없다. 매분 0초에 돈다.
  const secondValues = byKey.second?.values ?? [0];

  const domRestricted = byKey.dom?.restricted === true;
  const dowRestricted = byKey.dow?.restricted === true;
  const dayRuleAmbiguous =
    byKey.dom?.starPrefixed === false && byKey.dow?.starPrefixed === false;

  const warnings: CronWarning[] = [];
  if (dayRuleAmbiguous) {
    warnings.push({
      severity: 'danger',
      message:
        dialect === 'spring6'
          ? '일과 요일이 둘 다 지정됐습니다. Spring(6필드)은 둘 다 맞는 날에만 실행하고, 표준 crontab(5필드)은 둘 중 하나만 맞아도 실행합니다. 여기서는 Spring 규칙으로 계산했습니다.'
          : '일과 요일이 둘 다 지정됐습니다. 표준 crontab(5필드)은 둘 중 하나만 맞아도 실행하고, Spring(6필드)은 둘 다 맞아야 실행합니다. 여기서는 표준 crontab 규칙으로 계산했습니다.',
    });
  }

  return {
    ok: true,
    value: {
      kind: 'parsed',
      dialect,
      fields,
      secondValues,
      minuteValues: byKey.minute?.values ?? [],
      hourValues: byKey.hour?.values ?? [],
      domValues: byKey.dom?.values ?? [],
      monthValues: byKey.month?.values ?? [],
      dowValues: byKey.dow?.values ?? [],
      domRestricted,
      dowRestricted,
      dayRuleAmbiguous,
      summary: buildSummary(dialect, byKey, secondValues),
      warnings,
    },
  };
}

/*
 * 하루씩 넘기며 날짜가 맞는 날을 찾고, 그 날의 시각 후보를 훑는다. 초 단위로
 * 훑지 않으므로 드물게 도는 표현식(2월 29일 등)도 빠르다.
 *
 * 상한은 "전체 탐색 일수" 가 아니라 **직전 결과 이후 벌어진 간격**이다. 전체
 * 일수로 잡으면 결과를 N 개 달라고 할 때 뒤쪽이 잘린다 — `0 0 0 29 2 *` 의
 * 세 번째 결과(2036-02-29)가 상한 밖으로 밀려나 두 개만 나왔다.
 *
 * 간격을 45년으로 잡은 근거는 실측이다. 처음엔 "2월 29일 간격이 최대 8년" 이라는
 * 계산으로 9년을 뒀는데, 그건 **일과 월만 제한된 경우**의 값이었다. Spring 의
 * AND 규칙에서 일·월·요일이 함께 제한되면 간격이 훨씬 벌어진다 — 1900~2400년
 * 구간의 모든 (월, 일, 요일) 조합을 훑어 최악 간격을 재보니 **40년**이었다
 * (2월 29일이면서 특정 요일인 날: 2072 다음은 2112년이다). 9년 상한에서는
 * `0 0 9 1 1 MON` 같은 멀쩡한 표현식이 "실행되지 않습니다" 로 나왔다.
 * Spring 실물은 같은 표현식에 2103-01-01 을 정확히 답한다.
 */
const MAX_GAP_DAYS = 366 * 45;

/** 탐색 지평을 사람에게 말할 때 쓰는 연 수 */
export const SEARCH_HORIZON_YEARS = 45;

export interface NextRunsResult {
  runs: number[];
  /**
   * 날짜 조합 자체가 존재할 수 없어 영원히 실행되지 않는다(2월 30일 등).
   * "지평 안에서 못 찾았다" 와는 전혀 다른 소식이라 따로 둔다 — 예전에는 둘을
   * 하나로 뭉쳐서, 실제로는 도는 배치에 "2월 30일 같은 겁니다" 라고 답했다.
   */
  impossible: boolean;
  /** 지평 안에서 요청한 개수를 다 찾지 못했다 */
  truncated: boolean;
}

/** 그 (월, 일) 조합이 달력에 존재할 수 있는가. 2월 29일은 윤년에 존재한다. */
function everPossible(monthValues: number[], domValues: number[]): boolean {
  for (const month of monthValues) {
    const maxDay = month === 2 ? 29 : month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
    if (domValues.some((day) => day <= maxDay)) return true;
  }
  return false;
}

export function nextRuns(
  parsed: CronParsedValue,
  fromMillis: number,
  count: number,
): NextRunsResult {
  const out: number[] = [];
  if (count <= 0) return { runs: out, impossible: false, truncated: false };

  // 달력에 없는 날짜(2월 30일 등)는 훑기 전에 가려낸다. 지평까지 다 훑고 나서
  // "못 찾았다" 고 말하면, 정말 안 도는 것과 아직 멀었을 뿐인 것이 구분되지 않는다.
  if (!everPossible(parsed.monthValues, parsed.domValues)) {
    return { runs: out, impossible: true, truncated: false };
  }

  const monthSet = new Set(parsed.monthValues);
  const domSet = new Set(parsed.domValues);
  const dowSet = new Set(parsed.dowValues);
  const orSemantics = parsed.dialect === 'crontab5' && parsed.dayRuleAmbiguous;

  // 기준 시각이 속한 KST 날짜의 자정을 UTC 로 고정한 앵커. KST 는 서머타임이
  // 없으므로 여기에 86400초씩 더하는 것이 정확하다.
  const kstNow = new Date(fromMillis + KST_OFFSET_MS);
  const anchor = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());

  let daysSinceHit = 0;
  for (let dayIndex = 0; daysSinceHit <= MAX_GAP_DAYS; dayIndex++) {
    const day = new Date(anchor + dayIndex * 86400_000);
    const month = day.getUTCMonth() + 1;
    const domOk = domSet.has(day.getUTCDate());
    const dowOk = dowSet.has(day.getUTCDay());
    const dayOk = monthSet.has(month) && (orSemantics ? domOk || dowOk : domOk && dowOk);
    if (!dayOk) {
      daysSinceHit++;
      continue;
    }

    const year = day.getUTCFullYear();
    const date = day.getUTCDate();
    let pushedToday = false;
    for (const hour of parsed.hourValues) {
      for (const minute of parsed.minuteValues) {
        for (const second of parsed.secondValues) {
          const at = Date.UTC(year, month - 1, date, hour, minute, second) - KST_OFFSET_MS;
          // 기준 시각과 같은 순간은 내놓지 않는다. "다음" 실행이다.
          if (at <= fromMillis) continue;
          out.push(at);
          pushedToday = true;
          if (out.length >= count) return { runs: out, impossible: false, truncated: false };
        }
      }
    }
    // 날짜는 맞았지만 시각이 전부 기준 이전이면(첫날에만 생긴다) 아직 못 찾은 것이다.
    daysSinceHit = pushedToday ? 0 : daysSinceHit + 1;
  }

  return { runs: out, impossible: false, truncated: true };
}

/** epoch ms → 'YYYY-MM-DDTHH:MM:SS' (KST) */
export function formatKst(millis: number): string {
  return formatAt(millis + KST_OFFSET_MS);
}

/** epoch ms → 'YYYY-MM-DDTHH:MM:SS' (UTC) */
export function formatUtc(millis: number): string {
  return formatAt(millis);
}

function formatAt(shifted: number): string {
  const d = new Date(shifted);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}
