<# Removes the Task Scheduler task "TVDeck" (safe to run when it is not installed). Does not stop a running server. #>
$ErrorActionPreference = 'Stop'
$taskName = 'TVDeck'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Task '$taskName' removed."
} else {
  Write-Host "Task '$taskName' is not installed; nothing to do."
}
