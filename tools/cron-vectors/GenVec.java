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
