"""Build public UTF-8 subtitles and per-code JSON; auto legacy detection uses charset-normalizer."""

import argparse
import codecs
import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path


# Keep these rules aligned with GMSubs.codeFromTitle; never match bare date/sequence IDs.
FC2 = re.compile(r"(?i)(?<![a-z0-9])fc2[-_ ]?(?:ppv[-_ ]?)?(\d{5,8})(?!\d)")
CODE = re.compile(r"(?i)(?<![a-z0-9])([a-z]{2,8}|s2m(?:bd)?|t28|\d{2,4}[a-z]{2,8})[-_.]?(\d{2,6})(?![a-z0-9])")
SEPARATED_CODE = re.compile(r"(?i)(?<![a-z0-9])([a-z]{2,8}|s2m(?:bd)?|t28|\d{2,4}[a-z]{2,8})[-_.](\d{2,6})(?!\d)")
HEYZO = re.compile(r"(?i)(?<![a-z0-9])(heyzo)[-_ .]*(\d{2,6})(?!\d)")
NON_CODES = {"FHD", "UHD", "FULLHD", "HEVC", "XVID", "UTF", "GBK", "GB", "WEB", "MP"}
SUPPORTED = {".srt", ".ass", ".ssa", ".vtt"}
TIMING = re.compile(r"\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}")


def code_from_title(title):
    matches = []
    for pattern in (FC2, SEPARATED_CODE, HEYZO, CODE):
        for match in pattern.finditer(title):
            if pattern is FC2:
                code = "FC2-PPV-" + match[1]
            else:
                if match[1].upper() in NON_CODES:
                    continue
                code = match[1].upper() + "-" + match[2]
            matches.append((match.start(), code))
    return min(matches, key=lambda row: row[0])[1] if matches else ""


def code_key(code):
    return re.sub(r"[^A-Z0-9]", "", code.upper())


def decode_subtitle(raw, legacy_encoding):
    if raw.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return raw.decode("utf-16"), "utf-16"
    if raw.startswith(codecs.BOM_UTF8):
        return raw.decode("utf-8-sig"), "utf-8-sig"
    sample = raw[:512]
    if len(raw) % 2 == 0 and sample.count(b"\x00") > len(sample) // 10:
        encoding = "utf-16-le" if sample[1::2].count(b"\x00") > sample[::2].count(b"\x00") else "utf-16-be"
        return raw.decode(encoding), encoding + " (inferred)"
    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        if legacy_encoding == "auto":
            try:
                from charset_normalizer import from_bytes
            except ImportError as error:
                raise ValueError("Auto legacy detection requires charset-normalizer") from error
            match = from_bytes(raw, cp_isolation=["gb18030", "big5"]).best()
            if match is None or match.percent_chaos > 10 or match.percent_coherence < 10:
                raise ValueError("Ambiguous legacy encoding; review manually")
            return raw.decode(match.encoding), match.encoding + " (detected)"
        # Explicit encodings remain available for known single-encoding packs.
        return raw.decode(legacy_encoding), legacy_encoding + " (assumed)"


def actual_extension(text, original):
    lowered = text.lower()
    if text.lstrip().startswith("WEBVTT") and "-->" in text:
        return "vtt"
    if "[events]" in lowered and re.search(r"(?im)^dialogue\s*:", text):
        return "ssa" if "[v4 styles]" in lowered else "ass"
    if TIMING.search(text):
        return "srt"
    return ""


def quality(name):
    if re.search(r"精校|校对|修正|修订|人工|官方", name):
        return 0
    return 2 if re.search(r"机翻|机器|自动|(?i:\bai\b)", name) else 1


def language(name):
    if re.search(r"简体|(?i:\bchs\b|zh[-_.]?(?:cn|hans))", name):
        return "zh-Hans"
    if re.search(r"繁体|繁體|(?i:\bcht\b|zh[-_.]?(?:tw|hant))", name):
        return "zh-Hant"
    return ""


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def filesystem_path(path):
    value = str(path.resolve())
    if os.name == "nt" and not value.startswith("\\\\?\\"):
        value = "\\\\?\\UNC\\" + value[2:] if value.startswith("\\\\") else "\\\\?\\" + value
    return Path(value)


