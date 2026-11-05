# batch worker: reads job file, executes rows sequentially, writes progress back
param([string]$JobFile, [string]$Sid)
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Base = 'https://hub.tavo.cc/api'
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'

function New-HubClient {
  $c = New-Object System.Net.Http.HttpClient
  $c.Timeout = [TimeSpan]::FromSeconds(180)
  $c.DefaultRequestHeaders.TryAddWithoutValidation('User-Agent', $UA) | Out-Null
  return $c
}
function Hub-Send([string]$method, [string]$path, $content) {
  $c = New-HubClient
  try {
    $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), ($Base + $path))
    $req.Version = [Version]'1.1'
    if ($Sid) { $req.Headers.Add('x-sid', $Sid) }
    if ($content -ne $null) { $req.Content = $content }
    $resp = $c.SendAsync($req).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    $json = $null
    try { if ($body) { $json = $body | ConvertFrom-Json } } catch {}
    return @{ status = [int]$resp.StatusCode; body = $body; json = $json }
  } finally { $c.Dispose() }
}
function Hub-Get([string]$path) { return Hub-Send 'GET' $path $null }
function Hub-PostJson([string]$path, [object]$obj) {
  $json = $obj | ConvertTo-Json -Depth 12 -Compress
  $content = New-Object System.Net.Http.StringContent($json, [Text.Encoding]::UTF8, 'application/json')
  return Hub-Send 'POST' $path $content
}
function Hub-Multipart([string]$method, [string]$path, [hashtable]$fields, [hashtable]$files) {
  $fc = New-Object System.Net.Http.MultipartFormDataContent
  foreach ($k in $fields.Keys) {
    $sc = New-Object System.Net.Http.StringContent([string]$fields[$k], [Text.Encoding]::UTF8)
    $fc.Add($sc, $k)
  }
  foreach ($k in $files.Keys) {
    $f = $files[$k]
    $bc = New-Object System.Net.Http.ByteArrayContent(, $f.bytes)
    $fc.Add($bc, $k, $f.name)
  }
  return Hub-Send $method $path $fc
}
function Bump-Version([string]$v, [string]$policy) {
  $ver = [Version]$v
  $build = if ($ver.Build -lt 0) { 0 } else { $ver.Build }
  if ($policy -eq 'minor') { return ('{0}.{1}.0' -f $ver.Major, ($ver.Minor + 1)) }
  return ('{0}.{1}.{2}' -f $ver.Major, $ver.Minor, ($build + 1))
}
function Sha256-Hex([byte[]]$bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
}
function Job-Save($job) {
  $json = $job | ConvertTo-Json -Depth 14
  [IO.File]::WriteAllText($JobFile, $json, (New-Object Text.UTF8Encoding($false)))
}
function Trim-Note([string]$s, [int]$n) {
  if ([string]::IsNullOrEmpty($s)) { return '' }
  $s = ($s -replace '\s+', ' ').Trim()
  if ($s.Length -gt $n) { return $s.Substring(0, $n) + '...' }
  return $s
}

