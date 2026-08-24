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
  /** `*` 도 `?` 도 아니면 제한된 필드다 */
  restricted: boolean;
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

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

interface FieldSpec {
  key: FieldKey;
  min: number;
  max: number;
  names?: readonly string[];
  /** 이름이 가리키는 첫 값. 월은 JAN=1, 요일은 SUN=0 이다. */
  nameBase?: number;
}

const SPEC: Record<FieldKey, FieldSpec> = {
  second: { key: 'second', min: 0, max: 59 },
  minute: { key: 'minute', min: 0, max: 59 },
  hour: { key: 'hour', min: 0, max: 23 },
  dom: { key: 'dom', min: 1, max: 31 },
  month: { key: 'month', min: 1, max: 12, names: MONTH_NAMES, nameBase: 1 },
  // 요일은 0-7 을 받고 7 을 0 으로 접는다. 실측 확인: Spring 은 0 과 7 을 모두
  // 일요일로 읽는다(vectors.ts 의 `0 0 12 * * 0` 과 `0 0 12 * * 7` 이 같은 값이다).
  dow: { key: 'dow', min: 0, max: 7, names: DOW_NAMES, nameBase: 0 },
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
  if (spec.names === undefined || spec.nameBase === undefined) return null;
  const index = spec.names.indexOf(token.toUpperCase());
  return index === -1 ? null : index + spec.nameBase;
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

  const isWildcardBody = body === '*' || body === '?';
  let start: number;
  let end: number;

  if (isWildcardBody) {
    start = spec.min;
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
    if (from.value > to.value) {
      return {
        ok: false,
        error: `${LABEL[spec.key]} 필드의 범위 "${body}" 가 거꾸로입니다. 시작이 끝보다 큽니다.`,
      };
    }
    start = from.value;
    end = to.value;
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
    if (isWildcardBody) description = `${step}${unitOf(spec.key)}마다`;
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

  let dayPart: string;
  if (month?.restricted === true) {
    const prefix = `매년 ${listText(month.values, '월')}`;
    if (dom?.restricted === true) dayPart = `${prefix} ${listText(dom.values, '일')}`;
    else if (dow?.restricted === true) dayPart = `${prefix} ${dowText(dow.values)}`;
    else dayPart = `${prefix} 매일`;
  } else if (dom?.restricted === true && dow?.restricted === true) {
    dayPart =
      dialect === 'spring6'
        ? `매월 ${listText(dom.values, '일')}이면서 ${dowText(dow.values)}인 날`
        : `매월 ${listText(dom.values, '일')} 또는 매주 ${dowText(dow.values)}`;
  } else if (dom?.restricted === true) {
    dayPart = `매월 ${listText(dom.values, '일')}`;
  } else if (dow?.restricted === true) {
    dayPart = `매주 ${dowText(dow.values)}`;
  } else {
    dayPart = '매일';
  }

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

  const warnings: CronWarning[] = [];
  if (domRestricted && dowRestricted) {
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
      summary: buildSummary(dialect, byKey, secondValues),
      warnings,
    },
  };
}

/*
 * 하루씩 넘기며 날짜가 맞는 날을 찾고, 그 날의 시각 후보를 훑는다. 초 단위로
 * 훑지 않으므로 드물게 도는 표현식(2월 29일 등)도 빠르다.
 *
 * 상한을 둔다 — `0 0 0 30 2 *`(2월 30일)처럼 영원히 오지 않는 표현식이 있고,
 * 그때 무한 루프에 빠지는 대신 빈 목록을 돌려준다.
 *
 * 상한은 "전체 탐색 일수" 가 아니라 **직전 결과 이후 벌어진 간격**이다. 전체
 * 일수로 잡으면 결과를 N 개 달라고 할 때 뒤쪽이 잘린다 — `0 0 0 29 2 *` 의
 * 세 번째 결과(2036-02-29)가 10년 상한 밖으로 밀려나 두 개만 나왔다.
 * 9년으로 잡은 이유는 2월 29일 간격이 최대 8년까지 벌어지기 때문이다
 * (2096 다음 윤년 2월 29일은 2104년이다 — 2100년은 윤년이 아니다).
 */
const MAX_GAP_DAYS = 366 * 9;

export function nextRuns(parsed: CronParsedValue, fromMillis: number, count: number): number[] {
  const out: number[] = [];
  if (count <= 0) return out;

  const monthSet = new Set(parsed.monthValues);
  const domSet = new Set(parsed.domValues);
  const dowSet = new Set(parsed.dowValues);
  const orSemantics =
    parsed.dialect === 'crontab5' && parsed.domRestricted && parsed.dowRestricted;

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
          if (out.length >= count) return out;
        }
      }
    }
    // 날짜는 맞았지만 시각이 전부 기준 이전이면(첫날에만 생긴다) 아직 못 찾은 것이다.
    daysSinceHit = pushedToday ? 0 : daysSinceHit + 1;
  }

  return out;
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
