package com.github.catvod.spider;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Offline evidence runner using the exact runtime analyzer. Originals are read-only. */
public final class SubtitleRankingCheck {
    public static void main(String[] args) throws Exception {
        if (args.length != 4) throw new IllegalArgumentException("code api-json originals-dir report-json");
        JSONArray data = new JSONObject(Files.readString(Path.of(args[1]))).getJSONArray("data");
        JSONArray original = GMSubs.rankSubtitles(args[0], data);
        Map<String, GMSubs.SubtitleQuality> evidence = new LinkedHashMap<>();
        JSONArray details = new JSONArray();
        long cueEvidenceBytes = 0;
        for (int i = 0; i < data.length(); i++) {
            JSONObject row = data.getJSONObject(i);
            String url = row.getString("url");
            Path file = Path.of(args[2], url.substring(url.lastIndexOf('/') + 1));
            JSONObject detail = new JSONObject().put("apiOrder", i + 1).put("url", url);
            try {
                long started = System.nanoTime();
                GMSubs.SubtitleQuality q = GMSubs.analyzeSubtitle(Files.readAllBytes(file));
                cueEvidenceBytes += q.cueData.length * 8L;
                evidence.put(url, q);
                detail.put("cues", q.cues).put("invalid", q.invalid).put("empty", q.empty)
                        .put("noise", q.noise).put("dialogue", q.dialogue).put("isolatedLatin", q.isolatedLatin)
                        .put("loopedAnnotation", q.loopedAnnotation).put("score", q.score())
                        .put("fingerprint", q.fingerprint).put("bodyFingerprint", q.bodyFingerprint)
                        .put("analysisMillis", (System.nanoTime() - started) / 1000000.0);
            } catch (Exception uncertain) { detail.put("ungraded", uncertain.getMessage()); }
            details.put(detail);
        }
        // Reuse the private runtime score (including filename mismatch), rather than duplicating its rules offline.
        java.lang.reflect.Method scoring = GMSubs.class.getDeclaredMethod("subtitleContentScore", String.class, JSONObject.class, Map.class);
        scoring.setAccessible(true);
        for (int i = 0; i < data.length(); i++)
            details.getJSONObject(i).put("contentScore", scoring.invoke(null, args[0], data.getJSONObject(i), evidence));
        long rankingStarted = System.nanoTime();
        JSONArray ranked = GMSubs.rankSubtitleContents(args[0], original, evidence);
        JSONObject report = new JSONObject().put("code", args[0]).put("before", original.length())
                .put("after", ranked.length()).put("analyzed", evidence.size()).put("ranked", ranked).put("details", details)
                .put("rankingMillis", (System.nanoTime() - rankingStarted) / 1000000.0).put("cueEvidenceBytes", cueEvidenceBytes);
        Files.writeString(Path.of(args[3]), report.toString(2));
        String first = ranked.length() == 0 ? "none" : ranked.getJSONObject(0).getString("url");
        GMSubs.SubtitleQuality q = evidence.get(first);
        System.out.println(args[0] + ": " + original.length() + " -> " + ranked.length()
                + ", first cues=" + (q == null ? "unknown" : q.cues) + ", first invalid=" + (q == null ? "unknown" : q.invalid));
    }
}
