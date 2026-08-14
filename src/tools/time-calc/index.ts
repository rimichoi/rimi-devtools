import type { ToolModule } from '../../types';
import { createSelect } from '../../ui/select';
import { createNumberForm, type NumberFormHandle } from '../../ui/numberForm';
import { addDuration, diffDates, shiftDate } from './logic';

type Mode = 'duration' | 'diff' | 'shift';

const MODES = [
  ['duration', '시간 더하기 / 빼기'],
  ['diff', '두 날짜 사이 일수'],
  ['shift', '날짜에 일수 더하기'],
] as const;

const mod: ToolModule = {
  mount(root) {
    const mode = createSelect(MODES);
    const op = createSelect([
      ['+', '더하기'],
      ['-', '빼기'],
    ]);

    const bar = document.createElement('div');
    bar.className = 'io-controls';
    bar.append(mode, op);
    root.append(bar);

    const host = document.createElement('div');
    root.append(host);

    let form: NumberFormHandle | null = null;

    function fieldsFor(m: Mode) {
      if (m === 'duration') {
        return [
          { key: 'a', label: '시간 A', placeholder: '01:30:00' },
          { key: 'b', label: '시간 B', placeholder: '00:45:30' },
        ];
      }
      if (m === 'diff') {
        return [
          { key: 'a', label: '시작 날짜', placeholder: '2026-08-01' },
          { key: 'b', label: '종료 날짜', placeholder: '2026-08-14' },
        ];
      }
      return [
        { key: 'a', label: '기준 날짜', placeholder: '2026-08-14' },
        { key: 'b', label: '더할 일수 (음수 가능)', placeholder: '20' },
      ];
    }

    function compute(): void {
      if (!form) return;
      const { a = '', b = '' } = form.values();
      if (a.trim() === '' || b.trim() === '') {
        form.setResult('');
        return;
      }

      const m = mode.value as Mode;
      if (m === 'duration') {
        const r = addDuration(a, b, op.value === '-' ? '-' : '+');
        r.ok ? form.setResult(r.value) : form.setError(r.error);
        return;
      }
      if (m === 'diff') {
        const r = diffDates(a, b);
        if (!r.ok) return form.setError(r.error);
        const { days, weeks, remainderDays } = r.value;
        form.setResult(`${days}일 (${weeks}주 ${remainderDays}일)`);
        return;
      }
      const r = shiftDate(a, Number(b));
      r.ok ? form.setResult(r.value) : form.setError(r.error);
    }

    function rebuild(): void {
      form?.destroy();
      const m = mode.value as Mode;
      op.style.display = m === 'duration' ? '' : 'none';
      form = createNumberForm(host, fieldsFor(m), compute);
      compute();
    }

    mode.addEventListener('change', rebuild);
    op.addEventListener('change', compute);
    rebuild();

    return () => {
      form?.destroy();
      bar.remove();
      host.remove();
    };
  },
};

export default mod;
