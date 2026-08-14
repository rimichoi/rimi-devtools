import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createSelect } from '../../ui/select';
import { encodeBase64, decodeBase64 } from './logic';

const mod: ToolModule = {
  mount(root, initialInput) {
    const mode = createSelect([
      ['encode', '인코딩 (텍스트 → Base64)'],
      ['decode', '디코딩 (Base64 → 텍스트)'],
    ]);

    const pane = createIOPane(root, {
      controls: [mode],
      placeholder: '변환할 내용을 붙여넣으세요.',
      transform(input) {
        const result = mode.value === 'encode' ? encodeBase64(input) : decodeBase64(input.trim());
        return result.ok ? { ok: true, value: { text: result.value } } : result;
      },
    });

    if (initialInput) pane.setInput(initialInput);
    return () => pane.destroy();
  },
};

export default mod;
