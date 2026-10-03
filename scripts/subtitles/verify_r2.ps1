param(
    [Parameter(Mandatory = $true)][string]$PublicRoot,
    [Parameter(Mandatory = $true)][string]$AwsPython,
    [Parameter(Mandatory = $true)][string]$Endpoint,
    [string]$Bucket = 'luoyuqiu-subtitles',
    [string]$Profile = 'luoyuqiu-r2'
)

$ErrorActionPreference = 'Stop'
if ($Endpoint -notmatch '^https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com/?$') {
    throw 'Expected an HTTPS R2 S3 host root, without the bucket path.'
}
$r2ExportRoot = (Resolve-Path -LiteralPath $PublicRoot).Path.TrimEnd('\', '/')
$r2Files = @(Get-ChildItem -LiteralPath "$r2ExportRoot/subs", "$r2ExportRoot/index" -Recurse -File)
if ($r2Files.Count -eq 0) { throw 'No exported subtitle or index files found.' }

# AWS CLI handles authentication and pagination; never print credential values.
$r2Listing = & $AwsPython -m awscli s3api list-objects-v2 `
    --profile $Profile --endpoint-url $Endpoint --bucket $Bucket `
    --output json --cli-connect-timeout 10 --cli-read-timeout 30
if ($LASTEXITCODE -ne 0) { throw 'Could not read the remote object inventory.' }
$r2Inventory = ($r2Listing -join "`n") | ConvertFrom-Json
$r2Objects = @($r2Inventory.Contents)
if ($r2Objects.Count -ne $r2Files.Count) {
    throw "Object count mismatch: local=$($r2Files.Count), remote=$($r2Objects.Count). Nothing deleted."
}
$r2ByKey = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::Ordinal)
foreach ($r2Object in $r2Objects) { $r2ByKey.Add($r2Object.Key, $r2Object) }

$r2Checked = 0
$r2Bytes = [long]0
foreach ($r2File in $r2Files) {
    $r2Key = $r2File.FullName.Substring($r2ExportRoot.Length + 1).Replace('\', '/')
    if (-not $r2ByKey.ContainsKey($r2Key)) { throw 'A local file is missing from the remote inventory.' }
    $r2Remote = $r2ByKey[$r2Key]
    if ([long]$r2Remote.Size -ne $r2File.Length) { throw 'A remote file size differs from its local source.' }
    # All generated files are < 1 MiB and uploaded as single-part objects.
    # Their ETags are transport MD5s; the generator separately verifies SHA256.
    $r2Etag = ([string]$r2Remote.ETag).Trim('"')
    if ($r2Etag -notmatch '^[a-fA-F0-9]{32}$') { throw 'Non-MD5 ETag: do not treat multipart or encrypted ETags as content hashes.' }
    if ((Get-FileHash -LiteralPath $r2File.FullName -Algorithm MD5).Hash -ne $r2Etag) {
        throw 'A remote object checksum differs from its local source.'
    }
    $r2Bytes += $r2File.Length
    $r2Checked++
    if (($r2Checked % 10000) -eq 0) { Write-Host "REMOTE_OBJECTS_VERIFIED=$r2Checked" }
}
[pscustomobject]@{
    bucket = $Bucket
    verified_objects = $r2Checked
    verified_bytes = $r2Bytes
    verified_subtitles = @($r2Files | Where-Object { $_.FullName.StartsWith("$r2ExportRoot\subs\", [System.StringComparison]::Ordinal) }).Count
    verified_indexes = @($r2Files | Where-Object { $_.FullName.StartsWith("$r2ExportRoot\index\", [System.StringComparison]::Ordinal) }).Count
    verification = 'all keys, sizes and single-part ETag/MD5 values match local exports'
} | ConvertTo-Json
