import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toast';

/*
 * 서비스 워커 등록. 하는 일은 오프라인 지원 하나뿐이다.
 *
 * 새 버전 안내 토스트("새 버전이 있습니다. 새로고침")는 지웠다. 원래 그 토스트는
 * 새 배포를 **사용자 동의 아래** 적용하려고 있었는데, 재현해 보니 사용자의 실제
 * 사용 패턴에서는 뜨지도 않았다: 강력 새로고침(⌘⇧R)으로 연 탭은 서비스 워커의
 * 제어를 받지 않고(uncontrolled), 그 탭이 유일한 탭이면 제어 중인 클라이언트가
 * 하나도 없어 새 워커가 대기 단계를 건너뛰고 바로 활성화된다 — 'waiting' 이벤트가
 * 없으니 토스트를 띄울 계기 자체가 없다. 값은 못 주면서 배선만 남겨 두는 셈이라,
 * 세 세션에 걸쳐 이 기능 하나가 결함을 만들어 냈다.
 *
 * 지금 새 버전이 적용되는 시점은 이렇다:
 *   - 이 origin 의 탭을 전부 닫았다가 다시 열 때(대기 중이던 워커가 활성화된다)
 *   - 강력 새로고침할 때(서비스 워커를 우회해 서버에서 바로 받는다)
 *
 * registerType 은 그대로 'prompt' 다. 'autoUpdate' 로 바꾸면 안 된다 — 그쪽은
 * 새 워커가 활성화되는 순간 예고 없이 location.reload() 를 부르고, 이 사이트는
 * 긴 JSON·SQL·토큰을 붙여넣고 쓰는 곳이라 작업 중이던 입력이 통째로 날아간다.
 * 'prompt' 이면서 아무도 수락하지 않으므로 새 워커는 조용히 대기만 한다.
 * e2e/pwa-multitab.spec.ts 가 "배포해도 열려 있는 탭이 리로드되지 않는다" 를 잰다.
 */
export function setupServiceWorker(): void {
  registerSW({
    onOfflineReady() {
      showToast('오프라인에서도 사용할 수 있습니다.');
    },
  });
}
