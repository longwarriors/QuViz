<#
.SYNOPSIS
Run -- or deliberately regenerate -- the Linux/SwiftShader visual gate in the pinned
Playwright image.

.DESCRIPTION
web/playwright.config.ts refuses to load off Linux: the committed baselines are
SwiftShader's pixels in one image, and any other graphics stack draws different ones.
This wrapper runs the suite in exactly that image, pinned by digest, with the checkout
bind-mounted at /work and the container's own node_modules in a named volume (the host's
web/node_modules carries Windows-only native bindings).

  -Mode check    npm run test:visual                        (compare with the baselines)
  -Mode update   npm run test:visual:update, then test:visual (rewrite, compare again)
  -Fresh         force `npm ci` into the volume even when package-lock.json is unchanged

Before anything is installed, the image's own `node --version` is checked against
web/package.json's engines: under engine-strict an unsupported Node would only fail later,
inside `npm ci`, with a less useful message. The run writes web/dist and web/test-results
in the checkout, and (update mode) web/e2e/__screenshots__, which must be reviewed PNG by
PNG before committing. tests/test_visual_docker.py runs this script against a stub docker.
#>
[CmdletBinding()]
param(
    [ValidateSet('check', 'update')]
    [string] $Mode = 'check',
    [switch] $Fresh
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# The image of the exact @playwright/test version web/package.json pins, by digest, so a
# re-pushed tag cannot change the pixels under an unchanged script.
$Image = 'mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e'
$Volume = 'quviz-visual-node-modules'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Test-NodeSatisfiesEngines {
    # Reads the two clause shapes web/package.json uses: ^X.Y.Z and >=X.Y.Z, joined by ||.
    param(
        [Parameter(Mandatory)] [string] $Version,
        [Parameter(Mandatory)] [string] $Range
    )
    if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') {
        return $false
    }
    $have = [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
    foreach ($clause in ($Range -split '\|\|')) {
        $text = $clause.Trim()
        if ($text -notmatch '^(\^|>=)(\d+)\.(\d+)\.(\d+)$') {
            throw "visual-docker: engines clause '$text' is not ^X.Y.Z or >=X.Y.Z; teach this script the new shape"
        }
        $floor = [version]::new([int]$Matches[2], [int]$Matches[3], [int]$Matches[4])
        if ($Matches[1] -eq '^') {
            if ($have.Major -eq $floor.Major -and $have -ge $floor) {
                return $true
            }
        }
        elseif ($have -ge $floor) {
            return $true
        }
    }
    return $false
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'visual-docker: docker is not on PATH; install Docker Desktop (Linux containers).'
}
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'visual-docker: the Docker daemon is not running; start Docker Desktop and retry.'
}

$packageJson = Join-Path $repoRoot 'web/package.json'
$engines = (Get-Content -Raw -LiteralPath $packageJson | ConvertFrom-Json).engines.node
$nodeVersion = ((& docker run --rm $Image node --version) | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "visual-docker: could not run 'node --version' in $Image."
}
if (-not (Test-NodeSatisfiesEngines -Version $nodeVersion -Range $engines)) {
    throw ("visual-docker: the image ships Node $nodeVersion, which web/package.json engines " +
        "'$engines' rejects; npm ci would fail under engine-strict. Pin an image whose Node " +
        'satisfies engines.')
}
Write-Host "visual-docker: image Node $nodeVersion satisfies engines '$engines'"

# Not `$fresh`: PowerShell variable names are case-insensitive, so that would be the
# [switch] parameter itself, and assigning '0' or '1' to it fails the type conversion.
$freshFlag = if ($Fresh) { '1' } else { '0' }
$runArgs = @(
    'run', '--rm', '--init', '--ipc=host',
    '-e', 'CI=1',
    '-e', "QUVIZ_FRESH=$freshFlag",
    '-v', "${repoRoot}:/work",
    '-v', "${Volume}:/work/web/node_modules",
    '-w', '/work',
    $Image,
    'bash', 'scripts/visual-docker-entry.sh', $Mode
)
& docker @runArgs
exit $LASTEXITCODE
