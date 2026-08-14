// vitest 의 test 필드를 쓰므로 'vite' 가 아니라 'vitest/config' 에서 가져온다
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // 인라인 script 주입을 끈다. CSP 에 'unsafe-inline' 이 없다.
      injectRegister: null,
      manifest: {
        name: 'rimi devtools',
        short_name: 'devtools',
        description: '브라우저 안에서만 동작하는 개발 유틸리티 모음',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // 동적 import 로 쪼갠 청크까지 전부 precache 한다
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // 런타임 캐싱 규칙을 두지 않는다. 외부로 나가는 요청 자체가 없다.
        runtimeCaching: [],
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
