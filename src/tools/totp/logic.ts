import type { ToolResult } from '../../types';

/*
 * TOTP 설정의 순수 로직. DOM 을 참조하지 않고 현재 시각을 스스로 읽지 않는다.
 *
 * 이 도구가 조용히 틀릴 수 있는 자리는 셋이다.
 *
 * 1. **Base32 디코딩.** 인증 앱 화면의 비밀키는 패딩 없이, 네 글자씩 띄어서,
 *    때로는 소문자로 보인다. 그대로 붙여넣었을 때 안 읽히면 사용자는 자기가
 *    잘못 봤다고 생각한다. 반대로 Base64 를 관대하게 받아주면 엉뚱한 바이트로
 *    엉뚱한 코드를 만들어 낸다.
 * 2. **otpauth URI 의 알고리즘 표기.** 규격은 `SHA1` 이지 `SHA-1` 이 아니다.
 *    WebCrypto 는 반대로 `SHA-1` 을 쓴다. 한쪽 이름을 그대로 흘리면 앱이 파라미터를
 *    무시하고 기본값으로 계산해, 화면의 코드와 앱의 코드가 어긋난다.
 * 3. **라벨의 콜론.** 라벨은 `발급자:계정` 인데 계정 안에 콜론이 들어가면 앱이
 *    경계를 잘못 찾는다. 퍼센트 인코딩으로 막는다.
 *
 * 계산 자체는 RFC 6238 Appendix B 의 공식 벡터 18개가 지킨다(totp.test.ts).
 */

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export type TotpSeverity = 'danger' | 'caution';

export interface TotpWarning {
  severity: TotpSeverity;
  message: string;
}

export interface TotpConfig {
  secret: string;
  issuer: string;
  account: string;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** URI 규격의 이름 ↔ WebCrypto 의 이름. 하이픈 하나가 다르다. */
const URI_ALGORITHM: Record<TotpAlgorithm, string> = {
  'SHA-1': 'SHA1',
  'SHA-256': 'SHA256',
  'SHA-512': 'SHA512',
};
const FROM_URI_ALGORITHM: Record<string, TotpAlgorithm> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA512: 'SHA-512',
};

/**
 * Base32(RFC 4648) → 바이트.
 *
 * 사람이 옮겨 적은 모양을 받아준다: 소문자, 패딩 없음, 네 글자씩 띄어쓰기, 하이픈.
 * 다만 알파벳에 없는 글자는 거절한다 — Base64 를 조용히 받아주면 엉뚱한 비밀키로
 * 그럴듯한 코드를 만들어 낸다.
 */
export function decodeBase32(text: string): ToolResult<Uint8Array> {
  const cleaned = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (cleaned === '') return { ok: true, value: new Uint8Array(0) };

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      return {
        ok: false,
        error: `Base32 에 없는 글자입니다: "${char}". A~Z 와 2~7 만 쓸 수 있습니다(0 · 1 · 8 · 9 는 쓰지 않습니다).`,
      };
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  /*
   * 남은 비트는 마지막 바이트를 채우다 만 자투리라 전부 0 이어야 한다. 0 이 아니면
   * 글자 수가 Base32 로 나올 수 없는 조합이다(예: 8글자 그룹에 1·3·6글자만 남는 경우).
   */
  if (bits >= 5 || (buffer & ((1 << bits) - 1)) !== 0) {
    return { ok: false, error: `Base32 로 읽을 수 없는 길이입니다: ${cleaned.length}글자.` };
  }

  return { ok: true, value: new Uint8Array(bytes) };
}

/** 바이트 → Base32(RFC 4648). 패딩을 붙인다. */
export function encodeBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += '=';

  return out;
}

