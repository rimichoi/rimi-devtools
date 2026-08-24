import { test, expect, type Page } from '@playwright/test';

/**
 * 크론 해석 도구의 브라우저 계약.
 *
 * 다음 실행 시각 계산 자체는 유닛 테스트가 실제 Spring 5.3.19 가 낸 벡터 88개로
 * 고정한다. 여기서 재는 것은 그 계산이 **화면에 어떻게 배선돼 있는가** 다.
 *
 * 다음 실행 시각은 현재 시각에 따라 달라지므로 값을 리터럴로 못 박을 수 없다.
 * 대신 "시각 다섯 개가 오름차순으로 채워진다" 처럼 시계와 무관하게 참인 것만
 * 잰다 — 시계에 기대는 e2e 는 언젠가 깨지고, 그때 아무도 원인을 못 찾는다.
 */

function ui(page: Page) {
  return {
    input: page.locator('#tool-root .io-wrap textarea:not([readonly])'),
    summary: page.locator('#tool-root .cron-summary'),
    dangers: page.locator('#tool-root .cron-warnings .io-error'),
    lists: page.locator('#tool-root .result-list-wrap'),
    error: page.locator('#tool-root > .tool-stack > .io-error'),
  };
}

/** 다음 실행 목록의 값들 */
function runValues(page: Page) {
  return page.locator('#tool-root .result-list-wrap').nth(1).locator('dd');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/cron');
  await page.locator('#tool-root[data-tool="cron"]').waitFor();
});

test('6필드를 Spring 으로 읽고 요약을 보여준다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('0 5 9 * * *');
  await expect(summary).toHaveText('Spring 6필드 · 매일 09:05:00');
});

test('5필드를 표준 crontab 으로 읽는다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('5 9 * * *');
  await expect(summary).toHaveText('표준 crontab 5필드 · 매일 09:05:00');
});

test('필드별 해석을 원문과 함께 보여준다', async ({ page }) => {
  const { input, lists } = ui(page);
  await input.fill('0 0 9-18 * * MON-FRI');

  const fields = lists.nth(0);
  await expect(fields.locator('dt')).toHaveCount(6);
  await expect(fields.locator('dt').nth(2)).toContainText('시');
  await expect(fields.locator('dd').nth(2)).toHaveText('9~18시');
  await expect(fields.locator('dd').nth(5)).toHaveText('월~금요일');
});

test('다음 실행 시각 5개가 오름차순으로 채워진다', async ({ page }) => {
  const { input } = ui(page);
  await input.fill('0 */5 * * * *');

  const values = runValues(page);
  await expect(values).toHaveCount(5);

  const texts = await values.allTextContents();
  // 'YYYY-MM-DD HH:MM:SS KST · YYYY-MM-DD HH:MM:SS UTC'
  for (const text of texts) {
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} KST · \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
  }
  const kstTimes = texts.map((t) => t.split(' KST')[0] as string);
  expect(kstTimes, '시각이 오름차순이어야 한다').toEqual([...kstTimes].sort());
  expect(new Set(kstTimes).size, '같은 시각이 두 번 나오면 안 된다').toBe(5);
});

test('KST 와 UTC 가 9시간 차이로 함께 나온다', async ({ page }) => {
  const { input } = ui(page);
  await input.fill('0 0 * * * *');

  const first = (await runValues(page).first().textContent()) ?? '';
  const [kstPart, utcPart] = first.split(' · ');
  const kst = Date.parse(`${(kstPart ?? '').replace(' KST', '').replace(' ', 'T')}+09:00`);
  const utc = Date.parse(`${(utcPart ?? '').replace(' UTC', '').replace(' ', 'T')}Z`);
  expect(kst, 'KST 표기와 UTC 표기가 같은 순간을 가리켜야 한다').toBe(utc);
});

test('일과 요일이 둘 다 지정되면 방언이 갈린다고 위험 경고를 낸다', async ({ page }) => {
  const { input, dangers } = ui(page);
  await input.fill('0 0 12 1 * MON');

  await expect(dangers).toHaveCount(1);
  await expect(dangers.first()).toContainText('일과 요일이 둘 다 지정됐습니다');
  await expect(dangers.first()).toContainText('Spring 규칙으로 계산했습니다');
});

