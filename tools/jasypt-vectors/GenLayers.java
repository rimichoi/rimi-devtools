import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Produces layer-by-layer verification vectors for a from-scratch
 * PBEWithMD5AndDES implementation, and proves the intermediate values by
 * feeding them to SunJCE's raw DES/CBC/PKCS5Padding to recover a plaintext
 * that Jasypt itself produced.
 */
public class GenLayers {
    static final HexFormat HEX = HexFormat.of();

    static byte[] desEcb(byte[] key, byte[] block) throws Exception {
        Cipher c = Cipher.getInstance("DES/ECB/NoPadding", "SunJCE");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "DES"));
        return c.doFinal(block);
    }

    /** PKCS#5 v1.5 PBKDF1 with MD5: DK = MD5^c(password || salt), 16 bytes. */
    static byte[] pbkdf1Md5(byte[] pw, byte[] salt, int iterations) throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        md.update(pw);
        md.update(salt);
        byte[] dk = md.digest();
        for (int i = 1; i < iterations; i++) {
            md.reset();
            dk = md.digest(dk);
        }
        return dk;
    }

    public static void main(String[] a) throws Exception {
        System.out.println("=== DES/ECB/NoPadding known answers (SunJCE) ===");
        String[][] desCases = {
            { "133457799BBCDFF1", "0123456789ABCDEF" },
            { "0000000000000000", "0000000000000000" },
            { "FFFFFFFFFFFFFFFF", "FFFFFFFFFFFFFFFF" },
            { "0101010101010101", "0000000000000000" },
            { "8000000000000000", "0000000000000000" },
            { "0123456789ABCDEF", "4E6F772069732074" },
        };
        for (String[] c : desCases) {
            byte[] key = HEX.parseHex(c[0]);
            byte[] pt = HEX.parseHex(c[1]);
            System.out.printf("key=%s pt=%s ct=%s%n", c[0], c[1], HEX.formatHex(desEcb(key, pt)).toUpperCase());
        }

        System.out.println();
        System.out.println("=== PBKDF1-MD5 derived key, proven by raw DES/CBC/PKCS5Padding ===");
        // Ciphertexts below were produced by Jasypt StandardPBEStringEncryptor
        // (PBEWithMD5AndDES, 1000 iterations, RandomSaltGenerator, base64).
        String[][] pairs = {
            { "test1!", "xYIzsUiigr3pQj5xO0KWvg==", "root" },
            { "mypassword", "LCPlqdt8ntq9cdukcFzuUDahrciLtaFt", "Hello, World!" },
            { "P@ssw0rd", "6rSwGEHD4YPnVK1tj2cyX3vMdXJ738VaXgLQfCrqrGw=", "한글 비밀번호" },
        };
        for (String[] p : pairs) {
            byte[] raw = Base64.getDecoder().decode(p[1]);
            byte[] salt = new byte[8];
            System.arraycopy(raw, 0, salt, 0, 8);
            byte[] body = new byte[raw.length - 8];
            System.arraycopy(raw, 8, body, 0, body.length);

            byte[] pwBytes = new byte[p[0].length()];
            for (int i = 0; i < p[0].length(); i++) pwBytes[i] = (byte) p[0].charAt(i);

            byte[] dk = pbkdf1Md5(pwBytes, salt, 1000);
            byte[] desKey = new byte[8], iv = new byte[8];
            System.arraycopy(dk, 0, desKey, 0, 8);
            System.arraycopy(dk, 8, iv, 0, 8);

            Cipher c = Cipher.getInstance("DES/CBC/PKCS5Padding", "SunJCE");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(desKey, "DES"), new IvParameterSpec(iv));
            String got = new String(c.doFinal(body), java.nio.charset.StandardCharsets.UTF_8);

            System.out.printf("password=%s%n", p[0]);
            System.out.printf("  salt=%s%n", HEX.formatHex(salt));
            System.out.printf("  derivedKey(16B)=%s%n", HEX.formatHex(dk));
            System.out.printf("  desKey=%s iv=%s%n", HEX.formatHex(desKey), HEX.formatHex(iv));
            System.out.printf("  raw DES/CBC decrypt -> [%s]  MATCHES JASYPT = %s%n", got, got.equals(p[2]));
        }
    }
}
