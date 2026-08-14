import { test, expect } from '@playwright/test';
import { TOOL_IDS } from './tools';
import { extractPrecachedJsBasenames, hasChunkForId } from './precacheMatch';

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
  const jsBasenames = extractPrecachedJsBasenames(swText);

  // 개수(예: "10개")가 아니라 도구별 id 로 대조한다 — 도구가 늘어나도 이
  // 단언이 그대로 따라와야 하고, 특정 도구 하나만 빠지는 경우를 잡아야 한다.
  // hasChunkForId 는 "json" 이 "json-diff" 청크로 오인되는 것 같은 접두어
  // 겹침도 가려낸다(아래 별도 테스트로 그 로직 자체를 검증한다).
  const missing = TOOL_IDS.filter((id) => !hasChunkForId(id, TOOL_IDS, jsBasenames));

  expect(missing, `precache 매니페스트에서 빠진 도구 청크: ${missing.join(', ')}`).toEqual([]);
});

test('precache 매칭 로직은 접두어가 겹치는 도구 id 를 혼동하지 않는다', () => {
  // registry.ts 의 실제 id 와 무관하게, "짧은 id 가 더 긴 id 의 접두어"인
  // 상황을 인위적으로 만들어 hasChunkForId 자체를 검증한다. 실제 도구 목록이
  // 이런 쌍을 갖지 않게 되더라도 이 테스트는 그 자체로 로직의 정확성을 보장한다.
  const ids = ['json', 'json-diff'];

  // "json" 청크가 실제로는 없고, "json-diff" 청크만 있는 상황 — 이전 정규식
  // (assets/{id}-[\w-]+\.js)은 "json-diff-HASH.js" 가 "json-" 로 시작한다는
  // 이유로 "json" 이 있다고 오판했다. 더 구체적인 id 가 있으면 그쪽 소유로
  // 봐야 한다.
  const onlyJsonDiffChunk = ['json-diff-Ab12Cd34.js'];
  expect(hasChunkForId('json', ids, onlyJsonDiffChunk)).toBe(false);
  expect(hasChunkForId('json-diff', ids, onlyJsonDiffChunk)).toBe(true);

  // 둘 다 진짜로 존재하면 둘 다 인정돼야 한다.
  const bothChunks = ['json-Ab12Cd34.js', 'json-diff-Ef56Gh78.js'];
  expect(hasChunkForId('json', ids, bothChunks)).toBe(true);
  expect(hasChunkForId('json-diff', ids, bothChunks)).toBe(true);

  // 아예 없으면 둘 다 없어야 한다.
  expect(hasChunkForId('json', ids, ['unrelated-Xy12.js'])).toBe(false);
  expect(hasChunkForId('json-diff', ids, ['unrelated-Xy12.js'])).toBe(false);
});

test('첫 방문 세션에서, 리로드 없이도 오프라인 전환 후 방문하지 않은 도구가 마운트된다', async ({
  page,
  context,
}) => {
  // 이게 이 태스크가 존재하는 이유의 핵심 경로다 — "설치하고 바로 오프라인이
  // 되는" 시나리오는 리로드를 거치지 않는다. clientsClaim 없이는 SW 를 막
  // 설치한 이 페이지 자신이 uncontrolled 로 남아, 여기서 리로드를 먼저 해서
  // controlled 상태를 만들어버리면 그 결함을 구조적으로 못 본다. 그래서
  // 여기서는 절대 page.reload() 를 하지 않는다.
  await page.goto('/');
  await expect(page.locator('#tool-root[data-tool]')).toBeVisible();
  const firstVisited = await page.getAttribute('#tool-root', 'data-tool');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  // clientsClaim 이 없으면 이 시점에 controller 가 null 로 남는다(실측으로
  // 확인된 회귀의 근본 원인). 이 단언이 실패하면 아래 마운트 검증까지 갈
  // 것도 없이 원인이 바로 드러난다.
  const controllerScriptURL = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
  expect(controllerScriptURL, '첫 방문 세션의 이 탭 자신도 SW 의 컨트롤을 받아야 한다').not.toBeNull();

  await context.setOffline(true);

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

test('오프라인 하드 리로드 후에도 방문하지 않은 도구가 마운트된다', async ({ page, context }) => {
  // 위 테스트와 별개로, "탭을 닫았다 다시 열거나 새로고침하는" 흔한 경로도
  // 계속 지킨다.
  await page.goto('/');
  await expect(page.locator('#tool-root[data-tool]')).toBeVisible();
  const firstVisited = await page.getAttribute('#tool-root', 'data-tool');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);

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
