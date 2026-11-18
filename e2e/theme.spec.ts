import { test, expect } from '@playwright/test';

// 저장된 테마가 없는 사용자가 시스템 다크 모드일 때, main.ts 의 JS 가 도착해
// data-theme 를 붙이기 전에도 CSS 만으로 다크 팔레트가 그려져야 한다("첫 페인트
// 흰 화면" 회귀 방지). javaScriptEnabled: false 로 그 "스크립트 도착 전" 상태를
// 그대로 재현한다 — JS 를 켠 채로는 main.ts 가 곧 data-theme 을 붙여버려서, CSS의
// @media (prefers-color-scheme: dark) 블록을 통째로 지워도 이 테스트가 통과해버린다.
test.describe('저장된 테마가 없을 때 시스템 다크 모드의 첫 페인트', () => {
  test.use({ colorScheme: 'dark', javaScriptEnabled: false });

  test('JS 실행 전에도 CSS만으로 배경이 다크 팔레트로 그려진다', async ({ page }) => {
    await page.goto('/');
    const style = await page.evaluate(() => ({
      bodyBg: getComputedStyle(document.body).backgroundColor,
      dataTheme: document.documentElement.getAttribute('data-theme'),
    }));

    // data-theme 이 없다는 것은 이 결과가 JS(applyTheme) 가 아니라 CSS 미디어
    // 쿼리만으로 결정됐다는 뜻이다.
    expect(style.dataTheme).toBeNull();
    expect(style.bodyBg).toBe('rgb(18, 20, 24)');
  });
});

test.describe('저장된 테마가 없을 때 시스템 라이트 모드의 첫 페인트', () => {
  test.use({ colorScheme: 'light', javaScriptEnabled: false });

  test('JS 실행 전에는 배경이 라이트 팔레트로 그려진다', async ({ page }) => {
    await page.goto('/');
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(251, 250, 247)');
  });
});

// 저장값과 시스템 설정이 반대일 때 저장값의 토큰 블록이 이겨야 한다. 시스템과 저장값이
// 같으면 미디어 쿼리 블록이 대신 맞춰 줘서 [data-theme] 블록이 빠져도 통과한다.
for (const [system, stored, bodyBg, railBg] of [
  ['dark', 'light', 'rgb(251, 250, 247)', 'rgb(23, 33, 58)'],
  ['light', 'dark', 'rgb(18, 20, 24)', 'rgb(12, 18, 32)'],
] as const) {
  test.describe(`시스템 ${system} 에 저장값 ${stored}`, () => {
    test.use({ colorScheme: system });

    test('저장값의 팔레트로 그려진다', async ({ page }) => {
      await page.addInitScript((v) => localStorage.setItem('rdt.theme', JSON.stringify(v)), stored);
      await page.goto('/#/json-format');
      await expect(page.locator('html')).toHaveAttribute('data-theme', stored);
      await expect(page.locator('body')).toHaveCSS('background-color', bodyBg);
      await expect(page.locator('#sidebar')).toHaveCSS('background-color', railBg);
    });
  });
}

// 사이드바 위 버튼은 공용 button:hover·:active 가 작업 영역의 밝은 배경을 덮어써
// 밝은 글자가 묻힐 수 있다.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: 사이드바 테마 버튼은 hover·누름 중에도 글자 대비가 4.5:1 이상이다`, async ({
    page,
  }) => {
    await page.addInitScript((v) => localStorage.setItem('rdt.theme', JSON.stringify(v)), colorScheme);
    await page.goto('/#/json-format');
    const toggle = page.locator('.theme-toggle');
    const ratio = () =>
      toggle.evaluate((el) => {
        const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
        const lum = (c: string) => {
          const [r = 0, g = 0, b = 0] = parse(c);
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const s = getComputedStyle(el);
        const a = lum(s.color);
        const b = lum(s.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });

    await toggle.hover();
    await page.waitForTimeout(150);
    expect(await ratio(), 'hover').toBeGreaterThanOrEqual(4.5);
    await page.mouse.down();
    await page.waitForTimeout(150);
    expect(await ratio(), 'active').toBeGreaterThanOrEqual(4.5);
    await page.mouse.up();
  });
}

// 포커스 링은 작업 영역 기준 강조색이라, 배경이 반전된 사이드바 위에서는 따로 봐야 한다.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: 사이드바의 포커스 링이 사이드바 배경 위에서 3:1 이상이다`, async ({ page }) => {
    await page.addInitScript((v) => localStorage.setItem('rdt.theme', JSON.stringify(v)), colorScheme);
    await page.goto('/#/json-format');
    await page.locator('.sidebar-link').nth(1).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ratio = await page.evaluate(() => {
      const lum = (c: string) => {
        const [r = 0, g = 0, b = 0] = (c.match(/[\d.]+/g) ?? []).map(Number);
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const s = getComputedStyle(document.activeElement!);
      const ring = lum(s.outlineColor);
      const rail = lum(getComputedStyle(document.querySelector('#sidebar')!).backgroundColor);
      return {
        style: s.outlineStyle,
        width: parseFloat(s.outlineWidth),
        value: (Math.max(ring, rail) + 0.05) / (Math.min(ring, rail) + 0.05),
      };
    });
    // outline 이 꺼져도 outline-color 는 글자색으로 계산돼 대비만으로는 통과한다
    expect(ratio.style).not.toBe('none');
    expect(ratio.width).toBeGreaterThanOrEqual(2);
    expect(ratio.value).toBeGreaterThanOrEqual(3);
  });
}

test('다크: 사이드바와 작업 영역 사이에 경계선이 보인다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rdt.theme', JSON.stringify('dark')));
  await page.goto('/#/json-format');
  const side = await page.locator('#sidebar').evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderRightColor, bg: s.backgroundColor, width: s.borderRightWidth };
  });
  expect(side.width).toBe('1px');
  expect(side.border).not.toBe(side.bg);
});
