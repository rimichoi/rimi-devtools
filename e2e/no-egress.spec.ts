import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TOOL_IDS, sampleFor } from './tools';

const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
// localhost 자체는 허용하지만 'localhost.evil.com' 처럼 접두어로만 흉내 낸
// 호스트는 걸러야 하므로, localhost 뒤에 포트/경로/문자열 끝만 오는 경우로 한정한다.
const EXTERNAL_URL_PATTERN = /https?:\/\/(?!localhost(?=[:/]|$))/;
const EXTERNAL_URL_PATTERN_GLOBAL = /https?:\/\/(?!localhost(?=[:/]|$))\S+/g;

// dist/assets 스캔에서만 쓰는 예외 목록이다. 실제로 네트워크 요청에 쓰이는
// 게 아니라 서드파티 라이브러리 내부에 박힌, 절대 fetch/XHR 되지 않는
// 문자열이라는 걸 소스를 직접 읽어 확인한 것만 올린다. 접두어 하나하나를
// 검증 없이 통째로 정당화하지 않도록 각 항목에 근거를 남긴다.
const KNOWN_INERT_URL_PREFIXES = [
  // exifr 의 XMP 파서가 쓰는 XML 네임스페이스 식별자 상수다. XMP 스펙이
  // 고정한 문자열일 뿐, 실제로 이 주소로 요청을 보내는 코드가 아니다.
  'http://ns.adobe.com/',
  // exifr 라이브러리 자체의 GitHub 저장소 링크 — 에러 메시지/주석에 등장.
  'https://github.com/MikeKovarik/exifr',
  // rolldown 빌드 런타임 헬퍼가 특정 에러 상황에서 안내하는 문서 링크.
  'https://rolldown.rs/',
];

function findUnexpectedExternalUrls(content: string): string[] {
  const matches = content.match(EXTERNAL_URL_PATTERN_GLOBAL) ?? [];
  return matches.filter((url) => !KNOWN_INERT_URL_PREFIXES.some((prefix) => url.startsWith(prefix)));
}

const BASE = 'http://localhost:4173';
const BASE_ORIGIN = new URL(BASE).origin;

// textarea(읽기 전용 제외)뿐 아니라 type 이 생략된 input, text/search/number input 까지 잡는다.
const TEXT_FIELD_SELECTOR =
  '#tool-root textarea:not([readonly]), #tool-root input:not([readonly]):is([type="text"], [type="search"], [type="number"], :not([type]))';

for (const id of TOOL_IDS) {
  test(`${id}: 외부로 나가는 요청과 CSP 위반이 없다`, async ({ page }) => {
    const external: string[] = [];
    const cspViolations: string[] = [];

    page.on('request', (req) => {
      let origin: string;
      try {
        origin = new URL(req.url()).origin;
      } catch {
        origin = req.url();
      }
      if (origin !== BASE_ORIGIN && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
        external.push(`${req.method()} ${req.url()}`);
      }
    });
    page.on('console', (msg) => {
      if (/Content Security Policy|Refused to/i.test(msg.text())) cspViolations.push(msg.text());
    });

    await page.goto(`/#/${id}`);
    // tool.load() 는 동적 import 라 #tool-root 가 비동기로 채워진다. 이 대기가
    // auto-retry 되므로, 아래에서 입력 필드를 찾기 전에 mount 경합을 닫아둔다.
    await expect(page.locator('#tool-root')).not.toBeEmpty();

    const sample = sampleFor(id);
    if (sample.kind === 'text') {
      const fields = page.locator(TEXT_FIELD_SELECTOR);
      const count = await fields.count();
      // 텍스트 입력이 있다고 선언한 도구인데 필드를 못 찾으면, 아무것도 타이핑하지
      // 않은 채 통과하는 대신 여기서 바로 실패한다.
      expect(count, `${id}: 텍스트 입력을 선언했지만 입력 필드를 찾지 못했습니다`).toBeGreaterThan(0);

      for (let i = 0; i < sample.values.length && i < count; i++) {
        const value = sample.values[i];
        if (value === undefined) continue;
        await fields.nth(i).fill(value);
      }
    }

    await page.waitForTimeout(300);

    expect(external, `외부 요청이 발생했습니다: ${external.join(' | ')}`).toEqual([]);
    expect(cspViolations, `CSP 위반: ${cspViolations.join(' | ')}`).toEqual([]);
  });
}

test('빌드 산출물(index.html + JS/CSS 청크 전체)에 외부 호스트 URL 이 없다', async ({ request }) => {
  // index.html 은 실제로 서빙되는 응답을 확인한다.
  const html = await (await request.get('/')).text();
  expect(html).not.toMatch(EXTERNAL_URL_PATTERN);

  // 하지만 유출 벡터는 대부분 손으로 쓴 20줄짜리 index.html 이 아니라 도구
  // 코드가 번들된 JS 청크 쪽에 있다(엔드포인트 상수, CDN 폰트 URL 등). dist/
  // 의 모든 JS/CSS 산출물을 직접 읽어서 스캔해야 이 테스트의 이름이 실제
  // 검사 범위와 맞는다.
  const assetsDir = join(DIST_DIR, 'assets');
  const assetFiles = readdirSync(assetsDir).filter((f) => /\.(js|css)$/.test(f));
  expect(assetFiles.length, 'dist/assets 에 JS/CSS 산출물이 있어야 한다').toBeGreaterThan(0);

  const offenders: string[] = [];
  for (const file of assetFiles) {
    const content = readFileSync(join(assetsDir, file), 'utf8');
    const unexpected = findUnexpectedExternalUrls(content);
    if (unexpected.length > 0) offenders.push(`${file}: ${unexpected.join(', ')}`);
  }
  expect(offenders, `예상치 못한 외부 호스트 URL 이 포함된 산출물: ${offenders.join(' | ')}`).toEqual([]);
});
