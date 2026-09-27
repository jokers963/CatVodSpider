param([Parameter(Mandatory = $true)][string]$OutputDir)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$work = [IO.Path]::GetFullPath($OutputDir)
$wrapper = Join-Path $work 'wrapper'
$quiet = Join-Path $work 'quiet'
& "$root\scripts\gmSubsManual\build-check.ps1" -OutputDir $wrapper
& "$root\scripts\gmDiagnostic\build-check.ps1" -OutputDir $quiet -Quiet
Add-Type -AssemblyName System.IO.Compression.FileSystem
$base = Join-Path $quiet 'gm_subs-diagnostic.jar'
$candidate = Join-Path $work 'gm_subs-v35.jar'
$dex = Join-Path $wrapper 'codex-update\classes2.dex'
Copy-Item -LiteralPath $base -Destination $candidate
$zip = [IO.Compression.ZipFile]::Open($candidate, [IO.Compression.ZipArchiveMode]::Update)
try {
    $zip.GetEntry('classes2.dex').Delete()
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $dex, 'classes2.dex') | Out-Null
} finally { $zip.Dispose() }
function EntryHash($entry) {
    $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash($stream)) }
    finally { $stream.Dispose(); $sha.Dispose() }
}
$original = [IO.Compression.ZipFile]::OpenRead($base)
$result = [IO.Compression.ZipFile]::OpenRead($candidate)
try {
    if ($original.Entries.Count -ne $result.Entries.Count) { throw 'JAR entry count changed' }
    foreach ($entry in $original.Entries) {
        if ($entry.FullName -eq 'classes2.dex') { continue }
        if ((EntryHash $entry) -ne (EntryHash $result.GetEntry($entry.FullName))) { throw "Unexpected change: $($entry.FullName)" }
    }
    $hash = (EntryHash $result.GetEntry('classes2.dex')).Replace('-', '')
    if ($hash -ne (Get-FileHash -LiteralPath $dex).Hash) { throw 'Wrapper DEX mismatch' }
} finally { $original.Dispose(); $result.Dispose() }
[IO.File]::WriteAllText("$candidate.md5", (Get-FileHash -LiteralPath $candidate -Algorithm MD5).Hash.ToLowerInvariant())
Write-Output "Release candidate: $candidate"
Write-Output "SHA256 $((Get-FileHash -LiteralPath $candidate).Hash)"
Write-Output 'Quiet primary/helper retained; only tested wrapper DEX replaced; no checkout runtime overwritten.'
