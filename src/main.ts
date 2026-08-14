import './ui/styles.css';
import { tools, findTool } from './registry';
import { resolveToolId, shouldRender, UNSET } from './router';
import { renderSidebar } from './shell/sidebar';
import { prefs } from './shell/prefs';
import { applyTheme } from './shell/theme';
import { createPalette } from './shell/palette';

const sidebar = document.querySelector<HTMLElement>('#sidebar');
const root = document.querySelector<HTMLElement>('#tool-root');

let cleanup: (() => void) | null = null;
let currentId: string | null | typeof UNSET = UNSET;

async function render(): Promise<void> {
  if (!root || !sidebar) return;

  const id = resolveToolId(location.hash, tools);
  if (!shouldRender(id, currentId)) return;

  cleanup?.();
  cleanup = null;
  root.replaceChildren();
  currentId = id;
  root.dataset['tool'] = id ?? '';

  renderSidebar(sidebar, tools, id);

  if (id === null) {
    root.textContent = '등록된 도구가 없습니다.';
    return;
  }

  prefs.pushRecent(id);

  const tool = findTool(id);
  if (!tool) return;

  document.title = `${tool.name} · rimi devtools`;
  const mod = await tool.load();
  cleanup = mod.mount(root);
}

window.addEventListener('hashchange', () => void render());
applyTheme(prefs.getTheme());
createPalette(tools);
void render();
