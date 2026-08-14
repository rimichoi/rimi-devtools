import type { ToolResult } from '../../types';

export interface FormatOptions {
  indent: number | 'tab' | 'minify';
  sortKeys: boolean;
}

/**
 * 문자열 리터럴 내부를 공백으로 치환한다. 길이와 위치는 그대로 둔다.
 * 문자열 안에 든 숫자를 정밀도 검사 대상에서 빼기 위한 전처리다.
 */
export function stripStringLiterals(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    if (escaped) {
      out += ' ';
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ' ';
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += '"';
      inString = false;
      continue;
    }
    out += ' ';
  }

  return out;
}

/** JSON 숫자 문법 전체(정수/소수/지수)를 훑는다. 문자열은 이미 지워진 뒤다. */
const NUMBER_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/**
 * 리터럴이 정수 값으로 귀결되는지 확인하고, 그렇다면 그 정확한 값을 BigInt 로 재구성한다.
 * 소수부가 지수로도 상쇄되지 않고 남으면(=진짜 소수) null 을 돌려준다 — 소수는 검사 대상이 아니다.
 */
function exactIntegerValue(literal: string): bigint | null {
  const m = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  if (!m) return null;

  const sign = m[1] ?? '';
  const mantissa = m[2] + (m[3] ?? '');
  const exp = m[4] ? Number(m[4]) : 0;
  const shift = exp - (m[3]?.length ?? 0);

  if (shift >= 0) return BigInt(sign + mantissa + '0'.repeat(shift));

  // 지수가 소수부보다 덜 밀어내는 경우: 남는 자리가 전부 0 이면 여전히 정수다.
  const dropCount = -shift;
  if (dropCount > mantissa.length) return null;
  const kept = mantissa.slice(0, mantissa.length - dropCount);
  const dropped = mantissa.slice(mantissa.length - dropCount);
  if (!/^0*$/.test(dropped)) return null;

  return BigInt(sign + (kept || '0'));
}

export function findPrecisionLoss(json: string): string[] {
  const masked = stripStringLiterals(json);
  const lost = new Set<string>();

  for (const match of masked.matchAll(NUMBER_RE)) {
    const literal = match[0];
    const exact = exactIntegerValue(literal);
    if (exact === null) continue; // 소수는 검사 대상이 아니다.

    const asNumber = Number(literal);

    if (!Number.isFinite(asNumber)) {
      lost.add(literal);
      continue;
    }
    try {
      if (exact !== BigInt(asNumber)) lost.add(literal);
    } catch {
      lost.add(literal);
    }
  }

  return [...lost];
}

export function describeSyntaxError(json: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const positionMatch = /position (\d+)/.exec(message);

  if (!positionMatch?.[1]) return `JSON 구문 오류: ${message}`;

  const position = Number(positionMatch[1]);
  const before = json.slice(0, position);
  const line = before.split('\n').length;
  const column = position - before.lastIndexOf('\n');

  return `JSON 구문 오류: ${line} 번째 줄 ${column} 번째 칸 부근을 확인하세요.\n${message}`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value === null || typeof value !== 'object') return value;

  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, v]) => [key, sortValue(v)]));
}

export function formatJson(
  text: string,
  options: FormatOptions,
): ToolResult<{ text: string; warning?: string }> {
  if (text.trim() === '') return { ok: false, error: 'JSON 을 입력하세요.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: describeSyntaxError(text, err) };
  }

  const value = options.sortKeys ? sortValue(parsed) : parsed;
  const indent = options.indent === 'minify' ? undefined : options.indent === 'tab' ? '\t' : options.indent;
  const output = JSON.stringify(value, null, indent);

  const lost = findPrecisionLoss(text);
  const warning =
    lost.length > 0
      ? [
          '주의: 아래 숫자는 JavaScript 가 정확히 표현할 수 없어 값이 바뀌었습니다.',
          ...lost.map((literal) => `  ${literal} → ${Number(literal)}`),
          '원본 값이 필요하면 위 목록을 참고하세요. 64비트 정수 ID 에서 자주 발생합니다.',
        ].join('\n')
      : undefined;

  return { ok: true, value: { text: output, ...(warning ? { warning } : {}) } };
}
