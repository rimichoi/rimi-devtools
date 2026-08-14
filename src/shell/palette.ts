import type { Tool } from '../types';
import { prefs } from './prefs';
import { orderForPalette } from './paletteOrder';

const LIST_ID = 'palette-listbox';

function optionId(tool: Tool): string {
  return `palette-option-${tool.id}`;
}

export function createPalette(tools: Tool[]): { destroy(): void } {
  const overlay = document.createElement('div');
  overlay.className = 'palette-overlay';
  overlay.hidden = true;

  const box = document.createElement('div');
  box.className = 'palette-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '도구 검색 팔레트');

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '도구 이름이나 키워드를 입력하세요';
  input.setAttribute('aria-label', '도구 검색');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', LIST_ID);
  input.setAttribute('aria-autocomplete', 'list');
  input.autocomplete = 'off';
  input.spellcheck = false;

  const list = document.createElement('div');
  list.className = 'palette-list';
  list.id = LIST_ID;
  list.setAttribute('role', 'listbox');
  // Chrome 은 overflow-y:auto 인 컨테이너를 Tab 순서에 자동으로 끼워 넣는다.
  // tabIndex=-1 로 그 자동 포커스 대상에서 빼고, 이동은 화살표 키로만 한다.
  list.tabIndex = -1;

  box.append(input, list);
  overlay.append(box);
  document.body.append(overlay);

  let matches: Tool[] = [];
  let cursor = 0;
  let previouslyFocused: HTMLElement | null = null;

  function currentFavorites(): Set<string> {
    return new Set(prefs.getFavorites());
  }

  function render(): void {
    matches = orderForPalette(tools, input.value, prefs.getFavorites(), prefs.getRecent());
    cursor = 0;
    paint();
  }

  function paint(): void {
    list.replaceChildren();
    const favorites = currentFavorites();

    matches.forEach((tool, index) => {
      const isCursor = index === cursor;
      const isFavorite = favorites.has(tool.id);

      const row = document.createElement('div');
      row.id = optionId(tool);
      row.className = isCursor ? 'palette-row is-cursor' : 'palette-row';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', isCursor ? 'true' : 'false');
      row.addEventListener('click', () => go(tool));

      const name = document.createElement('span');
      name.className = 'palette-row-name';
      name.textContent = tool.name;

      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'palette-star';
      star.textContent = isFavorite ? '★' : '☆';
      star.setAttribute('aria-label', isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가');
      star.addEventListener('click', (event) => {
        event.stopPropagation();
        prefs.toggleFavorite(tool.id);
        render();
        input.focus();
      });

      row.append(star, name);
      list.append(row);

      if (isCursor) row.scrollIntoView({ block: 'nearest' });
    });

    const cursorTool = matches[cursor];
    if (cursorTool) {
      input.setAttribute('aria-activedescendant', optionId(cursorTool));
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function go(tool: Tool): void {
    location.hash = `#/${tool.id}`;
    // 이동한 경우, 닫히기 전에 포커스를 받았던 요소(사이드바 링크 등)는
    // hashchange 로 인한 renderSidebar() 의 replaceChildren() 이 곧 파괴한다.
    // 그 요소로 복원을 시도하는 대신 새로 렌더될 도구 영역으로 포커스를 옮긴다.
    overlay.hidden = true;
    setAppInert(false);
    document.body.classList.remove('no-scroll');
    previouslyFocused = null;
    document.querySelector<HTMLElement>('#tool-root')?.focus();
  }

  function setAppInert(value: boolean): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (app) app.inert = value;
  }

  function open(): void {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    setAppInert(true);
    document.body.classList.add('no-scroll');
    input.value = '';
    render();
    input.focus();
  }

  function close(): void {
    overlay.hidden = true;
    setAppInert(false);
    document.body.classList.remove('no-scroll');
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
      // 한글 등 IME 조합 중 확정 Enter 는 keyCode 229(구형 브라우저 호환)로도 온다.
      // 이 Enter 는 "음절 확정" 이지 "선택 확정" 이 아니므로 무시해야 한다.
      if (event.isComposing || event.keyCode === 229) return;
      const tool = matches[cursor];
      if (tool) {
        event.preventDefault();
        go(tool);
      }
    } else if (event.key === 'Tab') {
      // 팔레트 안에서 실제로 tab-stop 인 요소는 input 하나뿐이고(행 이동은 화살표
      // 키로 한다), 배경은 inert 처리돼 있다. Tab 이 오버레이 밖으로 새 나가지
      // 않도록 항상 input 에 포커스를 묶어 둔다.
      event.preventDefault();
      input.focus();
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
      setAppInert(false);
      document.body.classList.remove('no-scroll');
      overlay.remove();
    },
  };
}
