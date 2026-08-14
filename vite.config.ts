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
        // clientsClaim 은 다시 켠다 — 한 라운드 전엔 이게 다중 탭 강제 리로드의
        // 원인으로 보여 뺐었다. 그런데 부분 되돌리기로 확인한 결과, 다중 탭
        // 강제 리로드를 실제로 막는 건 registerSW() 에 넘기는 onNeedReload
        // no-op(updateToast.ts) 한 줄이었고, clientsClaim 제거는 거기 기여하는
        // 바 없이 대가만 치렀다: clientsClaim 이 없으면 SW 를 설치한 바로 그
        // 첫 방문 세션 내내 그 탭 자신이 uncontrolled 로 남는다 — precache 에
        // 22개 엔트리가 다 있어도 그 탭은 SW 캐시를 못 쓴다. "설치하고 바로
        // 오프라인이 되는" 시나리오(이 태스크가 존재하는 이유 자체)에서, 아직
        // 열지 않은 도구로 이동하면 동적 import 가 네트워크로 나가려다 실패해
        // 조용히 빈 화면이 된다(실측 확인). clientsClaim 을 켜면 SW 가
        // 활성화되는 즉시 그 탭 자신도 컨트롤러를 받아 이 문제가 사라지고,
        // onNeedReload no-op 이 이미 다중 탭 강제 리로드를 막고 있으므로
        // 두 설정을 함께 켜도 문제 되지 않는다(e2e/pwa-multitab.spec.ts 로
        // 재확인함).
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
