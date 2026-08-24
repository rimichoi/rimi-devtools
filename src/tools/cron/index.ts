import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createResultList, type ResultRow } from '../../ui/resultList';
import { formatKst, formatUtc, nextRuns, parseCron, type CronParsedValue } from './logic';

/*
 * 컴포넌트 선택 근거(ioPane.ts 상단 규칙 4번): 입력은 텍스트 한 덩어리고 결과는
 * 필드 해석 목록 + 다음 실행 시각 목록 + 경고로 나뉜다. 그래서 입력은 IOPane 의
 * 입력 카드(`output: false`)를 쓰고 결과는 ResultList 둘로 그린다.
 *
 * numberForm 을 쓰지 않는 이유: 그쪽은 숫자 필드와 masks.ts 의 마스크를 전제한다.
 * 크론 표현식은 `0 0 9-18 * * MON-FRI` 처럼 자릿수도 구분자도 고정돼 있지 않아
 * 붙일 마스크가 없다. 입력이 한 줄이라 textarea 가 높으므로 CSS 로 낮춘다
 * (`.cron-tool` 규칙) — 컴포넌트를 새로 만들지는 않는다.
 *
 * 결과 개수는 5개로 둔다. "이 배치 언제 도냐" 에 답하려면 다음 한 번으로는
 * 주기가 안 보이고(매일인지 매주인지), 열 개는 화면만 차지한다.
 */
const RUN_COUNT = 5;

function copyTextOf(rows: ResultRow[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join('\n');
}

const mod: ToolModule = {
  mount(root) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-stack cron-tool';

    const summary = document.createElement('div');
    summary.className = 'cron-summary';

    const warnings = document.createElement('div');
    warnings.className = 'cron-warnings';

    const panes = document.createElement('div');
    panes.className = 'cron-panes';
    const fieldsBox = document.createElement('div');
    const runsBox = document.createElement('div');
    panes.append(fieldsBox, runsBox);

    const error = document.createElement('div');
    error.className = 'io-error';

    let fieldRows: ResultRow[] = [];
    let runRows: ResultRow[] = [];

    createIOPane(wrap, {
      inputLabel: '크론 표현식',
      placeholder: '0 0 8 * * *   (Spring 6필드)  또는  0 8 * * *  (표준 crontab 5필드)',
      output: false,
      onInput: (input) => recompute(input),
    });

    wrap.append(summary, warnings, panes, error);

    const fieldList = createResultList(fieldsBox, {
      label: '필드 해석',
      getCopyText: () => copyTextOf(fieldRows),
      emptyHint: '크론 표현식을 입력하면 필드별 해석이 여기에 표시됩니다.',
    });

    const runList = createResultList(runsBox, {
      label: `다음 실행 ${RUN_COUNT}회 (KST · UTC)`,
      getCopyText: () => copyTextOf(runRows),
      emptyHint: '크론 표현식을 입력하면 다음 실행 시각이 여기에 표시됩니다.',
    });

    function clearResults(): void {
      summary.textContent = '';
      summary.removeAttribute('data-dialect');
      warnings.replaceChildren();
      fieldRows = [];
      runRows = [];
      fieldList.setRows([]);
      runList.setRows([]);
    }

    function renderWarnings(value: CronParsedValue): void {
      warnings.replaceChildren();
      for (const warning of value.warnings) {
        const line = document.createElement('div');
        // 새 색을 만들지 않는다. 위험은 오류와 같은 빨강, 주의는 경고와 같은 주황이다.
        line.className = warning.severity === 'danger' ? 'io-error' : 'io-warn';
        line.textContent = warning.message;
        warnings.append(line);
      }
    }

    function recompute(input: string): void {
      const result = parseCron(input);

      if (!result.ok) {
        error.textContent = result.error;
        clearResults();
        return;
      }
      error.textContent = '';

      if (result.value.kind === 'empty') {
        clearResults();
        return;
      }

      const value = result.value;
      // 어느 방언으로 읽었는지 화면에 남긴다. 6필드를 Quartz 로 적은 사람이
      // 요일 번호가 다르다는 것을 알아챌 유일한 단서다.
      summary.textContent = `${value.dialect === 'spring6' ? 'Spring 6필드' : '표준 crontab 5필드'} · ${value.summary}`;
      summary.dataset['dialect'] = value.dialect;
      renderWarnings(value);

      fieldRows = value.fields.map((field) => ({
        label: `${field.label}  ${field.raw}`,
        value: field.description,
      }));
      fieldList.setRows(fieldRows);

      // 현재 시각은 여기서 한 번만 읽는다. logic.ts 는 시계를 읽지 않는다.
      const runs = nextRuns(value, Date.now(), RUN_COUNT);
      runRows = runs.map((at, index) => ({
        label: `${index + 1}번째`,
        value: `${formatKst(at).replace('T', ' ')} KST · ${formatUtc(at).replace('T', ' ')} UTC`,
      }));
      runList.setRows(
        runRows,
        '앞으로 9년 안에 실행되지 않습니다. 2월 30일처럼 오지 않는 날짜일 수 있습니다.',
      );
    }

    root.append(wrap);
    recompute('');

    return () => {
      fieldList.destroy();
      runList.destroy();
      wrap.remove();
    };
  },
};

export default mod;