test('한쪽만 지정되면 그 경고를 내지 않는다', async ({ page }) => {
  const { input, dangers, summary } = ui(page);
  await input.fill('0 0 12 * * MON');
  await expect(summary).toContainText('매주 월요일');
  await expect(dangers).toHaveCount(0);
});

test('요일 이름 WED 를 지원하지 않는 토큰으로 오해하지 않는다', async ({ page }) => {
  // W 한 글자를 원문 전체에서 찾으면 "WED" 가 걸린다. 실제로 그 버그가 있었다.
  const { input, error, summary } = ui(page);
  await input.fill('15 30 4 * * WED');
  await expect(error).toHaveText('');
  await expect(summary).toHaveText('Spring 6필드 · 매주 수요일 04:30:15');
});

test('지원하지 않는 L 은 조용히 넘어가지 않고 그렇다고 말한다', async ({ page }) => {
  const { input, error } = ui(page);
  await input.fill('0 0 12 L * *');
  await expect(error).toHaveText(
    'L · W · # 는 지원하지 않습니다. 일 필드의 "L" 을 다르게 적어 주세요.',
  );
});

test('망가진 입력에 빨간 글씨를 띄우되, 빈 입력에는 띄우지 않는다', async ({ page }) => {
  const { input, error } = ui(page);

  await expect(error).toHaveText('');
  await input.fill('0 0 25 * * *');
  await expect(error).toContainText('범위(0~23)를 벗어났습니다');

  await input.fill('');
  await expect(error).toHaveText('');
});

test('오지 않는 날짜는 빈 목록과 함께 그 이유를 말한다', async ({ page }) => {
  const { input } = ui(page);
  await input.fill('0 0 0 30 2 *');

  await expect(runValues(page)).toHaveCount(0);
  await expect(page.locator('#tool-root .result-list-wrap').nth(1).locator('.result-empty')).toHaveText(
    '앞으로 9년 안에 실행되지 않습니다. 2월 30일처럼 오지 않는 날짜일 수 있습니다.',
  );
});

test('입력을 지우면 결과가 함께 걷힌다', async ({ page }) => {
  const { input, summary } = ui(page);
  await input.fill('0 0 8 * * *');
  await expect(runValues(page)).toHaveCount(5);

  await input.fill('');
  await expect(summary).toHaveText('');
  await expect(runValues(page)).toHaveCount(0);
});

test('넓은 화면에서 필드 해석과 다음 실행이 같은 줄에 나란히 놓인다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { input } = ui(page);
  await input.fill('0 0 8 * * *');
  await expect(runValues(page)).toHaveCount(5);

  const boxes = page.locator('#tool-root .cron-panes > div');
  const left = await boxes.nth(0).boundingBox();
  const right = await boxes.nth(1).boundingBox();
  expect(left, '필드 해석 카드를 찾지 못했습니다').not.toBeNull();
  expect(right, '다음 실행 카드를 찾지 못했습니다').not.toBeNull();

  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
  expect(right!.y).toBeLessThan(left!.y + left!.height);

  const row = await page.locator('#tool-root .cron-panes').boundingBox();
  expect(right!.width).toBeGreaterThan(row!.width * 0.4);
});

test('입력값이 저장소나 URL 에 남지 않는다', async ({ page }) => {
  const { input } = ui(page);
  const expression = '0 0 9 08,13,21 * *';
  await input.fill(expression);
  // 계산이 실제로 돌았음을 먼저 확인한다. 빈 화면을 재고 통과하지 않기 위함이다.
  await expect(runValues(page)).toHaveCount(5);

  const stored = await page.evaluate(() => {
    const dump = (storage: Storage): string[] => {
      const out: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null) out.push(`${key}=${storage.getItem(key) ?? ''}`);
      }
      return out;
    };
    return [...dump(window.localStorage), ...dump(window.sessionStorage), window.location.href, document.cookie].join('\n');
  });

  expect(stored, '입력한 표현식이 저장소나 URL 에 남았다').not.toContain('08,13,21');
});
