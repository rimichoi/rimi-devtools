import type { Tool } from '../types';
import { prefs } from './prefs';
import { orderForPalette } from './paletteOrder';

const LIST_ID = 'palette-listbox';

function optionId(tool: Tool): string {
  return `palette-option-${tool.id}`;
}

function statusId(tool: Tool): string {
  return `palette-status-${tool.id}`;
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

  const hint = document.createElement('div');
  hint.className = 'palette-hint';
  hint.textContent = '↑↓ 이동 · Enter 선택 · Ctrl/Cmd+D 즐겨찾기 토글 · Esc 닫기';

  box.append(input, list, hint);
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
      // 별 버튼의 aria-label 이 subtree 텍스트로 흡수돼 "즐겨찾기 추가 JSON 포맷" 처럼
      // 옵션 이름을 오염시키지 않도록, 이름을 도구 이름으로 명시적으로 고정한다.
      // explicit aria-label 이 있으면 브라우저는 name-from-content 계산을 하지 않는다.
      row.setAttribute('aria-label', tool.name);
      row.setAttribute('aria-keyshortcuts', 'Control+D');
      row.addEventListener('click', () => go(tool));

      const name = document.createElement('span');
      name.className = 'palette-row-name';
      name.textContent = tool.name;

      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'palette-star';
      star.textContent = isFavorite ? '★' : '☆';
      star.setAttribute('aria-label', isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가');
      // role="option" 은 ARIA 상 포커스 가능한 자손을 허용하지 않고, 실제로 Tab
      // 트랩(아래 onKeydown)도 이 버튼에는 절대 닿지 않는다. 마우스로는 계속
      // 클릭할 수 있지만, 키보드/스크린리더 경로는 별도의 tab-stop 을 만드는 대신
      // Ctrl/Cmd+D 단축키(아래)로 제공하므로 이 버튼 자체는 접근성 트리에서 뺀다.
      star.tabIndex = -1;
      star.setAttribute('aria-hidden', 'true');
      star.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleFavorite(tool);
      });

      const status = document.createElement('span');
      status.id = statusId(tool);
      status.className = 'visually-hidden';
      status.textContent = '즐겨찾기에 있음';
      if (isFavorite) {
        row.setAttribute('aria-describedby', statusId(tool));
      } else {
        row.removeAttribute('aria-describedby');
      }

      row.append(star, name, status);
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

  function toggleFavorite(tool: Tool): void {
    prefs.toggleFavorite(tool.id);
    render();
    input.focus();
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

    // 한글 등 IME 조합 중에는 Escape(조합 취소)/화살표(후보 이동)/Enter(음절 확정)를
    // 전부 IME 에 맡겨야 한다. 이 핸들러가 가로채면 조합 취소용 Escape 에 팔레트가
    // 통째로 닫히며 입력하던 검색어가 날아가는 등 IME 동작과 충돌한다. keyCode 229 는
    // 구형 브라우저 호환.
    if (event.isComposing || event.keyCode === 229) return;

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
    } else if (event.key === 'Tab') {
      // 팔레트 안에서 실제로 tab-stop 인 요소는 input 하나뿐이고(행 이동은 화살표
      // 키로 한다), 배경은 inert 처리돼 있다. Tab 이 오버레이 밖으로 새 나가지
      // 않도록 항상 input 에 포커스를 묶어 둔다.
      event.preventDefault();
      input.focus();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      // 별 토글은 role="option" 안에 tab-stop 을 두지 않는 대신(N1), 커서가 있는
      // 행에 대해 이 단축키로 키보드/스크린리더 사용자에게 즐겨찾기 조작을 제공한다.
      // 화면에 힌트 텍스트(hint)로도 노출한다.
      event.preventDefault();
      const tool = matches[cursor];
      if (tool) toggleFavorite(tool);
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
