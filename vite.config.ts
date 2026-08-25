// vitest 의 test 필드를 쓰므로 'vite' 가 아니라 'vitest/config' 에서 가져온다
import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import process from 'node:process';

/**
 * e2e/pwa-multitab.spec.ts 전용 빌드 시점 주입.
 *
 * 그 스펙은 "배포 전/후로 번들이 실제로 달라야" 성립한다(그래야 service worker
 * 가 업데이트를 감지하고 토스트가 뜬다). 예전에는 그걸 위해 추적 대상 소스인
 * src/main.ts 를 직접 덮어쓰고 finally 에서 되돌렸는데, 동시 실행에서 원복이
 * 깨진다: 인스턴스 1이 깨끗한 원본을 읽고 마커를 쓴 뒤 인스턴스 2가 "마커가
 * 박힌 내용"을 원본으로 읽어 두고, 나중에 그걸 다시 써 넣는다. 실제로
 * `--repeat-each=2 --workers=2` 로 재현했다 — 테스트는 "2 passed" 를 보고하면서
 * src/main.ts 에 마커 한 줄을 영구히 남겼다. 통과한 테스트가 워킹트리를
 * 오염시키면 누군가 그대로 커밋한다.
 *
 * 그래서 파일을 아예 쓰지 않는 방식으로 바꿨다. 환경 변수가 있을 때만 이
 * 플러그인이 존재하므로 프로덕션 빌드 산출물은 전혀 달라지지 않고, 디스크에
 * 쓰는 것이 없으니 동시 실행에서도 안전하다.
 */
function deployMarkerPlugin(marker: string): Plugin {
  return {
    name: 'rimi-deploy-marker',
    transform(code: string, id: string) {
      if (!id.endsWith('/src/main.ts')) return null;
      // 부수 효과가 있는 문장이라 minify 에도 살아남고, main.ts 의 내용이
      // 달라지므로 청크 해시와 precache 매니페스트(sw.js)까지 함께 바뀐다.
      return `${code}\ndocument.documentElement.dataset['deployMarker'] = ${JSON.stringify(marker)};\n`;
    },
  };
}

const deployMarker = process.env['RIMI_DEPLOY_MARKER'];

export default defineConfig({
  plugins: [
    ...(deployMarker ? [deployMarkerPlugin(deployMarker)] : []),
    VitePWA({
      // 'autoUpdate' 는 새 워커가 활성화되는 순간 조용히 location.reload() 를
      // 강제한다 — 작업 중이던 textarea 내용이 통째로 날아간다. 이 사이트는 긴
      // JSON·SQL·토큰을 붙여넣고 쓰는 곳이라 그 대가가 크다. 'prompt' 는 아무도
      // 수락하지 않으면 아무것도 하지 않는다. 새 버전 안내 토스트는 지웠으므로
      // (src/shell/serviceWorker.ts 참고) 실제로 아무도 수락하지 않는다 —
      // 새 워커는 이 origin 의 탭이 전부 닫힐 때까지 조용히 대기한다.
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
        // skipWaiting 은 절대 켜지 않는다. 켜면 새 SW 가 install 직후 활성화되며
        // precache 를 갈아치우는데, 그 순간 열려 있던 탭은 아직 옛 코드를 돌리고
        // 있다 — 그 탭이 아직 열지 않은 도구의 청크는 새 precache 에도 서버에도
        // 없어 동적 import 가 실패한다(main.ts 의 '새 버전이 배포되었습니다'
        // 안내가 그 경우다). 대기시켜 두면 탭이 다 닫힐 때까지 그 일이 없다.
        // registerType 이 'prompt' 이므로 플러그인도 이 값을 자동으로 켜지 않는다.
        //
        // clientsClaim 은 켠다 — 한 라운드 전엔 이게 다중 탭 강제 리로드의
        // 원인으로 보여 뺐었다. 그런데 부분 되돌리기로 확인한 결과, 강제 리로드를
        // 실제로 만들던 것은 플러그인의 controlling 리스너였고 clientsClaim 제거는
        // 거기 기여하는 바 없이 대가만 치렀다: clientsClaim 이 없으면 SW 를
        // 설치한 바로 그 첫 방문 세션 내내 그 탭 자신이 uncontrolled 로 남는다 —
        // precache 에 엔트리가 다 있어도 그 탭은 SW 캐시를 못 쓴다. "설치하고 바로
        // 오프라인이 되는" 시나리오(이 태스크가 존재하는 이유 자체)에서, 아직
        // 열지 않은 도구로 이동하면 동적 import 가 네트워크로 나가려다 실패해
        // 조용히 빈 화면이 된다(실측 확인). e2e/pwa.spec.ts 가 그 시나리오를 잰다.
        //
        // 그 controlling 리스너는 **아직 번들에 그대로 있다.** 플러그인은 waiting
        // 이벤트마다 그것을 다는데, onNeedRefresh 를 넘겼는지와 무관하다. 예전에는
        // 우리가 넘긴 onNeedReload no-op 이 그 자리를 막고 있었고, 그것을 지운 지금은
        // window.location.reload() 갈래가 산 코드다(dist 에서 확인:
        // `controlling`,e=>{e.isUpdate&&(n?n():window.location.reload())}`).
        //
        // 그런데도 발화하지 않는 이유는 우리 코드가 아니라 workbox-window 의 불변식
        // 이다: register() 시점에 isUpdate = Boolean(navigator.serviceWorker.controller)
        // 로 고정되는데, skipWaiting 이 꺼져 있으면 controlling 을 받을 수 있는
        // 클라이언트는 register 당시 uncontrolled 였던 탭뿐이고 그런 탭은 isUpdate 가
        // false 다. 최악 시나리오(강력 새로고침한 uncontrolled 탭 + controlled 탭,
        // 배포 후 controlled 탭을 닫아 대기 워커를 활성화)로 재현해 리로드가 일어나지
        // 않는 것을 확인했다. **skipWaiting 을 켜면 이 방어선이 무너진다** — 그때는
        // isUpdate=true 인 탭도 controlling 을 받는다. 위 skipWaiting 주석의 이유가
        // 하나 더 있는 셈이다.
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
