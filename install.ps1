<#
.SYNOPSIS
  Installs a skill of this repository for local agents on Windows.

.DESCRIPTION
  Creates directory junctions from the user-level skill folders to <repo>\<skill>\<skill>.
  A junction needs no administrator rights and no developer mode.
  The script copies nothing and deletes no folder. Uninstall removes only the junctions that point to this repository.

.EXAMPLE
  .\install.ps1 -Skill node-security
  .\install.ps1 -Skill node-security -Uninstall
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9-]+$')]
  [string]$Skill,
  [switch]$Uninstall,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Get-NormalizedPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-LinkTarget($Item) {
  # PowerShell 5.1 returns an array, PowerShell 7 returns a string.
  $t = @($Item.Target)[0]
  if (-not $t) { return $null }
  return Get-NormalizedPath $t
}

function Invoke-GitQuiet([string[]]$GitArgs) {
  # Windows PowerShell 5.1 turns stderr of a native command into a terminating error when
  # $ErrorActionPreference is 'Stop', even with 2>$null. Run git with 'Continue' and use the exit code.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & git @GitArgs 2>$null
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Remove-Junction([string]$Path) {
  # Non-recursive delete: removes the junction only, never the content of the target.
  [System.IO.Directory]::Delete($Path, $false)
}

$RepoDir = $PSScriptRoot
$Src = Get-NormalizedPath (Join-Path $RepoDir "$Skill\$Skill")
$Targets = @((Join-Path $HOME '.agents\skills'), (Join-Path $HOME '.claude\skills'))

if (-not (Test-Path -LiteralPath (Join-Path $Src 'SKILL.md') -PathType Leaf)) {
  Write-Error "Skill not found: $Src\SKILL.md"
}

if ($Uninstall) {
  foreach ($parent in $Targets) {
    $link = Join-Path $parent $Skill
    $item = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -in @('Junction', 'SymbolicLink') -and ((Get-LinkTarget $item) -ieq $Src)) {
      Remove-Junction $link
      Write-Host "Removed: $link"
    } else {
      Write-Host "Skipped (not a link to this repository): $link"
    }
  }
  return
}

# Release check: a release is installed from a tag, with no local changes.
if (Get-Command git -ErrorAction SilentlyContinue) {
  $tag = Invoke-GitQuiet @('-C', $RepoDir, 'describe', '--exact-match', '--tags')
  if ($tag.ExitCode -eq 0 -and $tag.Output) {
    Write-Host "Release tag: $($tag.Output)"
  } else {
    Write-Warning 'The repository is not at a release tag. This is a development version.'
  }
  $dirty = Invoke-GitQuiet @('-C', $RepoDir, 'status', '--porcelain', '--', "$Skill/$Skill")
  if ($dirty.Output) { Write-Warning 'The skill folder has uncommitted changes.' }
}

# Integrity check: only when the release manifest exists.
$Manifest = Join-Path $RepoDir "$Skill\SHA256SUMS"
if (Test-Path -LiteralPath $Manifest -PathType Leaf) {
  $failed = 0
  foreach ($line in Get-Content -LiteralPath $Manifest) {
    if ($line -notmatch '^([0-9a-fA-F]{64})\s+\*?(.+)$') { continue }
    $expected = $Matches[1].ToLower()
    $file = Join-Path (Join-Path $RepoDir $Skill) ($Matches[2] -replace '/', '\')
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Write-Host "MISSING: $($Matches[2])"; $failed++; continue }
    $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected) { Write-Host "FAILED: $($Matches[2])"; $failed++ }
  }
  if ($failed -gt 0) { Write-Error "Integrity check FAILED ($failed files). Nothing installed." }
  Write-Host 'Integrity check: PASS (authorship is verified separately, see README)'
} else {
  Write-Host 'No SHA256SUMS manifest: integrity check skipped (development version).'
}

foreach ($parent in $Targets) {
  $link = Join-Path $parent $Skill
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $item = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
  if ($item) {
    if ($item.LinkType -in @('Junction', 'SymbolicLink')) {
      $current = Get-LinkTarget $item
      if ($current -ieq $Src) { Write-Host "Already installed: $link"; continue }
      if ($Force) { Remove-Junction $link }
      else { Write-Error "$link points to $current. Use -Force to replace the link." }
    } else {
      Write-Error "$link exists and is not a link. Move or remove it yourself, then run again."
    }
  }
  New-Item -ItemType Junction -Path $link -Target $Src | Out-Null
  Write-Host "Linked: $link -> $Src"
}

Write-Host 'Done. Restart your agent sessions to load the skill.'
