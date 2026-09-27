param(
    [string] $Jar = (Join-Path $PSScriptRoot "custom_spider.jar"),
    [string] $BaseJar,
    [switch] $AllowBundledRuntime
)

$ErrorActionPreference = "Stop"

function Fail([string] $Message) {
    Write-Host "FAIL $Message"
    exit 1
}

function StartsWithAny([string] $Value, [string[]] $Prefixes) {
    foreach ($prefix in $Prefixes) {
        if ($Value.StartsWith($prefix, [StringComparison]::Ordinal)) {
            return $true
        }
    }
    return $false
}

$apktool = Join-Path $PSScriptRoot "3rd\apktool_2.11.0.jar"
if (-not (Test-Path -LiteralPath $Jar)) { Fail "missing jar: $Jar" }
if (-not (Test-Path -LiteralPath $apktool)) { Fail "missing apktool: $apktool" }

$Jar = (Resolve-Path -LiteralPath $Jar).Path
$BaseJarPath = $null
if ($BaseJar) {
    if (-not (Test-Path -LiteralPath $BaseJar)) { Fail "missing base jar: $BaseJar" }
    $BaseJarPath = (Resolve-Path -LiteralPath $BaseJar).Path
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    function Get-ZipEntryHash([string] $Path, [string] $EntryName) {
        $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
        try {
            $entry = $archive.GetEntry($EntryName)
            if (-not $entry) { return $null }
            $stream = $entry.Open()
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
            finally { $sha.Dispose(); $stream.Dispose() }
        } finally { $archive.Dispose() }
    }
    $baseDexHash = Get-ZipEntryHash $BaseJarPath 'classes.dex'
    $candidateDexHash = Get-ZipEntryHash $Jar 'classes.dex'
    if (-not $baseDexHash -or $baseDexHash -ne $candidateDexHash) { Fail "base classes.dex changed or is missing from candidate" }
    if (-not (Get-ZipEntryHash $Jar 'classes2.dex')) { Fail "missing classes2.dex: $Jar" }
}
$size = (Get-Item -LiteralPath $Jar).Length

$md5Path = "$Jar.md5"
if (-not (Test-Path -LiteralPath $md5Path)) { Fail "missing md5: $md5Path" }
$md5 = [System.Security.Cryptography.MD5]::Create()
try {
    $actualMd5 = [BitConverter]::ToString($md5.ComputeHash([IO.File]::ReadAllBytes($Jar))).Replace('-', '').ToLowerInvariant()
} finally {
    $md5.Dispose()
}
$expectedMd5 = (Get-Content -Raw -LiteralPath $md5Path).Trim().ToLowerInvariant()
if ($actualMd5 -ne $expectedMd5) { Fail "md5 mismatch: $actualMd5 != $expectedMd5" }

