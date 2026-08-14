import { test, expect, type Page } from '@playwright/test';

// main.ts 에서 도구가 실패하는 방식은 두 가지이고, 사용자가 해야 할 일이
// 정반대다 — 청크를 못 받은 것(새로고침이 실제로 해결)과 도구가 그리다 터진
// 것(새로고침해도 그대로)이다. 한때 이 둘을 catch 하나가 함께 덮으면서
// 아무것도 로그하지 않았고, Intl.Segmenter 가 없는 브라우저(Firefox 125 미만)의
// 글자수 세기 사용자는 빈 화면 + "새로고침해 주세요" 를 영원히 받으면서
// 콘솔에는 단서가 0건이었다.
//
// 두 분기를 실제로 태우기 위해 프로덕션 소스에 훅을 넣을 필요는 없다. 도구
// 청크의 HTTP 응답 자체를 갈아끼우면 된다 — registry 의 load 가
// import('./tools/base64/index').then(m => m.default) 이므로, 그 URL 에
// default export 를 가진 스텁 모듈을 응답하면 mount 가 실제 catch 분기를 탄다.
// 글로브에 해시가 아니라 base64-* 를 쓰므로 청크 해시가 바뀌어도 따라온다.

// service worker 가 precache 에서 청크를 내주면 page.route 가 가로챌 기회
// 자체가 사라진다. 이 스펙은 응답을 갈아끼우는 것이 전부이므로 SW 를 막아
// 결과를 결정론적으로 만든다(이 스펙은 SW 동작을 검증하지 않는다 —
// 그건 pwa.spec.ts / pwa-multitab.spec.ts 의 일이다).
test.use({ serviceWorkers: 'block' });

const CHUNK_GLOB = '**/assets/base64-*.js';
const TOAST = '#toast-root .toast-error';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test('도구 청크를 받지 못하면 새로고침을 안내하고 원인을 콘솔에 남긴다', async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.route(CHUNK_GLOB, (route) => route.abort());
  await page.goto('/#/base64');

  const toast = page.locator(TOAST);
  await expect(toast).toContainText('새 버전이 배포되었습니다');
  // 마운트 실패용 문구가 섞이면 두 경우를 구분하지 못한다는 뜻이다.
  await expect(toast).not.toContainText('새로고침해도 해결되지 않습니다');

  await expect
    .poll(() => errors.some((t) => t.includes('청크를 불러오지 못했습니다')), {
      message: `청크 로드 실패 원인이 콘솔에 남지 않았습니다: ${JSON.stringify(errors)}`,
    })
    .toBe(true);
});

test('도구가 그리다 터지면 새로고침이 소용없다고 안내하고 원인을 콘솔에 남긴다', async ({ page }) => {
  const errors = collectConsoleErrors(page);

  await page.route(CHUNK_GLOB, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `export default { mount() { throw new TypeError('mount boom'); } };`,
    }),
  );
  await page.goto('/#/base64');

  const toast = page.locator(TOAST);
  await expect(toast).toContainText('새로고침해도 해결되지 않습니다');
  // 도구 이름이 들어가야 사용자가 무엇이 실패했는지 안다.
  await expect(toast).toContainText('Base64');
  // 새로고침이 해결한다는 거짓 안내를 하면 안 된다 — 이게 S2 의 핵심이다.
  await expect(toast).not.toContainText('새 버전이 배포되었습니다');

  await expect(page.locator('#tool-root')).toBeEmpty();

  await expect
    .poll(() => errors.some((t) => t.includes('도구를 그리지 못했습니다')), {
      message: `마운트 실패 원인이 콘솔에 남지 않았습니다: ${JSON.stringify(errors)}`,
    })
    .toBe(true);
});
