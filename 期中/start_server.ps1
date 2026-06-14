# 免安裝 Windows 本地網頁伺服器 (PowerShell HTTP Listener)
# 用以解決 file:// 協定下無法使用相機 (camera) 與 Web Worker (Tesseract.js) 的安全性問題

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "       ANTIGRAVITY 智能車牌辨識系統 本地伺服器" -ForegroundColor Gold
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "伺服器正在啟動..."
Write-Host "正在監聽：http://localhost:$port/" -ForegroundColor Green
Write-Host "提示：關閉此視窗即可停止伺服器。" -ForegroundColor Yellow
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan

try {
    $listener.Start()
    
    # 自動在預設瀏覽器中打開網頁
    Start-Process "http://localhost:$port/"
    
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # 取得相對路徑
        $path = $request.Url.LocalPath
        if ($path -eq "/" -or $path -eq "") { 
            $path = "/index.html" 
        }
        
        # 組合本機檔案路徑
        $filePath = Join-Path $PSScriptRoot $path
        
        if (Test-Path $filePath -PathType Leaf) {
            # 讀取檔案二進位資料
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # 依副檔名設定 MIME 類型
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "text/plain"
            
            switch ($ext) {
                ".html" { $contentType = "text/html; charset=utf-8" }
                ".css"  { $contentType = "text/css; charset=utf-8" }
                ".js"   { $contentType = "application/javascript; charset=utf-8" }
                ".png"  { $contentType = "image/png" }
                ".jpg"  { $contentType = "image/jpeg" }
                ".jpeg" { $contentType = "image/jpeg" }
                ".gif"  { $contentType = "image/gif" }
                ".svg"  { $contentType = "image/svg+xml" }
                ".ico"  { $contentType = "image/x-icon" }
            }
            
            # 設定 Response
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            
            # 輸出檔案內容
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # 檔案不存在，回傳 404
            $response.StatusCode = 404
            $errorMsg = [System.Text.Encoding]::UTF8.GetBytes("<h1>404 File Not Found - 找不到檔案</h1>")
            $response.ContentType = "text/html; charset=utf-8"
            $response.ContentLength64 = $errorMsg.Length
            $response.OutputStream.Write($errorMsg, 0, $errorMsg.Length)
        }
        
        $response.OutputStream.Close()
    }
}
catch {
    Write-Host "伺服器出錯: $_" -ForegroundColor Red
}
finally {
    $listener.Stop()
    Write-Host "伺服器已關閉。" -ForegroundColor Yellow
}
