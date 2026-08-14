import { format } from 'sql-formatter';
import type { ToolResult } from '../../types';

/** Oracle 을 가장 먼저 둔다. 사내에서 가장 자주 쓰는 방언이다. */
export const SQL_DIALECTS = [
  ['plsql', 'Oracle (PL/SQL)'],
  ['sql', '표준 SQL'],
  ['mysql', 'MySQL'],
  ['mariadb', 'MariaDB'],
  ['postgresql', 'PostgreSQL'],
  ['tsql', 'SQL Server (T-SQL)'],
  ['sqlite', 'SQLite'],
] as const satisfies readonly (readonly [string, string])[];

export function formatSql(
  sql: string,
  dialect: string,
  keywordCase: 'upper' | 'lower' | 'preserve',
): ToolResult {
  if (sql.trim() === '') return { ok: false, error: 'SQL 을 입력하세요.' };

  try {
    return {
      ok: true,
      value: format(sql, {
        language: dialect as never,
        tabWidth: 2,
        keywordCase,
        linesBetweenQueries: 1,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `SQL 을 해석할 수 없습니다.\n${message}` };
  }
}
