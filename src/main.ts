import './ui/styles.css';
import { tools, findTool } from './registry';
import { resolveToolId, shouldRender, UNSET } from './router';
import { renderSidebar } from './shell/sidebar';
import { prefs } from './shell/prefs';
import { applyTheme } from './shell/theme';
import { createPalette } from './shell/palette';
import { setupUpdatePrompt } from './shell/updateToast';
import { showToast } from './ui/toast';

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

  // 다른 탭이 새 배포를 먼저 수락하면, 이 탭이 아직 열지 않은 도구의 청크는
  // (해시가 바뀌어) service worker 의 새 precache 에 없고 서버에도 이미 없을
  // 수 있다 — 동적 import 가 실패하고, catch 가 없으면 사용자는 설명 없는
  // 빈 화면만 본다. 이 탭 자신이 강제로 리로드되지는 않는다(다중 탭에서
  // 동의 없는 리로드를 막는 게 이 태스크의 핵심이므로), 대신 사용자가 무슨
  // 일이 일어났는지 알고 스스로 판단해 새로고침할 수 있도록 안내한다.
  try {
    const mod = await tool.load();
    cleanup = mod.mount(root);
  } catch {
    showToast('새 버전이 배포되었습니다. 새로고침해 주세요.', 'error', true);
  }
}

window.addEventListener('hashchange', () => void render());
applyTheme(prefs.getTheme());
createPalette(tools);
if (import.meta.env.PROD) setupUpdatePrompt();
void render();
