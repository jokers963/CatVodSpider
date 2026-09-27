param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$jdk = 'E:\DevTools\Gradle.gradle\jdks\jetbrains_s_r_o_-21-amd64-windows.2\bin'
$android = 'E:\DevTools\Android\sdk\platforms\android-37.0\android.jar'
$app = "$root\app\build\intermediates\compile_app_classes_jar\debug\bundleDebugClassesToCompileJar\classes.jar"
$api = 'E:\DevTools\Gradle.gradle\caches\9.6.1\transforms\06fa3c3720c12a4360e2059f5c6324f6\transformed\okhttp-api.jar'
$runtime = 'E:\DevTools\Gradle.gradle\caches\9.6.1\transforms\19afaaf8fd72c385630816a12d1e7dfa\transformed\okhttp-runtime.jar'
$okio = 'E:\DevTools\Gradle.gradle\caches\modules-2\files-2.1\com.squareup.okio\okio-jvm\3.18.1\a3a8128bb3a0157d23ecc18c17e8330d9c0ac96c\okio-jvm-3.18.1.jar'
$kotlin = 'E:\DevTools\Gradle.gradle\caches\modules-2\files-2.1\org.jetbrains.kotlin\kotlin-stdlib\2.3.21\a2ee2c4e220fee522f0451b723bab2a43f3481a7\kotlin-stdlib-2.3.21.jar'
$json = 'E:\DevTools\Gradle.gradle\caches\modules-2\files-2.1\org.json\json\20260814\a1d979d4b336516526d00ff423e4a8d4ba27670f\json-20260814.jar'
$junit = 'E:\DevTools\Gradle.gradle\caches\modules-2\files-2.1\junit\junit\4.13.2\8ac9e16d933b6fb43bc7f576336b8f4d7eb5ba12\junit-4.13.2.jar'
$hamcrest = 'E:\DevTools\Gradle.gradle\caches\modules-2\files-2.1\org.hamcrest\hamcrest-core\1.3\42a25dc3219429f0e5d060061f71acb49bf010a0\hamcrest-core-1.3.jar'
$work = [System.IO.Path]::GetFullPath($OutputDir)
if (Test-Path -LiteralPath $work) {
    if (Get-ChildItem -LiteralPath $work -Force | Select-Object -First 1) {
        throw "OutputDir must be a new or empty directory: $work"
    }
} else {
    New-Item -ItemType Directory -Path $work | Out-Null
}
$compileOut = Join-Path $work 'codex-out'
$testOut = Join-Path $work 'codex-test'
$dexOut = Join-Path $work 'codex-dex'
$updateOut = Join-Path $work 'codex-update'
New-Item -ItemType Directory -Path $compileOut, $testOut, $dexOut, $updateOut | Out-Null
$cp = "$app;$android;$api;$runtime;$okio;$kotlin"
& "$jdk\javac.exe" --release 17 -Xlint:none -cp $cp -d $compileOut "$root\app\src\main\java\com\github\catvod\spider\GMSubs.java"
if ($LASTEXITCODE) { throw 'javac failed' }
$testCp = "$compileOut;$json;$cp;$junit;$hamcrest"
& "$jdk\javac.exe" --release 17 -cp $testCp -d $testOut "$root\app\src\test\java\com\github\catvod\spider\GMSubsTest.java"
if ($LASTEXITCODE) { throw 'test compile failed' }
& "$jdk\java.exe" -cp "$testOut;$testCp" org.junit.runner.JUnitCore com.github.catvod.spider.GMSubsTest
if ($LASTEXITCODE) { throw 'tests failed' }

$classes = @(Get-ChildItem -LiteralPath "$compileOut\com\github\catvod\spider" -Filter 'GMSubs*.class' | Sort-Object Name)
if (-not ($classes | Where-Object Name -eq 'GMSubs.class')) { throw 'GMSubs.class missing from D8 inputs' }
if ($classes.Count -lt 3) { throw "Expected GMSubs and its generated nested classes; found $($classes.Count) input classes" }
$d8Args = @('--min-api', '24', '--lib', $android, '--classpath', $app, '--classpath', "$root\jar\gm.jar", '--classpath', $api, '--classpath', $runtime, '--classpath', $okio, '--classpath', $kotlin, '--output', $dexOut) + @($classes | ForEach-Object FullName)
& 'E:\DevTools\Android\sdk\build-tools\36.0.0\d8.bat' @d8Args
if ($LASTEXITCODE) { throw 'd8 failed' }
$dexDump = & 'E:\DevTools\Android\sdk\build-tools\36.0.0\dexdump.exe' -f "$dexOut\classes.dex" | Out-String
foreach ($descriptor in @('Lcom/github/catvod/spider/GMSubs;', 'Lcom/github/catvod/spider/GMSubs$1;', 'Lcom/github/catvod/spider/GMSubs$SubtitleCacheEntry;')) {
    if ($dexDump -notmatch [regex]::Escape($descriptor)) { throw "D8 output is missing class definition $descriptor" }
}

$candidateJar = Join-Path $work 'codex-gm_subs.jar'
Copy-Item -LiteralPath "$root\jar\gm.jar" -Destination $candidateJar
Copy-Item -LiteralPath "$dexOut\classes.dex" -Destination "$updateOut\classes2.dex"
& "$jdk\jar.exe" uf $candidateJar -C $updateOut classes2.dex
if ($LASTEXITCODE) { throw 'jar update failed' }
$originalDir = Join-Path $work 'original-jar'
$candidateDir = Join-Path $work 'candidate-jar'
New-Item -ItemType Directory -Path $originalDir, $candidateDir | Out-Null
Push-Location $originalDir
try { & "$jdk\jar.exe" xf "$root\jar\gm.jar" classes.dex } finally { Pop-Location }
Push-Location $candidateDir
try { & "$jdk\jar.exe" xf $candidateJar classes.dex classes2.dex } finally { Pop-Location }
if ($LASTEXITCODE) { throw 'candidate JAR extraction failed' }
$originalHash = (Get-FileHash -LiteralPath "$originalDir\classes.dex" -Algorithm SHA256).Hash
$candidateOriginalHash = (Get-FileHash -LiteralPath "$candidateDir\classes.dex" -Algorithm SHA256).Hash
if ($originalHash -ne $candidateOriginalHash) { throw 'Original classes.dex changed in the candidate JAR' }
[System.IO.File]::WriteAllText("$candidateJar.md5", (Get-FileHash -LiteralPath $candidateJar -Algorithm MD5).Hash.ToLowerInvariant())
& powershell -NoProfile -ExecutionPolicy Bypass -File "$root\jar\checkJar.ps1" -Jar $candidateJar -BaseJar "$root\jar\gm.jar" -AllowBundledRuntime
if ($LASTEXITCODE) { throw 'candidate JAR structural/reference verification failed' }
Write-Output "Temporary JAR verified: $candidateJar"
Write-Output "Original classes.dex preserved (SHA256 $originalHash); added classes2.dex defines GMSubs and both generated nested classes."