/** 화면에 보여줄 때 쓰는 정규화된 비밀키(대문자, 패딩 없음) */
function normalizeSecret(secret: string): string {
  return secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

export function buildOtpauthUri(config: TotpConfig): ToolResult<string> {
  const account = config.account.trim();
  if (account === '') return { ok: false, error: '계정 이름을 입력해 주세요.' };

  const secret = normalizeSecret(config.secret);
  if (secret === '') return { ok: false, error: '비밀키를 입력해 주세요.' };

  const decoded = decodeBase32(secret);
  if (!decoded.ok) return decoded;

  const issuer = config.issuer.trim();
  /*
   * 라벨은 `발급자:계정` 이고 콜론이 구분자다. 각 조각을 퍼센트 인코딩해야
   * 계정 안의 콜론이 구분자로 오해받지 않는다. encodeURIComponent 는 콜론도
   * %3A 로 바꾸므로 조각을 따로 인코딩하고 콜론만 날것으로 잇는다.
   */
  const label = issuer === '' ? encodeURIComponent(account) : `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;

  const params = new URLSearchParams();
  params.set('secret', secret);
  if (issuer !== '') params.set('issuer', issuer);
  params.set('algorithm', URI_ALGORITHM[config.algorithm]);
  params.set('digits', String(config.digits));
  params.set('period', String(config.period));

  return { ok: true, value: `otpauth://totp/${label}?${params.toString()}` };
}

export function parseOtpauthUri(text: string): ToolResult<TotpConfig> {
  const trimmed = text.trim();
  if (!trimmed.toLowerCase().startsWith('otpauth://')) {
    return { ok: false, error: 'otpauth:// 로 시작하는 URI 가 아닙니다.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'URI 로 읽을 수 없습니다.' };
  }

  if (url.host.toLowerCase() !== 'totp') {
    return { ok: false, error: `시간 기반(totp)만 지원합니다. 이 URI 는 ${url.host.toLowerCase()} 입니다.` };
  }

  const secretParam = url.searchParams.get('secret');
  if (secretParam === null || secretParam.trim() === '') {
    return { ok: false, error: 'URI 에 secret 이 없습니다.' };
  }
  const decoded = decodeBase32(secretParam);
  if (!decoded.ok) return decoded;

  // pathname 은 '/발급자:계정' 이다. URL 이 이미 퍼센트 디코딩하지 않으므로 직접 푼다.
  const rawLabel = url.pathname.replace(/^\//, '');
  const separator = rawLabel.indexOf(':');
  let issuer = '';
  let account: string;
  try {
    if (separator === -1) {
      account = decodeURIComponent(rawLabel);
    } else {
      issuer = decodeURIComponent(rawLabel.slice(0, separator));
      account = decodeURIComponent(rawLabel.slice(separator + 1));
    }
  } catch {
    return { ok: false, error: '라벨의 퍼센트 인코딩을 풀 수 없습니다.' };
  }

  // 쿼리의 issuer 가 라벨보다 정확하다. 라벨은 앱마다 다르게 쓰인 이력이 있다.
  const issuerParam = url.searchParams.get('issuer');
  if (issuerParam !== null && issuerParam !== '') issuer = issuerParam;

  const algorithmParam = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '');
  const algorithm = FROM_URI_ALGORITHM[algorithmParam];
  if (algorithm === undefined) {
    return { ok: false, error: `지원하지 않는 algorithm 입니다: ${algorithmParam}` };
  }

  const digits = Number.parseInt(url.searchParams.get('digits') ?? '6', 10);
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) {
    return { ok: false, error: `digits 는 6~10 이어야 합니다: ${url.searchParams.get('digits') ?? ''}` };
  }

  const period = Number.parseInt(url.searchParams.get('period') ?? '30', 10);
  if (!Number.isInteger(period) || period < 1 || period > 600) {
    return { ok: false, error: `period 는 1~600 초여야 합니다: ${url.searchParams.get('period') ?? ''}` };
  }

  return {
    ok: true,
    value: { secret: normalizeSecret(secretParam), issuer, account, algorithm, digits, period },
  };
}

export function configWarnings(config: TotpConfig): TotpWarning[] {
  const warnings: TotpWarning[] = [];

  /*
   * 이 셋은 "설정은 저장됐는데 코드가 안 맞는다" 의 압도적인 원인이다. Google
   * Authenticator 는 URI 의 algorithm · digits · period 를 무시하고 SHA-1 · 6자리 ·
   * 30초로 계산한다. 조용히 두면 사용자는 비밀키를 의심하며 시간을 버린다.
   */
  if (config.algorithm !== 'SHA-1') {
    warnings.push({
      severity: 'caution',
      message:
        'Google Authenticator 를 비롯한 여러 앱은 algorithm 을 무시하고 SHA-1 로 계산합니다. 코드가 맞지 않으면 이것부터 의심하세요.',
    });
  }
  if (config.digits !== 6) {
    warnings.push({
      severity: 'caution',
      message: 'Google Authenticator 를 비롯한 여러 앱은 digits 를 무시하고 6자리로 계산합니다.',
    });
  }
  if (config.period !== 30) {
    warnings.push({
      severity: 'caution',
      message: 'Google Authenticator 를 비롯한 여러 앱은 period 를 무시하고 30초로 계산합니다.',
    });
  }

  const decoded = decodeBase32(config.secret);
  if (decoded.ok && decoded.value.length > 0 && decoded.value.length < 16) {
    warnings.push({
      severity: 'caution',
      message: `비밀키가 ${decoded.value.length}바이트입니다. RFC 4226 은 16바이트 이상을 권합니다.`,
    });
  }

  return warnings;
}
