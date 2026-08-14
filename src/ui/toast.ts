// persistent 는 사용자가 닫기 전까지 화면에 남아야 하는 안내에 쓴다(예: 다른
// 탭이 먼저 배포를 수락해 이 탭의 도구 청크를 못 찾는 경우 — 사용자가 입력을
// 다른 곳에 저장한 뒤 스스로 새로고침할 시간이 필요하다). 2.5초 자동 소멸은
// 이런 경우엔 사용자가 보기도 전에 사라질 수 있다.
export function showToast(message: string, kind: 'info' | 'error' = 'info', persistent = false): void {
  const host = document.querySelector<HTMLElement>('#toast-root');
  if (!host) return;

  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = persistent ? `${message} ` : message;

  if (persistent) {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'toast-dismiss';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', '닫기');
    dismiss.addEventListener('click', () => el.remove());
    el.append(dismiss);
  } else {
    window.setTimeout(() => el.remove(), 2500);
  }

  host.append(el);
}
