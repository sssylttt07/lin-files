# 我的 Tavo Hub 管理器 - 本地服务 (PowerShell 5.1)
# 所有 hub 调用均基于 2026-10-31 实测通过的端点
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.IO.Compression.FileSystem
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir   = Join-Path $Root 'data'
$JobsDir   = Join-Path $Root 'jobs'
$BackupDir = Join-Path $Root 'backups'
$WwwDir    = Join-Path $Root 'www'
foreach ($d in @($DataDir, $JobsDir, $BackupDir)) { if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null } }

$Port         = 8791
$Base         = 'https://hub.tavo.cc/api'    # creator/内容端点 (/v1/...)
$AuthBase     = 'https://ag.tavo.cc/api'     # 账号/登录端点 (accounts/*, auth/*, v2/verification/*) — 2026-10-31 从 SPA 网络请求确认
$UA           = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'
$AccountsFile = Join-Path $DataDir 'accounts.json'
$MappingsFile = Join-Path $DataDir 'mappings.json'

# ---------- 本地私有配置（不入库） ----------
# 真实值放本目录 linhub-config.json（模板见 linhub-config.example.json；该文件必须加入 .gitignore）。
# 令牌/账号也可以不写在这里：运行后在「账号管理」里添加（存 data\<platform>-accounts.json）。
$ConfigFile = Join-Path $Root 'linhub-config.json'
function Get-ConfigValue([string]$key) {
  $cfg = Load-JsonFile $ConfigFile @{}
  if ($cfg -is [System.Collections.IDictionary]) {
    if (-not $cfg.Contains($key)) { return '' }
    return [string]$cfg[$key]
  }
  $p = $cfg.PSObject.Properties[$key]
  if ($p -eq $null) { return '' }
  return [string]$p.Value
}

# ---------- 基础工具 ----------
function Save-JsonFile([object]$obj, [string]$path) {
  $json = $obj | ConvertTo-Json -Depth 14
  [IO.File]::WriteAllText($path, $json, (New-Object Text.UTF8Encoding($false)))
}
function Load-JsonFile([string]$path, $default) {
  if (Test-Path -LiteralPath $path) {
    try { return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { return $default }
  }
  return $default
}
function New-HubClient {
  $c = New-Object System.Net.Http.HttpClient
  $c.Timeout = [TimeSpan]::FromSeconds(180)
  $c.DefaultRequestHeaders.TryAddWithoutValidation('User-Agent', $UA) | Out-Null
  return $c
}
# 统一 hub 请求: 返回 @{ status=int; body=string; json=object|null }
function Hub-Send([string]$method, [string]$path, [string]$sid, $content) {
  $c = New-HubClient
  try {
    $url = if ($path -like 'http*') { $path } else { $Base + $path }
    $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), $url)
    $req.Version = [Version]'1.1'
    if ($sid) { $req.Headers.Add('x-sid', $sid) }
    if ($content -ne $null) { $req.Content = $content }
    $resp = $c.SendAsync($req).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    $json = $null
    try { if ($body) { $json = $body | ConvertFrom-Json } } catch {}
    return @{ status = [int]$resp.StatusCode; body = $body; json = $json }
  } finally { $c.Dispose() }
}
function Hub-Get([string]$path, [string]$sid)   { return Hub-Send 'GET' $path $sid $null }
function Hub-PostJson([string]$path, [object]$obj, [string]$sid) {
  $json = $obj | ConvertTo-Json -Depth 12 -Compress
  $content = New-Object System.Net.Http.StringContent($json, [Text.Encoding]::UTF8, 'application/json')
  return Hub-Send 'POST' $path $sid $content
}
function Hub-PatchJson([string]$path, [object]$obj, [string]$sid) {
  $json = $obj | ConvertTo-Json -Depth 12 -Compress
  $content = New-Object System.Net.Http.StringContent($json, [Text.Encoding]::UTF8, 'application/json')
  return Hub-Send 'PATCH' $path $sid $content
}
function Hub-Multipart([string]$method, [string]$path, [string]$sid, [hashtable]$fields, [hashtable]$files) {
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
  return Hub-Send $method $path $sid $fc
}
# 字符串 multipart part (用于从磁盘读文件后以 ByteArray 提交, 避免流占用)
function Hub-GetRawBytes([string]$path, [string]$sid) {
  $c = New-HubClient
  try {
    $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod('GET')), ($Base + $path))
    $req.Version = [Version]'1.1'
    if ($sid) { $req.Headers.Add('x-sid', $sid) }
    $req.Headers.TryAddWithoutValidation('Accept', 'application/json') | Out-Null
    $resp = $c.SendAsync($req).Result
    $bytes = $resp.Content.ReadAsByteArrayAsync().Result
    return @{ status = [int]$resp.StatusCode; bytes = $bytes }
  } finally { $c.Dispose() }
}
# 主题/插件列表磁盘缓存（上游 21MB + 25 秒：6 个 worker 不共享内存，改存 data\cache\ 共享；
# 10 分钟内直接读盘，上游失败时用旧缓存兜底，重启后也有效）
function Get-HubListCached([string]$kind, [string]$sid) {
  $cacheDir = Join-Path $Root 'data\cache'
  if (-not (Test-Path -LiteralPath $cacheDir)) { New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null }
  $f = Join-Path $cacheDir ($kind + '.json')
  if (Test-Path -LiteralPath $f) {
    $age = ((Get-Date) - (Get-Item -LiteralPath $f).LastWriteTime).TotalMilliseconds
    if ($age -lt 600000) { return @{ status = 200; bytes = [IO.File]::ReadAllBytes($f) } }
  }
  $r = Hub-GetRawBytes ('/v1/creator/' + $kind) $sid
  if ($r.status -lt 400 -and $r.bytes) {
    [IO.File]::WriteAllBytes($f, $r.bytes)
    return $r
  }
  if (Test-Path -LiteralPath $f) { return @{ status = 200; bytes = [IO.File]::ReadAllBytes($f) } }
  return $r
}
# 大响应(列表带全部 manifest, >2MB)直接透传, 绕开 PS5.1 ConvertFrom-Json 的 MaxJsonLength 限制
function Send-RawJson($ctx, [byte[]]$bytes) {
  try {
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentType = 'application/json; charset=utf-8'
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {}
  try { $ctx.Response.OutputStream.Close() } catch {}
}
function Read-FileBytes([string]$p) { return [IO.File]::ReadAllBytes($p) }

# 路径归一化：Windows「复制为路径」会给整条路径加双引号，也常见全角引号/首尾空格。
# 前后端都做一次，前端只影响显示，后端保证真正可用。
function Normalize-Path([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return '' }
  $v = $p.Trim()
  $quotes = [char[]]@([char]0x22, [char]0x27, [char]0x201C, [char]0x201D, [char]0x2018, [char]0x2019)
  for ($i = 0; $i -lt 3; $i++) {
    $t = $v.Trim($quotes).Trim()
    if ($t -eq $v) { break }
    $v = $t
  }
  # 连续反斜杠压成单反斜杠（保留 UNC 开头的 \\）
  if ($v -notmatch '^\\\\') { $v = $v -replace '\\{2,}', '\' }
  return $v
}
function Short-Text([string]$s, [int]$n = 300) {
  if ([string]::IsNullOrEmpty($s)) { return '' }
  $s = ($s -replace '\s+', ' ').Trim()
  if ($s.Length -gt $n) { return $s.Substring(0, $n) + '...' }
  return $s
}

# ---------- Gitee 发布台 ----------
$script:GiteeApi = 'https://gitee.com/api/v5'
$GiteeFile = Join-Path $DataDir 'gitee.json'
function Gitee-ProjectsArrayJson {
  $g = Load-JsonFile $GiteeFile @{}
  $items = @()
  if ($g -and $g.projects) { $items = @($g.projects) }
  $parts = @()
  foreach ($it in $items) { if ($it -ne $null) { $parts += ($it | ConvertTo-Json -Compress -Depth 6) } }
  return ('[' + ($parts -join ',') + ']')
}
# PS 会把单元素数组序列化成对象，前端 .map 会崩 → projects 一律手工拼成真数组
function Get-GiteeProjectsJson {
  $g = Load-JsonFile $GiteeFile @{}
  $org = $(if ($g.org) { [string]$g.org } else { 'OFFAXIS' })
  $repo = $(if ($g.repo) { [string]$g.repo } else { Get-ConfigValue 'giteeRepo' })
  return ('{"org":' + ($org | ConvertTo-Json) + ',"repo":' + ($repo | ConvertTo-Json) + ',"projects":' + (Gitee-ProjectsArrayJson) + '}')
}
function Merge-GiteeProjectsJson($obj) {
  $base = $obj | ConvertTo-Json -Compress -Depth 6
  return ($base.TrimEnd('}') + ',"projects":' + (Gitee-ProjectsArrayJson) + '}')
}
function Get-GiteeToken {
  $t = Get-PlatformToken 'gitee'
  $cg = Get-ConfigValue 'giteeToken'
  if ($cg) { return $cg }
  if ($t) { return $t }
  $g = Load-JsonFile $GiteeFile @{}
  if ($g -and $g.token) { return [string]$g.token }
  $tp = Join-Path $DataDir 'gitee-token.txt'
  if (Test-Path -LiteralPath $tp) { return ([IO.File]::ReadAllText($tp, [Text.Encoding]::UTF8)).Trim() }
  return ''
}
function Gitee-Req([string]$method, [string]$relPath, [string]$token, [byte[]]$bodyBytes) {
  $c = New-HubClient
  try {
    $sep = if ($relPath.Contains('?')) { '&' } else { '?' }
    $url = $script:GiteeApi + $relPath + $sep + 'access_token=' + [Uri]::EscapeDataString($token)
    $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), $url)
    if ($bodyBytes) {
      $sc = New-Object System.Net.Http.ByteArrayContent(, $bodyBytes)
      $sc.Headers.TryAddWithoutValidation('Content-Type', 'application/json; charset=utf-8') | Out-Null
      $req.Content = $sc
    }
    $resp = $c.SendAsync($req).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    $json = $null
    try { if ($body) { $json = $body | ConvertFrom-Json } } catch {}
    return @{ status = [int]$resp.StatusCode; body = $body; json = $json }
  } finally { $c.Dispose() }
}
function Gitee-Upload([string]$relPath, [string]$token, [string]$fileName, [byte[]]$bytes) {
  $c = New-HubClient
  try {
    $url = $script:GiteeApi + $relPath + '?access_token=' + [Uri]::EscapeDataString($token)
    $fc = New-Object System.Net.Http.MultipartFormDataContent
    $bc = New-Object System.Net.Http.ByteArrayContent(, $bytes)
    $fc.Add($bc, 'file', $fileName)
    $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $url)
    $req.Content = $fc
    $resp = $c.SendAsync($req).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    $json = $null
    try { if ($body) { $json = $body | ConvertFrom-Json } } catch {}
    return @{ status = [int]$resp.StatusCode; body = $body; json = $json }
  } finally { $c.Dispose() }
}

