export function showToast(message: string, kind: 'info' | 'error' = 'info'): void {
  const host = document.querySelector<HTMLElement>('#toast-root');
  if (!host) return;

  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.append(el);

  window.setTimeout(() => el.remove(), 2500);
}
