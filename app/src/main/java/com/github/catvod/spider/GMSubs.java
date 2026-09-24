package com.github.catvod.spider;

import android.content.Context;
import android.util.Base64;

import com.github.catvod.crawler.Spider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** Keeps GM's page parsing and playback, adding matching Xunlei subtitle candidates. */
public class GMSubs extends Spider {

    private static final Pattern CODE = Pattern.compile("(?i)(?<![a-z0-9])([a-z]{2,8})[-_.](\\d{2,6})(?!\\d)");
    /** TurboVIPlay HLS whose segments are MPEG-TS behind a fake PNG header on a host that rejects a Referer. */
    private static final Pattern FAKE_PNG_HLS = Pattern.compile("(?i)^https?://[^/]*\\b(turboviplay|turbosplayer)\\.com/");
    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");
    private static final String HLS = "application/x-mpegURL";
    private static final int TS_PACKET = 188;
    private static final int SNIFF_BYTES = 64 * 1024;
    private static OkHttpClient http;
    private static OkHttpClient stream;
    private Spider gm;

    private static OkHttpClient http() {
        if (http == null) http = new OkHttpClient.Builder().callTimeout(3, TimeUnit.SECONDS).build();
        return http;
    }

    private static OkHttpClient stream() {
        if (stream == null) stream = new OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
        return stream;
    }

    // ponytail: use the first video code; expand only if real titles contain multiple codes.
    static String codeFromTitle(String title) {
        Matcher match = CODE.matcher(title == null ? "" : title);
        return match.find() ? (match.group(1) + "-" + match.group(2)).toUpperCase(Locale.ROOT) : "";
    }

