package android.util;

/** JVM test sink only. The build must not put this class into the candidate DEX. */
public final class Log {
    public static int count;
    public static String lastMessage;

    public static int i(String tag, String message) {
        if (!"GM_DIAG".equals(tag) || message.contains("private") || message.contains("\n")) {
            throw new AssertionError("Unsafe diagnostic output");
        }
        count++;
        lastMessage = message;
        return 1;
    }
}
