import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { countText, formatStats } from './logic';

const mod: ToolModule = {
  mount(root) {
    const pane = createIOPane(root, {
      inputLabel: '텍스트',
      outputLabel: '통계',
      placeholder: '글자수를 셀 텍스트를 입력하세요.',
      transform(input) {
        return { ok: true, value: { text: formatStats(countText(input)) } };
      },
    });

    return () => pane.destroy();
  },
};

export default mod;