    /** Strip separators so IPX-343, IPX343 and IPX_343 compare the same. */
    static String normalizeCode(String code) {
        return code == null ? "" : code.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    static String normalizeSubtitleName(String name) {
        return name == null ? "" : name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    /**
     * Lower is better: 0 starts with the code, 1 contains the code, 2 is an API hit without the code.
     */
    static int subtitleRank(String code, String name) {
        String normalizedCode = normalizeCode(code);
        String normalizedName = normalizeSubtitleName(name);
        if (normalizedCode.isEmpty() || normalizedName.isEmpty()) return 2;
        if (normalizedName.startsWith(normalizedCode)) return 0;
        if (normalizedName.contains(normalizedCode)) return 1;
        return 2;
    }

    static String subtitleFormat(String ext) {
        return switch (ext == null ? "" : ext.toLowerCase(Locale.ROOT)) {
            case "srt" -> "application/x-subrip";
            case "ass", "ssa" -> "text/x-ssa";
            case "vtt" -> "text/vtt";
            default -> "";
        };
    }

    /** Keep every valid Xunlei row, ranked by code relevance while preserving API order on ties. */
    static JSONArray rankSubtitles(String code, JSONArray data) throws Exception {
        JSONArray subs = new JSONArray();
        if (data == null) return subs;
        Set<String> seen = new HashSet<>();
        List<JSONObject> ranked = new ArrayList<>();
        for (int i = 0; i < data.length(); i++) {
            JSONObject item = data.optJSONObject(i);
            if (item == null) continue;
            String name = item.optString("name").trim();
            String url = item.optString("url");
            String format = subtitleFormat(item.optString("ext"));
            if (name.isEmpty() || !url.startsWith("https://") || format.isEmpty() || !seen.add(url)) continue;
            ranked.add(new JSONObject()
                    .put("name", "迅雷 · " + name)
                    .put("url", url)
                    .put("format", format)
                    .put("_rank", subtitleRank(code, name))
                    .put("_order", i));
        }
        ranked.sort(Comparator
                .comparingInt((JSONObject item) -> item.optInt("_rank"))
                .thenComparingInt(item -> item.optInt("_order")));
        for (JSONObject item : ranked) {
            item.remove("_rank");
            item.remove("_order");
            subs.put(item);
        }
        return subs;
    }

    /** GM stores the webview descriptor as data:text/plain;base64, plus the JSON. */
    static String playIdPayload(String id) {
        String prefix = "data:text/plain;base64,";
        if (id != null && id.startsWith(prefix)) return id.substring(prefix.length());
        return id == null ? "" : id;
    }

    /** SupJav puts the title in the play id. Direct-address sites put it in the line name. */
    static String codeFromPlay(String flag, String id) {
        String fromId = codeFromPlayId(id);
        return fromId.isEmpty() ? codeFromTitle(flag) : fromId;
    }

    private static String codeFromPlayId(String id) {
        String payload = playIdPayload(id);
        if (payload.startsWith("http://") || payload.startsWith("https://") || payload.isEmpty()) return "";
        try {
            String text = new String(Base64.decode(payload, Base64.DEFAULT), StandardCharsets.UTF_8).trim();
            if (!text.startsWith("{")) return "";
            return codeFromTitle(new JSONObject(text).optString("name"));
        } catch (Exception ignored) {
            return "";
        }
    }

    @Override
    public void init(Context context, String extend) throws Exception {
        gm = (Spider) Class.forName("com.github.catvod.spider.GM", true, getClass().getClassLoader()).getDeclaredConstructor().newInstance();
        gm.siteKey = siteKey;
        gm.init(context, extend);
    }

    @Override
    public String homeContent(boolean filter) throws Exception {
        return gm.homeContent(filter);
    }

    @Override
    public String homeVideoContent() throws Exception {
        return gm.homeVideoContent();
    }

    @Override
    public String categoryContent(String tid, String pg, boolean filter, HashMap<String, String> extend) throws Exception {
        return gm.categoryContent(tid, pg, filter, extend);
    }

    @Override
    public String detailContent(List<String> ids) throws Exception {
        return gm.detailContent(ids);
    }

    @Override
    public String searchContent(String key, boolean quick) throws Exception {
        return gm.searchContent(key, quick);
    }

    @Override
    public String searchContent(String key, boolean quick, String pg) throws Exception {
        return gm.searchContent(key, quick, pg);
    }

    @Override
    public String playerContent(String flag, String id, List<String> vipFlags) throws Exception {
        String result = gm.playerContent(flag, id, vipFlags);
        try {
            JSONObject play = new JSONObject(result);
            if (play.optString("url").isEmpty()) return result;
            boolean changed = proxyFakePngHls(play);
            JSONArray subs = subtitles(codeFromPlay(flag, id));
            if (subs.length() > 0) {
                play.put("subs", subs);
                changed = true;
            }
            return changed ? play.toString() : result;
        } catch (Exception ignored) {
            return result;
        }
    }

    private static JSONArray subtitles(String code) {
        if (code.isEmpty()) return new JSONArray();
        try {
            return search(code);
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private boolean proxyFakePngHls(JSONObject play) throws Exception {
        String url = play.optString("url");
        if (!FAKE_PNG_HLS.matcher(url).find()) return false;
        String base = proxyBase();
        if (base.isEmpty()) return false;
        play.put("url", proxyUrl(base, "m3u8", url, headers(play.opt("header"))));
        play.put("format", HLS);
        play.remove("header");
        return true;
    }

    /** The host app's local server forwards /proxy?siteKey=... back to this spider's proxy(). */
    private static String proxyBase() {
        try {
            Class<?> clz = Class.forName("com.github.catvod.Proxy");
            int port = (int) clz.getMethod("getPort").invoke(null);
            return port > 0 ? (String) clz.getMethod("getUrl", boolean.class).invoke(null, true) : "";
        } catch (Throwable ignored) {
            return "";
        }
    }

    private String proxyUrl(String base, String type, String url, Map<String, String> headers) {
        return base + "?do=csp&siteKey=" + encode(siteKey) + "&type=" + type + "&url=" + encode(url) + "&h=" + encode(new JSONObject(headers).toString());
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    static Map<String, String> headers(Object header) {
        Map<String, String> map = new LinkedHashMap<>();
        try {
            JSONObject json = header instanceof JSONObject ? (JSONObject) header : header instanceof String && !((String) header).isEmpty() ? new JSONObject((String) header) : null;
            if (json == null) return map;
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = json.optString(key);
                if (!value.isEmpty()) map.put(key, value);
            }
        } catch (Exception ignored) {
        }
        return map;
    }

    /** The segment host answers 429 whenever a Referer or Origin is present, so segments go out without them. */
    static Map<String, String> segmentHeaders(Map<String, String> headers) {
        Map<String, String> map = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String key = entry.getKey().toLowerCase(Locale.ROOT);
            if (key.equals("referer") || key.equals("origin") || key.equals("cookie")) continue;
            map.put(entry.getKey(), entry.getValue());
        }
        return map;
    }

    /**
     * Rewrites every URI through {@code link.apply(absoluteUri, isPlaylist)}.
     * A master playlist keeps only its highest resolution (then bandwidth) variant.
     */
    static String rewritePlaylist(String text, String baseUrl, BiFunction<String, Boolean, String> link) {
        String[] lines = text.replace("\r", "").split("\n");
        StringBuilder out = new StringBuilder();
        boolean master = text.contains("#EXT-X-STREAM-INF");
        String bestInf = null;
        String bestUri = null;
        long[] bestScore = null;
        String pendingInf = null;
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            if (master && line.startsWith("#EXT-X-STREAM-INF")) {
                pendingInf = line;
                continue;
            }
            if (line.startsWith("#")) {
                out.append(rewriteUriAttr(line, baseUrl, link, master)).append('\n');
                continue;
            }
            String absolute = resolve(baseUrl, line);
            if (master) {
                long[] score = variantScore(pendingInf);
                if (bestScore == null || compare(score, bestScore) > 0) {
                    bestScore = score;
                    bestInf = pendingInf;
                    bestUri = absolute;
                }
                pendingInf = null;
            } else {
                out.append(link.apply(absolute, false)).append('\n');
            }
        }
        if (master && bestUri != null) {
            if (bestInf != null) out.append(bestInf).append('\n');
            out.append(link.apply(bestUri, true)).append('\n');
        }
        return out.toString();
    }

    private static String rewriteUriAttr(String line, String baseUrl, BiFunction<String, Boolean, String> link, boolean master) {
        Matcher m = URI_ATTR.matcher(line);
        if (!m.find()) return line;
        boolean playlist = master && line.startsWith("#EXT-X-MEDIA");
        String target = link.apply(resolve(baseUrl, m.group(1)), playlist);
        return line.substring(0, m.start(1)) + target + line.substring(m.end(1));
    }

    private static long[] variantScore(String inf) {
        if (inf == null) return new long[]{0, 0};
        Matcher res = Pattern.compile("RESOLUTION=(\\d+)x(\\d+)").matcher(inf);
        Matcher bw = Pattern.compile("(?<![A-Z-])BANDWIDTH=(\\d+)").matcher(inf);
        long height = res.find() ? Long.parseLong(res.group(2)) : 0;
        long bandwidth = bw.find() ? Long.parseLong(bw.group(1)) : 0;
        return new long[]{height, bandwidth};
    }

    private static int compare(long[] a, long[] b) {
        return a[0] != b[0] ? Long.compare(a[0], b[0]) : Long.compare(a[1], b[1]);
    }

    private static String resolve(String baseUrl, String uri) {
        HttpUrl base = HttpUrl.parse(baseUrl);
        HttpUrl resolved = base == null ? null : base.resolve(uri);
        return resolved == null ? uri : resolved.toString();
    }

    /** Offset of the first MPEG-TS sync byte that repeats every 188 bytes, or -1. */
    static int tsOffset(byte[] data, int length) {
        for (int offset = 0; offset < length; offset++) {
            if (data[offset] != 0x47) continue;
            boolean sync = true;
            int checked = 0;
            for (int k = 1; k <= 4; k++) {
                int next = offset + k * TS_PACKET;
                if (next >= length) break;
                checked++;
                if (data[next] != 0x47) {
                    sync = false;
                    break;
                }
            }
            if (sync && checked > 0) return offset;
        }
        return -1;
    }

    static boolean isPng(byte[] data, int length) {
        return length >= 8 && (data[0] & 0xff) == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G';
    }

    @Override
    public Object[] proxy(Map<String, String> params) throws Exception {
        String type = params.get("type");
        String url = params.get("url");
        if (url == null || !url.startsWith("http") || !("m3u8".equals(type) || "ts".equals(type))) return gm.proxy(params);
        Map<String, String> headers = headers(params.get("h"));
        return "m3u8".equals(type) ? proxyPlaylist(url, headers) : proxySegment(url, headers);
    }

    private Object[] proxyPlaylist(String url, Map<String, String> headers) throws IOException {
        String base = proxyBase();
        try (Response res = stream().newCall(request(url, headers)).execute()) {
            if (!res.isSuccessful() || res.body() == null) return status(res.code());
            String finalUrl = res.request().url().toString();
            Map<String, String> segment = segmentHeaders(headers);
            String body = rewritePlaylist(res.body().string(), finalUrl, (target, playlist) ->
                    playlist ? proxyUrl(base, "m3u8", target, headers) : proxyUrl(base, "ts", target, segment));
            return new Object[]{200, HLS, new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8))};
        }
    }

