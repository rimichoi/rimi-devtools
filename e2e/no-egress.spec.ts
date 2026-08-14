import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
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
  // icon.svg 의 xmlns 선언. SVG 문서라면 어디든 들어가는 고정 네임스페이스
  // URI 문자열이지, 실제로 요청되는 주소가 아니다.
  'http://www.w3.org/2000/svg',
  // rolldown 빌드 런타임 헬퍼가 특정 에러 상황에서 안내하는 문서 링크.
  'https://rolldown.rs/',
  // workbox 런타임(workbox-*.js) 자체가 개발자에게 남기는 console.warn 문구에
  // 박힌 문서 링크("Learn more at https://bit.ly/wb-precache"). fetch 되는
  // 주소가 아니라 사람이 읽는 경고 메시지의 일부다.
  'https://bit.ly/wb-precache',
];

function findUnexpectedExternalUrls(content: string): string[] {
  const matches = content.match(EXTERNAL_URL_PATTERN_GLOBAL) ?? [];
  return matches.filter((url) => !KNOWN_INERT_URL_PREFIXES.some((prefix) => url.startsWith(prefix)));
}

// dist/assets 뿐 아니라 dist 루트도 재귀로 훑는다. service worker(sw.js) 와
// workbox 런타임 청크(workbox-<hash>.js) 는 dist 루트에 생기는데, 이 태스크가
// 새로 만든 파일이자 네트워크에 직접 말을 거는 파일이라 여기가 빠지면 가드가
// 아니다 — workbox.runtimeCaching 에 외부 CDN URL 을 넣는 실수가 그대로 통과해
// 버린다. manifest.webmanifest 도 마찬가지다 — 아이콘 URL 은 문자열이 아니라
// 설치 프롬프트/홈 화면 추가 시 브라우저가 실제로 가져오는 주소다. icon.svg
// 도 파일 내부에 외부 이미지 참조(<image href>)가 섞여 들어올 수 있는 자리라
// 함께 스캔한다(다만 SVG 의 xmlns 네임스페이스 URI 는 예외 목록에서 걸러야
// 한다 — 위 KNOWN_INERT_URL_PREFIXES 참고).
function listScannableFilesRecursively(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listScannableFilesRecursively(fullPath));
    } else if (/\.(js|css|webmanifest|svg)$/.test(entry.name)) {
      result.push(fullPath);
    }
  }
  return result;
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
    } else if (sample.kind === 'file') {
      const fileInput = page.locator('#tool-root input[type="file"]');
      // 텍스트 도구와 같은 이유로, 파일 입력을 못 찾으면 아무것도 올리지 않은
      // 채 통과하는 대신 여기서 바로 실패한다.
      expect(
        await fileInput.count(),
        `${id}: 파일 입력을 선언했지만 input[type="file"] 을 찾지 못했습니다`,
      ).toBeGreaterThan(0);

      await fileInput.first().setInputFiles(sample.path);
      // 처리가 끝나기 전에 판정하면 "아직 요청이 안 나갔을 뿐"인 상태를 무결로
      // 오독한다. 결과가 화면에 나타난 뒤에 요청 목록을 본다.
      await expect(page.locator(sample.settledSelector).first()).toBeVisible();
    }

    await page.waitForTimeout(300);

    expect(external, `외부 요청이 발생했습니다: ${external.join(' | ')}`).toEqual([]);
    expect(cspViolations, `CSP 위반: ${cspViolations.join(' | ')}`).toEqual([]);
  });
}

test('빌드 산출물(index.html, JS/CSS 청크, sw.js, manifest.webmanifest, 아이콘)에 외부 호스트 URL 이 없다', async ({
  request,
}) => {
  // index.html 은 실제로 서빙되는 응답을 확인한다.
  const html = await (await request.get('/')).text();
  expect(html).not.toMatch(EXTERNAL_URL_PATTERN);

  // 하지만 유출 벡터는 대부분 손으로 쓴 20줄짜리 index.html 이 아니라 도구
  // 코드가 번들된 JS 청크, service worker, manifest 쪽에 있다(엔드포인트
  // 상수, CDN 폰트 URL, 외부 아이콘 URL 등). dist/ 를 통째로 재귀로 읽어서
  // 스캔해야 이 테스트의 이름이 실제 검사 범위와 맞는다.
  const assetFiles = listScannableFilesRecursively(DIST_DIR);
  expect(assetFiles.length, 'dist 에 스캔 대상 산출물이 있어야 한다').toBeGreaterThan(0);
  expect(
    assetFiles.some((f) => f.endsWith('sw.js')),
    'dist/sw.js 가 스캔 대상에 포함돼야 한다',
  ).toBe(true);
  expect(
    assetFiles.some((f) => f.endsWith('.webmanifest')),
    'dist/manifest.webmanifest 가 스캔 대상에 포함돼야 한다',
  ).toBe(true);

  const offenders: string[] = [];
  for (const file of assetFiles) {
    const content = readFileSync(file, 'utf8');
    const unexpected = findUnexpectedExternalUrls(content);
    if (unexpected.length > 0) offenders.push(`${relative(DIST_DIR, file)}: ${unexpected.join(', ')}`);
  }
  expect(offenders, `예상치 못한 외부 호스트 URL 이 포함된 산출물: ${offenders.join(' | ')}`).toEqual([]);
});
