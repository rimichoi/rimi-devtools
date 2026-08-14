import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  // 'list' 는 지금까지의 터미널 출력(체크마크 목록)을 그대로 유지한다.
  // 'html' 은 실패 유무와 관계없이 매 실행마다 playwright-report/ 를 생성해서,
  // CI 의 "실패 시 리포트 업로드" 스텝이 실제로 업로드할 대상을 갖게 한다.
  // open 은 CI 에서는 반드시 'never' 여야 한다 — 리포터가 브라우저를 열려고
  // 로컬 서버를 띄운 채 대기하면 CI 잡이 끝나지 않고 멈춘다. 로컬 개발에서는
  // 'on-failure' (Playwright 기본값) 로 두어 실패했을 때만 열리게 한다.
  reporter: [['list'], ['html', { open: process.env.CI ? 'never' : 'on-failure' }]],
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
