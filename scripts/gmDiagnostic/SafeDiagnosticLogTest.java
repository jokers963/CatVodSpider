package com.github.catvodspidergm;

public final class SafeDiagnosticLogTest {
    private static int checks;

    private static void equal(String expected, String actual) {
        checks++;
        if (!expected.equals(actual)) throw new AssertionError("Sanitizer check failed: " + checks);
    }

    public static void main(String[] args) {
        equal("event=load host=supjav.com kind=other", SafeDiagnosticLog.format("LOAD_URL_BY_CLIENT",
                "https://private-user:private-password@supjav.com/zh/private-id#private-fragment"));
        equal("event=matched host=cdn.example.com kind=playlist", SafeDiagnosticLog.format("MATCHED_BY_CLIENT",
                "https://cdn.example.com/private-title/master.m3u8?token=private-token&cookie=private-cookie"));
        equal("event=allowed host=cdn.example.com kind=media", SafeDiagnosticLog.format("ALLOWED_BY_CLIENT",
                "https://cdn.example.com/private-id/1.ts?signature=private-signature"));
        equal("event=blocked host=ads.example.com kind=other", SafeDiagnosticLog.format("BLOCKED_BY_CLIENT",
                "https://ads.example.com/private-path?token=private-token"));
        equal("event=result", SafeDiagnosticLog.format("RESULT_BY_CLIENT", "private-json-and-header"));
        equal("event=error", SafeDiagnosticLog.format("ERROR_CLIENT", "private-error-and-cookie"));
        equal("event=container_error", SafeDiagnosticLog.format("WEBVIEW_CONTAINER", "private-stack"));
        equal("", SafeDiagnosticLog.format("private-tag", "private-payload"));
        equal("", SafeDiagnosticLog.format(null, "private-payload"));
        for (String input : new String[]{null, "private-text", "https://host.example/a\nprivate-injection",
                "https://127.0.0.1/private", "https://[::1]/private", "https://router.local/private",
                "https://router.internal/private", "file:///private", "javascript:private"}) {
            equal("event=load host=redacted kind=other", SafeDiagnosticLog.format("LOAD_URL_BY_CLIENT", input));
        }
        SafeDiagnosticLog.d("LOAD_URL_BY_CLIENT", "https://supjav.com/private?cookie=private");
        equal("event=load host=supjav.com kind=other", android.util.Log.lastMessage);
        SafeDiagnosticLog.e("ERROR_CLIENT", "private-message", new Exception("private-exception"));
        equal("event=error", android.util.Log.lastMessage);
        int before = android.util.Log.count;
        SafeDiagnosticLog.i("private-tag", "private-message");
        if (android.util.Log.count != before) throw new AssertionError("Unknown tags must be dropped");
        for (int i = 0; i < 70; i++) {
            SafeDiagnosticLog.i("ALLOWED_BY_CLIENT", "https://host" + i + ".example.com/private");
            SafeDiagnosticLog.i("ALLOWED_BY_CLIENT", "https://host" + i + ".example.com/private");
        }
        if (android.util.Log.count - before != 64) throw new AssertionError("Request log limit/dedup failed");
        SafeDiagnosticLog.i("MATCHED_BY_CLIENT", "https://cdn.example.com/private.m3u8?token=private");
        equal("event=matched host=cdn.example.com kind=playlist", android.util.Log.lastMessage);
        SafeDiagnosticLog.probe("frame", "https://user:private@frame.example.com/private?signature=private");
        equal("event=probe phase=frame host=frame.example.com kind=other", android.util.Log.lastMessage);
        SafeDiagnosticLog.probe("button", "FST");
        equal("event=probe phase=button line=FST", android.util.Log.lastMessage);
        SafeDiagnosticLog.probe("stage", "match_wait");
        equal("event=probe phase=stage stage=match_wait", android.util.Log.lastMessage);
        before = android.util.Log.count;
        SafeDiagnosticLog.probe("private-phase", "private");
        SafeDiagnosticLog.probe("button", "private-title");
        SafeDiagnosticLog.probe("stage", "match_wait\nprivate");
        if (android.util.Log.count != before) throw new AssertionError("Probe allowlist failed");
        if (!SafeDiagnosticLog.fstPlaylist("https://fc2stream.tv/sample/master.m3u8?token=private")) throw new AssertionError("FST probe target rejected");
        for (String url : new String[]{"https://ads.example.com/ad.mp4", "http://fc2stream.tv/a.m3u8", "https://fc2stream.tv.attacker.example/a.m3u8", "https://user@fc2stream.tv/a.m3u8", "private"}) {
            if (SafeDiagnosticLog.fstPlaylist(url)) throw new AssertionError("Unexpected network probe target");
        }
        java.util.Map<String, String> original = java.util.Map.of("referer", "private", "Origin", "private", "User-Agent", "private", "Cookie", "private");
        if (!SafeDiagnosticLog.probeHeaders(original, false).equals(original)) throw new AssertionError("Captured headers changed");
        if (!SafeDiagnosticLog.probeHeaders(original, true).equals(java.util.Map.of("User-Agent", "private", "Cookie", "private"))) throw new AssertionError("Header A/B filter failed");
        if (original.size() != 4) throw new AssertionError("Probe mutated original headers");
        byte[] transport = new byte[377]; transport[0] = transport[188] = transport[376] = 0x47;
        equal("ts", SafeDiagnosticLog.mediaKind(transport));
        equal("other", SafeDiagnosticLog.mediaKind(new byte[0]));
        equal("png", SafeDiagnosticLog.mediaKind(new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0}));
        System.out.println("SafeDiagnosticLog checks passed: " + checks + "; unknown-tag, dedup, limit and matched-after-limit checks passed");
    }
}
