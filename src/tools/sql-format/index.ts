import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createSelect } from '../../ui/select';
import { formatSql, SQL_DIALECTS } from './logic';

const mod: ToolModule = {
  mount(root) {
    const dialect = createSelect(SQL_DIALECTS);
    const keywordCase = createSelect([
      ['upper', '키워드 대문자'],
      ['lower', '키워드 소문자'],
      ['preserve', '원형 유지'],
    ]);

    const pane = createIOPane(root, {
      controls: [dialect, keywordCase],
      inputLabel: 'SQL',
      outputLabel: '포맷 결과',
      placeholder: 'select a, b from t where a = 1',
      transform(input) {
        const result = formatSql(
          input,
          dialect.value,
          keywordCase.value as 'upper' | 'lower' | 'preserve',
        );
        return result.ok ? { ok: true, value: { text: result.value } } : result;
      },
    });

    return () => pane.destroy();
  },
};

export default mod;