# ---------- GitHub 发布台 ----------
# 推送方式与 Gitee 一致：每个版本一个 tag + Release，包作为 Release 附件上传。
# GitHub 附件走 uploads.github.com（raw body + query name），令牌走 Authorization 头（不放 query）。
$script:GitHubApi = 'https://api.github.com'
$script:GitHubUp  = 'https://uploads.github.com'
$GitHubFile = Join-Path $DataDir 'github.json'
function GitHub-ProjectsArrayJson {
  $g = Load-JsonFile $GitHubFile @{}
  $items = @()
  if ($g -and $g.projects) { $items = @($g.projects) }
  $parts = @()
  foreach ($it in $items) { if ($it -ne $null) { $parts += ($it | ConvertTo-Json -Compress -Depth 6) } }
  return ('[' + ($parts -join ',') + ']')
}
function Get-GitHubProjectsJson {
  $g = Load-JsonFile $GitHubFile @{}
  $owner = $(if ($g.owner) { [string]$g.owner } else { '' })
  $repo = $(if ($g.repo) { [string]$g.repo } else { '' })
  return ('{"owner":' + ($owner | ConvertTo-Json) + ',"repo":' + ($repo | ConvertTo-Json) + ',"projects":' + (GitHub-ProjectsArrayJson) + '}')
}
function Merge-GitHubProjectsJson($obj) {
  $base = $obj | ConvertTo-Json -Compress -Depth 6
  return ($base.TrimEnd('}') + ',"projects":' + (GitHub-ProjectsArrayJson) + '}')
}
function Get-GitHubToken {
  $t = Get-PlatformToken 'github'
  if ($t) { return $t }
  $g = Load-JsonFile $GitHubFile @{}
  if ($g -and $g.token) { return [string]$g.token }
  $tp = Join-Path $DataDir 'github-token.txt'
  if (Test-Path -LiteralPath $tp) { return ([IO.File]::ReadAllText($tp, [Text.Encoding]::UTF8)).Trim() }
  return ''
}
function GitHub-Req([string]$method, [string]$url, [string]$token, [byte[]]$bodyBytes) {
  $c = New-HubClient
  try {
    $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), $url)
    $req.Headers.TryAddWithoutValidation('Authorization', ('Bearer ' + $token)) | Out-Null
    $req.Headers.TryAddWithoutValidation('Accept', 'application/vnd.github+json') | Out-Null
    $req.Headers.TryAddWithoutValidation('X-GitHub-Api-Version', '2022-11-28') | Out-Null
    if ($bodyBytes) {
      $sc = New-Object System.Net.Http.ByteArrayContent(, $bodyBytes)
      $sc.Headers.TryAddWithoutValidation('Content-Type', 'application/json; charset=utf-8') | Out-Null
      $req.Content = $sc
    }
    $resp = $c.SendAsync($req).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    $json = $null
    try { if ($body) { $json = $body | ConvertFrom-Json } } catch {}
    return @{ status = [int]$resp.StatusCode; body = $body; json = $json }
  } finally { $c.Dispose() }
}
function GitHub-UploadAsset([string]$owner, [string]$repo, [string]$relId, [string]$fileName, [byte[]]$bytes, [string]$token) {
  $c = New-HubClient
  try {
    $url = $script:GitHubUp + '/repos/' + $owner + '/' + $repo + '/releases/' + $relId + '/assets?name=' + [Uri]::EscapeDataString($fileName)
    $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $url)
    $req.Headers.TryAddWithoutValidation('Authorization', ('Bearer ' + $token)) | Out-Null
    $req.Headers.TryAddWithoutValidation('Accept', 'application/vnd.github+json') | Out-Null
    $bc = New-Object System.Net.Http.ByteArrayContent(, $bytes)
    $bc.Headers.TryAddWithoutValidation('Content-Type', 'application/octet-stream') | Out-Null
    $req.Content = $bc
    $resp = $c.SendAsync($req).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    $json = $null
    try { if ($body) { $json = $body | ConvertFrom-Json } } catch {}
    return @{ status = [int]$resp.StatusCode; body = $body; json = $json }
  } finally { $c.Dispose() }
}

# ---------- 平台账号（Gitee / GitHub 多令牌管理） ----------
# 每个平台一个 data\<platform>-accounts.json：{ items: [{id,name,login,token,created}], active }
# 推送时取 active 账号的令牌；首次读取时自动把 gitee.json / github.json 里的旧单令牌迁移进来
$BindingsFile = Join-Path $DataDir 'bindings.json'
function Get-PlatformAccountsFile([string]$platform) { return Join-Path $DataDir ($platform + '-accounts.json') }
function Save-PlatformAccountsStore($store) {
  Save-JsonFile @{ items = @($store.items); active = [string]$store.active } (Get-PlatformAccountsFile $store.platform)
}
function Get-PlatformAccountsStore([string]$platform) {
  $data = Load-JsonFile (Get-PlatformAccountsFile $platform) $null
  $items = @(); $active = ''
  if ($data -ne $null) {
    $items = @($data.items | Where-Object { $_ -ne $null })
    $active = [string]$data.active
  }
  if ($items.Count -eq 0) {
    $legacyPath = Join-Path $DataDir ($platform + '.json')
    $legacy = Load-JsonFile $legacyPath @{}
    if ($legacy -and $legacy.token) {
      $items = @(@{ id = [Guid]::NewGuid().ToString('N'); name = '旧令牌'; login = ''; token = [string]$legacy.token; created = (Get-Date -Format s) })
      $active = [string]$items[0].id
      Save-PlatformAccountsStore @{ platform = $platform; items = $items; active = $active }
    }
  }
  if ($items.Count -gt 0 -and -not ($items | Where-Object { $_.id -eq $active })) { $active = [string]$items[0].id }
  return @{ platform = $platform; items = $items; active = $active }
}
function Get-PlatformToken([string]$platform) {
  $s = Get-PlatformAccountsStore $platform
  $a = $s.items | Where-Object { $_.id -eq $s.active } | Select-Object -First 1
  if ($a -and $a.token) { return [string]$a.token }
  return ''
}
# 验证令牌并取账号身份；无效返回 $null
function Verify-PlatformToken([string]$platform, [string]$token) {
  try {
    if ($platform -eq 'gitee') {
      $r = Gitee-Req 'GET' '/user' $token $null
      if ($r.status -ge 400) { return $null }
      return @{ login = [string]$r.json.login; name = [string]$r.json.name }
    }
    $r = GitHub-Req 'GET' ($script:GitHubApi + '/user') $token $null
    if ($r.status -ge 400) { return $null }
    return @{ login = [string]$r.json.login; name = [string]$r.json.name }
  } catch { return $null }
}

# ---------- 本地库（.thm/.tpg 扫描 + 手动绑定在线库） ----------
function Get-ThmInfo([string]$thmPath) {
  try {
    $zip = [IO.Compression.ZipFile]::OpenRead($thmPath)
    try {
      $entry = $zip.Entries | Where-Object { $_.Name -ieq 'theme.json' } | Select-Object -First 1
      if (-not $entry) { return $null }
      $sr = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8)
      $txt = $sr.ReadToEnd(); $sr.Close()
      $o = $txt | ConvertFrom-Json
      return @{ name = [string]$o.name; version = [string]$o.version }
    } finally { $zip.Dispose() }
  } catch { return $null }
}
# 绑定表用数组记录（data\bindings.json = { items: [{file, hubThemeId, ...}] }）。
# 坑：PS5.1 里对 Hashtable 用 PSObject.Properties 会把 CLR 属性（Count/Keys/SyncRoot…）当数据拷进去，
# 且 Hashtable 的同名键会遮蔽 .Count —— 所以绑定表绝不能用「哈希表当字典」的形态做 JSON 往返。
function Get-BindingItems {
  $data = Load-JsonFile $BindingsFile $null
  $items = @()
  if ($data -ne $null -and $data.items) { $items = @($data.items | Where-Object { $_ -ne $null }) }
  return $items
}
function Save-BindingItems($items) {
  Save-JsonFile @{ items = @($items) } $BindingsFile
}
function Get-BindingFor([string]$file, $items) {
  foreach ($it in @($items)) {
    if ($it -ne $null -and [string]$it.file -ieq $file) { return $it }
  }
  return $null
}
# 绑定字段白名单；四个绑定目标全空 = 解除绑定
function Clean-Binding($bind) {
  $bind = Obj-ToHashtable $bind
  $clean = @{}
  foreach ($k in @('file', 'hubThemeId', 'hubThemeName', 'hubPluginId', 'giteeProjectId', 'githubProjectId', 'note')) {
    $clean[$k] = [string]$bind[$k]
  }
  return $clean
}

