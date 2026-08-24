import type { ToolResult } from '../../types';

/*
 * JWT 디코딩의 순수 로직. DOM 을 참조하지 않고, 현재 시각을 스스로 읽지 않는다
 * (`nowSeconds` 를 인자로 받는다) — 그러지 않으면 "만료됨" 을 검사하는 테스트가
 * 시계에 의존해 언젠가 깨지거나, 반대로 아무 때나 통과하는 공허한 테스트가 된다.
 *
 * 모듈 평가 시점에 throw 할 수 있는 코드를 두지 않는다. 이 프로젝트는 top-level
 * `new Intl.Segmenter(...)` 로 청크 평가가 실패해 도구 화면 대신 엉뚱한 토스트가
 * 뜨는 사고를 냈다. Intl 객체는 전부 함수 안에서 만든다.
 */

export type JwtSeverity = 'danger' | 'caution';

export interface JwtWarning {
  severity: JwtSeverity;
  message: string;
}

export type TimeClaim = 'exp' | 'iat' | 'nbf';

export interface JwtTimeRow {
  claim: TimeClaim;
  label: string;
  value: string;
}

export interface JwtDecoded {
  kind: 'decoded';
  /** 헤더의 alg. 문자열이 아니거나 없으면 null */
  alg: string | null;
  headerText: string;
  payloadText: string;
  payloadIsJson: boolean;
  /** 페이로드가 JSON 이 아닐 때만 채운다 */
  payloadNote?: string;
  /** HMAC 이 서명하는 대상, 곧 `헤더조각.페이로드조각` */
  signingInput: string;
  /** 서명 조각 원문(base64url). 서명 없는 토큰이면 빈 문자열 */
  signature: string;
  /** 서명 조각이 base64url 로 안 풀릴 때만 채운다 */
  signatureError?: string;
  timeRows: JwtTimeRow[];
  warnings: JwtWarning[];
}

export type JwtOutcome = { kind: 'empty' } | { kind: 'jwe' } | JwtDecoded;

/** RFC 7519 NumericDate 는 초 단위다. 이 값을 넘으면 밀리초로 넣었을 가능성을 의심한다. */
const SUSPICIOUS_SECONDS = 1e11;

const CLAIM_LABEL: Record<TimeClaim, string> = {
  exp: 'exp (만료)',
  iat: 'iat (발급)',
  nbf: 'nbf (유효 시작)',
};

const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

/**
 * base64url → 바이트. base64url 은 표준 base64 의 `+`/`/` 를 `-`/`_` 로 바꾸고
 * 패딩 `=` 를 뗀 것이다. 되돌린 뒤 패딩을 채워 넣는다.
 *
 * 표준 base64 문자(`+`, `/`, `=`)가 섞여 있으면 거부한다 — 관대하게 받아주면
 * "표준 base64 로 인코딩된 다른 무언가" 를 JWT 조각으로 잘못 읽는다.
 */
export function base64UrlToBytes(segment: string): ToolResult<Uint8Array> {
  if (!BASE64URL_RE.test(segment)) {
    return { ok: false, error: 'base64url 형식이 아닙니다.' };
  }

  const standard = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return { ok: false, error: 'base64url 형식이 아닙니다.' };
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { ok: true, value: bytes };
}

/** 이 도구가 서명을 검증할 수 있는 알고리즘인가 */
export function isSymmetricAlg(alg: string | null): boolean {
  return alg === 'HS256' || alg === 'HS384' || alg === 'HS512';
}

/**
 * 바이트 → UTF-8 문자열. `fatal: true` 를 반드시 쓴다 — 없으면 깨진 바이트가
 * U+FFFD 로 조용히 통과해서, 토큰이 손상됐는데도 정상인 것처럼 보인다.
 */
function decodeUtf8(bytes: Uint8Array): ToolResult<string> {
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: 'UTF-8 로 읽을 수 없는 바이트가 들어 있습니다.' };
  }
}

