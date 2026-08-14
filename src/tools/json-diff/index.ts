import type { ToolModule } from '../../types';
import { createCopyButton } from '../../ui/copyButton';
import { diffJson } from './logic';

const mod: ToolModule = {
  mount(root) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-custom';

    const pane = document.createElement('div');
    pane.className = 'io-pane';

    function makeSide(labelText: string, placeholder: string): HTMLTextAreaElement {
      const box = document.createElement('div');
      const label = document.createElement('label');
      label.textContent = labelText;
      const area = document.createElement('textarea');
      area.spellcheck = false;
      area.placeholder = placeholder;
      area.addEventListener('input', run);
      box.append(label, area);
      pane.append(box);
      return area;
    }

    const left = makeSide('왼쪽 (기준)', '{"id":1,"name":"다우"}');
    const right = makeSide('오른쪽 (비교)', '{"id":1,"name":"다우기술"}');

    const resultHead = document.createElement('div');
    resultHead.className = 'io-output-head section-heading';
    const resultLabel = document.createElement('label');
    resultLabel.textContent = '차이';
    const result = document.createElement('pre');
    result.className = 'diff-result';
    resultHead.append(resultLabel, createCopyButton(() => result.textContent ?? ''));

    const error = document.createElement('div');
    error.className = 'io-error';

    function run(): void {
      error.textContent = '';
      if (left.value.trim() === '' && right.value.trim() === '') {
        result.textContent = '';
        return;
      }
      const outcome = diffJson(left.value, right.value);
      if (outcome.ok) {
        result.textContent = outcome.value;
      } else {
        result.textContent = '';
        error.textContent = outcome.error;
      }
    }

    wrap.append(pane, resultHead, result, error);
    root.append(wrap);

    return () => wrap.remove();
  },
};

export default mod;