$work = Join-Path ([IO.Path]::GetTempPath()) ("catvod-checkJar-" + [Guid]::NewGuid().ToString("N"))
try {
    & java -jar $apktool d -f $Jar -o $work | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "apktool decode failed" }

    $smaliDirs = @(Get-ChildItem -Directory -LiteralPath $work | Where-Object { $_.Name -match '^smali(?:_classes\d+)?$' } | ForEach-Object FullName)
    if (-not $smaliDirs) { Fail "missing smali output" }

    if (-not $AllowBundledRuntime) {
        foreach ($smali in $smaliDirs) {
            foreach ($path in @("androidx", "kotlin", "javax\xml\namespace", "org\slf4j", "org\xmlpull\v1")) {
                if (Test-Path -LiteralPath (Join-Path $smali $path)) { Fail "unexpected packaged API: $path" }
            }
        }

        $catvodDirs = @($smaliDirs | ForEach-Object { Join-Path $_ "com\github\catvod" } | Where-Object { Test-Path -LiteralPath $_ })
        if (-not $catvodDirs) { Fail "missing catvod package" }
        $unexpected = @($catvodDirs | ForEach-Object { Get-ChildItem -Force -LiteralPath $_ } | Where-Object {
            $_.Name -notin @("js", "spider")
        })
        if ($unexpected) { Fail ("unexpected catvod entries: " + (($unexpected.Name | Sort-Object) -join ", ")) }
    }

    $defs = [Collections.Generic.HashSet[string]]::new()
    $refs = [Collections.Generic.HashSet[string]]::new()
    $classPattern = '(?m)^\.class[ \t]+(?:[^ \t\r\n]+[ \t]+)*L([^;\r\n]+);'
    $typePattern = '(?<![A-Za-z0-9_$])L([A-Za-z_$][A-Za-z0-9_$]*(?:/[A-Za-z_$][A-Za-z0-9_$]*)+(?:\$[A-Za-z0-9_$]+)?);'
    $forbiddenText = [ordered]@{
        "Lcom/google/gson/reflect/TypeToken;-><init>()V" = "illegal Gson TypeToken constructor call; use TypeToken.getParameterized"
    }
    $newSmaliDirs = @($smaliDirs | Where-Object { (Split-Path -Leaf $_) -match '^smali_classes\d+$' })
    if ($AllowBundledRuntime -and -not $newSmaliDirs) { Fail "missing secondary dex output" }

    foreach ($file in Get-ChildItem -Recurse -Filter "*.smali" -LiteralPath $smaliDirs) {
        $text = Get-Content -Raw -LiteralPath $file.FullName
        foreach ($pattern in $forbiddenText.Keys) {
            if ($text.Contains($pattern)) {
                Fail "$($forbiddenText[$pattern]): $($file.FullName)"
            }
        }
        foreach ($match in [regex]::Matches($text, $classPattern)) { [void] $defs.Add($match.Groups[1].Value) }
        foreach ($match in [regex]::Matches($text, $typePattern)) { [void] $refs.Add($match.Groups[1].Value) }
    }

    if ($AllowBundledRuntime) {
        $newDefs = [Collections.Generic.HashSet[string]]::new()
        $refs = [Collections.Generic.HashSet[string]]::new()
        foreach ($file in Get-ChildItem -Recurse -Filter "*.smali" -LiteralPath $newSmaliDirs) {
            $text = Get-Content -Raw -LiteralPath $file.FullName
            foreach ($match in [regex]::Matches($text, $classPattern)) { [void] $newDefs.Add($match.Groups[1].Value) }
            foreach ($match in [regex]::Matches($text, $typePattern)) { [void] $refs.Add($match.Groups[1].Value) }
        }
        foreach ($descriptor in @('com/github/catvod/spider/GMSubs', 'com/github/catvod/spider/GMSubs$1', 'com/github/catvod/spider/GMSubs$SubtitleCacheEntry')) {
            if (-not $newDefs.Contains($descriptor)) { Fail "secondary dex missing class definition: $descriptor" }
        }
    }

    $allowed = @(
        "android/",
        "androidx/annotation/",
        "androidx/startup/",
        "androidx/tracing/",
        "com/github/catvod/crawler/",
        "com/google/gson/",
        "com/hierynomus/",
        "com/thegrizzlylabs/sardineandroid/",
        "com/whl/quickjs/",
        "dalvik/",
        "j$/",
        "java/",
        "javax/crypto/",
        "javax/net/",
        "javax/security/",
        "javax/xml/namespace/",
        "okhttp3/",
        "okio/",
        "org/json/",
        "org/slf4j/",
        "org/w3c/dom/",
        "org/xml/sax/",
        "org/xmlpull/v1/",
        "kotlin/"
    )
    if ($AllowBundledRuntime) {
        $allowed += @("androidx/", "com/fongmi/android/tv/", "com/github/catvod/", "com/orhanobut/logger/", "kotlinx/")
    }
    # jsoup can reference re2j as an optional regex backend; the jar does not require it.
    $optional = @("com/google/re2j/")
    $missing = foreach ($ref in $refs) {
        if (-not $defs.Contains($ref) -and -not (StartsWithAny $ref $allowed) -and -not (StartsWithAny $ref $optional)) {
            $ref
        }
    }
    if ($missing) { Fail ("missing refs: " + (($missing | Sort-Object -Unique | Select-Object -First 20) -join ", ")) }

    $optionalRefs = foreach ($ref in $refs) {
        if (-not $defs.Contains($ref) -and (StartsWithAny $ref $optional)) {
            $ref
        }
    }
    if ($optionalRefs) {
        Write-Host ("WARN optional refs (jsoup optional regex backend): " + (($optionalRefs | Sort-Object -Unique) -join ", "))
    }

    Write-Host "OK $([IO.Path]::GetFileName($Jar)) $size bytes $actualMd5"
    if ($BaseJarPath) { Write-Host "OK base classes.dex preserved $baseDexHash" }
} finally {
    if (Test-Path -LiteralPath $work) {
        Remove-Item -LiteralPath $work -Recurse -Force
    }
}
