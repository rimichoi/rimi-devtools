import type { Tool, ToolCategory } from '../types';
import { CATEGORY_LABEL } from '../types';
import { createThemeToggle } from './theme';

const ORDER: ToolCategory[] = ['format', 'convert', 'encode', 'calc', 'file'];

/**
 * 커맨드 팔레트 단축키를 화면에 노출한다. 여태 이 단축키는 팔레트를 이미 열어야
 * 볼 수 있는 힌트 줄에만 적혀 있어서, 존재를 모르는 사람은 영원히 몰랐다.
 * 표기는 물리 키가 아니라 플랫폼 관례를 따른다(맥은 ⌘, 그 외는 Ctrl).
 */
function paletteShortcutLabel(): string {
  const mac = /Mac|iPhone|iPad/i.test(navigator.userAgent);
  return mac ? '⌘K' : 'Ctrl K';
}

export function renderSidebar(
  container: HTMLElement,
  tools: Tool[],
  activeId: string | null,
): void {
  container.replaceChildren();

  const title = document.createElement('div');
  title.className = 'sidebar-title';

  const brand = document.createElement('span');
  brand.textContent = 'rimi devtools';

  const shortcut = document.createElement('kbd');
  shortcut.className = 'kbd';
  shortcut.textContent = paletteShortcutLabel();
  shortcut.title = '도구 검색 팔레트 열기';

  title.append(brand, shortcut);
  container.append(title);

  for (const category of ORDER) {
    const group = tools.filter((t) => t.category === category);
    if (group.length === 0) continue;

    const heading = document.createElement('div');
    heading.textContent = CATEGORY_LABEL[category];
    heading.className = 'sidebar-heading';
    container.append(heading);

    const list = document.createElement('nav');
    for (const tool of group) {
      const link = document.createElement('a');
      link.href = `#/${tool.id}`;
      link.textContent = tool.name;
      link.dataset.toolId = tool.id;
      link.className = tool.id === activeId ? 'sidebar-link is-active' : 'sidebar-link';
      list.append(link);
    }
    container.append(list);
  }

  // 테마 토글을 목록 마지막 링크 바로 아래 떠 있게 두지 않고, 사이드바 바닥에
  // 붙는 별도 영역에 담는다(.sidebar-foot 이 margin-top:auto 로 밀어낸다).
  const foot = document.createElement('div');
  foot.className = 'sidebar-foot';
  foot.append(createThemeToggle());
  container.append(foot);
}
