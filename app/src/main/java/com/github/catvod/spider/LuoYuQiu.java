package com.github.catvod.spider;

import android.content.Context;
import android.text.TextUtils;

import com.github.catvod.bean.Class;
import com.github.catvod.bean.Result;
import com.github.catvod.bean.Vod;
import com.github.catvod.crawler.Spider;
import com.github.catvod.net.OkHttp;
import com.github.catvod.utils.Util;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;

import java.net.URI;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Public-page parser for libvio.host. */
public class LuoYuQiu extends Spider {

    private static final String DEFAULT_SITE = "https://libvio.host";
    private static final Pattern MEDIA_URL = Pattern.compile(
            "(?i)https?://[^\\\"'\\s<>]+\\.(?:m3u8|mp4|mkv)(?:\\?[^\\\"'\\s<>]*)?");
    private static final List<Class> CLASSES = Arrays.asList(
            new Class("1", "电影"),
            new Class("2", "剧集"),
            new Class("4", "番剧"),
            new Class("15", "日韩"),
            new Class("16", "欧美")
    );

    private String siteUrl = DEFAULT_SITE;

    private Map<String, String> headers() {
        Map<String, String> headers = new HashMap<>();
        headers.put("User-Agent", Util.CHROME);
        headers.put("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        headers.put("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");
        headers.put("Referer", siteUrl + "/");
        return headers;
    }

    @Override
    public void init(Context context, String extend) {
        if (!TextUtils.isEmpty(extend)) siteUrl = trimSlash(extend.trim());
    }

    @Override
    public String homeContent(boolean filter) {
        return Result.string(CLASSES, parseVods(fetch("/")));
    }

    @Override
    public String categoryContent(String tid, String pg, boolean filter, HashMap<String, String> extend) {
        int page = parsePage(pg);
        Document doc = fetch(String.format("/show/%s--------%d---.html", tid, page));
        return Result.get().page(page, pageCount(doc, tid), 0, 0).vod(parseVods(doc)).string();
    }

    @Override
    public String searchContent(String key, boolean quick) {
        return searchContent(key, quick, "1");
    }

    @Override
    public String searchContent(String key, boolean quick, String pg) {
        int page = parsePage(pg);
        String encoded = encode(key);
        Document doc = fetch("/search/" + encoded + "----------" + page + "---.html");
        return Result.get().page(page, pageCount(doc, ""), 0, 0).vod(parseVods(doc)).string();
    }

    @Override
    public String detailContent(List<String> ids) {
        if (ids == null || ids.isEmpty()) return Result.error("缺少视频ID");
        String id = absolute(ids.get(0));
        Document doc = fetch(path(id));
        Vod vod = new Vod();
        vod.setVodId(id);
        vod.setVodName(firstText(doc, "h1, h2, h3, .title, meta[property=og:title]"));
        vod.setVodPic(firstAttr(doc, "meta[property=og:image]", "content"));
        vod.setVodYear(findLabel(doc.text(), "(\\d{4})"));
        vod.setVodActor(findLabel(doc.text(), "主演[:：]([^导演]+)"));
        vod.setVodDirector(findLabel(doc.text(), "导演[:：]([^简介]+)"));
        String content = firstText(doc, ".vod_content, .detail-content, .description, meta[name=description]");
        vod.setVodContent(content);

        List<String> episodes = parseEpisodes(doc);
        if (episodes.isEmpty()) episodes.add(id);
        vod.setVodPlayFrom("落雨秋");
        vod.setVodPlayUrl(TextUtils.join("#", episodes));
        return Result.string(vod);
    }

    @Override
    public String playerContent(String flag, String id, List<String> vipFlags) {
        String pageUrl = absolute(id);
        Document doc = fetch(path(pageUrl));
        String media = extractMedia(doc.html());
        if (!media.isEmpty()) return Result.get().url(media).header(headers()).string();

        // The page may create its player URL in JavaScript. Let the app's configured
        // parser handle the public page; no anti-bot or access-control bypass is used.
        return Result.get().url(pageUrl).parse(1).header(headers()).string();
    }

    List<Vod> parseVods(Document doc) {
        List<Vod> list = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Element link : doc.select("a[href*='/detail/']")) {
            String id = absolute(link.attr("href"));
            if (!seen.add(id)) continue;
            String name = link.text().trim();
            if (name.isEmpty()) name = link.attr("title").trim();
            Element card = link;
            for (int i = 0; i < 4 && card != null; i++, card = card.parent()) {
                if (name.isEmpty()) name = card.select("h2, h3, h4, h5, .title").text().trim();
                if (card.select("img").size() > 0) break;
            }
            String pic = card == null ? "" : firstAttr(card, "img", "data-original");
            if (pic.isEmpty() && card != null) pic = firstAttr(card, "img", "data-src");
            if (pic.isEmpty() && card != null) pic = firstAttr(card, "img", "src");
            String remark = card == null ? "" : card.text().trim();
            if (name.isEmpty()) name = remark;
            if (name.isEmpty()) continue;
            list.add(new Vod(id, name, absolute(pic), remark));
        }
        return list;
    }

    private Document fetch(String path) {
        return Jsoup.parse(OkHttp.string(absolute(path), headers()), siteUrl + "/");
    }

    List<String> parseEpisodes(Document doc) {
        List<String> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Element link : doc.select("a[href*='/w/'], a[href*='/play/']")) {
            String url = absolute(link.attr("href"));
            if (seen.add(url)) result.add((link.text().trim().isEmpty() ? "播放" : link.text().trim()) + "$" + url);
        }
        return result;
    }

    private int pageCount(Document doc, String tid) {
        int count = 1;
        Pattern pattern = Pattern.compile("/show/" + Pattern.quote(tid) + "--------(\\d+)---\\.html");
        for (Element link : doc.select("a[href*='/show/']")) {
            Matcher matcher = pattern.matcher(link.attr("href"));
            if (matcher.find()) count = Math.max(count, Integer.parseInt(matcher.group(1)));
        }
        return count;
    }

    private String extractMedia(String html) {
        Matcher matcher = MEDIA_URL.matcher(html);
        return matcher.find() ? matcher.group() : "";
    }

    private String firstText(Document doc, String selector) {
        Element element = doc.selectFirst(selector);
        if (element == null) return "";
        String value = element.hasAttr("content") ? element.attr("content") : element.text();
        return value.trim();
    }

    private String firstAttr(Element root, String selector, String attr) {
        Element element = root.selectFirst(selector);
        return element == null ? "" : element.attr(attr).trim();
    }

    private String findLabel(String text, String regex) {
        Matcher matcher = Pattern.compile(regex).matcher(text);
        return matcher.find() ? matcher.group(matcher.groupCount()).trim() : "";
    }

    private String absolute(String value) {
        if (TextUtils.isEmpty(value)) return "";
        try {
            return new URI(siteUrl + "/").resolve(value).toString();
        } catch (Exception e) {
            return value;
        }
    }

    private String path(String value) {
        try {
            URI uri = new URI(value);
            return uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
        } catch (Exception e) {
            return value;
        }
    }

    private int parsePage(String value) {
        try {
            return Math.max(1, Integer.parseInt(value));
        } catch (Exception e) {
            return 1;
        }
    }

    private String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (Exception e) {
            return value;
        }
    }

    private String trimSlash(String value) {
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }
}
