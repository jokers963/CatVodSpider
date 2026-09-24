package com.github.catvod.spider;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class GMSubsTest {

    @Test
    public void extractsVideoCodeFromTitle() {
        assertEquals("REAL-795", GMSubs.codeFromTitle("REAL-795 A Slow-lip Delivery Service That Uses Incredible Technique"));
        assertEquals("IPX-343", GMSubs.codeFromTitle("IPX-343 「奥はダメ！もうイッてる！！」"));
    }

    @Test
    public void readsCodeFromTheLineNameWhenThePlayIdIsADirectAddress() {
        assertEquals("IPX-343", GMSubs.codeFromPlay("ipx-343-uncensored 标题", "https://cdn.example/master.m3u8"));
        assertEquals("", GMSubs.codeFromPlay("MissAV", "https://cdn.example/master.m3u8"));
    }

    @Test
    public void stripsGmDataUrlPrefixBeforeReadingTheTitle() {
        assertEquals("eyJuYW1lIjoiSVBYLTM0MyJ9", GMSubs.playIdPayload("data:text/plain;base64,eyJuYW1lIjoiSVBYLTM0MyJ9"));
        assertEquals("eyJuYW1lIjoiUkVBTC03OTUifQ==", GMSubs.playIdPayload("eyJuYW1lIjoiUkVBTC03OTUifQ=="));
    }

    @Test
    public void ranksSubtitlesByNormalizedCodeRelevance() throws Exception {
        assertEquals(0, GMSubs.subtitleRank("IPX-343", "IPX-343.zh.srt"));
        assertEquals(0, GMSubs.subtitleRank("IPX-343", "IPX343.ass"));
        assertEquals(0, GMSubs.subtitleRank("IPX-343", "[无码破解]IPX-343 完整标题.srt"));
        assertEquals(1, GMSubs.subtitleRank("IPX-343", "cover_IPX-343_full_title.srt"));
        assertEquals(2, GMSubs.subtitleRank("IPX-343", "OtherShow.chs.vtt"));

        JSONArray data = new JSONArray()
                .put(item("OtherShow.chs.vtt", "https://a.example/other.vtt", "vtt"))
                .put(item("cover_IPX-343_full_title.srt", "https://a.example/title.srt", "srt"))
                .put(item("IPX343.ass", "https://a.example/compact.ass", "ass"))
                .put(item("IPX-343.zh.srt", "https://a.example/exact.srt", "srt"))
                .put(item("Earlier equal rank.chs.srt", "https://a.example/earlier.srt", "srt"))
                .put(item("Later equal rank.chs.srt", "https://a.example/later.srt", "srt"))
                .put(item("dup.srt", "https://a.example/exact.srt", "srt"))
                .put(item("", "https://a.example/empty.srt", "srt"))
                .put(item("skip.http", "http://a.example/plain.srt", "srt"))
                .put(item("skip.ext", "https://a.example/file.sub", "sub"));

        JSONArray ranked = GMSubs.rankSubtitles("IPX-343", data);
        assertEquals(6, ranked.length());
        assertEquals("迅雷 · IPX343.ass", ranked.getJSONObject(0).getString("name"));
        assertEquals("迅雷 · IPX-343.zh.srt", ranked.getJSONObject(1).getString("name"));
        assertEquals("迅雷 · cover_IPX-343_full_title.srt", ranked.getJSONObject(2).getString("name"));
        assertEquals("迅雷 · OtherShow.chs.vtt", ranked.getJSONObject(3).getString("name"));
        assertEquals("迅雷 · Earlier equal rank.chs.srt", ranked.getJSONObject(4).getString("name"));
        assertEquals("迅雷 · Later equal rank.chs.srt", ranked.getJSONObject(5).getString("name"));
        assertFalse(containsUrl(ranked, "https://a.example/empty.srt"));
        assertFalse(containsUrl(ranked, "http://a.example/plain.srt"));
        assertFalse(containsUrl(ranked, "https://a.example/file.sub"));
        assertTrue(containsUrl(ranked, "https://a.example/exact.srt"));
    }

    private static JSONObject item(String name, String url, String ext) throws Exception {
        return new JSONObject().put("name", name).put("url", url).put("ext", ext);
    }

    private static boolean containsUrl(JSONArray ranked, String url) throws Exception {
        for (int i = 0; i < ranked.length(); i++) {
            if (url.equals(ranked.getJSONObject(i).getString("url"))) return true;
        }
        return false;
    }
}
