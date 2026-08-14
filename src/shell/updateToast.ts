import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toast';

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
  const host = document.querySelector<HTMLElement>('#toast-root');
  if (!host) return;

  const el = document.createElement('div');
  el.className = 'toast toast-update';
  el.textContent = '새 버전이 있습니다. ';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '새로고침';
  button.addEventListener('click', onClick);

  el.append(button);
  host.append(el);
}