# ---------- 插件 metadata ----------
# hub 只接受 6 个分类 key 中的一个，且 external_url 为空时父前端会整个字段省略
# （见 SPA admin2.js 的 Wu(): JSON.stringify({name, external_url, tags:[categoryTag], description?})）
$script:PluginTagKeys = @('memory', 'gameplay', 'chat', 'creation', 'appearance', 'utilities')
function Build-PluginMetadata($body) {
  $name = ([string]$body.name).Trim()

  $tags = @()
  foreach ($t in @($body.tags)) {
    $k = ([string]$t).Trim().ToLower()
    if ($k) { $tags += $k }
  }
  $tags = @($tags | Select-Object -Unique)
  if ($tags.Count -eq 0) { return @{ error = ('请选择分类标签（' + ($script:PluginTagKeys -join ' / ') + '）') } }
  if ($tags.Count -gt 1) { return @{ error = 'hub 只接受一个分类标签，请只选一个' } }
  if ($script:PluginTagKeys -notcontains $tags[0]) {
    return @{ error = ('标签无效："' + $tags[0] + '"，必须是 ' + ($script:PluginTagKeys -join ' / ') + ' 之一') }
  }

  $meta = [ordered]@{ name = $name; tags = @($tags[0]) }
  $url = ([string]$body.externalUrl).Trim()
  if ($url) {
    if ($url -notmatch '^https?://') { return @{ error = '外链必须以 http:// 或 https:// 开头（可留空）' } }
    $meta['external_url'] = $url
  }
  $desc = ([string]$body.description).Trim()
  if ($desc) { $meta['description'] = $desc }
  return @{ meta = $meta }
}

# ---------- 账号 ----------
# 账号状态一律以 accounts.json 为准（每个请求都重读）：服务是多线程的，
# 内存缓存会让不同 worker 看到不一样的账号列表。
function Get-AccountsStore {
  $data = Load-JsonFile $AccountsFile $null
  $items = @()
  $active = ''
  if ($data -ne $null) {
    $items = @($data.items | Where-Object { $_ -ne $null })
    $active = [string]$data.active
  }
  if ($items.Count -eq 0) {
    # 本地配置播种：linhub-config.json 的 hubAccount {sid, name}（模板见 linhub-config.example.json）
    $cfg = Load-JsonFile $ConfigFile @{}
    $ha = $null
    if ($cfg -is [System.Collections.IDictionary]) { if ($cfg.Contains('hubAccount')) { $ha = $cfg['hubAccount'] } }
    else { $hp = $cfg.PSObject.Properties['hubAccount']; if ($hp) { $ha = $hp.Value } }
    if ($ha -ne $null) {
      $h = Obj-ToHashtable $ha
      $seedSid = [string]$h['sid']
      if ($seedSid) {
        $seedName = [string]$h['name']
        if (-not $seedName) { $seedName = 'config 账号' }
        $items = @(@{ id = 'config-hub-account'; name = $seedName; email = ''; sid = $seedSid; revision = ''; created = '' })
        $active = 'config-hub-account'
      }
    }
  }
  if ($items.Count -gt 0 -and -not ($items | Where-Object { $_.id -eq $active })) {
    $active = [string]$items[0].id
  }
  return @{ items = $items; active = $active }
}
function Save-AccountsStore($store) {
  Save-JsonFile @{ items = @($store.items); active = [string]$store.active } $AccountsFile
}
function Get-ActiveAccount {
  $s = Get-AccountsStore
  $a = $s.items | Where-Object { $_.id -eq $s.active } | Select-Object -First 1
  return $a
}
function Get-ActiveSid {
  $a = Get-ActiveAccount
  if ($a) { return [string]$a.sid }
  return ''
}
function Account-Add([string]$name, [string]$email, [string]$sid, [string]$revision) {
  $s = Get-AccountsStore
  $existing = $s.items | Where-Object { $_.sid -eq $sid } | Select-Object -First 1
  if ($existing) {
    $s.active = [string]$existing.id
    Save-AccountsStore $s
    return @{ account = $existing; added = $false }
  }
  $acc = @{ id = [Guid]::NewGuid().ToString('N'); name = $name; email = $email; sid = $sid; revision = $revision; created = (Get-Date -Format s) }
  $s.items = @($s.items) + @($acc)
  $s.active = [string]$acc.id
  Save-AccountsStore $s
  return @{ account = $acc; added = $true }
}

# ---------- 本地包解析 ----------
function Get-ThmName([string]$thmPath) {
  try {
    $zip = [IO.Compression.ZipFile]::OpenRead($thmPath)
    try {
      $entry = $zip.Entries | Where-Object { $_.Name -ieq 'theme.json' } | Select-Object -First 1
      if (-not $entry) { return $null }
      $sr = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8)
      $txt = $sr.ReadToEnd(); $sr.Close()
      return (($txt | ConvertFrom-Json).name)
    } finally { $zip.Dispose() }
  } catch { return $null }
}
function Get-TpgManifest([string]$tpgPath) {
  try {
    $zip = [IO.Compression.ZipFile]::OpenRead($tpgPath)
    try {
      $entry = $zip.Entries | Where-Object { $_.Name -ieq 'manifest.json' } | Select-Object -First 1
      if (-not $entry) { return $null }
      $sr = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8)
      $txt = $sr.ReadToEnd(); $sr.Close()
      return ($txt | ConvertFrom-Json)
    } finally { $zip.Dispose() }
  } catch { return $null }
}
function Bump-Version([string]$v, [string]$policy) {
  $ver = [Version]$v
  $build = if ($ver.Build -lt 0) { 0 } else { $ver.Build }
  if ($policy -eq 'minor') { return ('{0}.{1}.0' -f $ver.Major, ($ver.Minor + 1)) }
  return ('{0}.{1}.{2}' -f $ver.Major, $ver.Minor, ($build + 1))
}

# ---------- 浏览器会话导入 (leveldb 扫描, 兼容前缀压缩) ----------
function Import-BrowserSessions {
  $base = Get-ConfigValue 'braveUserData'
  if (-not $base) { $base = Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\User Data' }
  $dirs = @()
  if (Test-Path $base) { $dirs += Get-ChildItem $base -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'Local Storage\leveldb') } }
  $alt = Get-ConfigValue 'chromeUserData'
  if (-not $alt) { $alt = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data' }
  if (Test-Path $alt) { $dirs += Get-ChildItem $alt -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'Local Storage\leveldb') } }
  $sids = @{}
  foreach ($d in $dirs) {
    $ldb = Join-Path $d.FullName 'Local Storage\leveldb'
    Get-ChildItem $ldb -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.log', '.ldb' } | ForEach-Object {
      try {
        $text = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($_.FullName))
        foreach ($m in [Regex]::Matches($text, '\{[^{}]*?"sid"\s*:\s*"[0-9a-fA-F-]{36}"[^{}]*?"revision"\s*:\s*"[0-9a-fA-F-]{36}"[^{}]*?\}')) {
          try {
            $o = $m.Value | ConvertFrom-Json
            if ($o.sid -and -not $sids.ContainsKey($o.sid)) { $sids[$o.sid] = [string]$o.revision }
          } catch {}
        }
      } catch {}
    }
  }
  return $sids
}

