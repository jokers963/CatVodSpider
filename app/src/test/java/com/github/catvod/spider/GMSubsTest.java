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

    private static GMSubs.SubtitleQuality quality(String text) throws Exception {
        return GMSubs.analyzeSubtitle(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String captions(int count, String body) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < count; i++) text.append(i + 1).append("\n00:00:01,000 --> 00:00:02,000\n")
                .append(body).append("\n\n");
        return text.toString();
    }

    private static String spacedCaptions(int count, String body, long offset) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < count; i++) {
            long from = offset + i * 30000L;
            text.append(i + 1).append('\n');
            for (long time : new long[]{from, from + 2000}) {
                text.append(String.format(java.util.Locale.ROOT, "%02d:%02d:%02d,%03d", time / 3600000,
                        time / 60000 % 60, time / 1000 % 60, time % 1000));
                text.append(time == from ? " --> " : "\n");
            }
            text.append(body).append("\n\n");
        }
        return text.toString();
    }

    @Test
    public void dominantLongAnnotationLoopsAreDemotedWithoutDeletingCandidates() throws Exception {
        String ordinary = spacedCaptions(120, "今天我们一起去公园。", 3000000);
        GMSubs.SubtitleQuality loop = quality(spacedCaptions(80, "（未知的长串识别标签）", 0) + ordinary);
        GMSubs.SubtitleQuality healthy = quality(spacedCaptions(80, "今天我们一起去公园。", 0) + ordinary);
        assertEquals(80, loop.loopedAnnotation);
        assertEquals(healthy.score() - 32, loop.score());
        assertTrue(loop.annotations.isEmpty());
        JSONArray rows = GMSubs.rankSubtitles("TEST-010", new JSONArray()
                .put(item("TEST-010.srt", "https://example.com/loop.srt", "srt"))
                .put(item("TEST-010-good.srt", "https://example.com/good.srt", "srt")));
        JSONArray ranked = GMSubs.rankSubtitleContents("TEST-010", rows,
                Map.of("https://example.com/loop.srt", loop, "https://example.com/good.srt", healthy));
        assertEquals(2, ranked.length());
        assertEquals("https://example.com/good.srt", ranked.getJSONObject(0).getString("url"));
        assertTrue(ranked.getJSONObject(1).getString("name").endsWith("疑似正文复读"));
    }

    @Test
    public void annotationLoopsProtectShortCallsDialogueLyricsRareAndConcentratedRepetition() throws Exception {
        String ordinary = spacedCaptions(120, "今天我们一起去公园。", 3000000);
        for (String body : new String[]{"哦", "是的", "部长", "（部长）", "（山田部长）", "今天我们一起去公园",
                "（你好，朋友，辛苦了。）", "（♪今天我们一起去公园♪）", "[Thank you very much]"})
            assertEquals(body, 0, quality(spacedCaptions(80, body, 0) + ordinary).loopedAnnotation);
        String annotation = "（未知的长串识别标签）";
        assertEquals(0, quality(spacedCaptions(59, annotation, 0) + spacedCaptions(41, "你好", 3000000)).loopedAnnotation);
        assertEquals(0, quality(spacedCaptions(60, annotation, 0) + spacedCaptions(140, "你好", 3000000)).loopedAnnotation);
        assertEquals(0, quality(captions(80, annotation) + ordinary).loopedAnnotation);
        assertEquals(0, quality(spacedCaptions(80, annotation, 0) + spacedCaptions(120, "A very long English dialogue for a foreign subtitle.", 3000000)).loopedAnnotation);
    }

    @Test
    public void nearEqualHealthyTranslationsAppearBeforeTheirTimeShiftAlternates() throws Exception {
        String body = spacedCaptions(120, "今天我们一起去公园。", 0);
        String shifted = spacedCaptions(120, "今天我们一起去公园。", 6000);
        String twiceShifted = spacedCaptions(120, "今天我们一起去公园。", 12000);
        assertEquals(quality(body).bodyFingerprint, quality(shifted).bodyFingerprint);
        assertFalse(quality(body).fingerprint.equals(quality(shifted).fingerprint));
        String[] names = {"a", "copy", "shift", "shift2", "other", "low", "unknown"};
        JSONArray data = new JSONArray();
        for (String name : names) data.put(item("TEST-011-" + name + ".srt", "https://example.com/" + name + ".srt", "srt"));
        JSONArray rows = GMSubs.rankSubtitles("TEST-011", data);
        Map<String, GMSubs.SubtitleQuality> evidence = Map.of(
                "https://example.com/a.srt", quality(body), "https://example.com/copy.srt", quality(body),
                "https://example.com/shift.srt", quality(shifted), "https://example.com/shift2.srt", quality(twiceShifted),
                "https://example.com/other.srt", quality(spacedCaptions(119, "今天我们一起去看电影。", 0)),
                "https://example.com/low.srt", quality(captions(20, "你好")));
        JSONArray ranked = GMSubs.rankSubtitleContents("TEST-011", rows, evidence);
        String[] expected = {"a", "other", "shift", "shift2", "low", "unknown"};
        assertEquals(expected.length, ranked.length());
        for (int i = 0; i < expected.length; i++) {
            assertEquals("https://example.com/" + expected[i] + ".srt", ranked.getJSONObject(i).getString("url"));
            assertEquals(i == 0 ? 1 : 2, ranked.getJSONObject(i).getInt("flag"));
        }
        assertTrue(ranked.getJSONObject(2).getString("name").endsWith("同正文·不同时间轴"));
        assertFalse(rows.getJSONObject(2).getString("name").contains("同正文"));
        // A distinct but much lower-quality family must not leapfrog a healthy time-shift alternative.
        assertTrue(ranked.getJSONObject(4).getString("url").contains("low.srt"));
    }

    @Test
    public void diversityNeverPromotesDamagedOrInvalidTranslationsOverHealthyShiftedAlternatives() throws Exception {
        JSONArray data = new JSONArray();
        for (String name : new String[]{"a", "shift", "damaged", "invalid"})
            data.put(item("TEST-012-" + name + ".srt", "https://example.com/" + name + ".srt", "srt"));
        String ordinary = spacedCaptions(120, "今天我们一起去公园。", 0);
        GMSubs.SubtitleQuality damaged = quality(ordinary.replaceFirst("今天", "今\ufffd"));
        GMSubs.SubtitleQuality invalid = quality(ordinary.replaceFirst("00:00:02,000", "00:00:00,000"));
        assertEquals(1, damaged.damaged);
        assertEquals(1, invalid.invalid);
        JSONArray ranked = GMSubs.rankSubtitleContents("TEST-012", GMSubs.rankSubtitles("TEST-012", data), Map.of(
                "https://example.com/a.srt", quality(ordinary),
                "https://example.com/shift.srt", quality(spacedCaptions(120, "今天我们一起去公园。", 6000)),
                "https://example.com/damaged.srt", damaged, "https://example.com/invalid.srt", invalid));
        assertEquals("https://example.com/a.srt", ranked.getJSONObject(0).getString("url"));
        assertEquals("https://example.com/shift.srt", ranked.getJSONObject(1).getString("url"));
        assertEquals(4, ranked.length());
    }

    @Test
    public void contentRankingPenalizesInvalidEmptyNoisyAndForeignNotJustEntryCount() throws Exception {
        GMSubs.SubtitleQuality healthy = quality(captions(493, "今天我们一起去公园。"));
        GMSubs.SubtitleQuality inflated = quality(captions(2456, "") + captions(699, "（呼吸声）") + captions(178, "你好"));
        GMSubs.SubtitleQuality invalid = quality(captions(493, "你好").replace("00:00:01,000", "00:00:03,000"));
        assertEquals(3333, inflated.cues);
        assertEquals(2456, inflated.empty);
        assertEquals(699, inflated.noise);
        assertEquals(493, invalid.invalid);
        assertTrue(healthy.score() > inflated.score());
        GMSubs.SubtitleQuality sounds = quality(captions(2450, "(息を吸う音)") + captions(643, "（吸气声）") + captions(240, "你好"));
        assertEquals(3093, sounds.noise);
        assertTrue(healthy.score() > sounds.score());
        assertTrue(healthy.score() > invalid.score());
        assertTrue(healthy.score() > quality(captions(493, "今日はいい天気です。" )).score());
        assertTrue(healthy.score() > quality(captions(493, "哈哈哈哈哈哈哈哈哈哈" )).score());
        assertTrue(healthy.score() > quality(captions(493, "坏\ufffd字\u0000符" )).score());
        assertTrue(healthy.score() > quality(captions(51, "今天我们一起去公园。" )).score());
        try { quality("<html>verification</html>"); org.junit.Assert.fail("Not a subtitle"); }
        catch (java.io.IOException expected) { }
        assertEquals(0, quality(captions(10, "（你好，朋友。）")).noise);
        assertTrue(healthy.score() > quality(captions(493, "A beautiful day outside.") + captions(1, "中文字幕")).score());
    }

    @Test
    public void parsesSrtVttAssAndSsaWithEqualVisibleContent() throws Exception {
        String srt = "1\n00:00:01,200 --> 00:00:03,450\n你好，<i>朋友</i>。\n";
        GMSubs.SubtitleQuality reference = quality(srt);
        String vtt = "WEBVTT\n\nintro\n00:01.200 --> 00:03.450 align:start\n你好，朋友。\n";
        String ass = "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\i1}你好，朋友。\n";
        String ssa = ass.replace("Layer", "Marked").replace("Dialogue: 0,", "Dialogue: Marked=0,");
        assertEquals(reference.fingerprint, quality(vtt).fingerprint);
        assertEquals(reference.fingerprint, quality(ass).fingerprint);
        assertEquals(reference.fingerprint, quality(ssa).fingerprint);
        assertEquals(3450, GMSubs.subtitleTime("0:00:03.45"));
        assertEquals(1200, GMSubs.subtitleTime("00:01.200"));
    }

    @Test
    public void frequentIsolatedLatinFragmentsLowerChineseQualityWithoutPenalizingNormalShortDialogue() throws Exception {
        String dialogue = captions(1400, "今天我们一起去公园。");
        int healthy = quality(dialogue + captions(600, "嗯嗯")).score();
        GMSubs.SubtitleQuality fragments = quality(dialogue + captions(60, "<i>A...</i>") + captions(540, "是的"));
        assertEquals(60, fragments.isolatedLatin);
        assertEquals(healthy - 12, fragments.score());
        for (String shortText : new String[]{"嗯", "啊", "嗯嗯", "是的", "好的", "A计划", "B超", "维生素A", "OK"})
            assertEquals(shortText, healthy, quality(dialogue + captions(600, shortText)).score());
        assertEquals(healthy, quality(dialogue + captions(4, "A")).score());
        assertEquals(healthy, quality(dialogue + captions(5, "A")).score()); // Below one percent.
        assertEquals(quality(captions(2000, "I")).score(), quality(captions(2000, "Hello")).score());
        JSONArray rows = GMSubs.rankSubtitles("TEST-009", new JSONArray()
                .put(item("TEST-009.srt", "https://example.com/fragments.srt", "srt"))
                .put(item("TEST-009-good.srt", "https://example.com/good.srt", "srt")));
        Map<String, GMSubs.SubtitleQuality> evidence = new LinkedHashMap<>();
        evidence.put("https://example.com/fragments.srt", fragments);
        evidence.put("https://example.com/good.srt", quality(dialogue + captions(600, "嗯嗯")));
        JSONArray ranked = GMSubs.rankSubtitleContents("TEST-009", rows, evidence);
        assertEquals("https://example.com/good.srt", ranked.getJSONObject(0).getString("url"));
        assertEquals(2, ranked.length()); // Demote, never remove a distinct candidate.
    }

    @Test
    public void removesOnlyDuplicatesWithBothIdenticalTextAndIdenticalTimestamps() throws Exception {
        String body = captions(120, "你好，朋友。");
        JSONArray rows = GMSubs.rankSubtitles("TEST-001", new JSONArray()
                .put(item("TEST-001.srt", "https://example.com/a.srt", "srt"))
                .put(item("TEST-001-copy.srt", "https://example.com/b.srt", "srt"))
                .put(item("TEST-001-shift.srt", "https://example.com/c.srt", "srt"))
                .put(item("TEST-001-text.srt", "https://example.com/d.srt", "srt"))
                .put(item("TEST-001-unfetched.srt", "https://example.com/e.srt", "srt")));
        Map<String, GMSubs.SubtitleQuality> evidence = new LinkedHashMap<>();
        evidence.put("https://example.com/a.srt", quality(body));
        evidence.put("https://example.com/b.srt", quality("\ufeff" + body.replace("\n", "\r\n") + "  \r\n"));
        evidence.put("https://example.com/c.srt", quality(body.replace("00:00:01,000", "00:00:02,000").replace("00:00:02,000\n", "00:00:03,000\n")));
        evidence.put("https://example.com/d.srt", quality(body.replace("朋友", "同学")));
        JSONArray ranked = GMSubs.rankSubtitleContents("TEST-001", rows, evidence);
        assertEquals(4, ranked.length());
        assertFalse(containsUrl(ranked, "https://example.com/b.srt"));
        assertTrue(containsUrl(ranked, "https://example.com/c.srt"));
        assertTrue(containsUrl(ranked, "https://example.com/d.srt"));
        assertTrue(containsUrl(ranked, "https://example.com/e.srt"));
        assertEquals(1, ranked.getJSONObject(0).getInt("flag"));
        assertEquals(2, ranked.getJSONObject(1).getInt("flag"));
        assertFalse(rows.getJSONObject(0).has("flag"));
    }

    @Test
    public void sourceCreditDoesNotOverrideBrokenTimingAndAllUnknownKeepsOriginalOrder() throws Exception {
        JSONArray rows = GMSubs.rankSubtitles("TEST-002", new JSONArray()
                .put(item("TEST-002-色花堂.srt", "https://example.com/a.srt", "srt"))
                .put(item("TEST-002.srt", "https://example.com/b.srt", "srt")));
        assertEquals(rows.toString(), GMSubs.rankSubtitleContents("TEST-002", rows, new LinkedHashMap<>()).toString());
        Map<String, GMSubs.SubtitleQuality> evidence = new LinkedHashMap<>();
        evidence.put("https://example.com/a.srt", quality(captions(150, "色花堂字幕出品").replace("00:00:02,000", "00:00:00,000")));
        evidence.put("https://example.com/b.srt", quality(captions(150, "今天我们去公园。")));
        JSONArray ranked = GMSubs.rankSubtitleContents("TEST-002", rows, evidence);
        assertEquals("https://example.com/b.srt", ranked.getJSONObject(0).getString("url"));
        assertTrue(ranked.getJSONObject(1).getString("name").endsWith("时轴异常"));
    }

    @Test
    public void explicitDifferentVideoCodeCannotWinByHavingMoreDialogue() throws Exception {
        JSONArray rows = GMSubs.rankSubtitles("TEST-007", new JSONArray()
                .put(item("TEST-008.srt", "https://example.com/wrong.srt", "srt"))
                .put(item("TEST-007.srt", "https://example.com/right.srt", "srt")));
        Map<String, GMSubs.SubtitleQuality> evidence = new LinkedHashMap<>();
        evidence.put("https://example.com/wrong.srt", quality(captions(1000, "今天我们去公园。")));
        evidence.put("https://example.com/right.srt", quality(captions(120, "你好，朋友。")));
        assertEquals("https://example.com/right.srt", GMSubs.rankSubtitleContents("TEST-007", rows, evidence).getJSONObject(0).getString("url"));
    }

    @Test
    public void decodingAndResourceCapsFailOpenRatherThanInventingText() throws Exception {
        String srt = captions(2, "你好");
        assertEquals(quality(srt).fingerprint, GMSubs.analyzeSubtitle(srt.getBytes(StandardCharsets.UTF_16)).fingerprint);
        try {
            GMSubs.decodeSubtitle(srt.getBytes(java.nio.charset.Charset.forName("GB18030")));
            org.junit.Assert.fail("Both legacy decoders accept these bytes but disagree; do not guess");
        } catch (java.io.IOException expected) { assertTrue(expected.getMessage().contains("Ambiguous")); }
        for (byte[] bytes : new byte[][]{new byte[]{(byte) 0xff}, new byte[GMSubs.MAX_SUBTITLE_BYTES + 1]}) {
            try { GMSubs.analyzeSubtitle(bytes); org.junit.Assert.fail("Must reject undecodable/oversized data"); }
            catch (Exception expected) { }
        }
        try { quality(captions(20001, "你好")); org.junit.Assert.fail("Cue cap"); }
        catch (java.io.IOException expected) { }
        try { quality(captions(2, "你好").replace("\n\n", "\n")); org.junit.Assert.fail("No partial dedup"); }
        catch (java.io.IOException expected) { }
        try { quality("1\n00:00:99,000 --> 00:01:40,000\n你好\n"); org.junit.Assert.fail("Bad clock"); }
        catch (IllegalArgumentException expected) { }
        assertFalse(GMSubs.trustedSubtitleUrl("https://subtitle.v.geilijiasu.com.evil.example/a.srt"));
        assertFalse(GMSubs.trustedSubtitleUrl("https://user:secret@subtitle.v.geilijiasu.com/a.srt"));
        assertFalse(GMSubs.trustedSubtitleUrl("http://subtitle.v.geilijiasu.com/a.srt"));
        assertFalse(GMSubs.trustedSubtitleUrl("https://subtitle.v.geilijiasu.com:444/a.srt"));
        assertTrue(GMSubs.trustedSubtitleUrl("https://subtitle.v.geilijiasu.com/A/B/c.srt"));
        long start = 123000L;
        assertEquals(1500, GMSubs.subtitleQualityBudget(start, start));
        assertEquals(500, GMSubs.subtitleQualityBudget(start, start + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(27500)));
        assertEquals(0, GMSubs.subtitleQualityBudget(start, start + java.util.concurrent.TimeUnit.SECONDS.toNanos(28)));
    }

    @Test
    public void contentFetchIsBoundedSkipsUnknownHostsAndKeepsFailedCandidates() throws Exception {
        java.lang.reflect.Field field = GMSubs.class.getDeclaredField("http");
        field.setAccessible(true);
        Object previous = field.get(null);
        java.util.concurrent.atomic.AtomicInteger requests = new java.util.concurrent.atomic.AtomicInteger();
        field.set(null, new okhttp3.OkHttpClient.Builder().addInterceptor(chain -> {
            requests.incrementAndGet();
            String path = chain.request().url().encodedPath();
            if (path.contains("failed")) throw new java.net.SocketTimeoutException("synthetic timeout");
            if (path.contains("slow")) {
                // Deterministic interceptor honors cancellation, without making external HTTP calls.
                while (!chain.call().isCanceled()) {
                    try { Thread.sleep(5); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); break; }
                }
                throw new java.io.IOException("cancelled");
            }
            String body = path.contains("bad") ? captions(100, "（呼吸声）") : captions(100, "今天我们一起去公园。");
            int status = path.contains("redirect") ? 302 : 200;
            return new okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
                    .code(status).message("test").header("Location", "https://untrusted.example/never")
                    .body(okhttp3.ResponseBody.create(body, okhttp3.MediaType.get("text/plain"))).build();
        }).build());
        try {
            JSONArray rows = GMSubs.rankSubtitles("TEST-003", new JSONArray()
                    .put(item("TEST-003.srt", "https://subtitle.v.geilijiasu.com/bad.srt", "srt"))
                    .put(item("TEST-003-good.srt", "https://subtitle.v.geilijiasu.com/good.srt", "srt"))
                    .put(item("TEST-003-failed.srt", "https://subtitle.v.geilijiasu.com/failed.srt", "srt"))
                    .put(item("TEST-003-other.srt", "https://unknown.example/a.srt", "srt"))
                    .put(item("TEST-003-redirect.srt", "https://subtitle.v.geilijiasu.com/redirect.srt", "srt")));
            JSONArray ranked = GMSubs.inspectSubtitleContents("TEST-003", rows, System.nanoTime());
            assertEquals(4, requests.get());
            assertEquals(5, ranked.length());
            assertEquals("https://subtitle.v.geilijiasu.com/good.srt", ranked.getJSONObject(0).getString("url"));
            assertTrue(containsUrl(ranked, "https://unknown.example/a.srt"));
            assertTrue(containsUrl(ranked, "https://subtitle.v.geilijiasu.com/failed.srt"));
            JSONArray slow = GMSubs.rankSubtitles("TEST-004", new JSONArray()
                    .put(item("TEST-004.srt", "https://subtitle.v.geilijiasu.com/slow.srt", "srt")));
            long before = System.nanoTime();
            assertEquals(slow.toString(), GMSubs.inspectSubtitleContents("TEST-004", slow, before).toString());
            assertTrue(java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - before) < 2200);
            int count = requests.get();
            assertEquals(rows.toString(), GMSubs.inspectSubtitleContents("TEST-003", rows, System.nanoTime() - java.util.concurrent.TimeUnit.SECONDS.toNanos(29)).toString());
            assertEquals(count, requests.get());
        } finally { field.set(null, previous); }
    }

    @Test
    public void contentFetchCapsTwentyFilesRejectsOversizeAndClosesEveryResponse() throws Exception {
        java.lang.reflect.Field field = GMSubs.class.getDeclaredField("http");
        field.setAccessible(true);
        Object previous = field.get(null);
        java.util.concurrent.atomic.AtomicInteger requests = new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger closed = new java.util.concurrent.atomic.AtomicInteger();
        field.set(null, new okhttp3.OkHttpClient.Builder().addInterceptor(chain -> {
            requests.incrementAndGet();
            return new okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
                    .code(200).message("test").body(new okhttp3.ResponseBody() {
                        @Override public okhttp3.MediaType contentType() { return okhttp3.MediaType.get("text/plain"); }
                        @Override public long contentLength() { return GMSubs.MAX_SUBTITLE_BYTES + 1L; }
                        @Override public okio.BufferedSource source() { throw new AssertionError("Must not read oversized body"); }
                        @Override public void close() { closed.incrementAndGet(); }
                    }).build();
        }).build());
        try {
            JSONArray raw = new JSONArray();
            for (int i = 0; i < 25; i++) raw.put(item("TEST-005-" + i + ".srt", "https://subtitle.v.geilijiasu.com/" + i + ".srt", "srt"));
            JSONArray rows = GMSubs.rankSubtitles("TEST-005", raw);
            assertEquals(rows.toString(), GMSubs.inspectSubtitleContents("TEST-005", rows, System.nanoTime()).toString());
            assertEquals(20, requests.get());
            assertEquals(20, closed.get());
            try { GMSubs.readAll(new ByteArrayInputStream(new byte[GMSubs.MAX_SUBTITLE_BYTES + 1]), GMSubs.MAX_SUBTITLE_BYTES); org.junit.Assert.fail("Chunked oversize body"); }
            catch (java.io.IOException expected) { }
        } finally { field.set(null, previous); }
    }

    @Test
    public void playerContentUsesRankedResultAndCacheWithoutChangingMediaHeadersOrNativeSubs() throws Exception {
        java.lang.reflect.Field field = GMSubs.class.getDeclaredField("http");
        field.setAccessible(true);
        Object previous = field.get(null);
        java.util.concurrent.atomic.AtomicInteger requests = new java.util.concurrent.atomic.AtomicInteger();
        String api = new JSONObject().put("code", 0).put("data", new JSONArray()
                .put(item("TEST-906.srt", "https://subtitle.v.geilijiasu.com/bad.srt", "srt"))
                .put(item("TEST-906-good.srt", "https://subtitle.v.geilijiasu.com/good.srt", "srt"))).toString();
        field.set(null, new okhttp3.OkHttpClient.Builder().addInterceptor(chain -> {
            requests.incrementAndGet();
            String host = chain.request().url().host();
            String body = host.equals("api-shoulei-ssl.xunlei.com") ? api
                    : captions(120, "你好，朋友。").replace("00:00:02,000", chain.request().url().encodedPath().contains("bad") ? "00:00:00,000" : "00:00:02,000");
            return new okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
                    .code(200).message("test").body(okhttp3.ResponseBody.create(body, okhttp3.MediaType.get("text/plain"))).build();
        }).build());
        String media = new JSONObject().put("url", "https://media.example/video.m3u8").put("parse", 0)
                .put("header", new JSONObject().put("User-Agent", "unchanged"))
                .put("subs", new JSONArray().put(item("Native.srt", "https://native.example/sub.srt", "srt"))).toString();
        try {
            GMSubs spider = new GMSubs();
            java.lang.reflect.Field delegate = GMSubs.class.getDeclaredField("gm");
            delegate.setAccessible(true);
            delegate.set(spider, new com.github.catvod.crawler.Spider() {
                @Override public String playerContent(String flag, String id, java.util.List<String> vipFlags) { return media; }
            });
            String result = spider.playerContent("TEST-906", "https://media.example/video.m3u8", java.util.List.of());
            JSONObject play = new JSONObject(result);
            assertEquals("https://media.example/video.m3u8", play.getString("url"));
            assertEquals("unchanged", play.getJSONObject("header").getString("User-Agent"));
            assertEquals(0, play.getInt("parse"));
            assertEquals(3, play.getJSONArray("subs").length());
            assertEquals("https://subtitle.v.geilijiasu.com/good.srt", play.getJSONArray("subs").getJSONObject(0).getString("url"));
            assertTrue(containsUrl(play.getJSONArray("subs"), "https://native.example/sub.srt"));
            assertEquals(3, requests.get());
            assertEquals(result, spider.playerContent("TEST-906", "https://media.example/video.m3u8", java.util.List.of()));
            assertEquals(3, requests.get());
        } finally { field.set(null, previous); }
    }

    @Test
    public void extractsVideoCodeFromTitle() {
        assertEquals("REAL-795", GMSubs.codeFromTitle("REAL-795 A Slow-lip Delivery Service That Uses Incredible Technique"));
        assertEquals("IPX-343", GMSubs.codeFromTitle("IPX-343 「奥はダメ！もうイッてる！！」"));
    }

    @Test
    public void publicLibraryUsesTheSameCodeRulesAsTheBuilder() {
        String[][] samples = {{"IPX343.FHD", "IPX-343"}, {"S2M-016", "S2M-016"},
                {"T28-451", "T28-451"}, {"259LUXU-1196", "259LUXU-1196"},
                {"FC2PPV-1234567", "FC2-PPV-1234567"}, {"FC2-PPV-1234567", "FC2-PPV-1234567"},
                {"HEYZO 1234", "HEYZO-1234"}, {"FHD1080 IPX-343", "IPX-343"},
                {"1080p", ""}, {"UTF-16", ""}, {"082215_01", ""}, {"ABP317C", ""},
                {"REAL-795 IPX-343", "REAL-795"}, {"ABP-317C", "ABP-317"}};
        for (String[] sample : samples) assertEquals(sample[0], sample[1], GMSubs.codeFromTitle(sample[0]));
    }

    @Test
    public void publicLibraryIsOptionalAndConfinesManifestObjectsToTheExactCode() throws Exception {
        String base = "https://subs.example/library/";
        assertEquals(base, GMSubs.libraryFromExtend("{\"subtitleLibrary\":\"https://subs.example/library\"}"));
        for (String config : new String[]{"{}", "not json", "{\"subtitleLibrary\":\"http://subs.example\"}",
                "{\"subtitleLibrary\":\"https://user:secret@subs.example\"}", "{\"subtitleLibrary\":\"https://subs.example?token=x\"}"}) {
            assertEquals("", GMSubs.libraryFromExtend(config));
        }
        assertEquals(base + "index/IP/IPX343.json", GMSubs.libraryIndexUrl(base, "ipx-343"));
        String digest = "a".repeat(64);
        JSONArray rows = new JSONArray()
                .put(libraryRow("IPX343", digest, "srt"))
                .put(libraryRow("IPX343", digest, "srt"))
                .put(libraryRow("IPX343", "b".repeat(64), "ass"))
                .put(libraryRow("IPX344", digest, "srt"))
                .put(new JSONObject().put("name", "escape").put("ext", "srt").put("path", "subs/IP/IPX343/../../escape.srt"))
                .put(new JSONObject().put("name", "remote").put("ext", "srt").put("path", "https://other.example/sub.srt"));
        JSONObject manifest = new JSONObject().put("code", "IPX343").put("subs", rows);
        JSONArray subs = GMSubs.librarySubtitles(base, "IPX-343", manifest);
        assertEquals(2, subs.length());
        assertEquals(base + "subs/IP/IPX343/" + digest + ".srt", subs.getJSONObject(0).getString("url"));
        assertEquals("application/x-subrip", subs.getJSONObject(0).getString("format"));
        assertEquals(1, subs.getJSONObject(0).getInt("flag"));
        assertEquals(2, subs.getJSONObject(1).getInt("flag"));
        assertEquals(0, GMSubs.librarySubtitles(base, "IPX-344", manifest).length());
    }

    @Test
    public void libraryHitsSkipXunleiAndMissesOrFailuresFallbackWithoutMixingCaches() throws Exception {
        JSONArray own = new JSONArray().put(item("Own.srt", "https://subs.example/own.srt", "srt"));
        JSONArray xunlei = new JSONArray().put(item("Other.srt", "https://xunlei.example/other.srt", "srt"));
        int[] requests = {0};
        java.util.concurrent.Callable<JSONArray> fallback = () -> { requests[0]++; return xunlei; };
        assertEquals(own.toString(), GMSubs.libraryFirst(() -> own, fallback).toString());
        assertEquals(0, requests[0]);
        assertEquals(xunlei.toString(), GMSubs.libraryFirst(() -> new JSONArray(), fallback).toString());
        assertEquals(xunlei.toString(), GMSubs.libraryFirst(() -> { throw new java.io.IOException("offline"); }, fallback).toString());
        assertEquals(xunlei.toString(), GMSubs.libraryFirst(null, fallback).toString());
        assertEquals(3, requests[0]);
        long now = System.currentTimeMillis();
        GMSubs.cacheSubtitles("https://subs.example/one/", "LIB-941", own, now);
        GMSubs.cacheSubtitles("", "LIB-941", xunlei, now);
        assertEquals(own.toString(), GMSubs.cachedSubtitles("https://subs.example/one/", "lib941", now).toString());
        assertEquals(xunlei.toString(), GMSubs.cachedSubtitles("LIB-941").toString());
        assertEquals(null, GMSubs.cachedSubtitles("https://subs.example/two/", "LIB-941", now));
        assertEquals(2, GMSubs.mergeSubtitles(own, new JSONArray().put(own.getJSONObject(0)).put(xunlei.getJSONObject(0))).length());
        long start = 4_000_000_000L;
        assertTrue(GMSubs.hasSubtitleLookupBudget(start, start + java.util.concurrent.TimeUnit.SECONDS.toNanos(25), 2));
        assertFalse(GMSubs.hasSubtitleLookupBudget(start, start + java.util.concurrent.TimeUnit.SECONDS.toNanos(26), 2));
    }

    private static JSONObject libraryRow(String key, String digest, String ext) throws Exception {
        return new JSONObject().put("name", key + "." + ext).put("ext", ext)
                .put("path", "subs/" + key.substring(0, 2) + "/" + key + "/" + digest + "." + ext);
    }

    @Test
    public void playerContentFetchesLibraryOrXunleiAndAlwaysKeepsTheMediaResult() throws Exception {
        java.lang.reflect.Field clientField = GMSubs.class.getDeclaredField("http");
        clientField.setAccessible(true);
        Object previous = clientField.get(null);
        java.util.List<String> requests = new java.util.ArrayList<>();
        String ownResponse = new JSONObject().put("code", "LIB952").put("subs", new JSONArray()
                .put(libraryRow("LIB952", "a".repeat(64), "srt"))).toString();
        String fallbackResponse = new JSONObject().put("code", 0).put("data", new JSONArray()
                .put(item("Candidate.srt", "https://xunlei.example/fallback.srt", "srt"))).toString();
        clientField.set(null, new okhttp3.OkHttpClient.Builder().addInterceptor(chain -> {
            String url = chain.request().url().toString();
            requests.add(url);
            boolean library = chain.request().url().host().equals("subs.example");
            if (library && url.endsWith("LIB956.json")) throw new java.net.ConnectException("synthetic connection refused");
            if (library && url.endsWith("LIB957.json")) throw new java.net.SocketTimeoutException("synthetic timeout");
            String body;
            int status = 200;
            if (library && url.endsWith("LIB952.json")) {
                body = ownResponse;
            } else if (library) {
                if (url.endsWith("LIB953.json")) { status = 404; body = ""; }
                else body = "broken JSON";
            } else {
                if (chain.request().url().queryParameter("name").equals("LIB-955")) throw new java.io.IOException("offline");
                body = fallbackResponse;
            }
            return new okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
                    .code(status).message("synthetic").body(okhttp3.ResponseBody.create(body, okhttp3.MediaType.get("application/json"))).build();
        }).build());
        String media = new JSONObject().put("url", "https://media.example/master.m3u8").put("parse", 0)
                .put("header", new JSONObject().put("User-Agent", "media-UA"))
                .put("subs", new JSONArray().put(item("Native.srt", "https://native.example/sub.srt", "srt"))).toString();
        try {
            GMSubs spider = new GMSubs();
            java.lang.reflect.Field delegate = GMSubs.class.getDeclaredField("gm");
            delegate.setAccessible(true);
            delegate.set(spider, new com.github.catvod.crawler.Spider() {
                @Override public String playerContent(String flag, String id, java.util.List<String> vipFlags) { return media; }
            });
            java.lang.reflect.Field libraryField = GMSubs.class.getDeclaredField("subtitleLibrary");
            libraryField.setAccessible(true);
            libraryField.set(spider, "https://subs.example/");
            for (String code : new String[]{"LIB-952", "LIB-953", "LIB-954", "LIB-955", "LIB-956", "LIB-957"}) {
                requests.clear();
                String result = spider.playerContent(code, "https://media.example/master.m3u8", java.util.List.of());
                JSONObject play = new JSONObject(result);
                assertEquals("https://media.example/master.m3u8", play.getString("url"));
                assertEquals("media-UA", play.getJSONObject("header").getString("User-Agent"));
                assertEquals(code.equals("LIB-952") ? 1 : 2, requests.size());
                assertEquals(code.equals("LIB-955") ? 1 : 2, play.getJSONArray("subs").length());
                assertTrue(containsUrl(play.getJSONArray("subs"), "https://native.example/sub.srt"));
                if (!code.equals("LIB-952") && !code.equals("LIB-955")) {
                    assertTrue(containsUrl(play.getJSONArray("subs"), "https://xunlei.example/fallback.srt"));
                }
                if (code.equals("LIB-955")) assertEquals(media, result);
            }
            requests.clear();
            spider.playerContent("LIB-952", "https://media.example/master.m3u8", java.util.List.of());
            assertEquals(0, requests.size());
        } finally {
            clientField.set(null, previous);
        }
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
    public void proxyPreservesMasterVariantsHeadersRelativeUrisAndSeekTags() throws Exception {
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
        headers.put("Referer", "https://rou.video/");
        headers.put("Cookie", "session=tv");
        GMSubs spider = new GMSubs();
        spider.siteKey = "rou";
        String proxyBase = "http://127.0.0.1:9978/proxy";

        String proxiedMaster = spider.rewriteProxyPlaylist(master,
                "https://cdn.example/hls/master.m3u8", proxyBase, headers);
        assertTrue(proxiedMaster.contains("RESOLUTION=854x480\n"));
        assertTrue(proxiedMaster.contains("RESOLUTION=1280x720\n"));
        assertTrue(proxiedMaster.contains("RESOLUTION=1920x1080\n"));
        assertEquals(3, proxiedMaster.lines().filter(line -> !line.startsWith("#")).count());
        assertTrue(proxiedMaster.contains("URI=\"" + proxyBase + "?do=csp&siteKey=rou&type=m3u8"));
        String audioLink = proxiedMaster.substring(proxiedMaster.indexOf("URI=\"") + 5).split("\"", 2)[0];
        assertEquals("https://cdn.example/hls/audio/index.m3u8", HttpUrl.parse(audioLink).queryParameter("url"));
        HttpUrl variant = HttpUrl.parse(proxiedMaster.lines().filter(line -> !line.startsWith("#")).findFirst().orElseThrow());
        assertEquals("https://cdn.example/hls/480.m3u8", variant.queryParameter("url"));
        JSONObject variantHeaders = new JSONObject(variant.queryParameter("h"));
        assertEquals("TV-UA", variantHeaders.getString("User-Agent"));
        assertEquals("https://rou.video/", variantHeaders.getString("Referer"));
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
    public void proxyKeepsEveryAdaptiveQuality() {
        String master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\nlow.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720\nmid.m3u8\n"
                + "#EXT-X-STREAM-INF:BANDWIDTH=3103220,RESOLUTION=1920x1080\nhigh.m3u8\n";
        GMSubs spider = new GMSubs();
        spider.siteKey = "rou";
        String result = spider.rewriteProxyPlaylist(master, "https://rou.video/api/hls/sample", "http://127.0.0.1:9978/proxy", Map.of());
        assertTrue(result.contains("RESOLUTION=640x360"));
        assertTrue(result.contains("RESOLUTION=1280x720"));
        assertTrue(result.contains("RESOLUTION=1920x1080"));
    }

    @Test
    public void rouPlaylistsUseThePngProxyWithoutChangingOtherSites() {
        assertTrue(GMSubs.needsPngProxy("https://rou.video/api/hls/video-id"));
        for (String url : new String[]{null, "https://www.av01.media/master.m3u8",
                "http://rou.video/api/hls/id", "https://user@rou.video/api/hls/id", "https://rou.video.evil.example/api/hls/id"}) {
            assertFalse(GMSubs.needsPngProxy(url));
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
        Map<String, String> headers = GMSubs.headers("{\"User-Agent\":\"UA\",\"Referer\":\"https://rou.video/\",\"origin\":\"https://x\",\"Cookie\":\"a=b\"}");
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