def build(source, output, legacy_encoding="auto"):
    source, output = source.resolve(), output.resolve()
    if not source.is_dir():
        raise ValueError("Source must be an existing directory")
    if source == output or source in output.parents or output in source.parents:
        raise ValueError("Output and source directories must be separate")
    if output.exists():
        raise ValueError("Use a new output directory; existing files will not be overwritten")
    if legacy_encoding != "auto":
        codecs.lookup(legacy_encoding)
    else:
        try:
            import charset_normalizer  # Fail before generation if the selected Python lacks it.
        except ImportError as error:
            raise ValueError("Use a Python with charset-normalizer, or supply a known --legacy-encoding") from error
    source, output = filesystem_path(source), filesystem_path(output)
    public = output / "public"
    reports = output / "reports"
    public.mkdir(parents=True)
    reports.mkdir()
    groups = defaultdict(dict)
    counts, encodings = Counter(), Counter()
    issues, sources, legacy = [], [], []
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        counts["files"] += 1
        relative = path.relative_to(source).as_posix()
        if path.suffix.lower() not in SUPPORTED:
            counts["archives" if path.suffix.lower() in {".zip", ".rar", ".7z"} else "other"] += 1
            continue
        counts["supported"] += 1
        code = code_from_title(path.stem)
        if not code:
            counts["unmatched"] += 1
            issues.append({"source": relative, "reason": "unmatched code"})
            continue
        try:
            if path.stat().st_size > 16 * 1024 * 1024:
                raise ValueError("Subtitle exceeds 16 MiB")
            raw = path.read_bytes()
            text, encoding = decode_subtitle(raw, legacy_encoding)
            text = text.lstrip("\ufeff").rstrip("\x00").replace("\r\n", "\n").replace("\r", "\n")
            if "\x00" in text or "\ufffd" in text:
                raise ValueError("NUL or replacement characters; review encoding")
            ext = actual_extension(text, path.suffix[1:].lower())
            if not ext:
                raise ValueError("No supported subtitle cues")
        except (OSError, UnicodeError, ValueError) as error:
            counts["rejected"] += 1
            issues.append({"source": relative, "reason": str(error)})
            continue
        encoded = text.encode("utf-8")
        digest = hashlib.sha256(encoded).hexdigest()
        key = code_key(code)
        object_path = f"subs/{key[:2]}/{key}/{digest}.{ext}"
        row = {"path": object_path, "ext": ext, "lang": language(path.stem), "_quality": quality(path.stem)}
        duplicate_key = (digest, ext)
        if duplicate_key in groups[key]:
            counts["duplicates"] += 1
            prior = groups[key][duplicate_key]
            prior["_quality"] = min(prior["_quality"], row["_quality"])
            if not prior["lang"]:
                prior["lang"] = row["lang"]
        else:
            target = public / object_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(encoded)
            groups[key][duplicate_key] = row
            counts["objects"] += 1
            counts["object_bytes"] += len(encoded)
        counts["accepted_files"] += 1
        encodings[encoding] += 1
        if ext != path.suffix[1:].lower():
            counts["corrected_extensions"] += 1
        if encoding.endswith(("(assumed)", "(detected)", "(inferred)")):
            legacy.append({"source": relative, "encoding": encoding, "object": object_path})
        sources.append({"source": relative, "source_sha256": hashlib.sha256(raw).hexdigest(),
                        "object": object_path, "encoding": encoding})
    for key, candidates in sorted(groups.items()):
        rows = sorted(candidates.values(), key=lambda row: (row["_quality"], row["ext"] != "srt", row["path"]))
        for index, row in enumerate(rows):
            row.pop("_quality")
            row["name"] = f"{key} · {row['ext'].upper()} · {index + 1:02d}"
            if not row["lang"]:
                row.pop("lang")
        write_json(public / f"index/{key[:2]}/{key}.json", {"code": key, "subs": rows})
    counts["codes"] = len(groups)
    counts["max_candidates"] = max((len(rows) for rows in groups.values()), default=0)
    counts["public_bytes"] = sum(path.stat().st_size for path in public.rglob("*") if path.is_file())
    summary = {"counts": dict(sorted(counts.items())), "encodings": dict(encodings),
               "legacy_encoding": legacy_encoding, "legacy_audit_files": len(legacy),
               "legacy_review_required": sum(row["encoding"].endswith("(assumed)") for row in legacy),
               "layout": "public/index/AA/CODE.json + public/subs/AA/CODE/SHA256.ext"}
    write_json(reports / "summary.json", summary)
    write_json(reports / "issues.json", issues)
    write_json(reports / "legacy-encoding-review.json", legacy)
    write_json(reports / "sources.json", sources)
    return summary


