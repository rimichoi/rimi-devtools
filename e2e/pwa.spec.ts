import { test, expect } from '@playwright/test';
import { TOOL_IDS } from './tools';

// 이 태스크의 핵심 산출물(서비스 워커, precache, 오프라인 동작)을 직접 검증한다.
// workbox 의 maximumFileSizeToCacheInBytes(기본 2MiB) 는 어느 청크가 이 크기를
// 넘기면 빌드 로그 경고 한 줄만 남기고 precache 목록에서 조용히 제외한다 —
// registry.ts 에 도구를 추가/변경했는데 그 청크가 프리캐시에서 빠지는 회귀를
// 여기서 잡아야, 오프라인에서 그 도구만 조용히 죽는 사고를 미리 잡는다.

test('서비스 워커가 등록되고 활성화된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tool-root')).not.toBeEmpty();

  const active = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.scriptURL ?? null;
  });

  expect(active).toBe('http://localhost:4173/sw.js');
});

test('precache 매니페스트가 registry.ts 의 도구 청크를 id 기준으로 전부 포함한다', async ({ request }) => {
  const swText = await (await request.get('/sw.js')).text();

  // 개수(예: "10개")가 아니라 도구별 id 로 대조한다 — 도구가 늘어나도 이
  // 단언이 그대로 따라와야 하고, 특정 도구 하나만 빠지는 경우를 잡아야 한다.
  const missing = TOOL_IDS.filter((id) => !new RegExp(`assets/${id}-[\\w-]+\\.js`).test(swText));

  expect(missing, `precache 매니페스트에서 빠진 도구 청크: ${missing.join(', ')}`).toEqual([]);
});

test('오프라인 상태에서, 온라인 중 방문하지 않은 도구도 마운트된다', async ({ page, context }) => {
  // 온라인으로는 기본 경로(첫 번째 도구)만 연다. 나머지 9개는 이 세션에서
  // 한 번도 온라인으로 열리지 않은 채로 오프라인 전환 후 마운트를 시도한다.
  await page.goto('/');
  await expect(page.locator('#tool-root[data-tool]')).toBeVisible();
  const firstVisited = await page.getAttribute('#tool-root', 'data-tool');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);

  // 오프라인 하드 리로드로 앱 셸이 뜨는지 먼저 확인한다.
  await page.reload();
  await expect(page.locator('#tool-root[data-tool]')).toBeVisible();

  for (const id of TOOL_IDS) {
    if (id === firstVisited) continue;

    await page.evaluate((toolId) => {
      location.hash = `#/${toolId}`;
    }, id);

    await expect(page.locator(`#tool-root[data-tool="${id}"]`)).toBeVisible();
    await expect(page.locator('#tool-root')).not.toBeEmpty();
  }

  await context.setOffline(false);
});
