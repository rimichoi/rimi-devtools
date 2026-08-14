import type { ToolModule } from '../../types';
import { createSelect } from '../../ui/select';
import { createNumberForm } from '../../ui/numberForm';
import { calcPercent, PERCENT_MODES, type PercentMode } from './logic';

const mod: ToolModule = {
  mount(root) {
    const mode = createSelect(PERCENT_MODES.map((m) => [m.id, m.label] as const));
    const bar = document.createElement('div');
    bar.className = 'io-controls';
    bar.append(mode);
    root.append(bar);

    const form = createNumberForm(
      root,
      [
        { key: 'a', label: 'A', placeholder: '숫자' },
        { key: 'b', label: 'B', placeholder: '숫자' },
      ],
      run,
    );

    function currentMode(): (typeof PERCENT_MODES)[number] {
      return PERCENT_MODES.find((m) => m.id === mode.value) ?? PERCENT_MODES[0];
    }

    function run(): void {
      const spec = currentMode();
      form.setLabel('a', spec.labelA);
      form.setLabel('b', spec.labelB);

      const { a = '', b = '' } = form.values();
      if (a.trim() === '' || b.trim() === '') {
        form.setResult('');
        return;
      }

      const result = calcPercent(spec.id as PercentMode, Number(a), Number(b));
      if (!result.ok) {
        form.setError(result.error);
        return;
      }

      const suffix = spec.id === 'ratio' || spec.id === 'change' ? ' %' : '';
      form.setResult(result.value.toLocaleString('ko-KR') + suffix);
    }

    mode.addEventListener('change', run);
    run();

    return () => {
      bar.remove();
      form.destroy();
    };
  },
};

export default mod;
