package com.github.catvod.spider;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.DeflaterOutputStream;

import okhttp3.HttpUrl;

import static org.junit.Assert.assertArrayEquals;
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

    @Test
    public void cachesSubtitleResultsByNormalizedCodeWithoutSharingMutableArrays() throws Exception {
        JSONArray original = new JSONArray().put(item("IPX-343.srt", "https://a.example/cache.srt", "srt"));
        GMSubs.cacheSubtitles("CACHE-101", original);
        original.put(item("mutated.srt", "https://a.example/mutated.srt", "srt"));

        JSONArray first = GMSubs.cachedSubtitles("cache101");
        assertEquals(1, first.length());
        first.put(item("local-change.srt", "https://a.example/local.srt", "srt"));
        assertEquals(1, GMSubs.cachedSubtitles("CACHE-101").length());
        assertEquals(null, GMSubs.cachedSubtitles("missing-102"));
    }

    @Test
    public void cachesSuccessfulEmptyResultsAndExpiresEntries() {
        long now = 1_000_000L;
        GMSubs.cacheSubtitles("EMPTY-201", new JSONArray(), now);
        assertEquals(0, GMSubs.cachedSubtitles("empty201", now + GMSubs.SUBTITLE_CACHE_TTL_MS - 1).length());
        assertEquals(null, GMSubs.cachedSubtitles("EMPTY-201", now + GMSubs.SUBTITLE_CACHE_TTL_MS));
    }

    @Test
    public void evictsOldestSubtitleEntryAtCapacity() {
        for (int i = 0; i <= GMSubs.SUBTITLE_CACHE_SIZE; i++) {
            GMSubs.cacheSubtitles("CAPACITY-" + i, new JSONArray());
        }
        assertEquals(null, GMSubs.cachedSubtitles("CAPACITY-0"));
        assertEquals(0, GMSubs.cachedSubtitles("CAPACITY-" + GMSubs.SUBTITLE_CACHE_SIZE).length());
    }

    @Test
    public void failedSubtitleLookupIsNotCachedAndReturnsNoSubtitles() throws Exception {
        final int[] attempts = {0};
        JSONArray failed = GMSubs.cachedOrLookupSubtitles("FAIL-301", () -> {
            attempts[0]++;
            throw new java.io.IOException("offline");
        });
        assertEquals(0, failed.length());
        assertEquals(null, GMSubs.cachedSubtitles("FAIL-301"));

        JSONArray empty = GMSubs.cachedOrLookupSubtitles("FAIL-301", () -> {
            attempts[0]++;
            return new JSONArray();
        });
        assertEquals(0, empty.length());
        assertEquals(0, GMSubs.cachedOrLookupSubtitles("FAIL-301", () -> {
            attempts[0]++;
            return new JSONArray().put(new JSONObject());
        }).length());
        assertEquals(2, attempts[0]);
    }

    @Test
    public void subtitleLookupIsSkippedNearTheInstalledPlayerDeadline() {
        long start = 4_000_000_000L;
        assertTrue(GMSubs.hasSubtitleLookupBudget(start, start));
        assertFalse(GMSubs.hasSubtitleLookupBudget(start, start + java.util.concurrent.TimeUnit.SECONDS.toNanos(27)));
    }

    @Test
    public void supJavTvProxyPreservesMasterVariantsHeadersRelativeUrisAndSeekTags() throws Exception {
        String master = "#EXTM3U\n#EXT-X-VERSION:6\n"
                + "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",NAME=\"Audio\",URI=\"audio/index.m3u8\"\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=52800,RESOLUTION=854x480\n480.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=105600,RESOLUTION=1280x720\n720.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=1205600,RESOLUTION=1920x1080\n1080.m3u8\n"
                + "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=12000,RESOLUTION=320x180,URI=\"iframe.m3u8\"\n";
        String media = "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:120\n"
                + "#EXTINF:4.0,\nsegments/001.ts\n#EXT-X-BYTERANGE:512@0\n"
                + "shared.ts\n#EXTINF:4.0,\nsegments/003.ts\n#EXT-X-ENDLIST\n";
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("User-Agent", "TV-UA");
        headers.put("Referer", "https://turbovidhls.com/");
        headers.put("Cookie", "session=tv");
        GMSubs spider = new GMSubs();
        spider.siteKey = "SupJav";
        String proxyBase = "http://127.0.0.1:9978/proxy";

        String proxiedMaster = spider.rewriteProxyPlaylist(master,
                "https://cdn.example/hls/master.m3u8", proxyBase, headers);
        assertTrue(proxiedMaster.contains("RESOLUTION=854x480\n"));
        assertTrue(proxiedMaster.contains("RESOLUTION=1280x720\n"));
        assertTrue(proxiedMaster.contains("RESOLUTION=1920x1080\n"));
        assertEquals(3, proxiedMaster.lines().filter(line -> !line.startsWith("#")).count());
        assertTrue(proxiedMaster.contains("URI=\"" + proxyBase + "?do=csp&siteKey=SupJav&type=m3u8"));
        String audioLink = proxiedMaster.substring(proxiedMaster.indexOf("URI=\"") + 5).split("\"", 2)[0];
        assertEquals("https://cdn.example/hls/audio/index.m3u8", HttpUrl.parse(audioLink).queryParameter("url"));
        HttpUrl variant = HttpUrl.parse(proxiedMaster.lines().filter(line -> !line.startsWith("#")).findFirst().orElseThrow());
        assertEquals("https://cdn.example/hls/480.m3u8", variant.queryParameter("url"));
        JSONObject variantHeaders = new JSONObject(variant.queryParameter("h"));
        assertEquals("TV-UA", variantHeaders.getString("User-Agent"));
        assertEquals("https://turbovidhls.com/", variantHeaders.getString("Referer"));
        assertEquals("session=tv", variantHeaders.getString("Cookie"));

        String proxiedMedia = spider.rewriteProxyPlaylist(media,
                "https://cdn.example/hls/720/index.m3u8", proxyBase, headers);
        assertTrue(proxiedMedia.contains("#EXT-X-MEDIA-SEQUENCE:120\n"));
        assertTrue(proxiedMedia.contains("#EXTINF:4.0,\n"));
        assertTrue(proxiedMedia.contains("#EXT-X-BYTERANGE:512@0\n"));
        HttpUrl segment = HttpUrl.parse(proxiedMedia.lines().filter(line -> line.contains("type=ts") && line.contains("url=")).findFirst().orElseThrow());
        assertEquals("https://cdn.example/hls/720/segments/001.ts", segment.queryParameter("url"));
        JSONObject segmentHeaders = new JSONObject(segment.queryParameter("h"));
        assertEquals("TV-UA", segmentHeaders.getString("User-Agent"));
        assertFalse(segmentHeaders.has("Referer"));
        assertFalse(segmentHeaders.has("Cookie"));
        assertTrue("media segments stay on the same proxy route needed for seeking", proxiedMedia.contains("type=ts"));
    }

    @Test
    public void mediaPlaylistRoutesEverySegmentAndResolvesRelativeUris() {
        String media = "#EXTM3U\r\n#EXT-X-TARGETDURATION:5\r\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\r\n#EXTINF:5.0,\r\nhttps://lh3.example/d/abc=d\r\n#EXTINF:5.0,\r\nseg/2.ts\r\n#EXT-X-ENDLIST\r\n";
        String out = GMSubs.rewritePlaylist(media, "https://gs07.example/file/v/master.m3u8", (url, playlist) -> (playlist ? "P:" : "S:") + url);
        assertEquals("#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-KEY:METHOD=AES-128,URI=\"S:https://gs07.example/file/v/key.bin\"\n"
                + "#EXTINF:5.0,\nS:https://lh3.example/d/abc=d\n#EXTINF:5.0,\nS:https://gs07.example/file/v/seg/2.ts\n#EXT-X-ENDLIST\n", out);
    }

    @Test
    public void closesSegmentResponseWhenPrefixReadingFails() throws Exception {
        boolean[] closed = {false};
        okio.BufferedSource source = okio.Okio.buffer(new okio.Source() {
            public long read(okio.Buffer sink, long byteCount) throws java.io.IOException { throw new java.io.IOException("synthetic read failure"); }
            public okio.Timeout timeout() { return new okio.Timeout(); }
            public void close() { closed[0] = true; }
        });
        okhttp3.ResponseBody body = new okhttp3.ResponseBody() {
            public okhttp3.MediaType contentType() { return null; }
            public long contentLength() { return -1; }
            public okio.BufferedSource source() { return source; }
        };
        java.lang.reflect.Field field = GMSubs.class.getDeclaredField("stream");
        field.setAccessible(true);
        Object previous = field.get(null);
        field.set(null, new okhttp3.OkHttpClient.Builder().addInterceptor(chain -> new okhttp3.Response.Builder()
                .request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1).code(200).message("OK").body(body).build()).build());
        try {
            GMSubs spider = new GMSubs();
            java.lang.reflect.Method method = GMSubs.class.getDeclaredMethod("proxySegment", String.class, Map.class);
            method.setAccessible(true);
            try { method.invoke(spider, "https://cdn.example/test.ts", Map.of()); throw new AssertionError("Expected read failure"); }
            catch (java.lang.reflect.InvocationTargetException error) { assertTrue(error.getCause() instanceof java.io.IOException); }
            assertTrue(closed[0]);
        } finally { field.set(null, previous); }
    }

    @Test
    public void closesSegmentStreamAfterMidBodyReadFailure() throws Exception {
        final boolean[] closed = {false};
        InputStream source = new InputStream() {
            int remaining = 65536;
            @Override public int read() throws java.io.IOException {
                if (remaining-- > 0) return 0;
                throw new java.net.SocketTimeoutException("synthetic body failure");
            }
            @Override public void close() { closed[0] = true; }
        };
        InputStream input = GMSubs.stripFakePng(GMSubs.closeOnReadFailure(source));
        byte[] buffer = new byte[65536];
        assertEquals(65536, input.read(buffer));
        try { input.read(buffer); throw new AssertionError("Expected body timeout"); }
        catch (java.net.SocketTimeoutException expected) { assertTrue(closed[0]); }
    }

    @Test
    public void tvAndFstKeepEveryAdaptiveQuality() {
        String master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\nlow.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720\nmid.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=3103220,RESOLUTION=1920x1080\nhigh.m3u8\n";
        GMSubs spider = new GMSubs();
        spider.siteKey = "supjav";
        String fst = spider.rewriteProxyPlaylist(master, "https://fc2stream.tv/sample/master.m3u8", "http://127.0.0.1:9978/proxy", Map.of());
        assertTrue(fst.contains("RESOLUTION=640x360"));
        assertTrue(fst.contains("RESOLUTION=1280x720"));
        assertTrue(fst.contains("RESOLUTION=1920x1080"));
        assertTrue(spider.rewriteProxyPlaylist(master, "https://cdn3.turboviplay.com/sample/master.m3u8", "http://127.0.0.1:9978/proxy", Map.of()).contains("RESOLUTION=1920x1080"));
    }

    @Test
    public void fstPlaylistsReuseThePngProxyWithoutChangingOtherSites() {
        assertTrue(GMSubs.needsPngProxy("https://fc2stream.tv/video/master.m3u8?token=test"));
        assertTrue(GMSubs.needsPngProxy("https://cdn3.turboviplay.com/video/master.m3u8"));
        assertTrue(GMSubs.needsPngProxy("https://media.cdn-centaurus.com/hls/master.m3u8?token=test"));
        assertTrue(GMSubs.needsPngProxy("https://edge.premilkyway.com/hls/master.m3u8?token=test"));
        assertTrue(GMSubs.needsPngProxy("https://rou.video/api/hls/video-id"));
        for (String url : new String[]{null, "https://fc2stream.tv.attacker.example/a.m3u8", "https://user@fc2stream.tv/a.m3u8",
                "http://fc2stream.tv/a.m3u8", "https://fc2stream.tv/ad.mp4", "https://www.av01.media/master.m3u8",
                "https://cdn-centaurus.com.attacker.example/a.m3u8", "https://premilkyway.com.attacker.example/a.m3u8",
                "http://rou.video/api/hls/id", "https://user@rou.video/api/hls/id", "https://rou.video.evil.example/api/hls/id"}) {
            assertFalse(GMSubs.needsPngProxy(url));
        }
    }

    @Test
    public void resolvesFc2EmbedFromItsPackedPlayerWithoutLeakingSiteCredentials() throws Exception {
        String packed = "<script>eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1=\\\"2://3.4.10/5/6.7?8=9\\\";',10,11,'const|url|https|media|cdn-centaurus|hls|master|m3u8|token|safe|com'.split('|')))</script>";
        okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder().addInterceptor(chain -> {
            assertEquals("https://lk1.supremejav.com/", chain.request().header("Referer"));
            return new okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
                    .code(200).message("OK").body(okhttp3.ResponseBody.create(packed, okhttp3.MediaType.parse("text/html"))).build();
        }).build();
        JSONObject play = new JSONObject().put("url", "https://fc2stream.tv/e/test_123")
                .put("header", new JSONObject().put("User-Agent", "UA").put("Cookie", "private"));

        assertTrue(GMSubs.resolveFc2Embed(play, client));
        assertEquals("https://media.cdn-centaurus.com/hls/master.m3u8?token=safe", play.getString("url"));
        assertEquals("https://edge.premilkyway.com/hls/master.m3u8?token=safe",
                GMSubs.extractFc2Playlist(packed.replace("media|cdn-centaurus", "edge|premilkyway")));
        JSONObject header = play.getJSONObject("header");
        assertEquals("UA", header.getString("User-Agent"));
        assertEquals("https://fc2stream.tv/e/test_123", header.getString("Referer"));
        assertEquals("https://fc2stream.tv", header.getString("Origin"));
        assertFalse(header.has("Cookie"));
        for (String url : new String[]{"http://fc2stream.tv/e/test", "https://user@fc2stream.tv/e/test",
                "https://fc2stream.tv.attacker.example/e/test", "https://fc2stream.tv/watch/test"}) {
            assertFalse(GMSubs.isFc2Embed(url));
        }
    }

    @Test
    public void unwrapsRouPngPayloadsAndStopsBeforePngTrailer() throws Exception {
        byte[] playlist = "#EXTM3U\n#EXT-X-ENDLIST\n".getBytes(StandardCharsets.UTF_8);
        assertArrayEquals(playlist, readAll(GMSubs.stripFakePng(new ByteArrayInputStream(rouPng(playlist, true)))));
        byte[] segment = new byte[TS * 6];
        for (int i = 0; i < 6; i++) segment[i * TS] = 0x47;
        assertArrayEquals(segment, readAll(GMSubs.stripFakePng(new ByteArrayInputStream(rouPng(segment, false)))));
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

    private static byte[] rouPng(byte[] payload, boolean compressed) throws Exception {
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        if (compressed) {
            try (DeflaterOutputStream deflate = new DeflaterOutputStream(encoded)) { deflate.write(payload); }
        } else {
            encoded.write(payload);
        }
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(png)) {
            out.write(new byte[]{(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10});
            out.writeInt(encoded.size() + 1);
            out.writeBytes("roUd");
            out.writeByte(compressed ? 1 : 0);
            encoded.writeTo(out);
            out.writeInt(0);
            out.writeInt(0);
            out.writeBytes("IEND");
            out.writeInt(0);
        }
        return png.toByteArray();
    }

    @Test
    public void tokenMastersKeepAdaptiveVariantsOnTheAuthorizedApiHost() {
        String master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360\nlow.m3u8?ro=0\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080\nhigh.m3u8\n"
                + "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1000,URI=\"iframe.m3u8\"\n";
        String result = GMSubs.rewritePlaylist(master, "https://www.av01.media/api/v1/videos/7/manifest/master.m3u8",
                (url, playlist) -> playlist ? GMSubs.tokenManifestUrl(url, "T") : url, false);
        assertTrue(result.contains("RESOLUTION=640x360\nhttps://customers.iw01.xyz/api/v1/videos/7/manifest/low.m3u8?ro=0&access_token=T"));
        assertTrue(result.contains("RESOLUTION=1920x1080\nhttps://customers.iw01.xyz/api/v1/videos/7/manifest/high.m3u8?access_token=T"));
        assertTrue(result.contains("URI=\"https://customers.iw01.xyz/api/v1/videos/7/manifest/iframe.m3u8?access_token=T\""));
        assertEquals("https://cdn.example/other.m3u8", GMSubs.tokenManifestUrl("https://cdn.example/other.m3u8", "T"));
        assertEquals("https://customers.iw01.xyz/api/v1/videos/7/manifest/high.m3u8?access_token=Z",
                GMSubs.tokenManifestUrl("https://www.av01.media/api/v1/videos/7/manifest/high.m3u8?access_token=Z", "T"));
    }

    @Test
    public void coldTokenKeepsOnlySiteSupportedQualitiesAndFallsBackToLowest() {
        String master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360\nlow.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nmid.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080\nhigh.m3u8\n"
                + "#EXT-X-I-FRAME-STREAM-INF:RESOLUTION=1920x1080,URI=\"iframe.m3u8\"\n";
        String out = GMSubs.rewritePlaylist(master, "https://cdn.example/master.m3u8", (url, playlist) -> url, false, 720);
        assertTrue(out.contains("low.m3u8"));
        assertTrue(out.contains("mid.m3u8"));
        assertFalse(out.contains("high.m3u8"));
        assertFalse(out.contains("iframe.m3u8"));
        assertTrue(GMSubs.rewritePlaylist("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nonly.m3u8\n",
                "https://cdn.example/master.m3u8", (url, playlist) -> url, false, 720).contains("only.m3u8"));
    }

    @Test
    public void hotTokenRetainsEveryAuthorizedQualityForAdaptivePlayback() {
        String master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360\nlow.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nmid.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080\nhigh.m3u8\n";
        String out = GMSubs.rewritePlaylist(master, "https://cdn.example/master.m3u8", (url, playlist) -> url, false, 1080);
        assertTrue(out, out.contains("RESOLUTION=640x360\nhttps://cdn.example/low.m3u8"));
        assertTrue(out, out.contains("RESOLUTION=1280x720\nhttps://cdn.example/mid.m3u8"));
        assertTrue(out, out.contains("RESOLUTION=1920x1080\nhttps://cdn.example/high.m3u8"));
    }

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