function formatIn(seconds: number, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(seconds * 1000));
}

/** 부호 없는 크기만 말한다. "전/뒤" 는 부르는 쪽이 붙인다. */
function formatMagnitude(absSeconds: number): string {
  if (absSeconds < 60) return `${absSeconds}초`;
  if (absSeconds < 3600) return `${Math.floor(absSeconds / 60)}분`;
  if (absSeconds < 86400) return `${Math.floor(absSeconds / 3600)}시간`;
  return `${Math.floor(absSeconds / 86400)}일`;
}

function relativePhrase(claim: TimeClaim, seconds: number, nowSeconds: number): string {
  const delta = seconds - nowSeconds;
  const magnitude = formatMagnitude(Math.abs(delta));
  if (claim === 'exp') {
    return delta < 0 ? `${magnitude} 전에 만료됨` : `${magnitude} 뒤 만료`;
  }
  return delta < 0 ? `${magnitude} 전` : `${magnitude} 뒤`;
}

function timeRowFor(
  claim: TimeClaim,
  raw: unknown,
  nowSeconds: number,
): { row: JwtTimeRow; warnings: JwtWarning[] } {
  const label = CLAIM_LABEL[claim];

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    // 숫자가 아니면 시각으로 해석하지 않는다. 값을 그대로 보여준다.
    return { row: { claim, label, value: `숫자가 아닙니다: ${JSON.stringify(raw)}` }, warnings: [] };
  }

  const warnings: JwtWarning[] = [];
  if (raw > SUSPICIOUS_SECONDS) {
    // 경고만 한다. 해석은 바꾸지 않는다 — 규격이 초라고 정해두었고, 자릿수로
    // 단위를 추정하기 시작하면 사용자가 결과를 믿을 근거가 사라진다.
    warnings.push({
      severity: 'caution',
      message: `${claim} 값이 너무 큽니다 — 초가 아니라 밀리초로 넣은 값일 수 있습니다.`,
    });
  }

  const value = [
    `UTC ${formatIn(raw, 'UTC')}`,
    `KST ${formatIn(raw, 'Asia/Seoul')}`,
    relativePhrase(claim, raw, nowSeconds),
  ].join(' · ');

  return { row: { claim, label, value }, warnings };
}

function decodeSegmentToText(segment: string, what: string): ToolResult<string> {
  const bytes = base64UrlToBytes(segment);
  if (!bytes.ok) return { ok: false, error: `${what}가 base64url 형식이 아닙니다.` };
  const text = decodeUtf8(bytes.value);
  if (!text.ok) return { ok: false, error: `${what}를 UTF-8 로 읽을 수 없습니다.` };
  return text;
}

/**
 * 토큰을 풀어 헤더·페이로드·시간 클레임·경고를 돌려준다.
 *
 * 빈 입력은 오류가 아니다 — 아무것도 하지 않은 화면에 빨간 글씨를 띄우지 않는다.
 */
