param(
    [string]$WorkRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime-build\ffmpeg'),
    [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public\ffmpeg-core.js')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$FfmpegCoreCommit = '0deba716e237a5382f1b69320d093483df1d1d5b'
$ZlibCommit = 'cacf7f1d4e3d44d871b605da3b647f07d718623f'
$LameCommit = '59a722d49e9f2bea65917dcdd17b94c710a02f0c'
$EmsdkCommit = '27b23d467d5b8beb73d4d325b9a32c8eb77e8f95'
$EmscriptenVersion = '1.39.0'
$EmscriptenRevision = 'd57bfdd6d43181501bbd3fab502d57c9073ceb49'
$ExpectedOutputSha256 = '2f89c5687ceb3f058e9e21fffd2b02821eece2c45bdfe74d6cf58844110a46ad'
$CmakeArchiveSha256 = '5c648eac06c33477e510bae14ce1f969e9abb38992b71f245633b182fccb474d'
$MakeArchiveSha256 = 'fb66a02b530f7466f6222ce53c0b602c5288e601547a034e4156a512dd895ee7'

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command is unavailable: $Name"
    }
}

function Assert-ChildPath([string]$Path, [string]$Parent) {
    $resolvedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside the build root: $resolvedPath"
    }
}

function Reset-BuildDirectory([string]$Path) {
    Assert-ChildPath $Path $WorkRoot
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path | Out-Null
}

function Invoke-Git([string]$Directory, [string[]]$Arguments) {
    & git -C $Directory @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git failed in ${Directory}: git $($Arguments -join ' ')"
    }
}

function Ensure-Checkout([string]$Path, [string]$Repository, [string]$Commit, [switch]$PreserveUntracked) {
    if (-not (Test-Path -LiteralPath (Join-Path $Path '.git'))) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
        & git -C $Path init --quiet
        if ($LASTEXITCODE -ne 0) { throw "Could not initialize $Path" }
        & git -C $Path remote add origin $Repository
        if ($LASTEXITCODE -ne 0) { throw "Could not configure source repository for $Path" }
    }
    Invoke-Git $Path @('fetch', '--depth', '1', 'origin', $Commit)
    Invoke-Git $Path @('checkout', '--detach', '--force', 'FETCH_HEAD')
    if (-not $PreserveUntracked) { Invoke-Git $Path @('clean', '-fdx') }
    $actual = (& git -C $Path rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $actual -ne $Commit) {
        throw "Source revision mismatch for $Path. Expected $Commit, got $actual."
    }
}

function Get-VerifiedArchive([string]$Url, [string]$Path, [string]$Sha256) {
    if (-not (Test-Path -LiteralPath $Path)) {
        & curl.exe -L --fail --silent --show-error --output $Path $Url
        if ($LASTEXITCODE -ne 0) { throw "Could not download $Url" }
    }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Sha256) {
        throw "Archive checksum mismatch for $Path. Expected $Sha256, got $actual."
    }
}

