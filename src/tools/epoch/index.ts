import type { ToolModule } from '../../types';
import { createSelect } from '../../ui/select';
import { createNumberForm } from '../../ui/numberForm';
import { DATE_TIME_MASK, INTEGER_MASK } from '../../ui/masks';
import { createResultList } from '../../ui/resultList';
import { fromEpoch, toEpoch, formatEpochInfo, type EpochInfo, type EpochUnit, type TimeZone } from './logic';

const mod: ToolModule = {
  mount(root) {
    const unit = createSelect([
      ['auto', '단위 자동 판별'],
      ['seconds', '초로 해석'],
      ['milliseconds', '밀리초로 해석'],
    ]);

    const unitBar = document.createElement('div');
    unitBar.className = 'io-controls';
    unitBar.append(unit);
    root.append(unitBar);

    let lastInfo: EpochInfo | undefined;

    // 이 방향의 결과와 오류는 아래 ResultList 가 전부 그린다. 폼 자신의 결과
    // 영역을 만들면 아무도 채우지 않는 빈 상자가 입력과 결과 사이에 남는다.
    const forwardForm = createNumberForm(
      root,
      /*
       * 정수 마스크다 — 숫자와 맨 앞 '-' 하나. '-' 를 함께 살리는 이유: fromEpoch 이
       * `-?\d+` 를 받고 detectUnit 이 `Math.abs` 로 판별하도록 만들어져 있어, 1970년
       * 이전 시각을 가리키는 음수 타임스탬프는 이 도구가 이미 지원하는 정상 입력이다.
       * 숫자만 남기는 필터로 '-' 를 지우면 그 입력을 아예 칠 수 없게 된다.
       * 쉼표/밑줄이 섞인 `1,700,000,000` 은 마스크가 순수한 숫자로 정규화한다.
       */
      [{ key: 'timestamp', label: '타임스탬프', placeholder: '1700000000', mask: INTEGER_MASK }],
      runForward,
      { result: false },
    );

    const result = createResultList(root, {
      label: '변환 결과',
      getCopyText: () => (lastInfo ? formatEpochInfo(lastInfo) : ''),
      emptyHint: '타임스탬프를 입력하면 변환 결과가 여기 표시됩니다.',
    });

    function runForward(): void {
      const { timestamp = '' } = forwardForm.values();
      if (timestamp.trim() === '') {
        lastInfo = undefined;
        result.setRows([]);
        return;
      }

      const outcome = fromEpoch(timestamp, unit.value as EpochUnit | 'auto', new Date());
      if (!outcome.ok) {
        lastInfo = undefined;
        result.setError(outcome.error);
        return;
      }

      lastInfo = outcome.value;
      result.setRows([
        { label: '입력 단위', value: outcome.value.unit === 'seconds' ? '초' : '밀리초' },
        { label: 'UTC', value: outcome.value.utc },
        { label: 'KST +09:00', value: outcome.value.kst },
        { label: 'ISO 8601', value: outcome.value.iso },
        { label: '초', value: String(outcome.value.epochSeconds) },
        { label: '밀리초', value: String(outcome.value.epochMillis) },
        { label: '상대 시각', value: outcome.value.relative },
      ]);
    }

    unit.addEventListener('change', runForward);

    const nowButton = document.createElement('button');
    nowButton.type = 'button';
    nowButton.textContent = '현재 시각 넣기';
    nowButton.addEventListener('click', () => {
      forwardForm.setValue('timestamp', String(Math.floor(Date.now() / 1000)));
    });
    unitBar.append(nowButton);

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

    // 위 방향과 마찬가지로 결과·오류는 전적으로 아래 ResultList 가 그린다.
    const reverseForm = createNumberForm(
      root,
      [
        {
          key: 'datetime',
          label: '날짜와 시각',
          placeholder: '2023-11-15 07:13:20',
          mask: DATE_TIME_MASK,
        },
      ],
      runReverse,
      { result: false },
    );

    let lastReverse: { seconds: number; millis: number } | undefined;

    // 같은 화면의 같은 종류의 답(타임스탬프)인데, 이 방향만 한 줄 문자열
    // (`초 … / 밀리초 …`)로 뭉쳐 보여주고 있었다. 위 방향과 같은 ResultList 로
    // 맞춰 초/밀리초를 각각 라벨 붙은 행으로 낸다.
    const reverseResult = createResultList(root, {
      label: '변환 결과',
      getCopyText: () =>
        lastReverse ? `초         ${lastReverse.seconds}\n밀리초     ${lastReverse.millis}` : '',
      emptyHint: '날짜와 시각을 입력하면 타임스탬프가 여기 표시됩니다.',
    });

    function runReverse(): void {
      const { datetime = '' } = reverseForm.values();
      if (datetime.trim() === '') {
        lastReverse = undefined;
        reverseResult.setRows([]);
        return;
      }
      const outcome = toEpoch(datetime, zone.value as TimeZone);
      if (!outcome.ok) {
        lastReverse = undefined;
        reverseResult.setError(outcome.error);
        return;
      }
      lastReverse = outcome.value;
      reverseResult.setRows([
        { label: '초', value: String(outcome.value.seconds) },
        { label: '밀리초', value: String(outcome.value.millis) },
      ]);
    }

    zone.addEventListener('change', runReverse);

    return () => {
      unitBar.remove();
      forwardForm.destroy();
      result.destroy();
      divider.remove();
      zoneBar.remove();
      reverseForm.destroy();
      reverseResult.destroy();
    };
  },
};

export default mod;