    private Object[] proxySegment(String url, Map<String, String> headers) throws IOException {
        Response res = stream().newCall(request(url, headers)).execute();
        if (!res.isSuccessful() || res.body() == null) {
            int code = res.code();
            res.close();
            return status(code);
        }
        return new Object[]{200, "video/mp2t", stripFakePng(res.body().byteStream())};
    }

    static InputStream stripFakePng(InputStream in) throws IOException {
        byte[] head = new byte[SNIFF_BYTES];
        int length = 0;
        while (length < head.length) {
            int read = in.read(head, length, head.length - length);
            if (read < 0) break;
            length += read;
        }
        int offset = 0;
        if (isPng(head, length)) {
            int ts = tsOffset(head, length);
            if (ts > 0) offset = ts;
        }
        return new SequenceInputStream(new ByteArrayInputStream(head, offset, length - offset), in);
    }

    private static Request request(String url, Map<String, String> headers) {
        Request.Builder builder = new Request.Builder().url(url);
        for (Map.Entry<String, String> entry : headers.entrySet()) builder.header(entry.getKey(), entry.getValue());
        return builder.build();
    }

    private static Object[] status(int code) {
        return new Object[]{code, "text/plain", new ByteArrayInputStream(new byte[0])};
    }

    private static JSONArray search(String code) throws Exception {
        Request request = new Request.Builder().url("https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=" + code).build();
        try (Response response = http().newCall(request).execute()) {
            if (!response.isSuccessful() || response.body() == null) return new JSONArray();
            JSONObject json = new JSONObject(response.body().string());
            if (json.optInt("code", -1) != 0) return new JSONArray();
            return rankSubtitles(code, json.optJSONArray("data"));
        }
    }

    @Override
    public boolean manualVideoCheck() throws Exception {
        return gm.manualVideoCheck();
    }

    @Override
    public boolean isVideoFormat(String url) throws Exception {
        return gm.isVideoFormat(url);
    }

    @Override
    public void destroy() {
        if (gm != null) gm.destroy();
    }
}
