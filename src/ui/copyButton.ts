import { showToast } from './toast';

export function createCopyButton(getText: () => string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '복사';
  button.addEventListener('click', () => {
    const text = getText();
    if (text === '') {
      showToast('복사할 내용이 없습니다.', 'error');
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => showToast('복사했습니다.'),
      () => showToast('복사에 실패했습니다.', 'error'),
    );
  });
  return button;
}
