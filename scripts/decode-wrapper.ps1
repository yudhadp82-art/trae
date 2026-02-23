param()
$repo = Split-Path $PSScriptRoot -Parent
$textExt = @('.ts','.tsx','.js','.cjs','.mjs','.json','.svg','.html','.css','.md','.gradle','.properties','.xml','.java','.txt','.yml','.yaml')
$binExt = @('.jar','.png','.jpg','.jpeg','.gif','.webp','.ico','.bin')
$skipNames = @('.env')
$decodedCount = 0
$gitPattern = "$repo\.git\*"
Get-ChildItem -Path $repo -File -Recurse | Where-Object { $_.FullName -notlike $gitPattern } | ForEach-Object {
  $path = $_.FullName
  try {
    $raw = Get-Content -Raw -Path $path -ErrorAction Stop
  } catch { return }
  $name = [System.IO.Path]::GetFileName($path)
  if ($skipNames -contains $name) { return }
  try {
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $obj.data) { return }
    $bytes = [System.Convert]::FromBase64String($obj.data)
  } catch { return }
  $ext = ([System.IO.Path]::GetExtension($path)).ToLowerInvariant()
  if ($binExt -contains $ext) {
    [System.IO.File]::WriteAllBytes($path, $bytes)
  } else {
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $text, $enc)
  }
  $decodedCount++
}
Write-Host \"Decoded: $decodedCount files\"
