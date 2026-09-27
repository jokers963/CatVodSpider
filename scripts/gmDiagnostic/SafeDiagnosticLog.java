package com.github.catvodspidergm;

import android.util.Log;
import android.os.Build;
import android.webkit.WebResourceRequest;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import javax.net.ssl.SSLException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Local diagnostic candidate only; never forwards original messages or throwables. */
public final class SafeDiagnosticLog {
    // Diagnostic-only switch: playback regression must not compete with extra network probes.
    private static final boolean NETWORK_PROBE = false;
    private static final Set<String> REQUESTS = new HashSet<>();

    static String format(String tag, String message) {
        if (tag == null) return "";
        String event;
        switch (tag) {
            case "LOAD_URL_BY_CLIENT": event = "load"; break;
            case "MATCHED_BY_CLIENT": event = "matched"; break;
            case "ALLOWED_BY_CLIENT": event = "allowed"; break;
            case "BLOCKED_BY_CLIENT": event = "blocked"; break;
            case "RESULT_BY_CLIENT": return "event=result";
            case "ERROR_CLIENT": return "event=error";
            case "WEBVIEW_CONTAINER": return "event=container_error";
            default: return "";
        }
        String host = "redacted";
        String kind = "other";
        try {
            URI uri = new URI(message);
            String scheme = uri.getScheme();
            String candidate = uri.getHost();
            if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                    && candidate != null) {
                candidate = candidate.toLowerCase(Locale.ROOT);
                if (candidate.length() <= 253 && candidate.matches("[a-z0-9.-]+")
                        && candidate.contains(".") && !candidate.matches("[0-9.]+")
                        && !candidate.endsWith(".local") && !candidate.endsWith(".internal")) {
                    host = candidate;
                }
                String path = uri.getPath();
                if (path != null && path.toLowerCase(Locale.ROOT).endsWith(".m3u8")) kind = "playlist";
                else if (path != null && path.toLowerCase(Locale.ROOT).matches(".*\\.(ts|m4s|mp4)$")) kind = "media";
            }
        } catch (Exception ignored) {
            // Invalid URLs and private messages never enter the log output.
        }
        return "event=" + event + " host=" + host + " kind=" + kind;
    }

    private static int emit(String tag, String message) {
        String line = format(tag, message);
        if (line.isEmpty()) return 0;
        if (line.startsWith("event=allowed ") || line.startsWith("event=blocked ")) {
            synchronized (REQUESTS) {
                // ponytail: 64 unique request summaries per loader; restart the diagnostic loader for another run.
                if (REQUESTS.size() >= 64 || !REQUESTS.add(line)) return 0;
            }
        }
        return Log.i("GM_DIAG", line);
    }

    public static void probe(String phase, String value) {
        String line;
        if ("frame".equals(phase)) {
            line = format("LOAD_URL_BY_CLIENT", value).replace("event=load", "event=probe phase=frame");
        } else if ("button".equals(phase) && ("TV".equals(value) || "FST".equals(value))) {
            line = "event=probe phase=button line=" + value;
        } else if ("stage".equals(phase) && value != null
                && value.matches("started|page_ready|page_unavailable|match_wait|button_missing|frame_missing|frame_loaded")) {
            line = "event=probe phase=stage stage=" + value;
        } else return;
        Log.i("GM_DIAG", line);
    }

    static boolean fstPlaylist(String url) {
        try {
            URI uri = new URI(url);
            return "https".equals(uri.getScheme()) && "fc2stream.tv".equals(uri.getHost())
                    && uri.getUserInfo() == null && uri.getPath().endsWith(".m3u8");
        } catch (Exception ignored) { return false; }
    }

    static Map<String, String> probeHeaders(Map<String, String> original, boolean omitSiteHeaders) {
        Map<String, String> result = new HashMap<>(original);
        if (omitSiteHeaders) result.keySet().removeIf(key -> key.matches("(?i)referer|origin"));
        return result;
    }

    static String mediaKind(byte[] bytes) {
        if (bytes.length >= 377 && bytes[0] == 0x47 && bytes[188] == 0x47 && bytes[376] == 0x47) return "ts";
        if (bytes.length >= 8 && bytes[0] == (byte) 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e && bytes[3] == 0x47) return "png";
        if (bytes.length >= 3 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8 && bytes[2] == (byte) 0xff) return "jpeg";
        if (bytes.length >= 8 && bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70) return "mp4";
        return "other";
    }

    static int transportOffset(byte[] bytes) {
        try {
            java.lang.reflect.Method method = Class.forName("com.github.catvod.spider.GMSubs")
                    .getDeclaredMethod("tsOffset", byte[].class, int.class);
            method.setAccessible(true);
            return (Integer) method.invoke(null, bytes, Math.min(bytes.length, 64 * 1024));
        } catch (Exception ignored) { return -2; }
    }

    /** Test-only, bounded HTTP observation using the captured request headers; no URLs/bodies are logged. */
    public static void inspect(WebResourceRequest request) {
        if (!NETWORK_PROBE) return;
        if (Build.VERSION.SDK_INT < 33) {
            Log.i("GM_DIAG", "event=media_probe error=unsupported_android");
            return;
        }
        String url = request.getUrl().toString();
        if (!fstPlaylist(url)) return;
        Map<String, String> captured = new HashMap<>(request.getRequestHeaders());
        new Thread(() -> {
          // Test-only A/B: same address, captured headers versus omitting Referer/Origin. No native request changes.
          for (boolean omitSiteHeaders : new boolean[]{false, true}) {
            Map<String, String> headers = probeHeaders(captured, omitSiteHeaders);
            String profile = omitSiteHeaders ? "no_site_headers" : "captured";
            String current = url;
            // ponytail: first rendition only, at most three levels; extend if an observed manifest needs more.
            for (int depth = 0; depth < 3; depth++) {
                HttpURLConnection connection = null;
                String host = format("LOAD_URL_BY_CLIENT", current).split(" host=")[1].split(" ")[0];
                if ("redacted".equals(host)) break;
                String phase = depth == 0 ? "manifest" : "resource";
                String step = "connect";
                long started = System.nanoTime();
                int status = 0;
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                try {
                    connection = (HttpURLConnection) new URI(current).toURL().openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(8000);
                    connection.setReadTimeout(8000);
                    for (Map.Entry<String, String> header : headers.entrySet()) {
                        if (!host.equals(new URI(url).getHost()) && header.getKey().matches("(?i)cookie|authorization|proxy-authorization")) continue;
                        connection.setRequestProperty(header.getKey(), header.getValue());
                    }
                    boolean playlist = new URI(current).getPath().endsWith(".m3u8");
                    if (!playlist) connection.setRequestProperty("Range", "bytes=0-262143");
                    connection.connect();
                    step = "headers";
                    status = connection.getResponseCode();
                    step = "body";
                    if (status == 200 || status == 206) {
                        int limit = playlist ? 64 * 1024 : 256 * 1024;
                        try (InputStream input = connection.getInputStream()) {
                            byte[] chunk = new byte[8192];
                            while (buffer.size() < limit && System.nanoTime() - started < 12_000_000_000L) {
                                int count = input.read(chunk, 0, Math.min(chunk.length, limit - buffer.size()));
                                if (count < 0) break;
                                buffer.write(chunk, 0, count);
                            }
                        }
                    }
                    byte[] bytes = buffer.toByteArray();
                    String body = new String(bytes, StandardCharsets.UTF_8).trim();
                    boolean hls = body.startsWith("#EXTM3U");
                    long elapsed = (System.nanoTime() - started) / 1_000_000;
                    Log.i("GM_DIAG", "event=media_probe profile=" + profile + " phase=" + phase + " host=" + host + " status=" + status + " hls=" + hls + " bytes=" + bytes.length + " ms=" + elapsed + " kind=" + (hls ? "hls" : mediaKind(bytes)) + " ts_offset=" + (hls ? -1 : transportOffset(bytes)));
                    if (!hls) break;
                    int variants = 0;
                    long bandwidth = 0;
                    for (String line : body.split("\\r?\\n")) {
                        if (line.startsWith("#EXT-X-STREAM-INF:")) {
                            variants++;
                            java.util.regex.Matcher match = java.util.regex.Pattern.compile("(?:^|[:,])BANDWIDTH=(\\d+)").matcher(line);
                            if (match.find()) bandwidth = Math.max(bandwidth, Long.parseLong(match.group(1)));
                        }
                    }
                    Log.i("GM_DIAG", "event=manifest_meta profile=" + profile + " variants=" + variants + " max_bandwidth=" + bandwidth + " encrypted=" + body.contains("#EXT-X-KEY:"));
                    String child = null;
                    for (String line : body.split("\\r?\\n")) if (!line.isBlank() && !line.startsWith("#")) { child = line.trim(); break; }
                    if (child == null) break;
                    URI next = new URI(current).resolve(child);
                    if (!"https".equals(next.getScheme()) || next.getUserInfo() != null) break;
                    current = next.toString();
                } catch (Exception error) {
                    String kind = error instanceof SocketTimeoutException ? "timeout" : error instanceof SSLException ? "tls" : "io";
                    long elapsed = (System.nanoTime() - started) / 1_000_000;
                    Log.i("GM_DIAG", "event=media_probe profile=" + profile + " phase=" + phase + " host=" + host + " step=" + step + " status=" + status + " bytes=" + buffer.size() + " ms=" + elapsed + " error=" + kind);
                    break;
                } finally { if (connection != null) connection.disconnect(); }
            }
          }
        }, "gm-diagnostic-http").start();
    }

    public static int d(String tag, String message) { return emit(tag, message); }
    public static int i(String tag, String message) { return emit(tag, message); }
    public static int v(String tag, String message) { return emit(tag, message); }
    public static int e(String tag, String message) { return emit(tag, message); }
    public static int w(String tag, String message) { return emit(tag, message); }
    public static int d(String tag, String message, Throwable ignored) { return emit(tag, message); }
    public static int i(String tag, String message, Throwable ignored) { return emit(tag, message); }
    public static int v(String tag, String message, Throwable ignored) { return emit(tag, message); }
    public static int e(String tag, String message, Throwable ignored) { return emit(tag, message); }
    public static int w(String tag, String message, Throwable ignored) { return emit(tag, message); }
    public static int w(String tag, Throwable ignored) { return emit(tag, null); }
    public static int wtf(String tag, Throwable ignored) { return emit(tag, null); }
    public static void stack(Throwable ignored) { }
}
