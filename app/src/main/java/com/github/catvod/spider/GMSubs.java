package com.github.catvod.spider;

import android.content.Context;
import android.util.Base64;

import com.github.catvod.crawler.Spider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** Keeps GM's page parsing and playback, adding matching Xunlei subtitle candidates. */
public class GMSubs extends Spider {

    private static final Pattern CODE = Pattern.compile("(?i)(?<![a-z0-9])([a-z]{2,8})[-_.](\\d{2,6})(?!\\d)");
    private static final OkHttpClient HTTP = new OkHttpClient.Builder().callTimeout(3, TimeUnit.SECONDS).build();
    private Spider gm;

    // ponytail: use the first video code; expand only if real titles contain multiple codes.
    static String codeFromTitle(String title) {
        Matcher match = CODE.matcher(title == null ? "" : title);
        return match.find() ? (match.group(1) + "-" + match.group(2)).toUpperCase(Locale.ROOT) : "";
    }

    static Pattern codeInSubtitle(String code) {
        String[] parts = code.split("-", 2);
        return Pattern.compile("(?i)(?<![a-z0-9])" + Pattern.quote(parts[0]) + "[-_. ]*" + Pattern.quote(parts[1]) + "(?!\\d)");
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
            JSONObject medium = new JSONObject(new String(Base64.decode(id, Base64.DEFAULT), StandardCharsets.UTF_8));
            String code = codeFromTitle(medium.optString("name"));
            if (code.isEmpty()) return result;
            JSONArray subs = search(code);
            if (subs.length() == 0) return result;
            play.put("subs", subs);
            return play.toString();
        } catch (Exception ignored) {
            return result;
        }
    }

    private static JSONArray search(String code) throws Exception {
        Request request = new Request.Builder().url("https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=" + code).build();
        try (Response response = HTTP.newCall(request).execute()) {
            if (!response.isSuccessful() || response.body() == null) return new JSONArray();
            JSONObject json = new JSONObject(response.body().string());
            JSONArray data = json.optJSONArray("data");
            JSONArray subs = new JSONArray();
            if (json.optInt("code", -1) != 0 || data == null) return subs;
            Pattern exact = codeInSubtitle(code);
            Set<String> seen = new HashSet<>();
            for (int i = 0; i < data.length() && subs.length() < 20; i++) {
                JSONObject item = data.optJSONObject(i);
                if (item == null) continue;
                String name = item.optString("name");
                String url = item.optString("url");
                String ext = item.optString("ext").toLowerCase(Locale.ROOT);
                if (!exact.matcher(name).find() || !url.startsWith("https://") || !seen.add(url)) continue;
                String format = switch (ext) {
                    case "srt" -> "application/x-subrip";
                    case "ass", "ssa" -> "text/x-ssa";
                    case "vtt" -> "text/vtt";
                    default -> "";
                };
                if (format.isEmpty()) continue;
                subs.put(new JSONObject().put("name", "迅雷 · " + name).put("url", url).put("format", format));
            }
            return subs;
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