# ---------- HTTP 响应 ----------
function Send-Json($ctx, [int]$code, $obj) {
  try {
    # 传字符串时视为已序列化好的 JSON 原样发送（用于手工拼数组等场景）
    $json = if ($obj -is [string]) { $obj } else { $obj | ConvertTo-Json -Depth 14 -Compress }
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = 'application/json; charset=utf-8'
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {}
  try { $ctx.Response.OutputStream.Close() } catch {}
}
function Send-Bytes($ctx, [byte[]]$bytes, [string]$type) {
  try {
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentType = $type
    # 本地工具：绝不缓存静态资源，改完 js/css 刷新即生效
    $ctx.Response.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    $ctx.Response.Headers['Pragma'] = 'no-cache'
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {}
  try { $ctx.Response.OutputStream.Close() } catch {}
}
function Read-BodyJson($ctx) {
  $sr = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
  $raw = $sr.ReadToEnd(); $sr.Close()
  if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
  try { return ($raw | ConvertFrom-Json) } catch { return @{} }
}
function Obj-ToHashtable($o) {
  $h = @{}
  if ($o -eq $null) { return $h }
  # 坑：Hashtable 的 PSObject.Properties 会给出 CLR 属性（Count/Keys/SyncRoot…）而非键值对，
  # 拷进新表后同名键 'Count' 还会遮蔽 .Count。IDictionary 一律走 Keys/Values。
  if ($o -is [System.Collections.IDictionary]) {
    foreach ($k in $o.Keys) { $h[[string]$k] = $o[$k] }
    return $h
  }
  foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }
  return $h
}

# ---------- 静态文件 ----------
$script:StaticMap = @{
  '/'       = @{ file = 'app.html'; type = 'text/html; charset=utf-8' }
  '/app.js' = @{ file = 'app.js';   type = 'text/javascript; charset=utf-8' }
  '/app.css' = @{ file = 'app.css'; type = 'text/css; charset=utf-8' }
}

# ================= 路由 =================
function Handle-Api($ctx, [string]$path, [string]$method) {
  $body = Obj-ToHashtable (Read-BodyJson $ctx)
  $qs = $ctx.Request.QueryString
  $sid = Get-ActiveSid

  # ---- 无需登录 ----
  if ($path -eq '/api/login/code' -and $method -eq 'POST') {
    $email = [string]$body.email
    if (-not $email) { Send-Json $ctx 400 @{ error = 'email required' }; return }
    $r = Hub-PostJson ($AuthBase + '/v2/verification/email') @{ template = 'register'; email = $email } ''
    Send-Json $ctx $r.status @{ ok = ($r.status -ge 200 -and $r.status -lt 300); status = $r.status; body = $r.body }
    return
  }
  if ($path -eq '/api/login' -and $method -eq 'POST') {
    $email = [string]$body.email; $vcode = [string]$body.code; $name = [string]$body.name
    if (-not $email -or -not $vcode) { Send-Json $ctx 400 @{ error = 'email/code required' }; return }
    $ex = Hub-Get ($AuthBase + '/accounts/exists?email=' + [Uri]::EscapeDataString($email)) ''
    if ($ex.status -ge 400) { Send-Json $ctx 502 @{ error = 'exists check failed'; status = $ex.status; body = $ex.body }; return }
    $exists = $false
    try { $exists = [bool]$ex.json.exists } catch { if ($ex.json -is [bool]) { $exists = $ex.json } }
    if ($exists) { $r = Hub-PostJson ($AuthBase + '/auth/email') @{ email = $email; vcode = $vcode } '' }
    else { $r = Hub-PostJson ($AuthBase + '/accounts') @{ email = $email; vcode = $vcode; channel = 'official-tavo'; device = 'tavo-hub-manager' } '' }
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ error = 'login rejected'; status = $r.status; body = $r.body }; return }
    $newSid = [string]$r.json.sid
    if (-not $newSid) { Send-Json $ctx 502 @{ error = 'no sid in response'; body = $r.body }; return }
    $rev = ''
    try { $rev = [string]$r.json.revision } catch {}
    $disp = if ($name) { $name } else { $email.Split('@')[0] }
    $res = Account-Add $disp $email $newSid $rev
    $acc = $res.account
    Send-Json $ctx 200 @{ ok = $true; account = @{ id = $acc.id; name = $acc.name; email = $email } }
    return
  }
  if ($path -eq '/api/import-browser' -and $method -eq 'POST') {
    $found = Import-BrowserSessions
    if ($found.Count -eq 0) { Send-Json $ctx 200 @{ ok = $true; added = @(); note = '浏览器 leveldb 中未找到 hub 会话（浏览器需登录过 hub.tavoai.dev 且已完全关闭）' }; return }
    $added = @()
    $n = 1
    foreach ($k in $found.Keys) {
      $res = Account-Add ('浏览器导入 ' + $n) '' $k ([string]$found[$k])
      if ($res.added) { $added += @{ id = $res.account.id; name = $res.account.name } }
      $n++
    }
    Send-Json $ctx 200 @{ ok = $true; added = $added; total = $found.Count }
    return
  }
  if ($path -eq '/api/accounts' -and $method -eq 'GET') {
    $store = Get-AccountsStore
    $items = @($store.items | ForEach-Object {
      $m = [string]$_.sid
      if ($m.Length -gt 10) { $m = $m.Substring(0, 8) + '…' + $m.Substring($m.Length - 4) }
      @{ id = $_.id; name = $_.name; email = $_.email; sidMasked = $m; created = $_.created }
    })
    Send-Json $ctx 200 @{ active = $store.active; items = $items }
    return
  }
  if ($path -eq '/api/accounts/select' -and $method -eq 'POST') {
    $store = Get-AccountsStore
    $a = $store.items | Where-Object { $_.id -eq [string]$body.id } | Select-Object -First 1
    if (-not $a) { Send-Json $ctx 404 @{ error = 'account not found' }; return }
    $store.active = [string]$a.id
    Save-AccountsStore $store
    Send-Json $ctx 200 @{ ok = $true; active = $store.active }
    return
  }
  if ($path -eq '/api/accounts/delete' -and $method -eq 'POST') {
    $store = Get-AccountsStore
    $store.items = @($store.items | Where-Object { $_.id -ne [string]$body.id })
    if (-not ($store.items | Where-Object { $_.id -eq $store.active })) {
      if ($store.items.Count -gt 0) { $store.active = [string]$store.items[0].id } else { $store.active = '' }
    }
    Save-AccountsStore $store
    Send-Json $ctx 200 @{ ok = $true }
    return
  }
  if ($path -eq '/api/accounts/manual' -and $method -eq 'POST') {
    $mSid = ([string]$body.sid).Trim()
    if (-not $mSid) { Send-Json $ctx 400 @{ error = 'sid required' }; return }
    $chk = Hub-Get ($AuthBase + '/accounts/me') $mSid
    if ($chk.status -ge 400) { Send-Json $ctx $chk.status @{ error = 'sid 校验失败'; status = $chk.status; body = $chk.body }; return }
    $res = Account-Add ([string]$body.name) '' $mSid ''
    Send-Json $ctx 200 @{ ok = $true; account = @{ id = $res.account.id; name = $res.account.name } }
    return
  }

  # ---- 以下需要登录 ----
  if (-not $sid) { Send-Json $ctx 401 @{ error = 'no account; 请先添加账号' }; return }

  if ($path -eq '/api/session/check' -and $method -eq 'GET') {
    $r = Hub-Get ($AuthBase + '/accounts/me') $sid
    $ok = ($r.status -ge 200 -and $r.status -lt 300)
    $email = ''; $uname = ''
    try { if ($r.json) { $email = [string]$r.json.email; $uname = [string]$r.json.name } } catch {}
    Send-Json $ctx 200 @{ ok = $ok; status = $r.status; email = $email; name = $uname }
    return
  }
  if ($path -eq '/api/themes' -and $method -eq 'GET') {
    $r = Get-HubListCached 'themes' $sid
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ status = $r.status; error = '获取主题列表失败'; body = [Text.Encoding]::UTF8.GetString($r.bytes[0..([Math]::Min(400, $r.bytes.Length - 1))]) }; return }
    Send-RawJson $ctx $r.bytes
    return
  }
  if ($path -eq '/api/plugins' -and $method -eq 'GET') {
    $r = Get-HubListCached 'plugins' $sid
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ status = $r.status; error = '获取插件列表失败'; body = [Text.Encoding]::UTF8.GetString($r.bytes[0..([Math]::Min(400, $r.bytes.Length - 1))]) }; return }
    Send-RawJson $ctx $r.bytes
    return
  }
  if ($path -eq '/api/theme' -and $method -eq 'GET') {
    $id = [string]$qs['id']
    if ($id -notmatch '^[0-9a-fA-F]+$') { Send-Json $ctx 400 @{ error = 'bad id' }; return }
    $r = Hub-GetRawBytes ('/v1/creator/themes/' + $id) $sid
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ error = '获取主题详情失败' }; return }
    Send-RawJson $ctx $r.bytes
    return
  }
  if ($path -eq '/api/theme/publish' -and $method -eq 'POST') {
    $r = Hub-PostJson ('/v1/creator/themes/' + [string]$body.id + '/publish') @{ version = [string]$body.version } $sid
    Send-Json $ctx $r.status @{ status = $r.status; data = $r.json; body = $r.body }
    return
  }
  if ($path -eq '/api/theme/external-url' -and $method -eq 'POST') {
    $r = Hub-PatchJson ('/v1/creator/themes/' + [string]$body.id) @{ external_url = [string]$body.url } $sid
    Send-Json $ctx $r.status @{ status = $r.status; data = $r.json; body = $r.body }
    return
  }
  if ($path -eq '/api/theme/cover' -and $method -eq 'POST') {
    $id = [string]$body.id; $coverPath = Normalize-Path ([string]$body.coverPath)
    if (-not (Test-Path -LiteralPath $coverPath)) { Send-Json $ctx 400 @{ error = '封面文件不存在: ' + $coverPath }; return }
    $rec = Hub-Get ('/v1/creator/themes/' + $id) $sid
    if ($rec.status -ge 400) { Send-Json $ctx $rec.status @{ error = '获取主题失败'; body = $rec.body }; return }
    $hubName = [string]$rec.json.name
    $newVer = Bump-Version ([string]$rec.json.latest_version) ([string]$body.policy)
    $cb = Read-FileBytes $coverPath
    $r = Hub-Multipart 'POST' ('/v1/creator/themes/' + $id + '/versions') $sid `
      @{ metadata = (@{ name = $hubName; version = $newVer } | ConvertTo-Json -Compress) } `
      @{ cover_file = @{ name = 'cover.png'; bytes = $cb } }
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ error = '上传封面版本失败'; status = $r.status; body = $r.body }; return }
    $pj = Hub-PostJson ('/v1/creator/themes/' + $id + '/publish') @{ version = $newVer } $sid
    Send-Json $ctx 200 @{ ok = ($pj.status -ge 200 -and $pj.status -lt 300); version = $newVer; publish = $pj.json; publishBody = $pj.body }
    return
  }
  if ($path -eq '/api/theme/upload' -and $method -eq 'POST') {
    $id = [string]$body.id; $thmPath = Normalize-Path ([string]$body.thmPath); $coverPath = Normalize-Path ([string]$body.coverPath)
    if (-not (Test-Path -LiteralPath $thmPath)) { Send-Json $ctx 400 @{ error = '主题文件不存在: ' + $thmPath }; return }
    $rec = Hub-Get ('/v1/creator/themes/' + $id) $sid
    if ($rec.status -ge 400) { Send-Json $ctx $rec.status @{ error = '获取主题失败'; body = $rec.body }; return }
    $hubName = [string]$rec.json.name
    $newVer = [string]$body.version
    if (-not $newVer) { $newVer = Bump-Version ([string]$rec.json.latest_version) ([string]$body.policy) }
    $files = @{ theme_file = @{ name = 'theme-' + $newVer + '.thm'; bytes = (Read-FileBytes $thmPath) } }
    if ($coverPath -and (Test-Path -LiteralPath $coverPath)) { $files['cover_file'] = @{ name = 'cover.png'; bytes = (Read-FileBytes $coverPath) } }
    $r = Hub-Multipart 'POST' ('/v1/creator/themes/' + $id + '/versions') $sid `
      @{ metadata = (@{ name = $hubName; version = $newVer } | ConvertTo-Json -Compress) } $files
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ error = '上传失败'; status = $r.status; body = $r.body }; return }
    $out = @{ ok = $true; version = $newVer; upload = $r.json }
    if ([bool]$body.autoPublish) {
      $pj = Hub-PostJson ('/v1/creator/themes/' + $id + '/publish') @{ version = $newVer } $sid
      $out.publish = $pj.json; $out.publishBody = $pj.body; $out.published = ($pj.status -ge 200 -and $pj.status -lt 300)
    }
    Send-Json $ctx 200 $out
    return
  }
  if ($path -eq '/api/theme/create' -and $method -eq 'POST') {
    # POST /v1/creator/themes = create new theme; hub publishes it in the same call
    $p = Normalize-Path ([string]$body.thmPath)
    if (-not (Test-Path -LiteralPath $p)) { Send-Json $ctx 400 @{ error = '主题文件不存在: ' + $p }; return }
    $name = [string]$body.name
    if (-not $name) { $name = Get-ThmName $p }
    if (-not $name) { Send-Json $ctx 400 @{ error = '无法从包里解析主题名，请手动填写' }; return }
    $ver = [string]$body.version
    if (-not $ver) { $ver = '1.0.0' }
    $files = @{ theme_file = @{ name = 'theme-' + $ver + '.thm'; bytes = (Read-FileBytes $p) } }
    $coverPath = Normalize-Path ([string]$body.coverPath)
    if ($coverPath -and (Test-Path -LiteralPath $coverPath)) {
      $files['cover_file'] = @{ name = 'cover.png'; bytes = (Read-FileBytes $coverPath) }
    }
    $meta = @{ name = $name; version = $ver }
    if ($body.externalUrl) { $meta['external_url'] = [string]$body.externalUrl }
    $r = Hub-Multipart 'POST' '/v1/creator/themes' $sid @{ metadata = ($meta | ConvertTo-Json -Compress) } $files
    Send-Json $ctx $r.status @{ ok = ($r.status -ge 200 -and $r.status -lt 300); status = $r.status; data = $r.json; body = $r.body; version = $ver }
    return
  }
  if ($path -eq '/api/theme/backup' -and $method -eq 'POST') {
    $id = [string]$body.id
    $du = Hub-Get ('/v1/creator/themes/' + $id + '/download-url') $sid
    if ($du.status -ge 400) { Send-Json $ctx $du.status @{ error = '获取下载地址失败'; body = $du.body }; return }
    $url = [string]$du.json.url; $fname = [string]$du.json.file_name
    if (-not $url) { Send-Json $ctx 502 @{ error = 'download-url 无 url'; body = $du.body }; return }
    $c = New-HubClient
    try { $bytes = $c.GetByteArrayAsync($url).Result } finally { $c.Dispose() }
    $safe = ($fname -replace '[\\/:*?"<>|]', '_')
    $dest = Join-Path $BackupDir $safe
    $i = 1
    while (Test-Path -LiteralPath $dest) { $dest = Join-Path $BackupDir (($i.ToString()) + '_' + $safe); $i++ }
    [IO.File]::WriteAllBytes($dest, $bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
    $shaMatch = $true
    try { if ($du.json.sha256) { $shaMatch = ($hash -eq [string]$du.json.sha256) } } catch {}
    Send-Json $ctx 200 @{ ok = $true; file = $dest; size = $bytes.Length; sha256 = $hash; shaMatch = $shaMatch }
    return
  }
  if ($path -eq '/api/theme/check' -and $method -eq 'POST') {
    $p = Normalize-Path ([string]$body.path)
    if (-not (Test-Path -LiteralPath $p)) { Send-Json $ctx 400 @{ error = '文件不存在' }; return }
    $r = Hub-Multipart 'POST' '/v1/creator/themes/check-archive' $sid @{} @{ theme_file = @{ name = 'check.thm'; bytes = (Read-FileBytes $p) } }
    Send-Json $ctx 200 @{ status = $r.status; data = $r.json; body = $r.body }
    return
  }
  if ($path -eq '/api/plugin/tags' -and $method -eq 'GET') {
    $r = Hub-GetRawBytes '/v1/plugins/tags?lang=zh-CN' $sid
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ error = '获取插件分类失败'; body = (Short-Text ([Text.Encoding]::UTF8.GetString($r.bytes)) 300) }; return }
    Send-RawJson $ctx $r.bytes
    return
  }
  if ($path -eq '/api/plugin/check' -and $method -eq 'POST') {
    $p = Normalize-Path ([string]$body.path)
    if (-not (Test-Path -LiteralPath $p)) { Send-Json $ctx 400 @{ error = '文件不存在' }; return }
    $r = Hub-Multipart 'POST' '/v1/creator/plugins/check-package' $sid @{} @{ plugin_file = @{ name = 'check.tpg'; bytes = (Read-FileBytes $p) } }
    Send-Json $ctx 200 @{ status = $r.status; data = $r.json; body = $r.body }
    return
  }
  if ($path -eq '/api/plugin/update' -and $method -eq 'POST') {
    $id = [string]$body.id; $p = [string]$body.filePath
    if (-not (Test-Path -LiteralPath $p)) { Send-Json $ctx 400 @{ error = '插件文件不存在: ' + $p }; return }
    $built = Build-PluginMetadata $body
    if ($built.error) { Send-Json $ctx 400 @{ error = $built.error }; return }
    $metaJson = $built.meta | ConvertTo-Json -Compress -Depth 5
    $r = Hub-Multipart 'PATCH' ('/v1/creator/plugins/' + $id + '/publish') $sid `
      @{ metadata = $metaJson } `
      @{ plugin_file = @{ name = 'plugin.tpg'; bytes = (Read-FileBytes $p) } }
    Write-SrvLog ('plugin update ' + $id + ' -> ' + $r.status + ' ' + (Short-Text $r.body 300))
    Send-Json $ctx $r.status @{ status = $r.status; data = $r.json; body = $r.body }
    return
  }
  if ($path -eq '/api/plugin/create' -and $method -eq 'POST') {
    $p = Normalize-Path ([string]$body.filePath)
    if (-not (Test-Path -LiteralPath $p)) { Send-Json $ctx 400 @{ error = '插件文件不存在: ' + $p }; return }
    $built = Build-PluginMetadata $body
    if ($built.error) { Send-Json $ctx 400 @{ error = $built.error }; return }
    # 先验包：包不合法时直接报错，不要提交创建
    $chk = Hub-Multipart 'POST' '/v1/creator/plugins/check-package' $sid @{} @{ plugin_file = @{ name = 'check.tpg'; bytes = (Read-FileBytes $p) } }
    if ($chk.status -ge 400) {
      Write-SrvLog ('plugin create precheck failed ' + $chk.status + ' ' + (Short-Text $chk.body 300))
      $code = ''
      try { $code = [string]$chk.json.error.code } catch {}
      if ($code -eq 'package_id_taken') {
        Send-Json $ctx 409 @{ error = '这个插件的 package_id 在 hub 上已存在，不能重复创建。请在列表里找到它，用「更新发布」上传新版本。'; code = $code; body = $chk.body }
        return
      }
      Send-Json $ctx $chk.status @{ error = '插件包校验未通过'; code = $code; status = $chk.status; body = $chk.body }
      return
    }
    # 名字/描述留空时回退到包内 manifest，避免 hub 上出现空标题/空描述
    $meta = $built.meta
    if (-not $meta['name'] -and $chk.json.name) { $meta['name'] = [string]$chk.json.name }
    if (-not $meta['description'] -and $chk.json.description) { $meta['description'] = [string]$chk.json.description }
    if (-not $meta['name']) { Send-Json $ctx 400 @{ error = '插件名称为空，且包内 manifest 没有 name' }; return }
    $metaJson = $meta | ConvertTo-Json -Compress -Depth 5
    $r = Hub-Multipart 'POST' '/v1/creator/plugins' $sid `
      @{ metadata = $metaJson } `
      @{ plugin_file = @{ name = 'plugin.tpg'; bytes = (Read-FileBytes $p) } }
    Write-SrvLog ('plugin create -> ' + $r.status + ' ' + (Short-Text $r.body 400))
    Send-Json $ctx $r.status @{ status = $r.status; data = $r.json; body = $r.body }
    return
  }
  if ($path -eq '/api/plugin/metadata' -and $method -eq 'POST') {
    $id = [string]$body.id
    $built = Build-PluginMetadata $body
    if ($built.error) { Send-Json $ctx 400 @{ error = $built.error }; return }
    $metaJson = $built.meta | ConvertTo-Json -Compress -Depth 5
    $r = Hub-Multipart 'PATCH' ('/v1/creator/plugins/' + $id) $sid @{ metadata = $metaJson } @{}
    Write-SrvLog ('plugin metadata ' + $id + ' -> ' + $r.status + ' ' + (Short-Text $r.body 300))
    Send-Json $ctx $r.status @{ status = $r.status; data = $r.json; body = $r.body }
    return
  }

  # ---- 批量 ----
  # 计划阶段只扫本地并解析包名/封面, hub 匹配由前端用已加载的列表完成 (hub 列表 >2MB 无法在 PS5.1 解析)
  if ($path -eq '/api/batch/plan' -and $method -eq 'POST') {
    $dir = Normalize-Path ([string]$body.dir)
    if (-not (Test-Path -LiteralPath $dir)) { Send-Json $ctx 400 @{ error = '目录不存在: ' + $dir }; return }
    $coverDir = Normalize-Path ([string]$body.coverDir)
    $mappings = @{}
    $mo = Load-JsonFile $MappingsFile @{}
    foreach ($p in $mo.PSObject.Properties) { $mappings[$p.Name] = [string]$p.Value }
    $rows = @()
    foreach ($f in (Get-ChildItem -LiteralPath $dir -Filter '*.thm' -File | Sort-Object Name)) {
      $localName = Get-ThmName $f.FullName
      if (-not $localName) { $rows += @{ file = $f.FullName; localName = ''; hubName = ''; coverPath = ''; note = 'theme.json 解析失败' }; continue }
      $hubName = $localName
      if ($mappings.ContainsKey($localName)) { $hubName = $mappings[$localName] }
      $coverPath = ''
      if ($coverDir -and (Test-Path -LiteralPath $coverDir)) {
        $baseNames = @($hubName, ($hubName -replace '（古风）', '' -replace '（现代）', ''), $localName, ($localName -replace '（古风）', '' -replace '（现代）', ''))
        foreach ($bn in $baseNames) {
          if (-not $bn) { continue }
          $cand = Join-Path $coverDir ($bn + '.png')
          if (Test-Path -LiteralPath $cand) { $coverPath = $cand; break }
        }
        if (-not $coverPath) {
          $stem = [IO.Path]::GetFileNameWithoutExtension($f.Name)
          $c = Get-ChildItem -LiteralPath $coverDir -Filter ($stem + '*.png') -File -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($c) { $coverPath = $c.FullName }
        }
        if (-not $coverPath) {
          $core = ($hubName -replace '^风景·', '' -replace '^诗意·', '' -replace '（古风）', '' -replace '（现代）', '')
          if ($core) {
            $c = Get-ChildItem -LiteralPath $coverDir -Filter '*.png' -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName.Contains($core) } | Select-Object -First 1
            if ($c) { $coverPath = $c.FullName }
          }
        }
      }
      $rows += @{ file = $f.FullName; localName = $localName; hubName = $hubName; coverPath = $coverPath; note = '' }
    }
    Send-Json $ctx 200 @{ ok = $true; rows = $rows }
    return
  }
  if ($path -eq '/api/batch/run' -and $method -eq 'POST') {
    $rows = @($body.rows)
    if ($rows.Count -eq 0) { Send-Json $ctx 400 @{ error = '没有可执行的行' }; return }
    $jobId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + (Get-Random -Maximum 9999)
    $jobFile = Join-Path $JobsDir ($jobId + '.json')
    Save-JsonFile @{ id = $jobId; status = 'running'; done = 0; total = $rows.Count; results = @(); rows = $rows } $jobFile
    $proc = Start-Process -FilePath 'powershell.exe' `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $Root 'batch-run.ps1') + '"'), '-JobFile', ('"' + $jobFile + '"'), '-Sid', $sid) `
      -WindowStyle Hidden -PassThru
    Send-Json $ctx 200 @{ ok = $true; jobId = $jobId; pid = $proc.Id }
    return
  }
  if ($path -eq '/api/job' -and $method -eq 'GET') {
    $id = [string]$qs['id']
    if ($id -notmatch '^[0-9A-Za-z-]+$') { Send-Json $ctx 400 @{ error = 'bad id' }; return }
    $jf = Join-Path $JobsDir ($id + '.json')
    if (-not (Test-Path -LiteralPath $jf)) { Send-Json $ctx 404 @{ error = 'job not found' }; return }
    Send-Json $ctx 200 (Load-JsonFile $jf @{})
    return
  }
  if ($path -eq '/api/mappings' -and $method -eq 'GET') {
    Send-Json $ctx 200 (Load-JsonFile $MappingsFile @{})
    return
  }
  if ($path -eq '/api/mappings' -and $method -eq 'POST') {
    Save-JsonFile $body $MappingsFile
    Send-Json $ctx 200 @{ ok = $true }
    return
  }
  
  # ==================== Gitee 发布台 ====================
  if ($path -eq '/api/gitee/config' -and $method -eq 'GET') {
    $g = Load-JsonFile $GiteeFile @{}
    $hasTok = $false
    $tokPath = Join-Path $DataDir 'gitee-token.txt'
    if (Test-Path -LiteralPath $tokPath) { $hasTok = ([IO.File]::ReadAllText($tokPath, [Text.Encoding]::UTF8).Trim().Length -gt 0) }
    if ($g.token) { $hasTok = $true }
    Send-Json $ctx 200 @{ org = $(if ($g.org) { $g.org } else { 'OFFAXIS' }); repo = $(if ($g.repo) { $g.repo } else { Get-ConfigValue 'giteeRepo' }); hasToken = $hasTok }
    return
  }
  if ($path -eq '/api/gitee/token' -and $method -eq 'POST') {
    $tok = ([string]$body.token).Trim()
    $g = Load-JsonFile $GiteeFile @{}
    if (-not $g) { $g = @{} }
    if ($body.org) { $g.org = [string]$body.org }
    if ($body.repo) { $g.repo = [string]$body.repo }
    if (-not $tok) {
      # 空令牌 = 只更新组织/仓库设置（令牌统一在「账号管理」里配）
      Save-JsonFile $g $GiteeFile
      Send-Json $ctx 200 @{ ok = $true; note = '只更新了仓库设置' }
      return
    }
    $g.token = $tok
    Save-JsonFile $g $GiteeFile
    # 立即验证 token 与管理员权限
    $me = Gitee-Req 'GET' '/user' $tok
    if ($me.status -ge 400) { Send-Json $ctx 200 @{ ok = $false; error = '令牌无效或网络失败'; status = $me.status }; return }
    $orgCheck = Gitee-Req 'GET' ('/orgs/' + $(if ($g.org) { $g.org } else { 'OFFAXIS' }) + '/memberships/mine') $tok
    Send-Json $ctx 200 @{ ok = $true; login = $me.json.login; name = $me.json.name; orgOk = ($orgCheck.status -lt 400); orgStatus = $orgCheck.status }
    return
  }
  if ($path -eq '/api/gitee/test' -and $method -eq 'GET') {
    $g = Load-JsonFile $GiteeFile @{}
    $tok = Get-GiteeToken
    if (-not $tok) { Send-Json $ctx 400 @{ error = '还没设置 token' }; return }
    $org = $(if ($g.org) { $g.org } else { 'OFFAXIS' })
    $repos = Gitee-Req 'GET' ('/orgs/' + $org + '/repos?per_page=100') $tok
    $members = Gitee-Req 'GET' ('/orgs/' + $org + '/members?per_page=100') $tok
    Send-Json $ctx 200 @{
      reposStatus = $repos.status; repoCount = $(try { @($repos.json).Count } catch { 0 })
      repoList = $(try { @($repos.json | ForEach-Object { @{ name = $_.name; private = $_.private; html_url = $_.html_url } }) } catch { @() })
      membersStatus = $members.status; memberCount = $(try { @($members.json).Count } catch { 0 })
      members = $(try { @($members.json | ForEach-Object { @{ login = $_.login; name = $_.name } }) } catch { @() })
    }
    return
  }
  if ($path -eq '/api/gitee/projects' -and $method -eq 'GET') {
    Send-Json $ctx 200 (Get-GiteeProjectsJson)
    return
  }
  if ($path -eq '/api/gitee/projects' -and $method -eq 'POST') {
    $g = Load-JsonFile $GiteeFile @{}
    if (-not $g) { $g = @{} }
    if (-not $g.projects) { $g.projects = @() }
    if ($body.action -eq 'add') {
      $p = @{ id = [Guid]::NewGuid().ToString('N'); name = [string]$body.name; localPath = [string]$body.localPath; version = [string]$body.version; note = [string]$body.note; pushedAt = '' }
      $g.projects = @($g.projects) + @($p)
    } elseif ($body.action -eq 'remove') {
      $g.projects = @($g.projects | Where-Object { $_.id -ne [string]$body.id })
    } elseif ($body.action -eq 'update') {
      foreach ($it in @($g.projects)) { if ($it.id -eq [string]$body.id) { if ($body.version) { $it.version = [string]$body.version }; if ($body.name) { $it.name = [string]$body.name }; if ($body.localPath) { $it.localPath = [string]$body.localPath }; if ($body.note) { $it.note = [string]$body.note } } }
    }
    Save-JsonFile $g $GiteeFile
    Send-Json $ctx 200 (Get-GiteeProjectsJson)
    return
  }
  if ($path -eq '/api/gitee/push' -and $method -eq 'POST') {
    $g = Load-JsonFile $GiteeFile @{}
    $tok = Get-GiteeToken
    if (-not $tok) { Send-Json $ctx 400 @{ error = '还没设置 token' }; return }
    $org = $(if ($body.org) { [string]$body.org } elseif ($g.org) { $g.org } else { 'OFFAXIS' })
    $repo = $(if ($body.repo) { [string]$body.repo } elseif ($g.repo) { $g.repo } else { '' })
    if (-not $repo) { $repo = Get-ConfigValue 'giteeRepo' }
    if (-not $repo) { Send-Json $ctx 400 @{ error = '还没指定仓库名（先在设置里填）' }; return }
    $path_ = [string]$body.filePath
    $name = [string]$body.name
    $ver = [string]$body.version
    $desc = [string]$body.desc
    if (-not (Test-Path -LiteralPath $path_)) { Send-Json $ctx 400 @{ error = '文件不存在: ' + $path_ }; return }
    if (-not $name) { $name = [IO.Path]::GetFileNameWithoutExtension($path_) }
    if (-not $ver) { $ver = '1.0.0' }
    $tag = 'v' + $ver
    $actions = @()

    # 1) 确保发行版存在
    $rel = Gitee-Req 'GET' ('/repos/' + $org + '/' + $repo + '/releases/tags/' + $tag) $tok
    $relId = $null
    if ($rel.status -eq 200) { $relId = [string]$rel.json.id }
    if (-not $relId) {
      $createBody = @{ tag_name = $tag; name = ($name + ' ' + $tag); body = $(if ($desc) { $desc } else { $name + ' ' + $ver }); prerelease = $false; target_commitish = 'master' } | ConvertTo-Json -Compress
      $c = Gitee-Req 'POST' ('/repos/' + $org + '/' + $repo + '/releases') $tok ([Text.Encoding]::UTF8.GetBytes($createBody))
      if ($c.status -ge 400) { Send-Json $ctx $c.status @{ error = '创建发行版失败'; status = $c.status; body = $c.body }; return }
      $relId = [string]$c.json.id
      $actions += ('release+ ' + $tag)
    } else { $actions += ('release= ' + $tag) }

    # 2) 上传附件
    $bytes = [IO.File]::ReadAllBytes($path_)
    $fname = [IO.Path]::GetFileName($path_)
    $up = Gitee-Upload ('/repos/' + $org + '/' + $repo + '/releases/' + $relId + '/attach_files') $tok $fname $bytes
    if ($up.status -ge 400) { Send-Json $ctx $up.status @{ error = '上传附件失败'; status = $up.status; body = $up.body; actions = $actions }; return }
    $actions += ('attach ' + $fname + ' (' + [math]::Round($bytes.Length/1MB,2) + 'MB)')

    # 3) 更新项目记录
    if (-not $g.projects) { $g.projects = @() }
    $hit = $null
    foreach ($it in $g.projects) { if ($it.name -eq $name) { $hit = $it; break } }
    if (-not $hit) {
      $hit = @{ id = [Guid]::NewGuid().ToString('N'); name = $name; localPath = $path_; version = $ver; note = $desc; pushedAt = (Get-Date -Format s) }
      $g.projects = @($g.projects) + @($hit)
    } else { $hit.version = $ver; $hit.localPath = $path_; $hit.pushedAt = (Get-Date -Format s); if ($desc) { $hit.note = $desc } }
    Save-JsonFile $g $GiteeFile
    Send-Json $ctx 200 (Merge-GiteeProjectsJson @{ ok = $true; tag = $tag; releaseId = $relId; actions = $actions })
    return
  }
  if ($path -eq '/api/gitee/createrepo' -and $method -eq 'POST') {
    $g = Load-JsonFile $GiteeFile @{}
    $tok = Get-GiteeToken
    if (-not $tok) { Send-Json $ctx 400 @{ error = '还没设置 token' }; return }
    $org = $(if ($body.org) { [string]$body.org } elseif ($g.org) { $g.org } else { 'OFFAXIS' })
    $repo = [string]$body.repo
    if (-not $repo) { Send-Json $ctx 400 @{ error = '仓库名必填' }; return }
    $createBody = @{
      name = $repo
      description = [string]$body.description
      private = [bool]$body.private
      auto_init = $true
      gitignore_template = ''
      license_template = ''
    } | ConvertTo-Json -Compress
    $r = Gitee-Req 'POST' ('/orgs/' + $org + '/repos') $tok ([Text.Encoding]::UTF8.GetBytes($createBody))
    if ($r.status -ge 400) { Send-Json $ctx $r.status @{ error = '创建仓库失败（需要组织管理员权限）'; status = $r.status; body = $r.body }; return }
    if (-not $g) { $g = @{} }
    $g.repo = $repo
    Save-JsonFile $g $GiteeFile
    Send-Json $ctx 200 @{ ok = $true; repo = $repo; htmlUrl = $r.json.html_url }
    return
  }

  # ==================== GitHub 发布台 ====================
  if ($path -eq '/api/github/config' -and $method -eq 'GET') {
    $g = Load-JsonFile $GitHubFile @{}
    Send-Json $ctx 200 @{
      owner = $(if ($g.owner) { $g.owner } else { '' })
      repo = $(if ($g.repo) { $g.repo } else { '' })
      hasToken = ((Get-GitHubToken) -ne '')
    }
    return
  }
  if ($path -eq '/api/github/token' -and $method -eq 'POST') {
    $tok = ([string]$body.token).Trim()
    $g = Load-JsonFile $GitHubFile @{}
    if (-not $g) { $g = @{} }
    if ($body.owner) { $g.owner = [string]$body.owner }
    if ($body.repo) { $g.repo = [string]$body.repo }
    if (-not $tok) {
      # 空令牌 = 只更新默认 owner/repo，不动已存的令牌
      Save-JsonFile $g $GitHubFile
      Send-Json $ctx 200 @{ ok = $true; note = '只更新了默认仓库设置' }
      return
    }
    $g.token = $tok
    Save-JsonFile $g $GitHubFile
    # 立即验证令牌（fine-grained token 需要 Contents: Read and write 权限）
    $me = GitHub-Req 'GET' ($script:GitHubApi + '/user') $tok $null
    if ($me.status -ge 400) { Send-Json $ctx 200 @{ ok = $false; error = '令牌无效或网络失败'; status = $me.status }; return }
    Send-Json $ctx 200 @{ ok = $true; login = $me.json.login; name = $me.json.name }
    return
  }
  if ($path -eq '/api/github/projects' -and $method -eq 'GET') {
    Send-Json $ctx 200 (Get-GitHubProjectsJson)
    return
  }
  if ($path -eq '/api/github/projects' -and $method -eq 'POST') {
    $g = Load-JsonFile $GitHubFile @{}
    if (-not $g) { $g = @{} }
    if (-not $g.projects) { $g.projects = @() }
    if ($body.action -eq 'add') {
      $p = @{ id = [Guid]::NewGuid().ToString('N'); name = [string]$body.name; localPath = [string]$body.localPath; version = [string]$body.version; note = [string]$body.note; pushedAt = '' }
      $g.projects = @($g.projects) + @($p)
    } elseif ($body.action -eq 'remove') {
      $g.projects = @($g.projects | Where-Object { $_.id -ne [string]$body.id })
    } elseif ($body.action -eq 'update') {
      foreach ($it in @($g.projects)) { if ($it.id -eq [string]$body.id) { if ($body.version) { $it.version = [string]$body.version }; if ($body.name) { $it.name = [string]$body.name }; if ($body.localPath) { $it.localPath = [string]$body.localPath }; if ($body.note) { $it.note = [string]$body.note } } }
    }
    Save-JsonFile $g $GitHubFile
    Send-Json $ctx 200 (Get-GitHubProjectsJson)
    return
  }
  if ($path -eq '/api/github/push' -and $method -eq 'POST') {
    $g = Load-JsonFile $GitHubFile @{}
    $tok = Get-GitHubToken
    if (-not $tok) { Send-Json $ctx 400 @{ error = '还没设置 token' }; return }
    $owner = $(if ($body.owner) { ([string]$body.owner).Trim() } elseif ($g.owner) { [string]$g.owner } else { '' })
    $repo = $(if ($body.repo) { ([string]$body.repo).Trim() } elseif ($g.repo) { [string]$g.repo } else { '' })
    if (-not $owner -or -not $repo) { Send-Json $ctx 400 @{ error = '还没指定 owner / 仓库名' }; return }
    $path_ = [string]$body.filePath
    $name = [string]$body.name
    $ver = [string]$body.version
    $desc = [string]$body.desc
    if (-not (Test-Path -LiteralPath $path_)) { Send-Json $ctx 400 @{ error = '文件不存在: ' + $path_ }; return }
    if (-not $name) { $name = [IO.Path]::GetFileNameWithoutExtension($path_) }
    if (-not $ver) { $ver = '1.0.0' }
    $tag = 'v' + $ver
    $actions = @()

    # 0) 仓库必须已存在（owner/repo 每次手填，不做隐式建仓）
    $rp = GitHub-Req 'GET' ($script:GitHubApi + '/repos/' + $owner + '/' + $repo) $tok $null
    if ($rp.status -eq 404) { Send-Json $ctx 404 @{ error = ('仓库不存在或令牌无权访问：' + $owner + '/' + $repo) }; return }
    if ($rp.status -ge 400) { Send-Json $ctx $rp.status @{ error = '仓库确认失败'; status = $rp.status; body = $rp.body }; return }

    # 1) 确保发行版存在（tag 不存在时 GitHub 会在默认分支上自动建 tag）
    $rel = GitHub-Req 'GET' ($script:GitHubApi + '/repos/' + $owner + '/' + $repo + '/releases/tags/' + $tag) $tok $null
    $relId = $null
    if ($rel.status -eq 200) { $relId = [string]$rel.json.id }
    if (-not $relId) {
      $createBody = @{ tag_name = $tag; name = ($name + ' ' + $tag); body = $(if ($desc) { $desc } else { $name + ' ' + $ver }); prerelease = $false } | ConvertTo-Json -Compress
      $c = GitHub-Req 'POST' ($script:GitHubApi + '/repos/' + $owner + '/' + $repo + '/releases') $tok ([Text.Encoding]::UTF8.GetBytes($createBody))
      if ($c.status -ge 400) {
        # 空仓库（没有任何 commit）打不了 tag：先引导一个 root commit 再重试一次
        $readme = '# ' + $repo + [Environment]::NewLine + [Environment]::NewLine + '由 Lin Hub 自动引导创建。' + [Environment]::NewLine
        $bootBody = @{ message = 'init: bootstrap commit'; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($readme)) } | ConvertTo-Json -Compress
        $b = GitHub-Req 'PUT' ($script:GitHubApi + '/repos/' + $owner + '/' + $repo + '/contents/README.md') $tok ([Text.Encoding]::UTF8.GetBytes($bootBody))
        if ($b.status -ge 400) { Send-Json $ctx $c.status @{ error = '创建发行版失败，且空仓库引导提交也失败'; status = $b.status; body = $b.body; actions = $actions }; return }
        $actions += 'bootstrap README（空仓库引导）'
        $c = GitHub-Req 'POST' ($script:GitHubApi + '/repos/' + $owner + '/' + $repo + '/releases') $tok ([Text.Encoding]::UTF8.GetBytes($createBody))
        if ($c.status -ge 400) { Send-Json $ctx $c.status @{ error = '创建发行版失败'; status = $c.status; body = $c.body; actions = $actions }; return }
      }
      $relId = [string]$c.json.id
      $actions += ('release+ ' + $tag)
    } else { $actions += ('release= ' + $tag) }

    # 2) 上传附件（GitHub 不覆盖同名附件：先删旧再传新）
    $bytes = [IO.File]::ReadAllBytes($path_)
    $fname = [IO.Path]::GetFileName($path_)
    $assets = GitHub-Req 'GET' ($script:GitHubApi + '/repos/' + $owner + '/' + $repo + '/releases/' + $relId + '/assets?per_page=100') $tok $null
    if ($assets.status -lt 400 -and $assets.json) {
      foreach ($a in @($assets.json)) {
        if ($a -and $a.name -eq $fname) {
          [void](GitHub-Req 'DELETE' ($script:GitHubApi + '/repos/' + $owner + '/' + $repo + '/releases/assets/' + $a.id) $tok $null)
          $actions += ('替换旧附件 ' + $fname)
          break
        }
      }
    }
    $up = GitHub-UploadAsset $owner $repo $relId $fname $bytes $tok
    if ($up.status -ge 300) { Send-Json $ctx $up.status @{ error = '上传附件失败'; status = $up.status; body = $up.body; actions = $actions }; return }
    $actions += ('attach ' + $fname + ' (' + [math]::Round($bytes.Length/1MB,2) + 'MB)')

    # 3) 更新项目记录 + 记住本次 owner/repo 作为下次默认
    if (-not $g.projects) { $g.projects = @() }
    $hit = $null
    foreach ($it in $g.projects) { if ($it.name -eq $name) { $hit = $it; break } }
    if (-not $hit) {
      $hit = @{ id = [Guid]::NewGuid().ToString('N'); name = $name; localPath = $path_; version = $ver; note = $desc; pushedAt = (Get-Date -Format s) }
      $g.projects = @($g.projects) + @($hit)
    } else { $hit.version = $ver; $hit.localPath = $path_; $hit.pushedAt = (Get-Date -Format s); if ($desc) { $hit.note = $desc } }
    $g.owner = $owner; $g.repo = $repo
    Save-JsonFile $g $GitHubFile
    Send-Json $ctx 200 (Merge-GitHubProjectsJson @{ ok = $true; tag = $tag; releaseId = $relId; assetUrl = $up.json.browser_download_url; actions = $actions })
    return
  }

  # ==================== 平台账号管理（Gitee / GitHub） ====================
  if ($path -eq '/api/paccounts' -and $method -eq 'GET') {
    $platform = ([string]$qs['platform']).ToLower()
    if ($platform -notin @('gitee', 'github')) { Send-Json $ctx 400 @{ error = 'platform 必须是 gitee 或 github' }; return }
    $s = Get-PlatformAccountsStore $platform
    $items = @($s.items | ForEach-Object {
      $m = [string]$_.token
      if ($m.Length -gt 14) { $m = $m.Substring(0, 10) + '…' + $m.Substring($m.Length - 4) }
      @{ id = $_.id; name = $_.name; login = $_.login; tokenMasked = $m; created = $_.created }
    })
    Send-Json $ctx 200 @{ active = $s.active; items = $items }
    return
  }
  if ($path -eq '/api/paccounts' -and $method -eq 'POST') {
    $platform = ([string]$body.platform).ToLower()
    if ($platform -notin @('gitee', 'github')) { Send-Json $ctx 400 @{ error = 'platform 必须是 gitee 或 github' }; return }
    $s = Get-PlatformAccountsStore $platform
    $action = [string]$body.action
    if ($action -eq 'add') {
      $tok = ([string]$body.token).Trim()
      if (-not $tok) { Send-Json $ctx 400 @{ error = 'token 不能为空' }; return }
      $info = Verify-PlatformToken $platform $tok
      if (-not $info) { Send-Json $ctx 200 @{ ok = $false; error = '令牌无效或网络失败' }; return }
      $added = $true
      $existing = $s.items | Where-Object { $_.token -eq $tok } | Select-Object -First 1
      if ($existing) {
        # 同一令牌重复添加 = 只设为当前并补 login
        $s.active = [string]$existing.id
        if ($info.login) { $existing.login = [string]$info.login }
        $added = $false
      } else {
        $nm = ([string]$body.name).Trim()
        if (-not $nm) { $nm = $info.login }
        if (-not $nm) { $nm = $platform + ' 账号 ' + ($s.items.Count + 1) }
        $acc = @{ id = [Guid]::NewGuid().ToString('N'); name = $nm; login = [string]$info.login; token = $tok; created = (Get-Date -Format s) }
        $s.items = @($s.items) + @($acc)
        $s.active = [string]$acc.id
      }
      Save-PlatformAccountsStore $s
      Send-Json $ctx 200 @{ ok = $true; added = $added; login = $info.login; name = $info.name; active = $s.active }
      return
    }
    if ($action -eq 'select') {
      $a = $s.items | Where-Object { $_.id -eq [string]$body.id } | Select-Object -First 1
      if (-not $a) { Send-Json $ctx 404 @{ error = 'account not found' }; return }
      $s.active = [string]$a.id
      Save-PlatformAccountsStore $s
      Send-Json $ctx 200 @{ ok = $true; active = $s.active }
      return
    }
    if ($action -eq 'remove') {
      $s.items = @($s.items | Where-Object { $_.id -ne [string]$body.id })
      if (-not ($s.items | Where-Object { $_.id -eq $s.active })) {
        if ($s.items.Count -gt 0) { $s.active = [string]$s.items[0].id } else { $s.active = '' }
      }
      Save-PlatformAccountsStore $s
      Send-Json $ctx 200 @{ ok = $true }
      return
    }
    Send-Json $ctx 400 @{ error = 'unknown action' }
    return
  }

  # ==================== 本地库（扫描 + 绑定） ====================
  if ($path -eq '/api/library/scan' -and $method -eq 'GET') {
    $dir = Normalize-Path ([string]$qs['dir'])
    if (-not (Test-Path -LiteralPath $dir)) { Send-Json $ctx 400 @{ error = '目录不存在: ' + $dir }; return }
    $bindItems = Get-BindingItems
    $rows = @()
    foreach ($f in (Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Extension -ieq '.thm' -or $_.Extension -ieq '.tpg' } | Sort-Object Name)) {
      $kind = ''; $name = ''; $ver = ''; $note = ''
      if ($f.Extension -ieq '.thm') {
        $kind = 'theme'
        $info = Get-ThmInfo $f.FullName
        if ($info) { $name = $info.name; $ver = $info.version } else { $note = 'theme.json 解析失败' }
      } else {
        $kind = 'plugin'
        $m = Get-TpgManifest $f.FullName
        if ($m) { $name = [string]$m.name; $ver = [string]$m.version } else { $note = 'manifest.json 解析失败' }
      }
      $b = Get-BindingFor $f.FullName $bindItems
      $rows += @{ file = $f.FullName; kind = $kind; name = $name; version = $ver; note = $note; binding = $b }
    }
    Send-Json $ctx 200 @{ ok = $true; dir = $dir; rows = $rows }
    return
  }
  if ($path -eq '/api/library/bindings' -and $method -eq 'GET') {
    Send-Json $ctx 200 @{ items = @(Get-BindingItems) }
    return
  }
  if ($path -eq '/api/library/bindings' -and $method -eq 'POST') {
    $file = Normalize-Path ([string]$body.file)
    if (-not $file) { Send-Json $ctx 400 @{ error = 'file required' }; return }
    $items = @(Get-BindingItems)
    $clean = Clean-Binding $body.binding
    $clean['file'] = $file
    $hasBind = ($clean['hubThemeId'] -or $clean['hubPluginId'] -or $clean['giteeProjectId'] -or $clean['githubProjectId'])
    $hit = Get-BindingFor $file $items
    if ($hasBind) {
      if ($hit) {
        $items = @($items | ForEach-Object { if ([string]$_.file -ieq $file) { $clean } else { $_ } })
      } else {
        $items = @($items) + @($clean)
      }
    } else {
      if ($hit) { $items = @($items | Where-Object { [string]$_.file -ine $file }) }
    }
    Save-BindingItems $items
    Send-Json $ctx 200 @{ ok = $true; items = @($items) }
    return
  }

  Send-Json $ctx 404 @{ error = 'unknown api: ' + $path }
}

# ---------- 日志 ----------
$ServerLog = Join-Path $Root 'logs\server.log'
$script:LogDir = Split-Path -Parent $ServerLog
if (-not (Test-Path -LiteralPath $script:LogDir)) { New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null }
function Write-SrvLog([string]$m) {
  try {
    Add-Content -LiteralPath $ServerLog -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff') + '  ' + $m) -Encoding UTF8
  } catch {}
}

# ---------- 单请求分发（每个 worker runspace 调用） ----------
function Invoke-HubRequest($ctx) {
  $rawPath = ''
  $method = '?'
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $rawPath = $ctx.Request.Url.AbsolutePath
    $method = $ctx.Request.HttpMethod
    if ($rawPath -like '/api/*') {
      Handle-Api $ctx $rawPath $method
    } elseif ($rawPath -eq '/favicon.ico') {
      $fp = Join-Path $Root 'icon.ico'
      if (Test-Path -LiteralPath $fp) { Send-Bytes $ctx ([IO.File]::ReadAllBytes($fp)) 'image/x-icon' }
      else { Send-Json $ctx 404 @{ error = 'no icon' } }
    } elseif ($script:StaticMap.ContainsKey($rawPath)) {
      $s = $script:StaticMap[$rawPath]
      $fp = Join-Path $WwwDir $s.file
      if (Test-Path -LiteralPath $fp) { Send-Bytes $ctx ([IO.File]::ReadAllBytes($fp)) $s.type }
      else { Send-Json $ctx 404 @{ error = 'missing www/' + $s.file } }
    } else {
      Send-Json $ctx 404 @{ error = 'not found' }
    }
  } catch {
    Write-SrvLog ('ERROR ' + $method + ' ' + $rawPath + ' : ' + $_.Exception.Message)
    try { Send-Json $ctx 500 @{ error = $_.Exception.Message } } catch {}
  } finally {
    $sw.Stop()
    if ($rawPath -ne '/api/job' -or $sw.ElapsedMilliseconds -gt 3000) {
      Write-SrvLog ($method + ' ' + $rawPath + ' ' + $sw.ElapsedMilliseconds + 'ms')
    }
  }
}