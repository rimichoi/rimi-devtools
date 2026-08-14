import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toast';

// registerSW 의 onNeedRefresh 는 새 waiting SW 를 감지할 때마다 다시 호출될 수
// 있다. 이미 화면에 떠 있는 토스트가 있으면 새로 쌓지 않는다. 닫으면 참조를
// 비워 다음 감지 때 다시 안내될 수 있게는 해두지만(사용자가 "다시 보지 않기"를
// 선택한 게 아니므로 영구 억제는 하지 않는다) — 다만 실측 결과, workbox-window
// 는 register() 로부터 60초(REGISTRATION_TIMEOUT_DURATION)가 지난 뒤 첫 번째로
// 감지되는 업데이트부터 그걸 "외부에서 트리거된 변경"으로 보고 내부
// updatefound 리스너 자체를 스스로 떼어낸다(node_modules/workbox-window/
// Workbox.js). 이건 라이브러리 내부 동작이라 여기서 우회하지 않는다. 그 결과
// 탭을 오래 열어두고 쓰는 현실적인 사용 패턴에서는 한 세션에 사실상 1회만
// 안내되고, 그 이후 배포는 그 탭에서 다시 안내되지 않는다(탭을 새로 열면
// 새 Workbox 인스턴스가 생겨 정상적으로 다시 감지된다). 실패 모드는 양성이다 —
// 안내를 못 받은 탭은 구 코드로 계속 정상 동작하고 입력도 날아가지 않는다.
let activeToast: HTMLElement | null = null;

export function setupUpdatePrompt(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      showRefreshToast(() => void updateSW(true));
    },
    onOfflineReady() {
      showToast('오프라인에서도 사용할 수 있습니다.');
    },
    // 플러그인 기본 동작은, 어느 탭이든 controller 가 바뀌는(controllerchange)
    // 순간 무조건 window.location.reload() 를 부른다 — "이 탭에서 사용자가
    // 새로고침을 눌렀는지"는 전혀 확인하지 않는다. clientsClaim 을 켜둔 채
    // 실측했을 때, 탭 A 에서 새로고침을 누르면 아무것도 누르지 않은 탭 B 가
    // 예고 없이 리로드되며 입력이 소실되는 걸 확인했다(1차 리뷰 blocking 과
    // 동일한 피해). vite.config.ts 에서 clientsClaim 을 뺐으므로 이제 다른
    // 탭의 controller 가 저절로 바뀌는 일 자체가 없지만, 방어적으로 이 콜백을
    // no-op 으로 넘겨 플러그인의 자동 리로드 경로를 완전히 죽인다. 실제
    // 리로드는 아래 showRefreshToast 의 클릭 핸들러가 전담한다 — 사용자가
    // "새로고침"을 누른 바로 그 탭에서만 일어난다.
    onNeedReload() {},
  });
}

function showRefreshToast(onClick: () => void): void {
  if (activeToast) return;

  const host = document.querySelector<HTMLElement>('#toast-root');
  if (!host) return;

  const el = document.createElement('div');
  el.className = 'toast toast-update';
  el.textContent = '새 버전이 있습니다. ';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '새로고침';
  button.addEventListener('click', () => {
    void reloadOnceThisTabsUpdateActivates();
    onClick();
  });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast-dismiss';
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', '닫기');
  dismiss.addEventListener('click', () => {
    el.remove();
    activeToast = null;
  });

  el.append(button, dismiss);
  host.append(el);
  activeToast = el;
}

// "새로고침" 을 누른 이 탭에서만 리로드를 건다. navigator.serviceWorker 의
// 전역 controllerchange 는 clientsClaim 이 없는 한 이미 컨트롤링 중인 탭에서는
// 발화하지 않으므로 거기에 기대지 않는다. 대신 지금 대기 중인 그 워커
// 인스턴스(registration.waiting) 자체의 statechange 를 직접 관찰해 activated
// 가 되는 순간 이 탭만 reload() 한다 — 일반 네비게이션(reload 포함)은
// clientsClaim 과 무관하게 그 시점에 활성화된 워커를 그대로 컨트롤러로 쓰므로
// 이걸로 충분하다. 대기 중인 워커가 이미 사라진 상태(예: 다른 탭이 먼저
// 수락해 이미 활성화된 경우)라면 바로 reload() 한다.
async function reloadOnceThisTabsUpdateActivates(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;

  if (waiting && waiting.state !== 'activated') {
    await new Promise<void>((resolve) => {
      const onStateChange = () => {
        if (waiting.state === 'activated') {
          waiting.removeEventListener('statechange', onStateChange);
          resolve();
        }
      };
      waiting.addEventListener('statechange', onStateChange);
    });
  }

  location.reload();
}
