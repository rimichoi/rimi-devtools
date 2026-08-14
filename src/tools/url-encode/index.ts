import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { encodeUrl, decodeUrl, type UrlMode } from './logic';

function createSelect(entries: readonly (readonly [string, string])[]): HTMLSelectElement {
  const select = document.createElement('select');
  for (const [value, label] of entries) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  return select;
}

const mod: ToolModule = {
  mount(root, initialInput) {
    const direction = createSelect([
      ['encode', '인코딩'],
      ['decode', '디코딩'],
    ]);
    const mode = createSelect([
      ['component', '값 단위 (encodeURIComponent)'],
      ['full', 'URL 전체 (encodeURI)'],
    ]);

    const pane = createIOPane(root, {
      controls: [direction, mode],
      placeholder: 'URL 또는 쿼리 값을 붙여넣으세요.',
      transform(input) {
        const m = mode.value as UrlMode;
        const result = direction.value === 'encode' ? encodeUrl(input, m) : decodeUrl(input.trim(), m);
        return result.ok ? { ok: true, value: { text: result.value } } : result;
      },
    });

    if (initialInput) pane.setInput(initialInput);
    return () => pane.destroy();
  },
};

export default mod;
