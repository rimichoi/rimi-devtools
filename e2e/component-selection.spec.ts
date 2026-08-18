import { test, expect } from '@playwright/test';

// epoch 의 "타임스탬프 → 날짜" 방향이 대량 텍스트용 IOPane(textarea) 을 쓰면서,
// 바로 아래의 "날짜 → 타임스탬프" 방향(단일 줄 input)과 같은 페이지에서 서로 다른
// 모양이 되는 결함을 고친 회귀 테스트. 두 방향 모두 단일 줄 필드를 쓰고, 결과는
// 구조화된 목록(ResultList) 으로 보여야 한다.
test.describe('epoch: 두 방향이 같은 종류의 입력 모양을 쓴다', () => {
  test('타임스탬프 입력은 textarea 가 아니라 단일 줄 input 이다', async ({ page }) => {
    await page.goto('/#/epoch');

    const timestampInput = page.locator('#tool-root input[placeholder="1700000000"]');
    await expect(timestampInput).toBeVisible();
    // textarea 였다면 이 locator 자체가 아무것도 못 찾는다(placeholder 는 input 에만 있음).
    expect(await timestampInput.evaluate((el) => el.tagName)).toBe('INPUT');

    // 페이지에 남아 있는 textarea 가 없어야 한다 — 두 방향 다 단일 줄 필드다.
    await expect(page.locator('#tool-root textarea')).toHaveCount(0);
  });

  // '.result-list' 는 빈 dl(자식 0개)이라 CSS grid 가 높이 0으로 접혀서, hidden
  // 속성을 실제로 세팅하지 않아도 Playwright 의 toBeHidden() 이 우연히 통과할 수
  // 있다. hidden 이라는 IDL 속성값 자체를 직접 확인해야 그 속성을 세팅하는
  // 코드가 실제로 지워졌을 때도 이 테스트가 빨갛게 죽는다.
  test('결과가 없을 때는 안내 문구만 보이고 빈 목록은 숨는다', async ({ page }) => {
    await page.goto('/#/epoch');

    const list = page.locator('#tool-root .result-list');
    const empty = page.locator('#tool-root .result-empty');
    await expect(empty).toHaveJSProperty('hidden', false);
    await expect(empty).toBeVisible();
    await expect(list).toHaveJSProperty('hidden', true);
  });

  test('현재 시각 넣기 버튼은 구조화된 결과 목록(UTC/KST/ISO 8601 등)을 채운다', async ({ page }) => {
    await page.goto('/#/epoch');

    await page.getByRole('button', { name: '현재 시각 넣기' }).click();

    const list = page.locator('#tool-root .result-list');
    const empty = page.locator('#tool-root .result-empty');
    await expect(list).toHaveJSProperty('hidden', false);
    await expect(list).toBeVisible();
    await expect(empty).toHaveJSProperty('hidden', true);
    await expect(list).toContainText('UTC');
    await expect(list).toContainText('KST');
    await expect(list).toContainText('ISO 8601');
    await expect(list).toContainText('상대 시각');
  });

  test('타임스탬프 입력칸이 비면 결과 목록도 다시 빈 안내로 돌아간다', async ({ page }) => {
    await page.goto('/#/epoch');

    const timestampInput = page.locator('#tool-root input[placeholder="1700000000"]');
    const list = page.locator('#tool-root .result-list');
    const empty = page.locator('#tool-root .result-empty');

    await timestampInput.fill('1700000000');
    await expect(list).toHaveJSProperty('hidden', false);

    await timestampInput.fill('');
    await expect(list).toHaveJSProperty('hidden', true);
    await expect(empty).toHaveJSProperty('hidden', false);
  });
});

// json-diff 는 한때 IOPane 밖에서 스스로 두 칸짜리 레이아웃을 재구현했었다. 이제
// createIOPane 의 secondInput 옵션을 써서 backstop/에러 표시를 다른 도구와 공유한다.
test.describe('json-diff: IOPane 의 두 입력을 쓴다', () => {
  test('왼쪽만 채워진 동안에는 "오른쪽을 입력하세요" 류의 하드 에러를 띄우지 않는다', async ({ page }) => {
    await page.goto('/#/json-diff');

    const areas = page.locator('#tool-root textarea:not([readonly])');
    await expect(areas).toHaveCount(2);

    await areas.nth(0).fill('{"a":1}');
    // 아직 오른쪽은 입력 전이다 — peers(단일 입력 도구)의 "완전히 비어 있으면
    // 에러 없이 조용하다" 규칙이 두 입력 모두에 대칭으로 적용돼야 한다.
    await expect(page.locator('#tool-root .io-error')).toHaveText('');
  });

  test('양쪽을 채우면 차이를 계산해 결과 textarea 에 보여준다', async ({ page }) => {
    await page.goto('/#/json-diff');

    const areas = page.locator('#tool-root textarea:not([readonly])');
    await areas.nth(0).fill('{"a":1}');
    await areas.nth(1).fill('{"a":2}');

    const output = page.locator('#tool-root textarea[readonly]');
    await expect(output).toHaveValue(/1개 차이/);
    await expect(output).toHaveValue(/a: 1 → 2/);
  });

  test('오른쪽이 구문 오류면 다른 JSON 도구와 같은 형식(줄/칸 안내)으로 알려준다', async ({ page }) => {
    await page.goto('/#/json-diff');

    const areas = page.locator('#tool-root textarea:not([readonly])');
    await areas.nth(0).fill('{"a":1}');
    await areas.nth(1).fill('not json');

    const error = page.locator('#tool-root .io-error');
    await expect(error).toContainText('오른쪽 JSON 구문 오류');
  });
});
