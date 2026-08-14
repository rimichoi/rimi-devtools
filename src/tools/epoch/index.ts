import type { ToolModule } from '../../types';
import { createSelect } from '../../ui/select';
import { createIOPane } from '../../ui/ioPane';
import { createNumberForm } from '../../ui/numberForm';
import { fromEpoch, toEpoch, formatEpochInfo, type EpochUnit, type TimeZone } from './logic';

const mod: ToolModule = {
  mount(root) {
    const unit = createSelect([
      ['auto', '단위 자동 판별'],
      ['seconds', '초로 해석'],
      ['milliseconds', '밀리초로 해석'],
    ]);

    const pane = createIOPane(root, {
      controls: [unit],
      inputLabel: '타임스탬프',
      outputLabel: '변환 결과',
      placeholder: '1700000000',
      transform(input) {
        const result = fromEpoch(input, unit.value as EpochUnit | 'auto', new Date());
        return result.ok ? { ok: true, value: { text: formatEpochInfo(result.value) } } : result;
      },
    });

    const divider = document.createElement('h3');
    divider.textContent = '날짜 → 타임스탬프';
    divider.className = 'section-heading';
    root.append(divider);

    const zone = createSelect([
      ['kst', 'KST (+09:00) 기준'],
      ['utc', 'UTC 기준'],
    ]);
    const zoneBar = document.createElement('div');
    zoneBar.className = 'io-controls';
    zoneBar.append(zone);
    root.append(zoneBar);

    const form = createNumberForm(
      root,
      [{ key: 'datetime', label: '날짜와 시각', placeholder: '2023-11-15 07:13:20' }],
      runReverse,
    );

    function runReverse(): void {
      const { datetime = '' } = form.values();
      if (datetime.trim() === '') {
        form.setResult('');
        return;
      }
      const result = toEpoch(datetime, zone.value as TimeZone);
      if (!result.ok) {
        form.setError(result.error);
        return;
      }
      form.setResult(`초 ${result.value.seconds}  /  밀리초 ${result.value.millis}`);
    }

    zone.addEventListener('change', runReverse);

    const nowButton = document.createElement('button');
    nowButton.type = 'button';
    nowButton.textContent = '현재 시각 넣기';
    nowButton.addEventListener('click', () => {
      pane.setInput(String(Math.floor(Date.now() / 1000)));
    });
    zoneBar.append(nowButton);


    return () => {
      pane.destroy();
      divider.remove();
      zoneBar.remove();
      form.destroy();
    };
  },
};

export default mod;
