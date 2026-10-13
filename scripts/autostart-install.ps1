<#
.SYNOPSIS
  Registers a Task Scheduler task "TVDeck" that starts the production server at logon (hidden).
.DESCRIPTION
  - Runs as the current user, interactive only, no password stored (needed for the launcher window and key injection).
  - Starts 15 s after logon, restarts up to 3 times (1 min apart) if the server exits with an error.
  - Safe to run again: an existing task is replaced.
.PARAMETER Elevated
  Run with highest privileges. Needs an administrator PowerShell. Only useful if you want the phone remote
  to control elevated windows (Windows blocks input from a normal process into an elevated one, UIPI).
#>
[CmdletBinding()]
param([switch]$Elevated)

$ErrorActionPreference = 'Stop'
$taskName = 'TVDeck'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$vbs = Join-Path $PSScriptRoot 'tvdeck-hidden.vbs'

if (-not (Test-Path $vbs)) { throw "Missing $vbs" }
foreach ($d in 'packages\remote\dist\index.html', 'packages\launcher\dist\index.html') {
  if (-not (Test-Path (Join-Path $root $d))) { throw "The apps are not built yet. Run 'npm run build' in $root first." }
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm was not found on PATH.' }

$principalId = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($Elevated) {
  $isAdmin = ([Security.Principal.WindowsPrincipal]$principalId).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { throw '-Elevated needs an administrator PowerShell (right-click, Run as administrator).' }
}
$user = $principalId.Name

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //Nologo `"$vbs`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay = 'PT15S'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$runLevel = if ($Elevated) { 'Highest' } else { 'Limited' }
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel $runLevel

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Replaced the existing '$taskName' task."
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Starts the TVDeck server (phone-remote TV launcher) at logon.' | Out-Null

Write-Host "Task '$taskName' installed for $user (run level: $runLevel)."
Write-Host "  It starts 15 s after you sign in and logs to %LOCALAPPDATA%\TVDeck\logs\tvdeck.log."
Write-Host "  Start it now:  Start-ScheduledTask -TaskName $taskName"
Write-Host "  Remove it:     npm run autostart:remove"