$job = [IO.File]::ReadAllText($JobFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
$job.status = 'running'
Job-Save $job

$rows = @($job.rows)
foreach ($row in $rows) {
  $res = @{ file = [string]$row.file; op = [string]$row.op; ok = $false; skipped = $false; note = ''; version = '' }
  try {
    # create works on themes that do not exist on the hub yet, so no hubId is required
    if ($row.op -ne 'create' -and -not $row.hubId) { throw 'no hubId' }

    if ($row.op -eq 'update') {
      $rec = Hub-Get ('/v1/creator/themes/' + $row.hubId)
      if ($rec.status -ge 400) { throw ('get detail ' + $rec.status + ': ' + (Trim-Note $rec.body 150)) }
      $hubName = [string]$row.hubName
      if (-not $hubName) { $hubName = [string]$rec.json.name }
      $policy = 'patch'; if ($row.policy) { $policy = [string]$row.policy }
      $newVer = [string]$row.version
      if (-not $newVer) { $newVer = Bump-Version ([string]$rec.json.latest_version) $policy }
      $res.version = $newVer
      if ($newVer -eq [string]$rec.json.published_version) {
        $res.ok = $true; $res.skipped = $true; $res.note = 'already published ' + $newVer
      } else {
        $thmBytes = [IO.File]::ReadAllBytes([string]$row.file)
        $files = @{ theme_file = @{ name = 'theme-' + $newVer + '.thm'; bytes = $thmBytes } }
        if ($row.coverPath -and (Test-Path -LiteralPath ([string]$row.coverPath))) {
          $files['cover_file'] = @{ name = 'cover.png'; bytes = [IO.File]::ReadAllBytes([string]$row.coverPath) }
        }
        $meta = @{ name = $hubName; version = $newVer } | ConvertTo-Json -Compress
        $r = Hub-Multipart 'POST' ('/v1/creator/themes/' + $row.hubId + '/versions') @{ metadata = $meta } $files
        if ($r.status -ge 400) { throw ('upload ' + $r.status + ': ' + (Trim-Note $r.body 220)) }
        $pj = Hub-PostJson ('/v1/creator/themes/' + $row.hubId + '/publish') @{ version = $newVer }
        if ($pj.status -ge 400) { throw ('publish ' + $pj.status + ': ' + (Trim-Note $pj.body 220)) }
        $res.ok = $true; $res.note = 'published ' + $newVer
      }
    }
    elseif ($row.op -eq 'cover') {
      $rec = Hub-Get ('/v1/creator/themes/' + $row.hubId)
      if ($rec.status -ge 400) { throw ('get detail ' + $rec.status + ': ' + (Trim-Note $rec.body 150)) }
      $hubName = [string]$row.hubName
      if (-not $hubName) { $hubName = [string]$rec.json.name }
      $policy = 'patch'; if ($row.policy) { $policy = [string]$row.policy }
      $newVer = Bump-Version ([string]$rec.json.latest_version) $policy
      $res.version = $newVer
      $coverBytes = [IO.File]::ReadAllBytes([string]$row.coverPath)
      $localSha = Sha256-Hex $coverBytes
      $pub = Hub-Get ('/themes/' + $row.hubId)
      if ($pub.status -lt 400 -and $pub.json -and $pub.json.cover_sha256 -eq $localSha) {
        $res.ok = $true; $res.skipped = $true; $res.note = 'same cover already'
      } else {
        $meta = @{ name = $hubName; version = $newVer } | ConvertTo-Json -Compress
        $r = Hub-Multipart 'POST' ('/v1/creator/themes/' + $row.hubId + '/versions') @{ metadata = $meta } `
          @{ cover_file = @{ name = 'cover.png'; bytes = $coverBytes } }
        if ($r.status -ge 400) { throw ('cover upload ' + $r.status + ': ' + (Trim-Note $r.body 220)) }
        $pj = Hub-PostJson ('/v1/creator/themes/' + $row.hubId + '/publish') @{ version = $newVer }
        if ($pj.status -ge 400) { throw ('publish ' + $pj.status + ': ' + (Trim-Note $pj.body 220)) }
        $res.ok = $true; $res.note = 'cover swapped ' + $newVer
      }
    }
    elseif ($row.op -eq 'publish') {
      $pj = Hub-PostJson ('/v1/creator/themes/' + $row.hubId + '/publish') @{ version = [string]$row.version }
      if ($pj.status -ge 400) { throw ('publish ' + $pj.status + ': ' + (Trim-Note $pj.body 220)) }
      $res.ok = $true; $res.version = [string]$row.version; $res.note = 'published ' + [string]$row.version
    }
    elseif ($row.op -eq 'create') {
      # POST /v1/creator/themes creates AND publishes in one step (response status=published)
      $name = [string]$row.hubName
      if (-not $name) { $name = [string]$row.localName }
      if (-not $name) { throw 'no theme name' }
      $ver = [string]$row.version
      if (-not $ver) { $ver = '1.0.0' }
      $res.version = $ver
      $thmBytes = [IO.File]::ReadAllBytes([string]$row.file)
      $files = @{ theme_file = @{ name = 'theme-' + $ver + '.thm'; bytes = $thmBytes } }
      if ($row.coverPath -and (Test-Path -LiteralPath ([string]$row.coverPath))) {
        $files['cover_file'] = @{ name = 'cover.png'; bytes = [IO.File]::ReadAllBytes([string]$row.coverPath) }
      }
      $meta = @{ name = $name; version = $ver }
      if ($row.externalUrl) { $meta['external_url'] = [string]$row.externalUrl }
      $r = Hub-Multipart 'POST' '/v1/creator/themes' @{ metadata = ($meta | ConvertTo-Json -Compress) } $files
      if ($r.status -ge 400) { throw ('create ' + $r.status + ': ' + (Trim-Note $r.body 220)) }
      $newId = ''
      try { $newId = [string]$r.json.id } catch {}
      $res.ok = $true
      $res.note = 'new theme created + published ' + $ver + $(if ($newId) { ' (id ' + $newId + ')' } else { '' })
    }
    else { throw ('unknown op ' + $row.op) }
  } catch {
    $res.note = Trim-Note $_.Exception.Message 260
  }
  $job.done = [int]$job.done + 1
  $job.results = @($job.results) + @($res)
  Job-Save $job
  Start-Sleep -Milliseconds 1200
}
$job.status = 'done'
Job-Save $job
