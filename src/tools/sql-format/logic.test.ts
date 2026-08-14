import { describe, it, expect } from 'vitest';
import { formatSql, SQL_DIALECTS } from './logic';

describe('SQL_DIALECTS', () => {
  it('Oracle(plsql) 을 첫 항목으로 둔다', () => {
    expect(SQL_DIALECTS[0]?.[0]).toBe('plsql');
  });
});

describe('formatSql', () => {
  it('한 줄 쿼리를 여러 줄로 편다', () => {
    const r = formatSql('select a,b from t where a=1', 'sql', 'upper');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('SELECT');
    expect(r.value.split('\n').length).toBeGreaterThan(1);
  });

  it('키워드를 소문자로 바꾼다', () => {
    const r = formatSql('SELECT A FROM T', 'sql', 'lower');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('select');
  });

  it('키워드 원형을 보존한다', () => {
    const r = formatSql('select a from t', 'sql', 'preserve');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('select');
  });

  it('Oracle 방언을 처리한다', () => {
    // LEVEL은 Oracle(plsql) 전용 키워드. 표준 SQL(sql)에서는 일반 식별자다.
    // plsql 방언: LEVEL은 대문자로, CONNECT BY는 새 줄에 들어간다.
    // sql 방언: level은 소문자, CONNECT BY는 한 줄에 붙는다.
    const r = formatSql('select level from dual connect by level <= 3', 'plsql', 'upper');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('LEVEL');
    expect(r.value).toContain('CONNECT BY');
  });

  it('빈 입력은 에러다', () => {
    expect(formatSql('   ', 'sql', 'upper').ok).toBe(false);
  });

  it('알 수 없는 방언은 에러로 처리하고 크래시하지 않는다', () => {
    const r = formatSql('select 1', 'nope-dialect', 'upper');
    expect(r.ok).toBe(false);
  });
});
