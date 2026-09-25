package com.github.catvod.spider;

import android.app.Activity;
import android.content.Context;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

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
import java.util.concurrent.atomic.AtomicInteger;
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
    /** AV01 master whose relative variant URIs must carry the master's access_token, as the site's own HLS loader does. */
    private static final Pattern TOKEN_MASTER = Pattern.compile("(?i)^https://www\\.av01\\.media/api/v1/videos/\\d+/manifest/master\\.m3u8\\?(.*&)?access_token=");
    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");
    private static final String HLS = "application/x-mpegURL";
    /** ST and VOE only start the file request after a real tap on the play control inside their frame. */
    private static final String EMBED_RECT = "(function(){var f=document.getElementById('video');if(!f)return '';"
            + "try{f.scrollIntoView({block:'center'})}catch(e){}"
            + "var r=f.getBoundingClientRect();var x=r.left+r.width/2,y=r.top+r.height/2;"
            + "for(var i=0;i<8;i++){var t=document.elementFromPoint(x,y);"
            + "if(!t||t===f||f.contains(t)||t.contains(f))break;t.remove();}"
            + "var top=document.elementFromPoint(x,y);"
            + "var clear=!top||top===f||f.contains(top)||top.contains(f);"
            + "return JSON.stringify({x:x,y:y,w:r.width,h:r.height,iw:window.innerWidth||1,clear:clear?1:0});})()";
    private static final String TAP = "GMSubsTap";
    private final AtomicInteger embedTapGeneration = new AtomicInteger();
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

    /** Streamtape and VOE need one real tap in the player frame. Other lines already request a file on their own. */
    static boolean needsEmbedTap(String flag) {
        if (flag == null) return false;
        String name = flag.trim();
        return name.equalsIgnoreCase("ST") || name.equalsIgnoreCase("VOE");
    }

    /** Map the player-frame center from CSS pixels into the WebView. Empty when the frame is not on screen yet. */
    static int[] embedTapPoint(String raw, int viewWidth, int viewHeight) {
        String json = unwrapJsString(raw);
        if (json.isEmpty() || viewWidth < 1 || viewHeight < 1) return null;
        try {
            JSONObject point = new JSONObject(json);
            double width = point.optDouble("w");
            double height = point.optDouble("h");
            double innerWidth = point.optDouble("iw");
            if (width < 80 || height < 80 || innerWidth < 1 || point.optInt("clear") != 1) return null;
            double scale = viewWidth / innerWidth;
            int x = (int) Math.round(point.optDouble("x") * scale);
            int y = (int) Math.round(point.optDouble("y") * scale);
            if (x < 0 || y < 0 || x >= viewWidth || y >= viewHeight) return null;
            return new int[]{x, y};
        } catch (Exception ignored) {
            return null;
        }
    }

    static String unwrapJsString(String value) {
        if (value == null || value.equals("null")) return "";
        try {
            if (value.startsWith("\"")) return new JSONArray("[" + value + "]").getString(0);
        } catch (Exception ignored) {
            return "";
        }
        return value;
    }

    /** The host keeps watching the page after a match result, so the play-control tap must stay armed. */
    static boolean isMatchResult(String result) {
        return "match".equalsIgnoreCase(resultType(result));
    }

    static String resultType(String result) {
        if (result == null || result.isEmpty()) return "";
        try {
            return new JSONObject(result).optString("type");
        } catch (Exception ignored) {
            return "";
        }
    }

    @Override
    public String playerContent(String flag, String id, List<String> vipFlags) throws Exception {
        boolean embed = needsEmbedTap(flag);
        if (embed) {
            scheduleEmbedTap(flag);
        } else {
            cancelEmbedTap();
        }
        String result = gm.playerContent(flag, id, vipFlags);
        if (embed) {
            Log.i(TAP, "gm returned " + resultType(result));
            if (!isMatchResult(result)) embedTapGeneration.incrementAndGet();
        } else {
            cancelEmbedTap();
        }
        try {
            JSONObject play = new JSONObject(result);
            if (play.optString("url").isEmpty()) return result;
            boolean changed = proxyFakePngHls(play) || proxyTokenMaster(play);
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

    private void cancelEmbedTap() {
        embedTapGeneration.incrementAndGet();
        Init.post(this::hideEmbedWebView, 200);
    }

    private void scheduleEmbedTap(String flag) {
        int generation = embedTapGeneration.incrementAndGet();
        Log.i(TAP, "schedule " + flag + " gen " + generation);
        Init.post(() -> attemptEmbedTap(generation, 0, 0), 1500);
    }

    private void attemptEmbedTap(int generation, int misses, int taps) {
        if (generation != embedTapGeneration.get() || misses > 48 || taps >= 1) return;
        List<WebView> views = candidateWebViews();
        if (views.isEmpty()) {
            if (misses == 0 || misses % 4 == 0) Log.i(TAP, "waiting view " + misses);
            Init.post(() -> attemptEmbedTap(generation, misses + 1, taps), 1200);
            return;
        }
        tryEmbedTap(generation, misses, taps, views, 0);
    }

    private void tryEmbedTap(int generation, int misses, int taps, List<WebView> views, int index) {
        if (generation != embedTapGeneration.get()) return;
        if (index >= views.size()) {
            if (misses >= 20) {
                Log.i(TAP, "give up " + misses);
                hideEmbedWebView();
                return;
            }
            Init.post(() -> attemptEmbedTap(generation, misses + 1, taps), 1200);
            return;
        }
        WebView webView = views.get(index);
        if (webView.getWidth() <= 200 || webView.getHeight() <= 200) {
            if (misses < 10) {
                try {
                    webView.setVisibility(View.VISIBLE);
                    webView.evaluateJavascript("try{GmSpiderInject.ShowWebview()}catch(e){}", null);
                } catch (Throwable ignored) {
                }
            }
            tryEmbedTap(generation, misses, taps, views, index + 1);
            return;
        }
        webView.evaluateJavascript(EMBED_RECT, value -> {
            if (generation != embedTapGeneration.get()) return;
            int[] point = embedTapPoint(value, webView.getWidth(), webView.getHeight());
            if (point == null) {
                if (misses % 3 == 0 && index == 0) {
                    Log.i(TAP, "waiting frame " + views.size() + " " + webView.getWidth() + "x" + webView.getHeight());
                }
                tryEmbedTap(generation, misses, taps, views, index + 1);
                return;
            }
            if (taps == 0 && misses < 2) {
                Log.i(TAP, "frame ready " + point[0] + "," + point[1]);
                Init.post(() -> attemptEmbedTap(generation, 2, 0), 3500);
                return;
            }
            dispatchTap(webView, point[0], point[1]);
            Log.i(TAP, "tap " + (taps + 1) + " at " + point[0] + "," + point[1]);
            Init.post(this::hideEmbedWebView, 10000);
            Init.post(() -> attemptEmbedTap(generation, misses, taps + 1), 8000);
        });
    }

    private void hideEmbedWebView() {
        WebView webView = supjavWebView();
        if (webView == null) return;
        try {
            webView.evaluateJavascript("try{GmSpiderInject.HideWebview()}catch(e){}", null);
        } catch (Throwable ignored) {
        }
    }

    private static List<WebView> candidateWebViews() {
        List<WebView> all = new ArrayList<>();
        for (View root : windowRoots()) collectWebViews(root, all);
        List<WebView> preferred = new ArrayList<>();
        List<WebView> rest = new ArrayList<>();
        for (WebView webView : all) {
            String url = webView.getUrl();
            boolean supjav = url != null && url.contains("supjav.com");
            if (!supjav && (webView.getWidth() <= 200 || webView.getHeight() <= 200)) continue;
            if (supjav) preferred.add(webView);
            else rest.add(webView);
        }
        preferred.addAll(rest);
        return preferred;
    }

    private static WebView supjavWebView() {
        List<WebView> views = candidateWebViews();
        return views.isEmpty() ? null : views.get(0);
    }

    private static List<View> windowRoots() {
        List<View> roots = new ArrayList<>();
        try {
            Class<?> global = Class.forName("android.view.WindowManagerGlobal");
            Object instance = global.getMethod("getInstance").invoke(null);
            java.lang.reflect.Field field = global.getDeclaredField("mViews");
            field.setAccessible(true);
            Object views = field.get(instance);
            if (views instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof View view) roots.add(view);
                }
            }
        } catch (Throwable ignored) {
            Activity activity = currentActivity();
            if (activity != null && activity.getWindow() != null) roots.add(activity.getWindow().getDecorView());
        }
        return roots;
    }

    private static Activity currentActivity() {
        try {
            Class<?> app = Class.forName("com.fongmi.android.tv.App");
            Object activity = app.getMethod("activity").invoke(null);
            if (activity instanceof Activity) return (Activity) activity;
        } catch (Throwable ignored) {
            return null;
        }
        return null;
    }

    private static WebView preferWebView(WebView current, WebView candidate) {
        if (candidate == null) return current;
        if (current == null || candidate.getWidth() > current.getWidth()) return candidate;
        return current;
    }

    private static WebView supjavWebView(View root) {
        List<WebView> views = new ArrayList<>();
        collectWebViews(root, views);
        WebView found = null;
        WebView fallback = null;
        for (WebView webView : views) {
            if (webView.getWidth() <= 200) continue;
            String url = webView.getUrl();
            if (url != null && url.contains("supjav.com")) {
                if (found == null || webView.getWidth() > found.getWidth()) found = webView;
            } else if (fallback == null || webView.getWidth() > fallback.getWidth()) {
                fallback = webView;
            }
        }
        return found != null ? found : fallback;
    }

    private static void collectWebViews(View view, List<WebView> out) {
        if (view instanceof WebView) out.add((WebView) view);
        if (view instanceof ViewGroup group) {
            for (int i = 0; i < group.getChildCount(); i++) collectWebViews(group.getChildAt(i), out);
        }
    }

    private static void dispatchTap(WebView webView, int x, int y) {
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(now, now + 40, MotionEvent.ACTION_UP, x, y, 0);
        webView.dispatchTouchEvent(down);
        webView.dispatchTouchEvent(up);
        down.recycle();
        up.recycle();
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

    private boolean proxyTokenMaster(JSONObject play) throws Exception {
        String url = play.optString("url");
        if (!TOKEN_MASTER.matcher(url).find()) return false;
        String base = proxyBase();
        if (base.isEmpty()) return false;
        play.put("url", proxyUrl(base, "master", url, headers(play.opt("header"))));
        play.put("format", HLS);
        return true;
    }

    static String withQuery(String url, String name, String value) {
        HttpUrl parsed = HttpUrl.parse(url);
        if (parsed == null || value == null || value.isEmpty() || parsed.queryParameter(name) != null) return url;
        return parsed.newBuilder().addQueryParameter(name, value).build().toString();
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
        if (url == null || !url.startsWith("http") || !("m3u8".equals(type) || "ts".equals(type) || "master".equals(type))) return gm.proxy(params);
        Map<String, String> headers = headers(params.get("h"));
        if ("master".equals(type)) return proxyTokenMaster(url, headers);
        return "m3u8".equals(type) ? proxyPlaylist(url, headers) : proxySegment(url, headers);
    }

    private Object[] proxyTokenMaster(String url, Map<String, String> headers) throws IOException {
        HttpUrl parsed = HttpUrl.parse(url);
        String token = parsed == null ? null : parsed.queryParameter("access_token");
        try (Response res = stream().newCall(request(url, headers)).execute()) {
            if (!res.isSuccessful() || res.body() == null) return status(res.code());
            String body = rewritePlaylist(res.body().string(), res.request().url().toString(), (target, playlist) ->
                    playlist ? withQuery(target, "access_token", token) : target);
            return new Object[]{200, HLS, new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8))};
        }
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
        cancelEmbedTap();
        if (gm != null) gm.destroy();
    }
}
