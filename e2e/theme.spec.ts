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
    expect(style.bodyBg).toBe('rgb(17, 19, 23)');
  });
});

test.describe('저장된 테마가 없을 때 시스템 라이트 모드의 첫 페인트', () => {
  test.use({ colorScheme: 'light', javaScriptEnabled: false });

  test('JS 실행 전에는 배경이 라이트 팔레트로 그려진다', async ({ page }) => {
    await page.goto('/');
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(255, 255, 255)');
  });
});
