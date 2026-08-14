import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toast';

// registerSW 의 onNeedRefresh 는 새 waiting SW 를 감지할 때마다 다시 호출될 수
// 있다. 이미 화면에 떠 있는 토스트가 있으면 새로 쌓지 않는다. 닫으면 참조를
// 비워 다음 감지 때 다시 안내될 수 있게는 해두지만(사용자가 "다시 보지 않기"를
// 선택한 게 아니므로 영구 억제는 하지 않는다), workbox-window 는 한 세션에서
// 두 번째로 감지된 업데이트부터 내부적으로 "외부에서 트리거된 변경"으로 보고
// updatefound 리스너 자체를 떼어내는 휴리스틱이 있어(실측 확인, 라이브러리
// 내부 동작이라 여기서 우회하지 않는다) 같은 탭을 계속 열어둔 채 배포가
// 여러 번 겹치는 드문 경우엔 두 번째 이후 업데이트가 안내되지 않을 수 있다.
// 탭을 새로 열면(=새 Workbox 인스턴스) 정상적으로 다시 감지된다.
let activeToast: HTMLElement | null = null;

export function setupUpdatePrompt(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      showRefreshToast(() => void updateSW(true));
    },
    onOfflineReady() {
      showToast('오프라인에서도 사용할 수 있습니다.');
    },
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
    // updateSW(true) 는 대기 중인 SW 에 skipWaiting 메시지를 보낼 뿐이다.
    // workbox-window 의 자체 reload 트리거는 Workbox 인스턴스가 처음
    // register() 될 때 한 번만 계산되는 isUpdate 플래그에 의존하는데, 이
    // 세션에서 SW 가 방금 막 처음 설치된 경우(같은 세션에서 연달아 두 번째
    // 배포까지 감지하는 드문 경우) 그 플래그가 false 로 굳어버려 리로드가
    // 실행되지 않는 것을 실측으로 확인했다. 그래서 리로드는 라이브러리에
    // 맡기지 않고 클릭 이후의 첫 controllerchange 를 직접 기다렸다가 건다.
    // 클릭 전에는 리스너를 달지 않으므로 최초 설치 시의 controllerchange 에는
    // 반응하지 않는다.
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
      once: true,
    });
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
