import './ui/styles.css';
import { tools, findTool } from './registry';
import { resolveToolId, shouldRender, UNSET } from './router';
import { renderSidebar } from './shell/sidebar';
import { prefs } from './shell/prefs';
import { applyTheme } from './shell/theme';
import { createPalette } from './shell/palette';
import { setupUpdatePrompt } from './shell/updateToast';
import { showToast } from './ui/toast';
import type { Tool, ToolModule } from './types';

const sidebar = document.querySelector<HTMLElement>('#sidebar');
const root = document.querySelector<HTMLElement>('#tool-root');
const header = document.querySelector<HTMLElement>('#tool-header');

/**
 * 도구 이름과 한 줄 설명을 본문 머리말에 그린다. 이전에는 도구가 무엇인지
 * 알려주는 문구가 본문 어디에도 없었다(사이드바 링크 텍스트가 전부였다).
 *
 * #tool-root 가 아니라 형제인 #tool-header 에 그린다 — mount 가 터진 경우
 * main.ts 는 #tool-root 를 빈 채로 남겨야 하고(e2e/tool-failure.spec.ts),
 * 헤더를 그 안에 넣으면 그 계약을 깬다.
 */
function renderHeader(tool: Tool | null): void {
  if (!header) return;
  header.replaceChildren();
  if (!tool) return;

  const title = document.createElement('h1');
  title.className = 'tool-title';
  title.textContent = tool.name;

  const desc = document.createElement('p');
  desc.className = 'tool-desc';
  desc.textContent = tool.description;

  // 여기에 "브라우저 안에서만 처리 · 전송 없음" 배지를 두었던 적이 있다. 뺐다 —
  // 페이지가 스스로 신뢰를 주장하는 것은 증거가 아니다. 증거는 CSP 응답 헤더,
  // 공개된 소스, 그리고 오리진 밖 요청이 하나라도 생기면 죽는 e2e/no-egress
  // 가드다. 배지는 모든 화면에서 자리를 상시 차지하면서 그중 무엇도 증명하지
  // 못했고, "전송 없음" 이라는 문구 자체도 부정확했다(동일 오리진 자산은
  // 실제로 받아 온다).
  header.append(title, desc);
}

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
    renderHeader(null);
    root.textContent = '등록된 도구가 없습니다.';
    return;
  }

  prefs.pushRecent(id);

  const tool = findTool(id);
  if (!tool) {
    renderHeader(null);
    return;
  }

  document.title = `${tool.name} · rimi devtools`;
  renderHeader(tool);

  // 여기서 실패하는 방식은 두 가지이고, 사용자가 해야 할 일이 정반대다.
  // 하나로 묶으면 반드시 한쪽에 거짓 안내를 하게 되므로 try 를 분리한다.
  // 어느 쪽이든 원인 오류를 콘솔에 남긴다 — 한 덩어리 catch 가 스택 트레이스까지
  // 통째로 삼키는 바람에, 재현하려는 사람에게 아무 단서도 남지 않았다.

  // 1) 청크를 못 받아온 경우. 다른 탭이 새 배포를 먼저 수락하면, 이 탭이 아직
  // 열지 않은 도구의 청크는 (해시가 바뀌어) service worker 의 새 precache 에도
  // 없고 서버에도 이미 없을 수 있다. 이 탭 자신을 강제로 리로드하지는 않지만
  // (다중 탭에서 동의 없는 리로드를 막는 것이 우선이다), 이 경우엔 새로고침이
  // 실제로 문제를 해결하므로 그렇게 안내한다.
  let mod: ToolModule;
  try {
    mod = await tool.load();
  } catch (err) {
    console.error(`[rimi-devtools] '${id}' 도구의 청크를 불러오지 못했습니다.`, err);
    showToast('새 버전이 배포되었습니다. 새로고침해 주세요.', 'error', true);
    return;
  }

  // 2) 청크는 받았는데 도구가 그리다 터진 경우. 버그이거나, 브라우저가 도구가
  // 쓰는 기능을 지원하지 않는 경우다(예: Intl.Segmenter 가 없는 Firefox 125
  // 미만에서 글자수 세기). 새로고침해도 결과가 같으므로 새로고침을 권하면 안 된다.
  try {
    cleanup = mod.mount(root);
  } catch (err) {
    console.error(`[rimi-devtools] '${id}' 도구를 그리지 못했습니다.`, err);
    showToast(
      `${tool.name} 도구를 여는 중 오류가 발생했습니다. 새로고침해도 해결되지 않습니다 — 브라우저를 최신 버전으로 올리거나 다른 도구를 이용해 주세요.`,
      'error',
      true,
    );
  }
}

window.addEventListener('hashchange', () => void render());
applyTheme(prefs.getTheme());
createPalette(tools);
if (import.meta.env.PROD) setupUpdatePrompt();
void render();
