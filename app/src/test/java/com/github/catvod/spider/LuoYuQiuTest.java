package com.github.catvod.spider;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class LuoYuQiuTest {

    @Test
    public void parsePublicCardAndEpisodes() {
        Document doc = Jsoup.parse("""
                <div class='item'>
                  <a href='/detail/5514.html'><img data-original='/cover.jpg'></a>
                  <h3>凡人修仙传</h3>
                  <a href='/w/5514-1-1.html'>第1集</a>
                </div>
                """);
        LuoYuQiu spider = new LuoYuQiu();
        assertEquals(1, spider.parseVods(doc).size());
        assertEquals(1, spider.parseEpisodes(doc).size());
        assertTrue(spider.parseEpisodes(doc).get(0).contains("$https://libvio.host/w/5514-1-1.html"));
    }
}
