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
        // clientsClaim 도 켜지 않는다(한 라운드 전엔 켰다가 뺐다) — 이게 켜져
        // 있으면 어느 한 탭이 skipWaiting 메시지를 보내는 순간 "열려 있는 모든
        // 탭"의 controller 가 즉시 바뀐다. vite-plugin-pwa 는 controller 가
        // 바뀌는 모든 탭에서 무조건 location.reload() 를 거는 리스너를 토스트를
        // 띄우는 시점에 걸어두는데, 그 탭이 실제로 "새로고침"을 눌렀는지는
        // 전혀 보지 않는다. 그 결과 clientsClaim 을 켠 채로 실측했을 때 —
        // 탭 A 에서 새로고침을 누르면 아무것도 누르지 않은 탭 B 가 예고 없이
        // 리로드되며 입력이 소실됐다(탭 B 가 토스트를 닫아도 막지 못함).
        // 1차 리뷰가 blocking 으로 지목한 피해가 다중 탭에서 그대로 재현된
        // 셈이라 뺀다. clientsClaim 없이도 "새로고침"을 누른 탭 자신은
        // updateToast.ts 가 해당 waiting worker 의 statechange 를 직접
        // 기다렸다가 스스로 reload() 하므로(일반 네비게이션은 clientsClaim 과
        // 무관하게 그 시점의 active worker 를 그대로 쓴다) 정상 동작한다.
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
