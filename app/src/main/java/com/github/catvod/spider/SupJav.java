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

/** Public-page parser for supjav.com. It does not bypass CAPTCHA or access controls. */
public class SupJav extends Spider {

    private static final String DEFAULT_SITE = "https://supjav.com";
    private static final Pattern MEDIA_URL = Pattern.compile(
            "(?i)https?://[^\\\"'\\s<>]+\\.(?:m3u8|mp4|mkv)(?:\\?[^\\\"'\\s<>]*)?");
    private static final List<Class> CLASSES = Arrays.asList(
            new Class("popular", "热门"),
            new Class("censored-jav", "有码"),
            new Class("uncensored-jav", "无码"),
            new Class("amateur", "素人"),
            new Class("fc2", "FC2")
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
        return Result.string(CLASSES, parseVods(fetch("/zh/popular")));
    }

    @Override
    public String categoryContent(String tid, String pg, boolean filter, HashMap<String, String> extend) {
        int page = parsePage(pg);
        Document doc = fetch("/zh/" + tid + "/page/" + page + "?sort=quantity");
        return Result.get().page(page, pageCount(doc), 0, 0).vod(parseVods(doc)).string();
    }

    @Override
    public String searchContent(String key, boolean quick) {
        return searchContent(key, quick, "1");
    }

    @Override
    public String searchContent(String key, boolean quick, String pg) {
        int page = parsePage(pg);
        Document doc = fetch("/zh/page/" + page + "?s=" + encode(key));
        return Result.get().page(page, pageCount(doc), 0, 0).vod(parseVods(doc)).string();
    }

    @Override
    public String detailContent(List<String> ids) {
        if (ids == null || ids.isEmpty()) return Result.error("缺少视频ID");
        String id = absolute(ids.get(0));
        Document doc = fetch(path(id));
        Vod vod = new Vod();
        vod.setVodId(id);
        vod.setVodName(firstText(doc, "meta[property=og:title], h1, h2, .title"));
        vod.setVodPic(firstAttr(doc, "meta[property=og:image]", "content"));
        vod.setVodYear(findLabel(doc.text(), "(\\d{4})"));
        vod.setVodActor(findLabel(doc.text(), "主演[:：]([^导演]+)"));
        vod.setVodContent(firstText(doc, "meta[name=description], .description, .detail-content"));

        List<String> episodes = parseEpisodes(doc);
        if (episodes.isEmpty()) episodes.add(id);
        vod.setVodPlayFrom("SupJav");
        vod.setVodPlayUrl(TextUtils.join("#", episodes));
        return Result.string(vod);
    }

    @Override
    public String playerContent(String flag, String id, List<String> vipFlags) {
        String pageUrl = absolute(id);
        Document doc = fetch(path(pageUrl));
        String media = extractMedia(doc.html());
        if (!media.isEmpty()) return Result.get().url(media).header(headers()).string();
        return Result.get().url(pageUrl).parse(1).header(headers()).string();
    }

    private Document fetch(String path) {
        return Jsoup.parse(OkHttp.string(absolute(path), headers()), siteUrl + "/");
    }

    private List<Vod> parseVods(Document doc) {
        List<Vod> list = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Element link : doc.select("a[href]")) {
            String href = link.attr("href");
            if (!isVideoLink(href)) continue;
            String id = absolute(href);
            if (!seen.add(id)) continue;
            Element card = link;
            String name = link.text().trim();
            for (int i = 0; i < 4 && card != null; i++, card = card.parent()) {
                if (name.isEmpty()) name = card.select("h2, h3, h4, h5, .title").text().trim();
                if (!card.select("img").isEmpty()) break;
            }
            if (name.isEmpty()) name = link.attr("title").trim();
            if (name.isEmpty()) continue;
            String pic = card == null ? "" : firstAttr(card, "img", "data-original");
            if (pic.isEmpty() && card != null) pic = firstAttr(card, "img", "data-src");
            if (pic.isEmpty() && card != null) pic = firstAttr(card, "img", "src");
            String remark = card == null ? "" : card.text().trim();
            list.add(new Vod(id, name, absolute(pic), remark));
        }
        return list;
    }

    private List<String> parseEpisodes(Document doc) {
        List<String> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Element link : doc.select("a[href]")) {
            String href = link.attr("href");
            if (!isPlayableLink(href)) continue;
            String url = absolute(href);
            if (seen.add(url)) {
                String name = link.text().trim();
                result.add((name.isEmpty() ? "播放" : name) + "$" + url);
            }
        }
        return result;
    }

    private boolean isVideoLink(String href) {
        if (TextUtils.isEmpty(href) || !href.contains("/zh/")) return false;
        String lower = href.toLowerCase();
        return !lower.contains("/popular") && !lower.contains("/page/")
                && !lower.contains("/category") && !lower.contains("/tag/")
                && !lower.contains("/maker/") && !lower.contains("/cast/")
                && !lower.contains("/genre/") && !lower.contains("#");
    }

    private boolean isPlayableLink(String href) {
        if (TextUtils.isEmpty(href)) return false;
        String lower = href.toLowerCase();
        return (lower.contains("/video/") || lower.contains("/play/")
                || lower.contains(".m3u8") || lower.contains(".mp4")
                || lower.contains("/zh/")) && !lower.contains("/popular")
                && !lower.contains("/page/");
    }

    private int pageCount(Document doc) {
        int count = 1;
        for (Element link : doc.select("a[href*='/page/']")) {
            Matcher matcher = Pattern.compile("/page/(\\d+)").matcher(link.attr("href"));
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
        return (element.hasAttr("content") ? element.attr("content") : element.text()).trim();
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
