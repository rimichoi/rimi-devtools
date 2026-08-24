import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createResultList, type ResultRow } from '../../ui/resultList';
import {
  SETGID,
  SETUID,
  STICKY,
  classRows,
  describeMode,
  parseMode,
  toSymbolic,
} from './logic';

/*
 * 컴포넌트 선택 근거(ioPane.ts 상단 규칙 4번): 입력은 텍스트 한 덩어리고 결과는
 * 클래스별 권한 목록 + 상세 목록 + 경고로 나뉜다. 입력은 IOPane 의 입력 카드
 * (`output: false`), 결과는 ResultList 둘이다.
 *
 * 여기에 체크박스 격자를 하나 더 둔다. 이 도구는 "이 모드가 뭐냐" 만이 아니라
 * "이 권한을 주려면 몇 번이냐" 에도 답해야 하는데, 후자는 글자를 치는 것보다
 * 눌러서 고르는 쪽이 맞다. 공용 컴포넌트로 빼지 않는다 — 사용자가 이 도구
 * 하나뿐이고, 3×3 + 특수 비트라는 모양이 chmod 에만 있다.
 *
 * 격자와 입력칸은 서로를 갱신하지만 순환하지 않는다: 체크박스를 누르면
 * `pane.setInput()` 으로 입력을 갈아끼우고 그게 recompute 를 부르며, recompute 가
 * 다시 체크박스를 맞출 때는 `.checked` 를 직접 대입하므로 change 이벤트가 나지
 * 않는다.
 */

const PERMISSIONS: readonly { label: string; bit: number }[] = [
  { label: '읽기', bit: 0b100 },
  { label: '쓰기', bit: 0b010 },
  { label: '실행', bit: 0b001 },
];

const CLASSES: readonly { label: string; shift: number }[] = [
  { label: '소유자', shift: 6 },
  { label: '그룹', shift: 3 },
  { label: '기타', shift: 0 },
];

const SPECIALS: readonly { label: string; bit: number }[] = [
  { label: 'setuid', bit: SETUID },
  { label: 'setgid', bit: SETGID },
  { label: 'sticky', bit: STICKY },
];

function copyTextOf(rows: ResultRow[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join('\n');
}

const mod: ToolModule = {
  mount(root) {
    const wrap = document.createElement('div');
    wrap.className = 'tool-stack chmod-tool';

    const summary = document.createElement('div');
    summary.className = 'chmod-summary';

    const warnings = document.createElement('div');
    warnings.className = 'chmod-warnings';

    // ── 체크박스 격자 ─────────────────────────────────────────────────
    const grid = document.createElement('section');
    grid.className = 'panel chmod-grid';

    const gridHead = document.createElement('div');
    gridHead.className = 'io-output-head';
    const gridLabel = document.createElement('label');
    gridLabel.textContent = '권한 고르기';
    gridHead.append(gridLabel);

    const table = document.createElement('table');
    const headRow = document.createElement('tr');
    headRow.append(document.createElement('th'));
    for (const permission of PERMISSIONS) {
      const th = document.createElement('th');
      th.textContent = permission.label;
      th.scope = 'col';
      headRow.append(th);
    }
    table.append(headRow);

    const boxes: { input: HTMLInputElement; bit: number }[] = [];

    for (const klass of CLASSES) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = klass.label;
      th.scope = 'row';
      row.append(th);

      for (const permission of PERMISSIONS) {
        const cell = document.createElement('td');
        const box = document.createElement('input');
        box.type = 'checkbox';
        // 눈에 보이는 라벨이 행·열 머리글에 흩어져 있어 스크린 리더가 셀 하나만
        // 읽으면 무슨 항목인지 알 수 없다. 셀마다 완성된 이름을 붙인다.
        box.setAttribute('aria-label', `${klass.label} ${permission.label}`);
        boxes.push({ input: box, bit: permission.bit << klass.shift });
        cell.append(box);
        row.append(cell);
      }
      table.append(row);
    }

    const specialRow = document.createElement('div');
    specialRow.className = 'chmod-specials';
    for (const special of SPECIALS) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      const text = document.createElement('span');
      text.textContent = special.label;
      label.append(box, text);
      boxes.push({ input: box, bit: special.bit });
      specialRow.append(label);
    }

    grid.append(gridHead, table, specialRow);

    const panes = document.createElement('div');
    panes.className = 'chmod-panes';
    const classBox = document.createElement('div');
    const detailBox = document.createElement('div');
    panes.append(classBox, detailBox);

    const error = document.createElement('div');
    error.className = 'io-error';

    let permissionRows: ResultRow[] = [];
    let detailRows: ResultRow[] = [];

    const pane = createIOPane(wrap, {
      inputLabel: '모드',
      placeholder: '755   0644   4755   rwxr-xr-x   -rwsr-xr-x   (ls -l 한 줄을 붙여넣어도 됩니다)',
      output: false,
      onInput: (input) => recompute(input),
    });

    wrap.append(summary, warnings, grid, panes, error);

    const classList = createResultList(classBox, {
      label: '누가 무엇을 할 수 있나',
      getCopyText: () => copyTextOf(permissionRows),
      emptyHint: '모드를 입력하면 여기에 표시됩니다.',
    });

    const detailList = createResultList(detailBox, {
      label: '표기',
      getCopyText: () => copyTextOf(detailRows),
      emptyHint: '모드를 입력하면 여기에 표시됩니다.',
    });

    function clearResults(): void {
      summary.textContent = '';
      warnings.replaceChildren();
      permissionRows = [];
      detailRows = [];
      classList.setRows([]);
      detailList.setRows([]);
      for (const box of boxes) box.input.checked = false;
    }

    function recompute(input: string): void {
      const result = parseMode(input);

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

      const { mode, fileType } = result.value;
      const description = describeMode(mode);

      summary.textContent = description.summary;
      warnings.replaceChildren();
      for (const warning of description.warnings) {
        const line = document.createElement('div');
        // 새 색을 만들지 않는다. 위험은 오류와 같은 빨강, 주의는 경고와 같은 주황이다.
        line.className = warning.severity === 'danger' ? 'io-error' : 'io-warn';
        line.textContent = warning.message;
        warnings.append(line);
      }

      // 체크박스를 맞춘다. `.checked` 직접 대입은 change 이벤트를 내지 않으므로
      // 여기서 다시 recompute 로 되돌아오지 않는다.
      for (const box of boxes) box.input.checked = (mode & box.bit) !== 0;

      permissionRows = classRows(mode);
      classList.setRows(permissionRows);

      detailRows = [
        { label: '8진수', value: mode.toString(8).padStart(4, '0') },
        { label: '심볼릭', value: toSymbolic(mode) },
        { label: 'chmod', value: description.command },
      ];
      if (fileType !== null) detailRows.push({ label: '파일 종류', value: fileType });
      detailList.setRows(detailRows);
    }

    function onBoxChange(): void {
      let mode = 0;
      for (const box of boxes) if (box.input.checked) mode |= box.bit;
      // 입력칸을 진실의 출처로 유지한다. setInput 이 recompute 를 다시 부르므로
      // 결과와 체크박스가 한 경로로만 갱신된다.
      pane.setInput(mode.toString(8).padStart(4, '0'));
    }

    for (const box of boxes) box.input.addEventListener('change', onBoxChange);

    root.append(wrap);
    recompute('');

    return () => {
      for (const box of boxes) box.input.removeEventListener('change', onBoxChange);
      pane.destroy();
      classList.destroy();
      detailList.destroy();
      wrap.remove();
    };
  },
};

export default mod;
