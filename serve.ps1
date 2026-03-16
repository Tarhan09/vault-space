# VaultSpace — PowerShell HTTP Server
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1

$port    = 8765
$rootDir = $PSScriptRoot
$prefix  = "http://*:$port/"

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.webp' = 'image/webp'
}

$uploadDir = Join-Path $rootDir "uploads"
if (-not (Test-Path $uploadDir)) { New-Item -ItemType Directory -Path $uploadDir }

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "🚀 VaultSpace sunucusu calisiyor: $prefix" -ForegroundColor Green
Write-Host "📂 Paylasim klasoru: $uploadDir" -ForegroundColor Cyan

try {
    while ($listener.IsListening) {
        $ctx  = $listener.GetContext()
        $req  = $ctx.Request
        $resp = $ctx.Response

        $urlPath = $req.Url.LocalPath
        if ($urlPath -eq '/' -or $urlPath -eq '') { $urlPath = '/index.html' }

        # --- API Endpoints ---
        if ($urlPath -eq '/api/files' -and $req.HttpMethod -eq 'GET') {
            $files = Get-ChildItem $uploadDir -File | ForEach-Object {
                $metaPath = $_.FullName + ".json"
                $meta = if (Test-Path $metaPath) { Get-Content $metaPath | ConvertFrom-Json } else { @{} }
                @{
                    id       = $_.Name
                    name     = $_.Name
                    type     = 'file'
                    size     = $_.Length
                    modified = $_.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
                    mime     = if ($meta.mime) { $meta.mime } else { $mime[[System.IO.Path]::GetExtension($_.Name)] }
                    hasData  = $true
                }
            }
            $json = $files | ConvertTo-Json -Compress
            $bytes = [Text.Encoding]::UTF8.GetBytes($json)
            $resp.ContentType = 'application/json'
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        elseif ($urlPath -eq '/api/upload' -and $req.HttpMethod -eq 'POST') {
            try {
                $reader = [System.IO.StreamReader]::new($req.InputStream)
                $body   = $reader.ReadToEnd()
                $data   = $body | ConvertFrom-Json
                
                $fileName = $data.name
                $base64   = $data.data.Split(',')[1]
                $fileBytes = [System.Convert]::FromBase64String($base64)
                
                [System.IO.File]::WriteAllBytes((Join-Path $uploadDir $fileName), $fileBytes)
                
                # Save metadata (mime)
                $meta = @{ mime = $data.mime } | ConvertTo-Json
                [System.IO.File]::WriteAllText((Join-Path $uploadDir ($fileName + ".json")), $meta)
                
                $resp.StatusCode = 200
            } catch {
                $resp.StatusCode = 500
                $err = @{ error = $_.Exception.Message } | ConvertTo-Json
                $resp.OutputStream.Write(([Text.Encoding]::UTF8.GetBytes($err)), 0, $err.Length)
            }
        }
        elseif ($urlPath -eq '/api/delete' -and $req.HttpMethod -eq 'DELETE') {
            $name = $req.QueryString["name"]
            if ($name) {
                $p = Join-Path $uploadDir $name
                if (Test-Path $p) { Remove-Item $p; Remove-Item ($p + ".json") -ErrorAction SilentlyContinue }
                $resp.StatusCode = 200
            } else { $resp.StatusCode = 400 }
        }
        # --- Static Files ---
        else {
            $filePath = Join-Path $rootDir ($urlPath.TrimStart('/').Replace('/', '\'))
            if (Test-Path $filePath -PathType Leaf) {
                $ext     = [System.IO.Path]::GetExtension($filePath)
                $ct      = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
                $bytes   = [System.IO.File]::ReadAllBytes($filePath)
                $resp.ContentType   = $ct
                $resp.ContentLength64 = $bytes.Length
                $resp.StatusCode    = 200
                $resp.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $resp.StatusCode = 404
            }
        }
        $resp.OutputStream.Close()
    }
} finally {
    $listener.Stop()
}
