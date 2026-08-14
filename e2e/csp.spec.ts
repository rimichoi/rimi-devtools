import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// CSP 는 README 가 "데이터가 나가지 않는다"의 첫 번째 근거로 내미는 항목인데,
// 이 스펙이 생기기 전까지는 프로젝트 어디에도 CSP 를 읽는 단언이 없었다.
// meta CSP 를 통째로 지워도 전체 스위트가 초록색이었다 — 즉 기여자가 인라인
// 스타일을 넣다가 CSP 를 느슨하게 "고쳐" 버려도 아무도 알아채지 못했다.
//
// CSP 는 두 곳에 있다:
//   1. index.html 의 meta 태그 — 어디에 배포하든 항상 적용된다.
//   2. public/_headers — Netlify 전용 규약. 배포됐을 때만 응답 헤더가 된다.
//      (vite preview 는 이 파일을 헤더로 해석하지 않고 평범한 텍스트 파일로
//      서빙한다. 그래서 배포 없이 검증 가능한 최대치는 "파일 내용이 맞는가"다.)
// 둘이 갈라지는 것 자체가 결함이므로 일치까지 검사한다.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_HEADERS_PATH = join(ROOT, 'public', '_headers');
const DIST_HEADERS_PATH = join(ROOT, 'dist', '_headers');

/** meta 와 _headers 양쪽이 반드시, 정확히 이 값으로 담고 있어야 하는 directive. */
const REQUIRED_DIRECTIVES: Record<string, string> = {
  // 아래에서 개별로 지정하지 않은 모든 fetch 종류의 기본값을 self 로 묶는다.
  'default-src': "'self'",
  'script-src': "'self'",
  // 이 프로젝트의 핵심 약속. 외부 도메인으로 향하는 fetch/XHR/WebSocket 을 막는다.
  'connect-src': "'self'",
  // EXIF 도구가 만드는 blob: 미리보기와 data: URI 는 허용해야 한다.
  'img-src': "'self' data: blob:",
  'object-src': "'none'",
  'base-uri': "'none'",
  // 폼 제출을 통한 데이터 유출 우회를 막는다.
  'form-action': "'none'",
};

/**
 * meta 태그에서는 스펙상 무시되므로 배포 헤더에서만 유효한 directive.
 * meta 와 _headers 를 비교할 때 이 목록만 예외로 뺀다.
 */
const HEADERS_ONLY_DIRECTIVES: Record<string, string> = {
  'frame-ancestors': "'none'",
};

/** 어느 쪽에도 절대 들어가면 안 되는 토큰. */
const FORBIDDEN_TOKENS = ["'unsafe-inline'", "'unsafe-eval'"];

function parseCsp(policy: string): Map<string, string> {
  const directives = new Map<string, string>();
  for (const part of policy.split(';')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const [name, ...values] = trimmed.split(/\s+/);
    if (name === undefined) continue;
    directives.set(name.toLowerCase(), values.join(' '));
  }
  return directives;
}

function extractMetaCsp(html: string): string {
  const tag = /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(html)?.[0];
  if (tag === undefined) throw new Error('빌드된 index.html 에 CSP meta 태그가 없습니다.');
  // CSP 값 자체가 작은따옴표('self')를 품고 있으므로, 속성을 감싼 따옴표를
  // 역참조로 고정해 그 짝까지만 최소 매칭한다.
  const content = /content=(["'])([\s\S]*?)\1/i.exec(tag)?.[2];
  if (content === undefined) throw new Error('CSP meta 태그에 content 속성이 없습니다.');
  return content;
}

function extractHeaderCsp(headersFile: string, path: string): string {
  const line = headersFile
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^content-security-policy:/i.test(l));
  if (line === undefined) throw new Error(`${path} 에 Content-Security-Policy 줄이 없습니다.`);
  return line.replace(/^content-security-policy:/i, '').trim();
}

/** 소스가 아니라 실제로 서빙되는 빌드 산출물의 meta CSP 를 읽는다. */
async function fetchMetaCsp(request: APIRequestContext): Promise<string> {
  const html = await (await request.get('/')).text();
  return extractMetaCsp(html);
}

test('빌드된 index.html 의 meta CSP 가 필수 directive 를 값까지 그대로 담고 있다', async ({ request }) => {
  const policy = await fetchMetaCsp(request);
  const directives = parseCsp(policy);

  for (const [name, expected] of Object.entries(REQUIRED_DIRECTIVES)) {
    expect(directives.get(name), `meta CSP 의 ${name} directive (전체 정책: ${policy})`).toBe(expected);
  }

  for (const token of FORBIDDEN_TOKENS) {
    expect(policy, `meta CSP 에 ${token} 이 들어가서는 안 됩니다`).not.toContain(token);
  }
});

test('public/_headers 의 CSP 가 필수 directive 와 frame-ancestors 를 값까지 그대로 담고 있다', () => {
  const policy = extractHeaderCsp(readFileSync(PUBLIC_HEADERS_PATH, 'utf8'), 'public/_headers');
  const directives = parseCsp(policy);

  for (const [name, expected] of Object.entries({ ...REQUIRED_DIRECTIVES, ...HEADERS_ONLY_DIRECTIVES })) {
    expect(directives.get(name), `public/_headers CSP 의 ${name} directive (전체 정책: ${policy})`).toBe(expected);
  }

  for (const token of FORBIDDEN_TOKENS) {
    expect(policy, `public/_headers CSP 에 ${token} 이 들어가서는 안 됩니다`).not.toContain(token);
  }
});

test('meta CSP 와 public/_headers 의 CSP 가 어긋나지 않는다', async ({ request }) => {
  const metaDirectives = parseCsp(await fetchMetaCsp(request));

  const headerDirectives = parseCsp(
    extractHeaderCsp(readFileSync(PUBLIC_HEADERS_PATH, 'utf8'), 'public/_headers'),
  );
  // meta 에서 무시되는 directive 만 빼면 두 정책은 완전히 같아야 한다. 한쪽만
  // 고치는 순간(예: meta 만 느슨하게) 여기서 걸린다.
  for (const name of Object.keys(HEADERS_ONLY_DIRECTIVES)) headerDirectives.delete(name);

  expect(Object.fromEntries(metaDirectives), 'meta CSP 와 _headers CSP 가 다릅니다').toEqual(
    Object.fromEntries(headerDirectives),
  );
});

test('public/_headers 가 빌드 산출물(dist)에 그대로 복사된다', () => {
  // _headers 가 public/ 밖에 있으면 Netlify 에 아예 배포되지 않는다.
  // 배포 헤더 경로가 실제로 산출물에 실린다는 것까지가 검증 가능한 최대치다.
  const source = readFileSync(PUBLIC_HEADERS_PATH, 'utf8');
  const built = readFileSync(DIST_HEADERS_PATH, 'utf8');
  expect(built, 'dist/_headers 가 public/_headers 와 다릅니다').toBe(source);
});
