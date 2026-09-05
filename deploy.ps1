[CmdletBinding()]
param (
    [string]$CommitMessage = "Deploy Manager Site",
    [string]$RepoUrl = "https://github.com/lironatar1994-coder/Manager_Site.git",
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]*$')][string]$Branch = "main",
    [ValidatePattern('^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')][string]$SSHHost = "root@vee-app.co.il",
    [ValidatePattern('^/[A-Za-z0-9_/-]+$')][string]$RemoteDir = "/root/Manager_Site",
    [switch]$CheckOnly
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE). Deployment stopped." }
}

# SSH arguments need POSIX quoting, not PowerShell quoting.
function Quote-Shell([string]$Value) {
    if ($Value.Contains("'")) { throw "Single quotes are not supported in deployment arguments." }
    return "'$Value'"
}

Push-Location $PSScriptRoot
try {
    foreach ($command in @('git', 'node', 'npm.cmd', 'ssh')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command missing: $command" }
    }
    if ($RemoteDir -eq '/' -or $RemoteDir.Contains('//')) { throw "RemoteDir must name the application directory." }
    if ($RepoUrl -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$') {
        throw "RepoUrl must be an HTTPS GitHub repository URL ending in .git."
    }
    $required = @('server.js', 'package.json', 'package-lock.json', 'deploy_linux.sh',
        'lib/tracking-links.js', 'tests/tracking-links.test.js', 'public/index.html',
        'public/app.js', 'public/boot.js', 'public/styles.css', 'public/interface.js',
        'public/interface.css', 'public/links.js', 'public/links.css')
    foreach ($file in $required) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing deployment file: $file" }
    }
    Invoke-Checked git @('rev-parse', '--is-inside-work-tree')
    Invoke-Checked git @('check-ref-format', '--branch', $Branch)
    $currentBranch = (Invoke-Checked git @('branch', '--show-current') | Out-String).Trim()
    if ($currentBranch -ne $Branch) { throw "Check out $Branch first (current branch: $currentBranch)." }
    $origin = (Invoke-Checked git @('remote', 'get-url', 'origin') | Out-String).Trim()
    if ($origin -ne $RepoUrl) { throw "origin does not match RepoUrl. No remote configuration was changed." }
    if ([int](Invoke-Checked node @('-p', 'process.versions.node.split(".")[0]')) -lt 20) {
        throw 'Node.js 20 or newer is required.'
    }

    # Include new app modules/tests; exclude runtime data and local agent attachments.
    $deployPaths = @('server.js', 'package.json', 'package-lock.json', 'public', 'lib', 'tests',
        'scripts', 'README.md', 'AGENTS.md', 'docs', 'clients', 'deploy.ps1', 'deploy_linux.sh', '.gitignore', '.gitattributes')
    $deployPaths = @($deployPaths | Where-Object { Test-Path -LiteralPath $_ })
    $unsafeStaged = @(Invoke-Checked git @('diff', '--cached', '--name-only') | Where-Object {
        $candidate = $_
        -not @($deployPaths | Where-Object { $candidate -eq $_ -or $candidate.StartsWith("$_/") }).Count
    })
    if ($unsafeStaged.Count) { throw "Unrelated files are already staged. Unstage them first: $($unsafeStaged -join ', ')" }

    Write-Host 'Checking JavaScript and tracking-link behavior...' -ForegroundColor Cyan
    Invoke-Checked npm.cmd @('run', 'check')
    Invoke-Checked npm.cmd @('run', 'test:links')
    if ($CheckOnly) {
        Write-Host 'Checks passed. No commit, push, SSH connection or deployment was performed.' -ForegroundColor Green
        return
    }

    Invoke-Checked ssh @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', $SSHHost, 'true')
    Invoke-Checked git @('fetch', 'origin', $Branch)
    & git merge-base --is-ancestor "origin/$Branch" HEAD
    if ($LASTEXITCODE -ne 0) { throw "origin/$Branch contains changes missing locally. Merge them and rerun the checks before deploying." }
    Invoke-Checked git (@('add', '--') + $deployPaths)
    $staged = @(Invoke-Checked git @('diff', '--cached', '--name-only'))
    if (@($staged | Where-Object { $_ -match '(^|/)(\.env($|\.)|data/|data-test[^/]*/|uploads/|initial-admin\.txt$)' }).Count) {
        throw 'Runtime data or secret files were staged. Unstage them before deploying.'
    }
    if ($staged.Count) {
        if ([string]::IsNullOrWhiteSpace($CommitMessage)) { throw 'A commit message is required.' }
        Invoke-Checked git @('commit', '-m', $CommitMessage)
    }
    $revision = (Invoke-Checked git @('rev-parse', 'HEAD') | Out-String).Trim()
    if ($revision -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve an exact Git revision.' }
    Invoke-Checked git @('push', 'origin', "HEAD:refs/heads/$Branch")

    # Run a snapshot from the exact pushed revision; never execute a stale deploy script.
    $remoteTemplate = @'
set -eu
if [ ! -d __DIR__/.git ]; then
  if [ -e __DIR__ ]; then
    echo 'Remote directory exists without Git; refusing to replace it.' >&2
    exit 1
  fi
  git clone --branch __BRANCH__ -- __REPO__ __DIR__
fi
cd __DIR__
[ "$(git remote get-url origin)" = __REPO__ ] || { echo 'Unexpected remote origin.' >&2; exit 1; }
git fetch origin __BRANCH__
git cat-file -e '__REV__^{commit}'
snapshot=$(mktemp /tmp/manager-site-deploy.XXXXXX)
trap 'rm -f "$snapshot"' EXIT
git show '__REV__:deploy_linux.sh' > "$snapshot"
bash "$snapshot" --dir __DIR__ --branch __BRANCH__ --ref '__REV__'
'@
    $remoteCommand = $remoteTemplate.Replace('__DIR__', (Quote-Shell $RemoteDir)).
        Replace('__REPO__', (Quote-Shell $RepoUrl)).Replace('__BRANCH__', (Quote-Shell $Branch)).
        Replace('__REV__', $revision).Replace([string][char]13, '')
    Write-Host "Deploying tested commit $revision..." -ForegroundColor Cyan
    Invoke-Checked ssh @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', $SSHHost, $remoteCommand)
    Write-Host 'Deployment verified: https://vee-app.co.il/Manager_Site/login' -ForegroundColor Green
}
finally {
    Pop-Location
}
