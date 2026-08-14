import type { Tool } from '../types';
import { searchTools } from './search';

export function createPalette(tools: Tool[]): { destroy(): void } {
  const overlay = document.createElement('div');
  overlay.className = 'palette-overlay';
  overlay.hidden = true;

  const box = document.createElement('div');
  box.className = 'palette-box';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '도구 이름이나 키워드를 입력하세요';

  const list = document.createElement('div');
  list.className = 'palette-list';

  box.append(input, list);
  overlay.append(box);
  document.body.append(overlay);

  let matches: Tool[] = [];
  let cursor = 0;
  let previouslyFocused: HTMLElement | null = null;

  function render(): void {
    matches = searchTools(tools, input.value);
    cursor = 0;
    paint();
  }

  function paint(): void {
    list.replaceChildren();
    matches.forEach((tool, index) => {
      const row = document.createElement('div');
      row.className = index === cursor ? 'palette-row is-cursor' : 'palette-row';
      row.textContent = tool.name;
      row.addEventListener('click', () => go(tool));
      list.append(row);
    });
  }

  function go(tool: Tool): void {
    location.hash = `#/${tool.id}`;
    close();
  }

  function open(): void {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    input.value = '';
    render();
    input.focus();
  }

  function close(): void {
    overlay.hidden = true;
    previouslyFocused?.focus();
    previouslyFocused = null;
  }

  function onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      overlay.hidden ? open() : close();
      return;
    }
    if (overlay.hidden) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      cursor = Math.min(cursor + 1, matches.length - 1);
      paint();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      paint();
    } else if (event.key === 'Enter') {
      const tool = matches[cursor];
      if (tool) {
        event.preventDefault();
        go(tool);
      }
    }
  }

  input.addEventListener('input', render);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  window.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      window.removeEventListener('keydown', onKeydown);
      overlay.remove();
    },
  };
}
