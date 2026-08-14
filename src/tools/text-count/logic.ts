export interface TextStats {
  /** 사람이 세는 글자수. 결합 이모지를 1로 센다 */
  graphemes: number;
  /** 유니코드 코드포인트 수 */
  codePoints: number;
  /** JS 의 String.length 값 */
  utf16Units: number;
  /** 공백류를 제외한 글자수 (grapheme 기준) */
  charsNoSpace: number;
  bytesUtf8: number;
  words: number;
  lines: number;
}

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

function countGraphemes(text: string): number {
  return [...segmenter.segment(text)].length;
}

export function countText(text: string): TextStats {
  const noSpace = text.replace(/\s/g, '');

  return {
    graphemes: countGraphemes(text),
    codePoints: Array.from(text).length,
    utf16Units: text.length,
    charsNoSpace: countGraphemes(noSpace),
    bytesUtf8: new TextEncoder().encode(text).length,
    words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
    lines: text === '' ? 0 : text.replace(/\n$/, '').split('\n').length,
  };
}

export function formatStats(stats: TextStats): string {
  const rows: [string, number][] = [
    ['글자수 (공백 포함)', stats.graphemes],
    ['글자수 (공백 제외)', stats.charsNoSpace],
    ['단어수', stats.words],
    ['줄수', stats.lines],
    ['바이트 (UTF-8)', stats.bytesUtf8],
    ['코드포인트', stats.codePoints],
    ['String.length (UTF-16)', stats.utf16Units],
  ];
  return rows.map(([label, value]) => `${label}: ${value.toLocaleString('ko-KR')}`).join('\n');
}
