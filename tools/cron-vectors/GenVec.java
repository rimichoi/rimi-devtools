import org.springframework.scheduling.support.CronExpression;
import java.time.*;

/** Spring CronExpression 실측 벡터 생성기. 출력은 TypeScript 리터럴 그대로다. */
public class GenVec {
  static final String[] EXPRS = {
    "0 */5 * * * *", "0 0 08 * * *", "0 0 09 08,13,21 * *", "0 05 09 13,22 * *",
    "0,30 * * * * *", "5,35 * * * * *", "0 15 11 20 * *", "0 05 09 * * *",
    "0 0 12 1 * MON", "0 0 12 15 * FRI", "0 0 12 * * MON", "0 0 12 1 * *",
    "0 0 12 * * ?", "0 0 12 ? * MON", "0 0 12 * * 0", "0 0 12 * * 7", "0 0 12 * * SUN",
    "0 0 9-18 * * MON-FRI", "0 0/15 * * * *", "0 0 0 1 JAN-MAR *", "0 30 8 * * 1-5",
    "0 0 0 29 2 *", "0 0 0 31 * *", "30 0 0 * * *", "0 0 0 * * SAT,SUN",
    "0 0 6,18 * * *", "0 10-20/5 * * * *", "0 0 0 1 1 *", "15 30 4 * * WED",
    // 요일 필드의 스텝과 범위. 처음 벡터 집합에는 이 부류가 하나도 없어서,
    // 요일 기준값을 SUN=0 으로 잘못 잡은 버그를 88개 벡터가 전부 놓쳤다.
    // Spring 은 와일드카드를 1-7 로 펼치고 이름은 SUN=7 이며 범위 시작 7 은 0 이 된다.
    "0 0 0 * * */2", "0 0 0 * * */3", "0 0 12 * * SUN/2", "0 0 0 * * 1/2",
    "0 0 0 * * 0/2", "0 0 0 * * 7/2", "0 0 0 * * 1-7/2", "0 0 0 * * 0-7/2",
    "0 0 0 * * SAT-SUN", "0 0 0 * * FRI-SUN", "0 0 0 * * MON-SUN",
    "0 0 0 * * 7-0", "0 0 0 * * 7-7", "0 0 0 * * 0-0", "0 0 0 * * 5-7", "0 0 0 * * 0-7",
    "0 0 0 * * 1-5/2", "0 0 0 * * MON,WED,FRI",
    // 일·월·요일이 함께 걸려 간격이 크게 벌어지는 것들 (탐색 상한 회귀 가드)
    "0 0 9 1 1 MON", "0 0 0 29 2 MON", "0 0 12 1 2 SAT", "0 0 0 31 12 SUN",
    // 일 필드의 스텝
    "0 0 0 1-7/2 * *", "0 0 0 */10 * *", "0 0 0 * */3 *",
  };
  static final String[] BASES = { "2026-01-01T00:00:00", "2026-08-24T13:45:30", "2026-02-27T23:59:59" };

  public static void main(String[] a) {
    ZoneId kst = ZoneId.of("Asia/Seoul");
    System.out.println("// Spring Framework " + org.springframework.core.SpringVersion.getVersion()
        + " 의 CronExpression 이 실제로 낸 값이다. tools/cron-vectors/GenVec.java 로 생성했다.");
    System.out.println("export const SPRING_VECTORS: ReadonlyArray<{");
    System.out.println("  expr: string;");
    System.out.println("  base: string;");
    System.out.println("  next: readonly string[];");
    System.out.println("}> = [");
    for (String base : BASES) {
      ZonedDateTime start = LocalDateTime.parse(base).atZone(kst);
      for (String e : EXPRS) {
        CronExpression c = CronExpression.parse(e);
        StringBuilder sb = new StringBuilder();
        ZonedDateTime t = start;
        for (int i = 0; i < 3; i++) {
          t = c.next(t);
          if (t == null) break;
          if (sb.length() > 0) sb.append(", ");
          sb.append('\'').append(t.toLocalDateTime().toString().length() == 16
              ? t.toLocalDateTime() + ":00" : t.toLocalDateTime().toString()).append('\'');
        }
        System.out.printf("  { expr: '%s', base: '%s', next: [%s] },%n", e, base, sb);
      }
    }
    System.out.println("];");
  }
}
