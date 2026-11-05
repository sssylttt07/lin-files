param([string]$Name = 'Lin Hub')
# Create a desktop shortcut to launcher.ps1
$desktop = [Environment]::GetFolderPath('Desktop')
$appDir = $PSScriptRoot
$lnkPath = Join-Path $desktop ($Name + '.lnk')
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnkPath)
$sc.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$sc.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $appDir 'launcher.ps1') + '"'
$sc.WorkingDirectory = $appDir
$sc.IconLocation = (Join-Path $appDir 'icon.ico') + ',0'
$sc.Description = 'Lin Hub (localhost:8791)'
$sc.Save()
Write-Host ('SHORTCUT CREATED: ' + $lnkPath)
