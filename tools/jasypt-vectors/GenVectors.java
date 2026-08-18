import org.jasypt.encryption.pbe.StandardPBEStringEncryptor;
import org.jasypt.encryption.pbe.config.SimpleStringPBEConfig;

public class GenVectors {
    static StandardPBEStringEncryptor enc(String pw) {
        StandardPBEStringEncryptor e = new StandardPBEStringEncryptor();
        SimpleStringPBEConfig c = new SimpleStringPBEConfig();
        c.setPassword(pw);
        c.setAlgorithm("PBEWithMD5AndDES");
        c.setKeyObtentionIterations("1000");
        c.setSaltGeneratorClassName("org.jasypt.salt.RandomSaltGenerator");
        c.setStringOutputType("base64");
        e.setConfig(c);
        e.initialize();
        return e;
    }

    static String esc(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch));
            else if (ch > 0x7e) b.append(String.format("\\u%04x", (int) ch));
            else b.append(ch);
        }
        return b.toString();
    }

    public static void main(String[] a) {
        String[][] cases = {
            { "test1!", "root", "ASCII short" },
            { "test1!", "1234", "digits" },
            { "mypassword", "Hello, World!", "13 bytes, not a block multiple" },
            { "mypassword", "01234567", "exactly one 8-byte block, full pad block follows" },
            { "mypassword", "0123456789012345", "exactly two blocks" },
            { "mypassword", "", "empty plaintext" },
            { "P@ssw0rd", "한글 비밀번호", "Korean plaintext, UTF-8" },
            { "P@ssw0rd", "😀 emoji surrogate pair", "astral plane plaintext" },
            { "a", "single-char master password", "1-char password" },
            { "master key with spaces", "spaces are legal in the password", "U+0020 in password" },
            { "0123456789012345678901234567890123456789", "long master password", "40-char password" },
            { "~!@#$%^&*()_+-=[]{}|;':,./<>?", "punctuation password", "full printable ASCII punctuation" },
            { "jdbc-secret", "jdbc:mysql://db.internal:3306/app?useSSL=false", "realistic config value" },
        };
        System.out.println("[");
        for (int i = 0; i < cases.length; i++) {
            String pw = cases[i][0], pt = cases[i][1], note = cases[i][2];
            StandardPBEStringEncryptor e = enc(pw);
            String ct = e.encrypt(pt);
            if (!e.decrypt(ct).equals(pt)) throw new IllegalStateException("roundtrip failed: " + note);
            System.out.printf("  { \"password\": \"%s\", \"plaintext\": \"%s\", \"ciphertext\": \"%s\", \"note\": \"%s\" }%s%n",
                esc(pw), esc(pt), ct, esc(note), i == cases.length - 1 ? "" : ",");
        }
        System.out.println("]");
    }
}
