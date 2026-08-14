import type { Tool, ToolCategory } from '../types';
import { CATEGORY_LABEL } from '../types';
import { createThemeToggle } from './theme';

const ORDER: ToolCategory[] = ['format', 'convert', 'encode', 'calc', 'file'];

export function renderSidebar(
  container: HTMLElement,
  tools: Tool[],
  activeId: string | null,
): void {
  container.replaceChildren();

  const title = document.createElement('div');
  title.textContent = 'rimi devtools';
  title.className = 'sidebar-title';
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

  container.append(createThemeToggle());
}
