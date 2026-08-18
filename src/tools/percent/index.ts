import type { ToolModule } from '../../types';
import { createSelect } from '../../ui/select';
import { createNumberForm } from '../../ui/numberForm';
import { DECIMAL_MASK } from '../../ui/masks';
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
      /*
       * 음수와 소수를 둘 다 허용한다(DECIMAL_MASK). 이 도구가 실제로 계산하는 것을
       * 보면 둘 다 필수다:
       *  - 소수: '12.5 % 를 적용하면', '3.5 는 200 의 몇 %' 는 이 도구의 평범한
       *    사용이다. 정수로 제한하면 퍼센트 계산기가 아니게 된다.
       *  - 음수: applyChange 의 B(증감 %)에 -10 을 넣는 것이 '10 % 할인' 이고,
       *    change 는 이미 음수 결과를 낸다. ratio/partOf 의 A/B 도 손익처럼 음수인
       *    값을 다룰 수 있다. 0 으로 나누는 경우만 logic 이 한국어 오류로 막는다.
       * 네 모드가 라벨만 바꾸고 같은 두 칸을 쓰므로, 모드별로 다른 마스크를 주지
       * 않는다 — 모드를 바꿀 때 이미 친 값이 마스크에 걸려 잘리는 일이 없다.
       */
      [
        { key: 'a', label: 'A', placeholder: '숫자', mask: DECIMAL_MASK },
        { key: 'b', label: 'B', placeholder: '숫자', mask: DECIMAL_MASK },
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