def verify(source, output):
    source, output = filesystem_path(source), filesystem_path(output)
    reports, public = output / "reports", output / "public"
    sources = json.loads((reports / "sources.json").read_text(encoding="utf-8"))
    issues = json.loads((reports / "issues.json").read_text(encoding="utf-8"))
    summary = json.loads((reports / "summary.json").read_text(encoding="utf-8"))
    accounted = {row["source"] for row in sources + issues}
    actual = {path.relative_to(source).as_posix() for path in source.rglob("*")
              if path.is_file() and path.suffix.lower() in SUPPORTED}
    if actual != accounted:
        raise ValueError("Source scan mismatch: some supported files are missing or have changed")
    for row in sources:
        if hashlib.sha256((source / row["source"]).read_bytes()).hexdigest() != row["source_sha256"]:
            raise ValueError("An original subtitle changed after generation")
    objects = set()
    indexes = list((public / "index").rglob("*.json"))
    for index in indexes:
        data = json.loads(index.read_text(encoding="utf-8"))
        key = data["code"]
        if index.relative_to(public).as_posix() != f"index/{key[:2]}/{key}.json":
            raise ValueError("Index path/code mismatch")
        if not 0 < len(data["subs"]) <= 100:
            raise ValueError("Empty or oversized manifest")
        for row in data["subs"]:
            relative = row["path"]
            if not re.fullmatch(r"subs/" + key[:2] + "/" + key + r"/[a-f0-9]{64}\.(srt|ass|ssa|vtt)", relative):
                raise ValueError("Invalid subtitle object path")
            payload = (public / relative).read_bytes()
            text = payload.decode("utf-8")
            if hashlib.sha256(payload).hexdigest() != Path(relative).stem or actual_extension(text, row["ext"]) != row["ext"]:
                raise ValueError("Subtitle hash or format mismatch")
            objects.add(relative)
    stored = {path.relative_to(public).as_posix() for path in (public / "subs").rglob("*") if path.is_file()}
    if objects != stored or len(objects) != summary["counts"]["objects"] or len(indexes) != summary["counts"]["codes"]:
        raise ValueError("Output inventory mismatch")
    result = {"verified_source_hashes": len(sources), "accounted_supported_files": len(actual),
              "verified_objects": len(objects), "verified_indexes": len(indexes),
              "legacy_review_required": summary["legacy_review_required"]}
    write_json(reports / "verification.json", result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New output directory outside the source")
    parser.add_argument("--legacy-encoding", default="auto", help="auto detects GB18030/Big5; explicit fallback is reported for review")
    parser.add_argument("--verify", action="store_true", help="Verify an existing output and original source hashes")
    args = parser.parse_args()
    try:
        summary = verify(args.source, args.output) if args.verify else build(args.source, args.output, args.legacy_encoding)
    except (OSError, ValueError, LookupError) as error:
        parser.exit(1, f"Error: {error}\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
