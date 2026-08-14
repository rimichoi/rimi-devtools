export interface DropZoneHandle {
  destroy(): void;
}

export function createDropZone(
  root: HTMLElement,
  onFile: (file: File) => void,
  accept: string,
): DropZoneHandle {
  const zone = document.createElement('div');
  zone.className = 'drop-zone';

  const text = document.createElement('p');
  text.textContent = '이미지를 여기에 끌어다 놓거나 클릭해서 선택하세요.';

  const note = document.createElement('p');
  note.className = 'drop-note';
  note.textContent = '파일은 브라우저 안에서만 읽습니다. 어디에도 전송되지 않습니다.';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.className = 'visually-hidden';

  zone.append(text, note, input);

  function handle(file: File | undefined): void {
    if (file) onFile(file);
  }

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => handle(input.files?.[0]));

  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-over');
    handle(event.dataTransfer?.files?.[0]);
  });

  root.append(zone);

  return { destroy: () => zone.remove() };
}
