"""Run with: python -m unittest discover -s scripts/subtitles -v"""

import codecs
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from build_library import build, code_from_title, decode_subtitle, verify


class SubtitleLibraryTest(unittest.TestCase):
    def test_codes_and_safe_utf8_build(self):
        examples = {
            "IPX-343 sample": "IPX-343", "IPX343.FHD": "IPX-343",
            "S2M-016": "S2M-016", "T28-451": "T28-451", "259LUXU-1196": "259LUXU-1196",
            "FC2PPV-1234567": "FC2-PPV-1234567", "FC2-PPV-1234567": "FC2-PPV-1234567",
            "HEYZO 1234": "HEYZO-1234", "FHD1080 IPX-343": "IPX-343",
            "1080p": "", "UTF-16": "", "082215_01": "", "ABP317C": "",
            "REAL-795 IPX-343": "REAL-795", "ABP-317C": "ABP-317",
        }
        for title, expected in examples.items():
            self.assertEqual(expected, code_from_title(title), title)
        srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\n字幕示例\r\n"
        for encoding in ("utf-16-le", "utf-16-be"):
            self.assertEqual(srt, decode_subtitle(srt.encode(encoding), "gb18030")[0])
        if importlib.util.find_spec("charset_normalizer"):
            traditional = "字幕測試：這是我的字幕，你可以正常看到這些文字。" * 30
            for encoding in ("gb18030", "big5"):
                self.assertEqual(traditional, decode_subtitle(traditional.encode(encoding), "auto")[0])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            fixtures = {
                "IPX-343.chs.srt": srt.encode("utf-8"),
                "IPX343.精校.ass": codecs.BOM_UTF8 + srt.encode("utf-8"),
                "REAL-795.srt": srt.encode("utf-16"),
                "ABP-123.cht.srt": srt.encode("gb18030"),
                "ABP-124.ass": b"[Script Info]\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Example\n",
                "ABP-125.vtt": b"WEBVTT\n\n00:01.000 --> 00:02.000\nExample\n",
                "ABP-126.srt": b"html instead of subtitles",
                "ABP-127.srt": b"1\n00:00:01,000 --> 00:00:02,000\n\x00broken",
                "082215_01.srt": srt.encode("utf-8"),
                "untouched.zip": b"not extracted",
            }
            for name, data in fixtures.items():
                (source / name).write_bytes(data)
            original = {name: hashlib.sha256(data).hexdigest() for name, data in fixtures.items()}
            output = root / "output"
            summary = build(source, output, "gb18030")
            self.assertEqual(5, summary["counts"]["objects"])
            self.assertEqual(1, summary["counts"]["duplicates"])
            self.assertEqual(1, summary["counts"]["unmatched"])
            self.assertEqual(2, summary["counts"]["rejected"])
            self.assertEqual(1, summary["legacy_review_required"])
            self.assertEqual(5, verify(source, output)["verified_objects"])
            for name, digest in original.items():
                self.assertEqual(digest, hashlib.sha256((source / name).read_bytes()).hexdigest())
            manifest = json.loads((output / "public/index/IP/IPX343.json").read_text(encoding="utf-8"))
            self.assertEqual(1, len(manifest["subs"]))
            self.assertEqual("srt", manifest["subs"][0]["ext"])
            self.assertEqual("zh-Hans", manifest["subs"][0]["lang"])
            self.assertNotIn("source", manifest["subs"][0])
            for index in (output / "public/index").rglob("*.json"):
                data = json.loads(index.read_text(encoding="utf-8"))
                self.assertEqual(index.stem, data["code"])
                for row in data["subs"]:
                    payload = (output / "public" / row["path"]).read_bytes()
                    payload.decode("utf-8")
                    self.assertEqual(Path(row["path"]).stem, hashlib.sha256(payload).hexdigest())
            with self.assertRaises(ValueError):
                build(source, output, "gb18030")
            with self.assertRaises(ValueError):
                build(source, source / "nested-output", "gb18030")
            (source / "ABP-123.cht.srt").write_bytes(b"changed")
            with self.assertRaises(ValueError):
                verify(source, output)


if __name__ == "__main__":
    unittest.main()
