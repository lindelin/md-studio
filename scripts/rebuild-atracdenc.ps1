param(
    [string]$WorkRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime-build\atracdenc'),
    [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'public\atracdenc.js')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$EmsdkCommit = '27b23d467d5b8beb73d4d325b9a32c8eb77e8f95'
$EmscriptenVersion = '1.39.18'
$AtracdencCommit = 'e16e9c60a18e4b914f5cb16463ed781f09808a25'
$LibsndfileCommit = '4bdd7414602946a18799b514001b0570e8693a47'
$ExpectedOutputSha256 = '2fe122f4da021f84b3fa9c32b957f62c17e8da23b08d2d9ea602c74ab1f7c51b'
$CmakeArchiveSha256 = '5c648eac06c33477e510bae14ce1f969e9abb38992b71f245633b182fccb474d'
$NinjaArchiveSha256 = 'f550fec705b6d6ff58f2db3c374c2277a37691678d6aba463adcbb129108467a'

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
        Invoke-WebRequest -Uri $Url -OutFile $Path
    }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Sha256) {
        throw "Archive checksum mismatch for $Path. Expected $Sha256, got $actual."
    }
}

Assert-Command 'git'
Assert-Command 'python'
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null
$WorkRoot = [System.IO.Path]::GetFullPath($WorkRoot)
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

$emsdk = Join-Path $WorkRoot 'emsdk'
$atracdenc = Join-Path $WorkRoot 'atracdenc-src'
$libsndfile = Join-Path $WorkRoot 'libsndfile-src'
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

$cmakeArchive = Join-Path $WorkRoot 'cmake-3.29.6-windows-x86_64.zip'
$ninjaArchive = Join-Path $WorkRoot 'ninja-win-1.12.1.zip'
Get-VerifiedArchive 'https://github.com/Kitware/CMake/releases/download/v3.29.6/cmake-3.29.6-windows-x86_64.zip' $cmakeArchive $CmakeArchiveSha256
Get-VerifiedArchive 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip' $ninjaArchive $NinjaArchiveSha256

$cmakeParent = Join-Path $WorkRoot 'cmake'
$cmake = Join-Path $cmakeParent 'cmake-3.29.6-windows-x86_64\bin\cmake.exe'
if (-not (Test-Path -LiteralPath $cmake)) {
    Reset-BuildDirectory $cmakeParent
    Expand-Archive -LiteralPath $cmakeArchive -DestinationPath $cmakeParent
}
$ninjaParent = Join-Path $WorkRoot 'ninja'
$ninja = Join-Path $ninjaParent 'ninja.exe'
if (-not (Test-Path -LiteralPath $ninja)) {
    Reset-BuildDirectory $ninjaParent
    Expand-Archive -LiteralPath $ninjaArchive -DestinationPath $ninjaParent
}

Ensure-Checkout $atracdenc 'https://github.com/dcherednik/atracdenc.git' $AtracdencCommit
Ensure-Checkout $libsndfile 'https://github.com/libsndfile/libsndfile.git' $LibsndfileCommit

$env:EMSDK = $emsdk.Replace('\', '/')
$env:EM_CONFIG = Join-Path $emsdk '.emscripten'
$env:EMSDK_NODE = Join-Path $emsdk 'node\12.9.1_64bit\bin\node.exe'
$env:EMSDK_PYTHON = Join-Path $emsdk 'python\3.7.4-pywin32_64bit\python.exe'
$env:JAVA_HOME = Join-Path $emsdk 'java\8.152_64bit'
$emscripten = Join-Path $emsdk 'upstream\emscripten'
$env:PATH = "$emsdk;$(Split-Path $env:EMSDK_NODE);$(Split-Path $env:EMSDK_PYTHON);$env:JAVA_HOME\bin;$emscripten;$(Split-Path $cmake);$ninjaParent;$env:PATH"

$emcmake = Join-Path $emscripten 'emcmake.bat'
$libsndfileBuild = Join-Path $WorkRoot 'libsndfile-build'
$libsndfileInstall = Join-Path $WorkRoot 'libsndfile-install'
Reset-BuildDirectory $libsndfileBuild
Reset-BuildDirectory $libsndfileInstall
& $emcmake $cmake -S $libsndfile -B $libsndfileBuild -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" -DCMAKE_BUILD_TYPE=Release "-DCMAKE_INSTALL_PREFIX=$libsndfileInstall" -DBUILD_TESTING=OFF -DENABLE_EXTERNAL_LIBS=OFF -DBUILD_PROGRAMS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_REGTEST=OFF
if ($LASTEXITCODE -ne 0) { throw 'Could not configure libsndfile.' }
& $cmake --build $libsndfileBuild --parallel
if ($LASTEXITCODE -ne 0) { throw 'Could not build libsndfile.' }
& $cmake --install $libsndfileBuild
if ($LASTEXITCODE -ne 0) { throw 'Could not install libsndfile.' }

$atracdencCmake = Join-Path $atracdenc 'src\CMakeLists.txt'
$originalCmake = [System.IO.File]::ReadAllText($atracdencCmake)
$patchedCmake = [regex]::Replace(
    $originalCmake,
    'include \(TestBigEndian\)\r?\nTEST_BIG_ENDIAN\(BIGENDIAN_ORDER\)\r?\nif \(\$\{BIGENDIAN\}\)\r?\n  add_compile_definitions\(BIGENDIAN_ORDER\)\r?\nendif\(\)\r?\n',
    ''
)
if ($patchedCmake -eq $originalCmake) { throw 'The Atracdenc endian probe patch no longer applies.' }
[System.IO.File]::WriteAllText($atracdencCmake, $patchedCmake, [System.Text.UTF8Encoding]::new($false))

$atracdencBuild = Join-Path $WorkRoot 'atracdenc-build'
Reset-BuildDirectory $atracdencBuild
$linkerFlags = "--closure 1 -Oz -s MODULARIZE=1 -s SINGLE_FILE=1 -s ALLOW_MEMORY_GROWTH=1 -s INVOKE_RUN=0 -s EXTRA_EXPORTED_RUNTIME_METHODS=['callMain','FS']"
& $emcmake $cmake -S (Join-Path $atracdenc 'src') -B $atracdencBuild -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXECUTABLE_SUFFIX=.js "-DLIBSNDFILE_INCLUDE_DIR=$(Join-Path $libsndfileInstall 'include')" "-DSNDFILE_LIBRARY=$(Join-Path $libsndfileInstall 'lib\libsndfile.a')" "-DCMAKE_EXE_LINKER_FLAGS=$linkerFlags"
if ($LASTEXITCODE -ne 0) { throw 'Could not configure Atracdenc.' }
& $cmake --build $atracdencBuild --parallel
if ($LASTEXITCODE -ne 0) { throw 'Could not build Atracdenc.' }

$builtRuntime = Join-Path $atracdencBuild 'atracdenc.js'
$actualOutputSha256 = (Get-FileHash -LiteralPath $builtRuntime -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualOutputSha256 -ne $ExpectedOutputSha256) {
    throw "Atracdenc output is not reproducible. Expected $ExpectedOutputSha256, got $actualOutputSha256."
}
Copy-Item -LiteralPath $builtRuntime -Destination $OutputPath -Force
Write-Host "Rebuilt Atracdenc $AtracdencCommit as $OutputPath ($actualOutputSha256)."
