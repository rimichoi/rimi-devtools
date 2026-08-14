import type { ToolModule } from '../../types';
import { createIOPane } from '../../ui/ioPane';
import { createSelect } from '../../ui/select';
import { formatJson, type FormatOptions } from './logic';

const mod: ToolModule = {
  mount(root, initialInput) {
    const indent = createSelect([
      ['2', '들여쓰기 2칸'],
      ['4', '들여쓰기 4칸'],
      ['tab', '탭'],
      ['minify', '압축 (한 줄)'],
    ]);

    const sortWrap = document.createElement('label');
    sortWrap.className = 'inline-check';
    const sort = document.createElement('input');
    sort.type = 'checkbox';
    sortWrap.append(sort, document.createTextNode(' 키 정렬'));

    const pane = createIOPane(root, {
      controls: [indent, sortWrap],
      inputLabel: 'JSON',
      outputLabel: '결과',
      placeholder: '{"id": 1, "name": "다우"}',
      transform(input) {
        const value = indent.value;
        const options: FormatOptions = {
          indent: value === 'minify' ? 'minify' : value === 'tab' ? 'tab' : Number(value),
          sortKeys: sort.checked,
        };
        return formatJson(input, options);
      },
    });

    sort.addEventListener('change', pane.run);

    if (initialInput) pane.setInput(initialInput);
    return () => pane.destroy();
  },
};

export default mod;
