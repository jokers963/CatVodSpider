package com.github.catvod.spider;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Map;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class GMSubsTest {

    @Test
    public void aStaleResolverCannotCancelTheNextPlaybackGeneration() {
        GMSubs spider = new GMSubs();
        assertTrue(spider.finishEmbedTap(0));
        assertFalse(spider.finishEmbedTap(0));
        assertTrue(spider.finishEmbedTap(1));
        assertFalse(spider.finishEmbedTap(0));
    }

    @Test
    public void embedTapTargetsOnlyTheRequestedPlayerPage() {
        String descriptor = "{\"name\":\"REAL-795 title\",\"ext\":{\"replace\":{\"pathname\":\"1234\",\"link\":2}}}";
        assertEquals("https://supjav.com/zh/1234#2", GMSubs.embedPageFromDescriptor(descriptor));
        assertEquals("https://supjav.com/zh/1234.html#2", GMSubs.embedPageFromDescriptor(descriptor.replace("1234", "1234.html")));
        assertEquals("", GMSubs.embedPageFromDescriptor("{\"ext\":{\"replace\":{\"pathname\":\"../evil\",\"link\":2}}}"));
        assertEquals("", GMSubs.embedPageFromDescriptor("https://supjav.com/zh/1234"));
        assertEquals("", GMSubs.embedPageFromDescriptor("invalid"));
    }

    @Test
    public void onlyStreamtapeAndVoeNeedATapInsideThePlayerFrame() {
        assertTrue(GMSubs.needsEmbedTap("ST"));
        assertTrue(GMSubs.needsEmbedTap("voe"));
        assertFalse(GMSubs.needsEmbedTap("TV"));
        assertFalse(GMSubs.needsEmbedTap("FST"));
        assertFalse(GMSubs.needsEmbedTap(""));
    }

    @Test
    public void keepsTheTapArmedWhenThePageOnlyAsksTheHostToMatch() {
        assertTrue(GMSubs.isMatchResult("{\"type\":\"match\"}"));
        assertTrue(GMSubs.isMatchResult("{\"type\":\"Match\"}"));
        assertFalse(GMSubs.isMatchResult("{\"type\":\"url\"}"));
        assertFalse(GMSubs.isMatchResult(""));
        assertFalse(GMSubs.isMatchResult(null));
    }

    @Test
    public void waitsForTheRealEmbedHostBeforeTapping() {
        assertTrue(GMSubs.embedSrcReady("ST", "https://streamtape.com/e/abc"));
        assertTrue(GMSubs.embedSrcReady("ST", "https://964695132.tapecontent.net/radosgw/x"));
        assertFalse(GMSubs.embedSrcReady("ST", "https://live.example/embed"));
        assertTrue(GMSubs.embedSrcReady("VOE", "https://voe.sx/e/abc"));
        assertFalse(GMSubs.embedSrcReady("VOE", "https://streamtape.com/e/abc"));
        assertTrue(GMSubs.embedSrcReady("ST", "https://lk1.supremejav.com/embed"));
        assertTrue(GMSubs.embedSrcReady("VOE", "https://lk1.supremejav.com/embed"));
        assertFalse(GMSubs.embedSrcReady("TV", "https://lk1.supremejav.com/embed"));
        assertFalse(GMSubs.embedSrcReady("ST", "https://evil.example/?url=streamtape.com"));
        assertFalse(GMSubs.embedSrcReady("ST", "https://streamtape.com.evil.example/e/abc"));
        assertFalse(GMSubs.embedSrcReady("ST", "http://streamtape.com/e/abc"));
        assertEquals("https://streamtape.com/e/abc", GMSubs.embedSrc("\"{\\\"src\\\":\\\"https://streamtape.com/e/abc\\\"}\""));
    }

    @Test
    public void reusesOnlyTheRetainedWebViewAfterItNavigatesAwayFromSupJav() {
        assertTrue(GMSubs.isEmbedCandidate("https://supjav.com/zh/123#3", "https://ad.example/", true));
        assertFalse(GMSubs.isEmbedCandidate("https://supjav.com/zh/123#3", "https://ad.example/", false));
        assertFalse(GMSubs.isEmbedCandidate("", "https://supjav.com/zh/123#3", false));
    }

    @Test
    public void serverSelectionDoesNotReloadAnAlreadyLoadedActiveFrame() {
        String script = GMSubs.selectFlagScript("ST");
        assertTrue(script.contains("classList.contains('active')"));
        assertTrue(script.contains("f.src&&f.src!=='about:blank'"));
        assertTrue(script.contains("list[i].click()"));
    }

    @Test
    public void mapsThePlayerFrameCenterIntoTheWebView() {
        String raw = "\"{\\\"x\\\":100,\\\"y\\\":200,\\\"w\\\":400,\\\"h\\\":300,\\\"iw\\\":1000,\\\"clear\\\":1}\"";
        assertEquals("", GMSubs.unwrapJsString("null"));
        assertEquals("{\"x\":100}", GMSubs.unwrapJsString("\"{\\\"x\\\":100}\""));
        int[] point = GMSubs.embedTapPoint(raw, 500, 800);
        assertEquals(50, point[0]);
        assertEquals(100, point[1]);
        assertEquals(null, GMSubs.embedTapPoint("\"{\\\"x\\\":100,\\\"y\\\":200,\\\"w\\\":400,\\\"h\\\":300,\\\"iw\\\":1000}\"", 500, 800));
        assertEquals(null, GMSubs.embedTapPoint("\"{\\\"x\\\":10,\\\"y\\\":10,\\\"w\\\":20,\\\"h\\\":20,\\\"iw\\\":1000,\\\"clear\\\":1}\"", 500, 800));
        assertEquals(null, GMSubs.embedTapPoint("\"{\\\"x\\\":100,\\\"y\\\":200,\\\"w\\\":400,\\\"h\\\":300,\\\"iw\\\":1000,\\\"clear\\\":0}\"", 500, 800));
    }

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

    @Test
    public void masterPlaylistKeepsOnlyTheHighestResolutionThroughTheProxy() {
        String master = "#EXTM3U\n#EXT-X-VERSION:6\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=105600,RESOLUTION=1280x720\nhttps://gs07.example/a/720.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=1205600,RESOLUTION=1920x1080\nhttps://gs16.example/a/1080.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=52800,RESOLUTION=854x480\nhttps://gs18.example/a/480.m3u8\n";
        String out = GMSubs.rewritePlaylist(master, "https://cdn3.example/data/x.m3u8", (url, playlist) -> (playlist ? "P:" : "S:") + url);
        assertEquals("#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-STREAM-INF:BANDWIDTH=1205600,RESOLUTION=1920x1080\nP:https://gs16.example/a/1080.m3u8\n", out);
    }

    @Test
    public void mediaPlaylistRoutesEverySegmentAndResolvesRelativeUris() {
        String media = "#EXTM3U\r\n#EXT-X-TARGETDURATION:5\r\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\r\n#EXTINF:5.0,\r\nhttps://lh3.example/d/abc=d\r\n#EXTINF:5.0,\r\nseg/2.ts\r\n#EXT-X-ENDLIST\r\n";
        String out = GMSubs.rewritePlaylist(media, "https://gs07.example/file/v/master.m3u8", (url, playlist) -> (playlist ? "P:" : "S:") + url);
        assertEquals("#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-KEY:METHOD=AES-128,URI=\"S:https://gs07.example/file/v/key.bin\"\n"
                + "#EXTINF:5.0,\nS:https://lh3.example/d/abc=d\n#EXTINF:5.0,\nS:https://gs07.example/file/v/seg/2.ts\n#EXT-X-ENDLIST\n", out);
    }

    @Test
    public void stripsTheFakePngPrefixAndKeepsTheTransportStream() throws Exception {
        byte[] ts = new byte[TS * 6];
        for (int i = 0; i < 6; i++) ts[i * TS] = 0x47;
        ts[5] = 0x47;
        byte[] png = new byte[941];
        png[0] = (byte) 0x89;
        png[1] = 'P';
        png[2] = 'N';
        png[3] = 'G';
        png[100] = 0x47;
        byte[] segment = new byte[png.length + ts.length];
        System.arraycopy(png, 0, segment, 0, png.length);
        System.arraycopy(ts, 0, segment, png.length, ts.length);

        assertEquals(941, GMSubs.tsOffset(segment, segment.length));
        assertArrayEquals(ts, readAll(GMSubs.stripFakePng(new ByteArrayInputStream(segment))));
        assertArrayEquals(ts, readAll(GMSubs.stripFakePng(new ByteArrayInputStream(ts))));
    }

    @Test
    public void segmentRequestsDropRefererOriginAndCookie() {
        Map<String, String> headers = GMSubs.headers("{\"User-Agent\":\"UA\",\"Referer\":\"https://turbovidhls.com/\",\"origin\":\"https://x\",\"Cookie\":\"a=b\"}");
        assertEquals(4, headers.size());
        Map<String, String> segment = GMSubs.segmentHeaders(headers);
        assertEquals(1, segment.size());
        assertEquals("UA", segment.get("User-Agent"));
    }

    @Test
    public void tokenMasterCarriesTheAccessTokenToTheRelativeBestVariant() {
        String master = "#EXTM3U\n#EXT-X-VERSION:3\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=396161,RESOLUTION=640x360\nindex90-sv1-v1-a1.m3u8?ro=0\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=3099362,RESOLUTION=1920x1080\nindex90-sv3-v1-a1.m3u8\n";
        String out = GMSubs.rewritePlaylist(master, "https://www.av01.media/api/v1/videos/7/manifest/master.m3u8?access_token=T",
                (url, playlist) -> playlist ? GMSubs.withQuery(url, "access_token", "T") : url);
        assertEquals("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=3099362,RESOLUTION=1920x1080\n"
                + "https://www.av01.media/api/v1/videos/7/manifest/index90-sv3-v1-a1.m3u8?access_token=T\n", out);
        assertEquals("https://x/a.m3u8?ro=0&access_token=T", GMSubs.withQuery("https://x/a.m3u8?ro=0", "access_token", "T"));
        assertEquals("https://x/a.m3u8?access_token=Z", GMSubs.withQuery("https://x/a.m3u8?access_token=Z", "access_token", "T"));
    }

    private static final int TS = 188;

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
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
