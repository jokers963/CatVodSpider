param(
    [Parameter(Mandatory = $true)][string]$OutputDir,
    [string]$JdkBin = 'E:\DevTools\Gradle.gradle\jdks\jetbrains_s_r_o_-21-amd64-windows.2\bin',
    [string]$Sdk = 'E:\DevTools\Android\sdk',
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$base = Join-Path $root 'jar\gm_subs.jar'
$apktool = Join-Path $root 'jar\3rd\apktool_2.11.0.jar'
$android = Join-Path $Sdk 'platforms\android-37.0\android.jar'
$d8 = Join-Path $Sdk 'build-tools\36.0.0\d8.bat'
$baseHash = '907BD6C189C2DF4C24F0434EE8B6BC151EC02B15E37912666764350ADCAC9104'
foreach ($required in @($base, $apktool, $android, $d8, "$JdkBin\java.exe", "$JdkBin\javac.exe")) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing prerequisite: $required" }
}
if ((Get-FileHash -LiteralPath $base).Hash -ne $baseHash) { throw 'Input must be the reviewed published v34 JAR' }
$work = [IO.Path]::GetFullPath($OutputDir)
if (Test-Path -LiteralPath $work) {
    if (Get-ChildItem -LiteralPath $work -Force | Select-Object -First 1) { throw 'OutputDir must be new or empty' }
} else { New-Item -ItemType Directory -Path $work | Out-Null }
$decoded = Join-Path $work 'decoded'
$verified = Join-Path $work 'verified'
$classes = Join-Path $work 'classes'
$dex = Join-Path $work 'helper-dex'
New-Item -ItemType Directory -Path $classes, $dex | Out-Null
& "$JdkBin\java.exe" -jar $apktool d $base -o $decoded
if ($LASTEXITCODE) { throw 'APKtool decode failed' }
$smali = Join-Path $decoded 'smali'
$sourceFiles = @(Get-ChildItem -LiteralPath $smali -Recurse -Filter '*.smali')
$originalDefinitions = @($sourceFiles | ForEach-Object {
    [regex]::Match([IO.File]::ReadAllText($_.FullName), '(?m)^\.class[^\r\n]+').Value
} | Sort-Object)
$modified = 0
$logPattern = 'Landroid/util/Log;->(?:d|e|i|v|w|wtf)\('
foreach ($file in $sourceFiles) {
    $before = [IO.File]::ReadAllText($file.FullName)
    $after = [regex]::Replace($before, $logPattern, {
        param($match) $match.Value.Replace('Landroid/util/Log;', 'Lcom/github/catvodspidergm/SafeDiagnosticLog;')
    })
    $after = [regex]::Replace($after,
        'invoke-virtual(?<range>/range)?(?<regs>\s+\{[^}\r\n]+\}), Ljava/lang/(?:Exception|Throwable);->printStackTrace\(\)V',
        'invoke-static${range}${regs}, Lcom/github/catvodspidergm/SafeDiagnosticLog;->stack(Ljava/lang/Throwable;)V')
    if ($file.FullName -eq (Join-Path $smali 'com\github\catvodspidergm\SentryLog.smali')) {
        foreach ($method in @('captureEvent\(Ljava/lang/String;Ljava/lang/String;\)V',
                'lambda\$captureEvent\$0\(Lio/sentry/SentryOptions;\)V')) {
            $pattern = '(?ms)(^\.method[^\r\n]* ' + $method + '\r?\n).*?^\.end method'
            if ([regex]::Matches($after, $pattern).Count -ne 1) { throw 'Telemetry method precondition changed' }
            $after = [regex]::Replace($after, $pattern, '${1}    .locals 0' + "`n    return-void`n.end method")
        }
    }
    if (-not $Quiet -and $file.FullName -eq (Join-Path $smali 'com\github\catvodspidergm\WebViewFactory.smali')) {
        if ($after -match '\.method public Diagnostic\(') { throw 'Diagnostic bridge already exists' }
        $after += @'

.method public Diagnostic(Ljava/lang/String;Ljava/lang/String;)V
    .locals 0
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    invoke-static {p1, p2}, Lcom/github/catvodspidergm/SafeDiagnosticLog;->probe(Ljava/lang/String;Ljava/lang/String;)V
    return-void
.end method
'@
    }
    if (-not $Quiet -and $file.FullName -eq (Join-Path $smali 'com\github\catvodspidergm\webmonkey\WebViewClientGmHook.smali')) {
        $call = 'invoke-virtual {p0, p1}, Lcom/github/catvodspidergm/webmonkey/WebViewClientGmHook;->SetSpiderResult(Landroid/webkit/WebResourceRequest;)V'
        if ([regex]::Matches($after, [regex]::Escape($call)).Count -ne 1) { throw 'Matched-request call precondition changed' }
        $after = $after.Replace($call, 'invoke-static {p1}, Lcom/github/catvodspidergm/SafeDiagnosticLog;->inspect(Landroid/webkit/WebResourceRequest;)V' + "`n    " + $call)
    }
    if ($before -ne $after) {
        # Mechanical rewrite of generated smali only; no checkout runtime files are overwritten.
        [IO.File]::WriteAllText($file.FullName, $after, [Text.UTF8Encoding]::new($false))
        $modified++
    }
}
if ($modified -lt 2) { throw 'Expected telemetry and logging patches are missing' }
foreach ($file in $sourceFiles) {
    $text = [IO.File]::ReadAllText($file.FullName)
    if ($text -match $logPattern) { throw 'Unredacted Android log writer remains in primary DEX' }
    if ($file.FullName -notmatch '\\io\\sentry\\' -and $text -match 'Lio/sentry/Sentry;->(?:init|capture)') {
        throw 'Telemetry SDK entry call remains outside the SDK'
    }
}
& "$JdkBin\javac.exe" --release 17 -cp $android -d $classes "$PSScriptRoot\SafeDiagnosticLog.java" "$PSScriptRoot\SafeDiagnosticLogTest.java" "$PSScriptRoot\test\android\util\Log.java"
if ($LASTEXITCODE) { throw 'Diagnostic helper compilation failed' }
& "$JdkBin\java.exe" -cp "$classes;$android" com.github.catvodspidergm.SafeDiagnosticLogTest
if ($LASTEXITCODE) { throw 'Sanitizer tests failed' }
if ($Quiet) {
    & "$JdkBin\javac.exe" --release 17 -d $classes "$PSScriptRoot\release\SafeDiagnosticLog.java"
    if ($LASTEXITCODE) { throw 'Release log sink compilation failed' }
}
& $d8 --min-api 24 --lib $android --output $dex "$classes\com\github\catvodspidergm\SafeDiagnosticLog.class"
if ($LASTEXITCODE) { throw 'Diagnostic D8 failed' }
$rebuilt = Join-Path $work 'rebuilt.jar'
& "$JdkBin\java.exe" -jar $apktool b $decoded -o $rebuilt
if ($LASTEXITCODE) { throw 'Patched primary DEX assembly failed' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$candidate = Join-Path $work 'gm_subs-diagnostic.jar'
Copy-Item -LiteralPath $base -Destination $candidate
function Replace-ZipEntry([string]$zipPath, [string]$entryName, [byte[]]$bytes) {
    $archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Update)
    try {
        $old = $archive.GetEntry($entryName)
        if ($old) { $old.Delete() }
        $entry = $archive.CreateEntry($entryName)
        $stream = $entry.Open()
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    } finally { $archive.Dispose() }
}
$archive = [IO.Compression.ZipFile]::OpenRead($rebuilt)
try {
    $stream = $archive.GetEntry('classes.dex').Open()
    $buffer = [IO.MemoryStream]::new()
    try { $stream.CopyTo($buffer); $primaryBytes = $buffer.ToArray() }
    finally { $buffer.Dispose(); $stream.Dispose() }
} finally { $archive.Dispose() }
Replace-ZipEntry $candidate 'classes.dex' $primaryBytes
Replace-ZipEntry $candidate 'classes3.dex' ([IO.File]::ReadAllBytes((Join-Path $dex 'classes.dex')))
& "$JdkBin\java.exe" -jar $apktool d $candidate -o $verified
if ($LASTEXITCODE) { throw 'Candidate DEX verification decode failed' }
$definitions = @(Get-ChildItem -LiteralPath (Join-Path $verified 'smali') -Recurse -Filter '*.smali' | ForEach-Object {
    [regex]::Match([IO.File]::ReadAllText($_.FullName), '(?m)^\.class[^\r\n]+').Value
} | Sort-Object)
if (Compare-Object $originalDefinitions $definitions) { throw 'Primary DEX class definitions changed' }
$sentryText = [IO.File]::ReadAllText((Join-Path $verified 'smali\com\github\catvodspidergm\SentryLog.smali'))
foreach ($method in @('captureEvent\(Ljava/lang/String;Ljava/lang/String;\)V',
        'lambda\$captureEvent\$0\(Lio/sentry/SentryOptions;\)V')) {
    $body = [regex]::Match($sentryText, '(?ms)^\.method[^\r\n]* ' + $method + '\r?\n(?<body>.*?)^\.end method')
    if (-not $body.Success -or $body.Groups['body'].Value -notmatch '^\s*\.locals 0\s+return-void\s*$') {
        throw 'Reassembled telemetry methods are not no-ops'
    }
}
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $verified 'smali') -Recurse -Filter '*.smali') {
    $text = [IO.File]::ReadAllText($file.FullName)
    if ($text -match $logPattern) { throw 'Reassembled primary DEX retained raw logging' }
    if ($file.FullName -notmatch '\\io\\sentry\\' -and $text -match 'Lio/sentry/Sentry;->(?:init|capture)') {
        throw 'Reassembled primary DEX retained telemetry entry calls'
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $verified 'smali_classes3\com\github\catvodspidergm\SafeDiagnosticLog.smali'))) {
    throw 'Diagnostic helper missing from third DEX'
}
$helperText = [IO.File]::ReadAllText((Join-Path $verified 'smali_classes3\com\github\catvodspidergm\SafeDiagnosticLog.smali'))
if ($Quiet -and $helperText -match 'Landroid/util/Log;|Ljava/net/|->probe\(|->inspect\(') { throw 'Release helper retained logging/network diagnostics' }
$helperMethods = @([regex]::Matches($helperText, '(?m)^\.method[^\r\n]* ([^ \r\n]+)\r?$') | ForEach-Object { $_.Groups[1].Value })
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $verified 'smali') -Recurse -Filter '*.smali') {
    foreach ($reference in [regex]::Matches([IO.File]::ReadAllText($file.FullName), 'Lcom/github/catvodspidergm/SafeDiagnosticLog;->([^\r\n ]+)')) {
        if ($reference.Groups[1].Value -notin $helperMethods) { throw 'Redirected log reference has no helper method' }
    }
}
if (Test-Path -LiteralPath (Join-Path $verified 'smali_classes3\android')) { throw 'JVM test sink must not ship' }
$originalZip = [IO.Compression.ZipFile]::OpenRead($base)
$candidateZip = [IO.Compression.ZipFile]::OpenRead($candidate)
try {
    foreach ($entry in $originalZip.Entries) {
        if ($entry.FullName -eq 'classes.dex') { continue }
        $other = $candidateZip.GetEntry($entry.FullName)
        if (-not $other) { throw 'Original JAR entry disappeared' }
        $one = $entry.Open(); $two = $other.Open(); $sha = [Security.Cryptography.SHA256]::Create()
        try {
            if ([BitConverter]::ToString($sha.ComputeHash($one)) -ne [BitConverter]::ToString($sha.ComputeHash($two))) {
                throw 'Non-primary entry changed (including published GMSubs classes2.dex)'
            }
        } finally { $sha.Dispose(); $one.Dispose(); $two.Dispose() }
    }
} finally { $originalZip.Dispose(); $candidateZip.Dispose() }
if ((Get-FileHash -LiteralPath $base).Hash -ne $baseHash) { throw 'Published input changed during build' }
Write-Output "LOCAL ONLY: $candidate"
Write-Output "Patched $modified generated smali files; telemetry no-op; raw Android log writers redirected; original non-primary JAR entries preserved."
Write-Output "SHA256 $((Get-FileHash -LiteralPath $candidate).Hash)"
