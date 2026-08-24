import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createResultList, type ResultRow } from '../../ui/resultList';
import {
  SEARCH_HORIZON_YEARS,
  formatKst,
  formatUtc,
  nextRuns,
  parseCron,
  type CronParsedValue,
} from './logic';

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
      const schedule = nextRuns(value, Date.now(), RUN_COUNT);
      runRows = schedule.runs.map((at, index) => ({
        label: `${index + 1}번째`,
        value: `${formatKst(at).replace('T', ' ')} KST · ${formatUtc(at).replace('T', ' ')} UTC`,
      }));

      /*
       * "영원히 안 돈다" 와 "아직 멀어서 여기까지만 찾았다" 는 사용자에게 전혀
       * 다른 소식이다. 예전에는 둘을 한 문구로 뭉쳐서, 12년 뒤에 실제로 도는
       * 배치에 "2월 30일처럼 오지 않는 날짜일 수 있습니다" 라고 답했다.
       */
      runList.setRows(
        runRows,
        schedule.impossible
          ? '달력에 없는 날짜라 영원히 실행되지 않습니다 (2월 30일처럼).'
          : `앞으로 ${SEARCH_HORIZON_YEARS}년 안에는 실행되지 않습니다.`,
      );

      // 일부만 찾은 경우도 조용히 넘기지 않는다 — 헤더는 5회라고 말하는데 목록이
      // 한 줄뿐이면 사용자는 그게 전부인 줄 안다.
      if (schedule.truncated && schedule.runs.length > 0) {
        const note = document.createElement('div');
        note.className = 'io-warn';
        note.textContent = `앞으로 ${SEARCH_HORIZON_YEARS}년 안에서 ${schedule.runs.length}개만 찾았습니다. 그 뒤에도 실행될 수 있습니다.`;
        warnings.append(note);
      }
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
