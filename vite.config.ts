// vitest 의 test 필드를 쓰므로 'vite' 가 아니라 'vitest/config' 에서 가져온다
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      // 'autoUpdate' 는 vite-plugin-pwa 가 onNeedRefresh 를 아예 배선하지 않고
      // activated 시점에 조용히 location.reload() 를 강제한다 — 작업 중이던
      // textarea 내용이 통째로 날아간다. 'prompt' 여야 onNeedRefresh 콜백이 실제로
      // 호출되고, 사용자가 "새로고침"을 누르기 전까지는 아무것도 바뀌지 않는다.
      registerType: 'prompt',
      // 인라인 script 주입을 끈다. CSP 에 'unsafe-inline' 이 없다.
      injectRegister: null,
      manifest: {
        name: 'rimi devtools',
        short_name: 'devtools',
        description: '브라우저 안에서만 동작하는 개발 유틸리티 모음',
        lang: 'ko',
        dir: 'ltr',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // manifest.icons 는 globPatterns 의 '**/*.svg' 로 이미 precache 된다.
      // 플러그인이 같은 파일을 또 큐에 넣어 중복 등재(revision 은 같아 지금은
      // 무해하지만 갈라지는 순간 add-to-cache-list-conflicting-entries 로 터진다)하는
      // 것을 막는다.
      includeManifestIcons: false,
      workbox: {
        // 동적 import 로 쪼갠 청크까지 전부 precache 한다
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // 런타임 캐싱 규칙을 두지 않는다. 외부로 나가는 요청 자체가 없다.
        runtimeCaching: [],
        navigateFallback: '/index.html',
        // skipWaiting 은 절대 켜지 않는다 — 이게 켜지면 새 SW 가 install 중
        // 바로 활성화돼 'waiting' 이벤트가 나지 않고, 토스트가 뜰 기회 자체가
        // 사라진다(사용자 동의 전에 이미 교체가 끝나버림). registerType 이
        // 'prompt' 이므로 플러그인도 이 값을 자동으로 켜지 않는다(자동 설정은
        // registerType 'autoUpdate' 일 때만 적용됨).
        //
        // clientsClaim 은 반대로 명시적으로 켠다 — skipWaiting 과 달리 이건
        // "기다림 없이 바로 활성화"가 아니라 "이미 활성화된 새 SW 가 이미 열려
        // 있는 탭도 즉시 맡는다"는 뜻이라 토스트 타이밍에는 영향이 없다. 이게
        // 꺼져 있으면(기본값) 사용자가 "새로고침"을 눌러 skipWaiting 메시지를
        // 보내도 이미 열린 탭의 controller 가 바뀌지 않아 controllerchange 가
        // 발화하지 않고, 버튼을 눌러도 아무 일도 일어나지 않는다(실측 확인,
        // task-16-fix-1-report.md 참고).
        clientsClaim: true,
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