function Get-ShortPath([string]$Path) {
    $shortPath = (& cmd.exe /d /c "for %I in (`"$Path`") do @echo %~sI").Trim()
    if ($LASTEXITCODE -ne 0 -or -not $shortPath) { throw "Could not resolve the short path for $Path" }
    return $shortPath
}

Assert-Command 'git'
Assert-Command 'python'
Assert-Command 'curl.exe'

New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null
$WorkRoot = [System.IO.Path]::GetFullPath($WorkRoot)
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$repositoryRoot = Split-Path -Parent $PSScriptRoot

$gitExecutable = (Get-Command git).Source
$gitRoot = Split-Path -Parent (Split-Path -Parent $gitExecutable)
$gitBash = Join-Path $gitRoot 'bin\bash.exe'
$gitShell = Join-Path $gitRoot 'usr\bin\sh.exe'
if (-not (Test-Path -LiteralPath $gitBash) -or -not (Test-Path -LiteralPath $gitShell)) {
    throw 'Git for Windows with Git Bash is required.'
}

$emsdk = Join-Path $WorkRoot 'emsdk'
$ffmpeg = Join-Path $WorkRoot 'ffmpeg-src'
$zlib = Join-Path $ffmpeg 'third_party\zlib'
$lame = Join-Path $ffmpeg 'third_party\lame'
Ensure-Checkout $emsdk 'https://github.com/emscripten-core/emsdk.git' $EmsdkCommit -PreserveUntracked
Push-Location $emsdk
try {
    & python '.\emsdk.py' install $EmscriptenVersion
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the pinned Emscripten SDK.' }
    & python '.\emsdk.py' activate $EmscriptenVersion
    if ($LASTEXITCODE -ne 0) { throw 'Could not activate the pinned Emscripten SDK.' }
} finally {
    Pop-Location
}

$releaseMap = [System.IO.File]::ReadAllText((Join-Path $emsdk 'emscripten-releases-tags.txt'))
if ($releaseMap -notmatch ('"' + [regex]::Escape($EmscriptenVersion) + '"\s*:\s*"' + $EmscriptenRevision + '"')) {
    throw "The pinned emsdk does not map Emscripten $EmscriptenVersion to $EmscriptenRevision."
}

$cmakeArchive = Join-Path $WorkRoot 'cmake-3.29.6-windows-x86_64.zip'
$makeArchive = Join-Path $WorkRoot 'make-4.4.1-without-guile-w32-bin.zip'
Get-VerifiedArchive 'https://github.com/Kitware/CMake/releases/download/v3.29.6/cmake-3.29.6-windows-x86_64.zip' $cmakeArchive $CmakeArchiveSha256
Get-VerifiedArchive 'https://downloads.sourceforge.net/project/ezwinports/make-4.4.1-without-guile-w32-bin.zip' $makeArchive $MakeArchiveSha256

$cmakeParent = Join-Path $WorkRoot 'cmake'
$cmake = Join-Path $cmakeParent 'cmake-3.29.6-windows-x86_64\bin\cmake.exe'
if (-not (Test-Path -LiteralPath $cmake)) {
    Reset-BuildDirectory $cmakeParent
    Expand-Archive -LiteralPath $cmakeArchive -DestinationPath $cmakeParent
}
$makeParent = Join-Path $WorkRoot 'make-4.4.1'
$make = Join-Path $makeParent 'bin\make.exe'
if (-not (Test-Path -LiteralPath $make)) {
    Reset-BuildDirectory $makeParent
    Expand-Archive -LiteralPath $makeArchive -DestinationPath $makeParent
}

Ensure-Checkout $ffmpeg 'https://github.com/ffmpegwasm/ffmpeg.wasm-core.git' $FfmpegCoreCommit
Ensure-Checkout $zlib 'https://github.com/madler/zlib.git' $ZlibCommit
Ensure-Checkout $lame 'https://github.com/zlargon/lame.git' $LameCommit

$buildScript = Join-Path $repositoryRoot 'extra\build-ffmpeg-core.sh'
$aeaPatch = Join-Path $repositoryRoot 'extra\aeafix.patch'
Copy-Item -LiteralPath $buildScript -Destination (Join-Path $ffmpeg 'build-js.sh') -Force
Invoke-Git $ffmpeg @('apply', '--check', '--unidiff-zero', $aeaPatch)
Invoke-Git $ffmpeg @('apply', '--unidiff-zero', $aeaPatch)

$env:EMSDK = $emsdk.Replace('\', '/')
$env:EM_CONFIG = (Join-Path $emsdk '.emscripten').Replace('\', '/')
$env:EMSDK_NODE = Join-Path $emsdk 'node\12.9.1_64bit\bin\node.exe'
$env:EMSDK_PYTHON = Join-Path $emsdk 'python\3.7.4-pywin32_64bit\python.exe'
$env:JAVA_HOME = Join-Path $emsdk 'java\8.152_64bit'
$emscripten = Join-Path $emsdk 'upstream\emscripten'
$env:GIT_BASH = $gitBash.Replace('\', '/')
$env:SHELL = (Get-ShortPath $gitShell).Replace('\', '/')
$env:CONFIG_SHELL = $env:SHELL
$env:PATH = "$makeParent\bin;$(Split-Path $cmake);$emsdk;$(Split-Path $env:EMSDK_NODE);$(Split-Path $env:EMSDK_PYTHON);$env:JAVA_HOME\bin;$emscripten;$(Join-Path $emsdk 'upstream\bin');$env:PATH"

$toolShims = Join-Path $WorkRoot 'tool-shims'
Reset-BuildDirectory $toolShims
$shimBodies = @{
    emcc = '#!/bin/bash`nexec "$EMSDK_PYTHON" "$EMSDK/upstream/emscripten/emcc.py" "$@"`n'
    emxx = '#!/bin/bash`nexec "$EMSDK_PYTHON" "$EMSDK/upstream/emscripten/em++.py" "$@"`n'
    emar = '#!/bin/bash`nexec "$EMSDK_PYTHON" "$EMSDK/upstream/emscripten/emar.py" "$@"`n'
    emranlib = '#!/bin/bash`nexec "$EMSDK_PYTHON" "$EMSDK/upstream/emscripten/emranlib" "$@"`n'
}
foreach ($shim in $shimBodies.GetEnumerator()) {
    [System.IO.File]::WriteAllText((Join-Path $toolShims $shim.Key), $shim.Value.Replace('`n', "`n"), [System.Text.UTF8Encoding]::new($false))
}

$buildPrefix = Join-Path $ffmpeg 'build'
Reset-BuildDirectory $buildPrefix
$zlibBuild = Join-Path $WorkRoot 'zlib-build'
Reset-BuildDirectory $zlibBuild
$emcmake = Join-Path $emscripten 'emcmake.bat'
& $emcmake $cmake -S $zlib -B $zlibBuild -G 'Unix Makefiles' "-DCMAKE_MAKE_PROGRAM=$make" "-DCMAKE_INSTALL_PREFIX=$buildPrefix" -DBUILD_SHARED_LIBS=OFF
if ($LASTEXITCODE -ne 0) { throw 'Could not configure zlib.' }
& $cmake --build $zlibBuild --parallel --target install
if ($LASTEXITCODE -ne 0) { throw 'Could not build zlib.' }

Push-Location $ffmpeg
try {
    & $gitBash '.\build-js.sh'
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the FFmpeg browser runtime.' }
} finally {
    Pop-Location
}

$builtRuntime = Join-Path $ffmpeg 'dist\ffmpeg-core.js'
$actualOutputSha256 = (Get-FileHash -LiteralPath $builtRuntime -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualOutputSha256 -ne $ExpectedOutputSha256) {
    throw "FFmpeg output is not reproducible. Expected $ExpectedOutputSha256, got $actualOutputSha256."
}
Copy-Item -LiteralPath $builtRuntime -Destination $OutputPath -Force
Write-Host "Rebuilt FFmpeg $FfmpegCoreCommit as $OutputPath ($actualOutputSha256)."
