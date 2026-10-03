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
        for (int i = 0; i < data.length(); i++) {
            JSONObject row = data.getJSONObject(i);
            String url = row.getString("url");
            Path file = Path.of(args[2], url.substring(url.lastIndexOf('/') + 1));
            JSONObject detail = new JSONObject().put("apiOrder", i + 1).put("url", url);
            try {
                GMSubs.SubtitleQuality q = GMSubs.analyzeSubtitle(Files.readAllBytes(file));
                evidence.put(url, q);
                detail.put("cues", q.cues).put("invalid", q.invalid).put("empty", q.empty)
                        .put("noise", q.noise).put("dialogue", q.dialogue).put("score", q.score())
                        .put("fingerprint", q.fingerprint);
            } catch (Exception uncertain) { detail.put("ungraded", uncertain.getMessage()); }
            details.put(detail);
        }
        JSONArray ranked = GMSubs.rankSubtitleContents(args[0], original, evidence);
        JSONObject report = new JSONObject().put("code", args[0]).put("before", original.length())
                .put("after", ranked.length()).put("analyzed", evidence.size()).put("ranked", ranked).put("details", details);
        Files.writeString(Path.of(args[3]), report.toString(2));
        String first = ranked.length() == 0 ? "none" : ranked.getJSONObject(0).getString("url");
        GMSubs.SubtitleQuality q = evidence.get(first);
        System.out.println(args[0] + ": " + original.length() + " -> " + ranked.length()
                + ", first cues=" + (q == null ? "unknown" : q.cues) + ", first invalid=" + (q == null ? "unknown" : q.invalid));
    }
}
