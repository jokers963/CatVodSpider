package com.github.catvod.spider;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class GMSubsTest {

    @Test
    public void searchesOnlyExactVideoCode() {
        String code = GMSubs.codeFromTitle("REAL-795 A Slow-lip Delivery Service That Uses Incredible Technique");
        assertEquals("REAL-795", code);
        assertTrue(GMSubs.codeInSubtitle(code).matcher("real_795.zh.srt").find());
        assertFalse(GMSubs.codeInSubtitle(code).matcher("Re Zero SP45.ass").find());
        assertFalse(GMSubs.codeInSubtitle(code).matcher("REAL-7950.srt").find());
    }

    @Test
    public void stripsGmDataUrlPrefixBeforeReadingTheTitle() {
        assertEquals("eyJuYW1lIjoiSVBYLTM0MyJ9", GMSubs.playIdPayload("data:text/plain;base64,eyJuYW1lIjoiSVBYLTM0MyJ9"));
        assertEquals("eyJuYW1lIjoiUkVBTC03OTUifQ==", GMSubs.playIdPayload("eyJuYW1lIjoiUkVBTC03OTUifQ=="));
    }
}
