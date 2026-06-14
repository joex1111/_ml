# 智能車牌辨識系統 (Smart LPR System)

一個基於純前端技術（HTML5 / Canvas / Tesseract.js）的**高質感、免安裝、零依賴**的台灣車牌辨識網頁應用程式。

本系統特別針對台灣車牌格式與多變的本機使用環境進行了深度調校，支援拖曳裁切、自適應二值化、語音合成及格式智慧修正，並附帶一鍵啟動的極輕量本地伺服器以解決瀏覽器安全權限問題。

---

## 🌟 核心特色與功能

1. **極致科技感視覺 (Premium Dark UI)**
   - 採用現代暗黑科技風格（Cohesive Dark Theme）與磨砂玻璃質感（Glassmorphism）。
   - 配備流暢的微動畫（例如：雷射掃描線、發光按鈕）與高擬真的台灣實體車牌視覺卡片。

2. **自訂拖曳裁剪框 (Interactive Cropping Tool)**
   - 採用 Pointer Events 支援滑鼠與手機多點觸控，使用者可自由調整紅框大小、位置，將辨識區域鎖定在車牌本身，有效過濾複雜背景。

3. **強大影像預處理 (Adaptive Image Preprocessing)**
   - **Bradley-Roth 自適應二值化 (Bradley Adaptive Thresholding)**：能有效應對戶外強光、陰影、不均勻照度，一秒提取清晰的黑白文字特徵。
   - **無損等比例放大 (Upscaling & Padding)**：自動將車牌區域放大至高度 120px，並加上 20px 純白保護邊框。此舉可提供 Tesseract.js 最佳的辨識字級大小，並杜絕車牌外框線的字元干擾。
   - **反轉黑白 (Invert Colors)**：點擊即可反轉影像色彩，適用於綠底白字（電動客車）或紅底白字（重機）等深色底盤車牌。

4. **台灣車牌格式智慧校正 (LPR Autocorrect Algorithm)**
   - 自動識別車牌並補上遺漏的連接號 `-`（例如將 `ABC1234` 轉為 `ABC-1234`）。
   - 根據台灣車牌「英數分區」的特徵，利用映射表自動糾正相似字元（例如：在數字區的 `O` 自動校正為 `0`、`I` 變 `1`；在英文區的 `8` 自動校正為 `B`），大幅度降低常見 OCR 錯誤率。

5. **測試車牌模擬生成器 (Mock Plate Generator)**
   - 內建台灣規格車牌生成畫布（Canvas），支援自訂文字與車牌種類（普通轎車、電動車、重機、計程車），無須真實照片即可一鍵點選進行辨識測試。

6. **輔助與資料功能 (Features & Logs)**
   - **語音讀牌**：整合 Web Speech API，一鍵用語音唸出辨識車牌。
   - **本地歷史紀錄**：自動以 base64 保存車牌裁剪縮圖、辨識文字、時間與信賴度至瀏覽器 `localStorage`。
   - **CSV 資料匯出**：支援一鍵將所有歷史辨識紀錄匯出為 UTF-8 (帶 BOM) 的 CSV 報表。

---

## 🛠️ 專案檔案結構

```text
車牌辨識/
│
├── index.html          # 網頁結構與儀表板佈局
├── styles.css          # 暗黑科技風格與動畫樣式表
├── app.js              # 核心辨識邏輯與 Canvas 影像處理程式碼
├── start_server.ps1    # 免安裝的 PowerShell 本地網頁伺服器腳本
└── 雙擊啟動.bat         # Windows 一鍵啟動批次檔
```

---

## 🚀 如何在本機運行與測試？

本專案無須安裝 Node.js、Python 或任何伺服器環境：

1. 下載本專案至您的電腦，解壓縮後進入資料夾。
2. 雙擊 **`雙擊啟動.bat`**。
3. 系統會自動以 PowerShell 於背景架設輕量本地網頁伺服器（此步是用以解除瀏覽器直接開啟檔案時對相機與 Web Worker 的安全限制），並**自動開啟瀏覽器**導向至 `http://localhost:8000/`。
4. **測試方式**：
   - 進入網頁後，切換至 **「測試生成」** 分頁。
   - 點選 **「生成測試車牌」**，中間會產生一張虛擬台灣車牌。
   - 點選 **「立即辨識車牌」**，右側即會顯示辨識後的完美結果！
   - 您亦可透過 **「圖片上傳」** 拖入您自己的車牌照片，或在支援鏡頭的裝置上選擇 **「視訊掃描」** 開啟相機。

---

## 💻 開發技術棧

- **Markups & Logic**: HTML5, Vanilla JavaScript (ES6+)
- **Styling**: Vanilla CSS3 (Custom Variables, Flexbox, Grid)
- **OCR Engine**: Tesseract.js (透過 JSDelivr CDN 載入，利用 IndexedDB 快取模型)
- **Image Processing**: Canvas 2D API (Bradley-Roth Integral Image Adaptive Thresholding)
- **Local Web Server**: PowerShell System.Net.HttpListener (.NET Framework)
