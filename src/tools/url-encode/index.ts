import type { ToolModule } from '../../types';
import { createLinkedPanes } from '../../ui/linkedPanes';
import { createSelect } from '../../ui/select';
import { encodeUrl, decodeUrl, type UrlMode } from './logic';

const mod: ToolModule = {
  mount(root) {
    // 방향(인코딩/디코딩) select 는 없앴다 — 두 값을 양방향으로 잇는다.
    // 이 select 는 남는다. 방향이 아니라 '무엇을 escape 할 것인가' 를 정하는,
    // 결과가 실제로 달라지는 선택이기 때문이다.
    const mode = createSelect([
      ['component', '값 단위 (encodeURIComponent)'],
      ['full', 'URL 전체 (encodeURI)'],
    ]);

    const panes = createLinkedPanes(root, {
      controls: [mode],
      left: { label: '원문', placeholder: 'URL 또는 쿼리 값을 붙여넣으세요.' },
      right: { label: '인코딩된 값', placeholder: '퍼센트 인코딩된 값을 붙여넣으세요.' },
      toRight: (text) => encodeUrl(text, mode.value as UrlMode),
      toLeft: (encoded) => decodeUrl(encoded, mode.value as UrlMode),
    });

    // 규칙이 바뀌었으니 두 값을 다시 맞춘다(원문 기준).
    const onModeChange = (): void => panes.resync();
    mode.addEventListener('change', onModeChange);

    return () => {
      mode.removeEventListener('change', onModeChange);
      panes.destroy();
    };
  },
};

export default mod;
