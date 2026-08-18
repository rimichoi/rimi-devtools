import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { diffJson } from './logic';

const mod: ToolModule = {
  mount(root) {
    const pane = createIOPane(root, {
      inputLabel: '왼쪽 (기준)',
      placeholder: '{"id":1,"name":"다우"}',
      secondInput: {
        label: '오른쪽 (비교)',
        placeholder: '{"id":1,"name":"다우기술"}',
      },
      outputLabel: '차이',
      transform(left, right) {
        const outcome = diffJson(left, right ?? '');
        return outcome.ok ? { ok: true, value: { text: outcome.value } } : outcome;
      },
    });

    return () => pane.destroy();
  },
};

export default mod;