export function decodeJwt(input: string, nowSeconds: number): ToolResult<JwtOutcome> {
  // HTTP 헤더에서 통째로 복사하는 일이 흔하다.
  const trimmed = input.trim().replace(/^Bearer\s+/i, '');
  if (trimmed === '') return { ok: true, value: { kind: 'empty' } };

  const parts = trimmed.split('.');
  if (parts.length === 5) return { ok: true, value: { kind: 'jwe' } };
  if (parts.length !== 3 && parts.length !== 2) {
    return {
      ok: false,
      error: `JWT 는 점으로 나뉜 조각이 3개여야 합니다. 이 입력은 ${parts.length}개입니다.`,
    };
  }

  const [headerSegment, payloadSegment] = parts as [string, string, ...string[]];
  const signature = parts.length === 3 ? (parts[2] as string) : '';

  const headerText = decodeSegmentToText(headerSegment, '헤더');
  if (!headerText.ok) return headerText;

  let header: unknown;
  try {
    header = JSON.parse(headerText.value);
  } catch {
    return { ok: false, error: '헤더가 JSON 이 아닙니다.' };
  }
  if (header === null || typeof header !== 'object' || Array.isArray(header)) {
    return { ok: false, error: '헤더가 JSON 객체가 아닙니다.' };
  }
  const headerObject = header as Record<string, unknown>;

  const payloadRaw = decodeSegmentToText(payloadSegment, '페이로드');
  if (!payloadRaw.ok) return payloadRaw;

  // 페이로드가 JSON 이 아닌 것은 규격상 가능하다. 오류로 만들지 않는다.
  let payload: Record<string, unknown> | null = null;
  let payloadText = payloadRaw.value;
  let payloadNote: string | undefined;
  try {
    const parsed: unknown = JSON.parse(payloadRaw.value);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
      payloadText = JSON.stringify(parsed, null, 2);
    } else {
      payloadNote = '페이로드가 JSON 이 아닙니다.';
    }
  } catch {
    payloadNote = '페이로드가 JSON 이 아닙니다.';
  }

  const rawAlg = headerObject['alg'];
  const alg = typeof rawAlg === 'string' ? rawAlg : null;

  const warnings: JwtWarning[] = [];
  const timeRows: JwtTimeRow[] = [];

  const isNone = alg !== null && alg.toLowerCase() === 'none';
  if (isNone) {
    warnings.push({
      severity: 'danger',
      message: 'alg 가 none 입니다. 서명이 없어 내용을 누구나 바꿔 넣을 수 있는 토큰입니다.',
    });
  } else if (signature === '' && alg !== null) {
    warnings.push({
      severity: 'danger',
      message: `서명이 비어 있는데 헤더는 ${alg} 로 서명됐다고 말합니다. 서명을 떼어낸 토큰일 수 있습니다.`,
    });
  }

  for (const claim of ['exp', 'iat', 'nbf'] as const) {
    if (payload === null || !(claim in payload)) continue;
    const { row, warnings: claimWarnings } = timeRowFor(claim, payload[claim], nowSeconds);
    timeRows.push(row);
    warnings.push(...claimWarnings);
  }

  if (payload !== null) {
    const exp = payload['exp'];
    if (typeof exp === 'number' && Number.isFinite(exp) && exp < nowSeconds) {
      warnings.push({ severity: 'danger', message: '이미 만료된 토큰입니다.' });
    }
    const nbf = payload['nbf'];
    if (typeof nbf === 'number' && Number.isFinite(nbf) && nbf > nowSeconds) {
      warnings.push({ severity: 'danger', message: '아직 유효하지 않은 토큰입니다(nbf 가 미래).' });
    }
    if (!('exp' in payload)) {
      warnings.push({ severity: 'caution', message: 'exp 가 없습니다 — 만료되지 않는 토큰입니다.' });
    }
  }

  // 비대칭 서명은 조용히 넘기지 않는다. 검증 칸을 비워두면 사용자가 "아무 말도
  // 없으니 통과했나 보다" 로 읽는다.
  if (alg !== null && /^(RS|ES|PS)/.test(alg)) {
    warnings.push({
      severity: 'caution',
      message: `이 도구는 대칭키(HS256/384/512) 서명만 검증합니다. ${alg} 는 검증하지 않습니다.`,
    });
  }

  let signatureError: string | undefined;
  if (signature !== '' && !base64UrlToBytes(signature).ok) {
    signatureError = '서명 조각이 base64url 형식이 아닙니다.';
  }

  const decodedValue: JwtDecoded = {
    kind: 'decoded',
    alg,
    headerText: JSON.stringify(headerObject, null, 2),
    payloadText,
    payloadIsJson: payload !== null,
    signingInput: `${headerSegment}.${payloadSegment}`,
    signature,
    timeRows,
    warnings,
  };
  if (payloadNote !== undefined) decodedValue.payloadNote = payloadNote;
  if (signatureError !== undefined) decodedValue.signatureError = signatureError;

  return { ok: true, value: decodedValue };
}
