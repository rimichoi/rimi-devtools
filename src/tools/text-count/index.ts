import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createResultList, type ResultRow } from '../../ui/resultList';
import {
  countEucKrBytes,
  countText,
  findInvisibleChars,
  formatCodePoint,
  formatFinding,
  formatUnsupportedChar,
} from './logic';

function decimal(value: number): string {
  return value.toLocaleString('ko-KR');
}

function copyTextOf(rows: ResultRow[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join('\n');
}

const EMPTY_HINT = '텍스트를 입력하면 결과가 여기에 표시됩니다.';

const mod: ToolModule = {
  mount(root) {
    /*
     * 결과가 "한 덩어리 텍스트" 가 아니라 통계 묶음 둘 + 발견 목록 둘이므로
     * ioPane.ts 의 컴포넌트 선택 규칙 5번을 따른다: 입력은 IOPane 의 입력 카드,
     * 결과는 ResultList 넷. 이전에는 formatStats() 가 만든 문자열을 출력
     * textarea 에 넣었는데, 그러면 세 가지 "글자수" 가 왜 다른지도, 보이지 않는
     * 문자를 찾았는지도 줄글에 묻혀 읽히지 않았다.
     */
    const results = document.createElement('div');
    results.className = 'text-count-results';

    let basicRows: ResultRow[] = [];
    let unitRows: ResultRow[] = [];
    let eucKrRows: ResultRow[] = [];
    let invisibleRows: ResultRow[] = [];

    const basic = createResultList(results, {
      label: '기본 통계',
      getCopyText: () => copyTextOf(basicRows),
      emptyHint: EMPTY_HINT,
    });

    // 세 가지 "글자수" 는 서로 다른 값이 나올 수 있고, 어느 값이 맞는지는
    // 길이 제한을 검사하는 쪽이 무엇으로 세는지에 달려 있다. 대응하는 언어를
    // 라벨에 적어 두는 것이 그 사실을 가장 직접적으로 알려준다. 첫 행(자소)은
    // 위 '기본 통계' 와 같은 값을 한 번 더 보여주는데, 그게 비교의 기준점이다 —
    // 이 표는 값 목록이 아니라 "어디서 어긋나는가" 를 보는 표다.
    const units = createResultList(results, {
      label: '길이 제한 단위 (백엔드가 세는 기준)',
      getCopyText: () => copyTextOf(unitRows),
      emptyHint: EMPTY_HINT,
    });

    const eucKr = createResultList(results, {
      label: 'EUC-KR 로 표현할 수 없는 문자',
      getCopyText: () => copyTextOf(eucKrRows),
      emptyHint: EMPTY_HINT,
    });

    const invisible = createResultList(results, {
      label: '보이지 않는 문자 / JSON 위험 문자',
      getCopyText: () => copyTextOf(invisibleRows),
      emptyHint: EMPTY_HINT,
    });

    function reset(): void {
      basicRows = [];
      unitRows = [];
      eucKrRows = [];
      invisibleRows = [];
      basic.setRows(basicRows);
      units.setRows(unitRows);
      eucKr.setRows(eucKrRows);
      invisible.setRows(invisibleRows);
    }

    function update(text: string): void {
      // trim() 으로 빈 입력을 판정하면 안 된다 — JS 의 trim() 은 U+00A0(NBSP) 도
      // 지우므로, "NBSP 만 들어 있는 텍스트" 가 빈 입력으로 취급돼 이 도구에서
      // 가장 값진 검사(보이지 않는 문자)를 통째로 건너뛰게 된다.
      if (text === '') {
        reset();
        return;
      }

      const stats = countText(text);
      const euc = countEucKrBytes(text);

      basicRows = [
        { label: '글자수 (공백 포함)', value: decimal(stats.graphemes) },
        { label: '글자수 (공백 제외)', value: decimal(stats.charsNoSpace) },
        { label: '줄수', value: decimal(stats.lines) },
      ];
      basic.setRows(basicRows);

      unitRows = [
        { label: '글자수 (사람이 보는 수)', value: decimal(stats.graphemes) },
        { label: '코드포인트 (Python·Go len)', value: decimal(stats.codePoints) },
        { label: 'UTF-16 (Java·JS length)', value: decimal(stats.utf16Units) },
        { label: '바이트 (UTF-8)', value: decimal(stats.bytesUtf8) },
      ];
      if (euc.ok) {
        const unsupportedCount = euc.value.unsupported.reduce((sum, item) => sum + item.count, 0);
        unitRows.push({
          label: '바이트 (EUC-KR)',
          value:
            unsupportedCount === 0
              ? decimal(euc.value.bytes)
              : `${decimal(euc.value.bytes)} (표현 불가 ${decimal(unsupportedCount)}자를 ? 1바이트로 계산)`,
        });
      }
      units.setRows(unitRows);

      if (!euc.ok) {
        eucKrRows = [];
        eucKr.setError(euc.error);
      } else {
        eucKrRows = euc.value.unsupported.map((item) => ({
          label: formatCodePoint(item.codePoint),
          value: formatUnsupportedChar(item),
        }));
        eucKr.setRows(eucKrRows, '모든 문자를 EUC-KR 로 표현할 수 있습니다.');
      }

      invisibleRows = findInvisibleChars(text).map((finding) => ({
        label: finding.label,
        value: formatFinding(finding),
      }));
      invisible.setRows(invisibleRows, '보이지 않는 문자나 제어문자가 없습니다.');
    }

    const pane = createIOPane(root, {
      inputLabel: '텍스트',
      placeholder: '글자수를 셀 텍스트를 입력하세요.',
      output: false,
      onInput: update,
    });

    root.append(results);

    return () => {
      pane.destroy();
      basic.destroy();
      units.destroy();
      eucKr.destroy();
      invisible.destroy();
      results.remove();
    };
  },
};

export default mod;
