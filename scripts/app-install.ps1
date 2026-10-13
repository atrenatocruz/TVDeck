# Adds "TVDeck" shortcuts to the Start menu and the Desktop, pointing at app\TVDeck.exe.
# Run through `npm run app:install` (which builds the exe first). Safe to run again.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "app\TVDeck.exe"
if (-not (Test-Path $exe)) { throw "app\TVDeck.exe not found. Run: npm run app:build" }

$shell = New-Object -ComObject WScript.Shell
$places = @(
  (Join-Path ([Environment]::GetFolderPath("Programs")) "TVDeck.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "TVDeck.lnk")
)
foreach ($lnk in $places) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $exe
  $s.WorkingDirectory = $root
  $s.IconLocation = "$exe,0"
  $s.Description = "Open the TVDeck launcher"
  $s.Save()
  Write-Host "created $lnk"
}
Write-Host "Done. Right-click TVDeck in the Start menu to pin it to Start or the taskbar."
