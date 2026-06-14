/**
 * 智能車牌辨識系統 - 核心邏輯
 * 採用純前端技術：Tesseract.js + Canvas API
 */

(function () {
    // ==========================================================================
    // 狀態與全域變數
    // ==========================================================================
    let worker = null;
    let ocrStatus = 'loading'; // 'loading', 'ready', 'processing', 'error'
    let cameraStream = null;
    let activeTab = 'webcam-tab';
    
    // 裁剪框百分比坐標 (x, y, width, height)
    let cropBoxPercent = { x: 15, y: 35, w: 70, h: 30 };
    
    // 拖曳狀態
    let isDragging = false;
    let dragType = null; // 'move', 'nw', 'ne', 'se', 'sw'
    let dragStart = { pointerX: 0, pointerY: 0, boxX: 0, boxY: 0, boxW: 0, boxH: 0 };
    
    // 歷史紀錄
    let historyList = [];

    // ==========================================================================
    // DOM 元素選取
    // ==========================================================================
    const ocrStatusEl = document.getElementById('ocr-status');
    const cameraStatusEl = document.getElementById('camera-status');
    
    // 標籤頁
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // 相機控制
    const cameraSelect = document.getElementById('camera-select');
    const btnStartCamera = document.getElementById('btn-start-camera');
    const btnStopCamera = document.getElementById('btn-stop-camera');
    const videoFeed = document.getElementById('video-feed');
    
    // 檔案上傳
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileInfoContainer = document.getElementById('file-info-container');
    const fileNameText = document.getElementById('file-name-text');
    const btnRemoveFile = document.getElementById('btn-remove-file');
    
    // 測試生成
    const mockPlateText = document.getElementById('mock-plate-text');
    const mockPlateType = document.getElementById('mock-plate-type');
    const btnGenerateMock = document.getElementById('btn-generate-mock');
    
    // 裁剪與預處理
    const cropperWrapper = document.getElementById('cropper-wrapper');
    const cropperEmpty = document.getElementById('cropper-empty');
    const sourceImage = document.getElementById('source-image');
    const cropOverlay = document.getElementById('crop-overlay');
    const cropBox = document.getElementById('crop-box');
    
    const togglePreprocess = document.getElementById('toggle-preprocess');
    const chkAdaptive = document.getElementById('chk-adaptive');
    const chkInvert = document.getElementById('chk-invert');
    
    const sliderBrightness = document.getElementById('slider-brightness');
    const sliderContrast = document.getElementById('slider-contrast');
    const sliderThreshold = document.getElementById('slider-threshold');
    
    const valBrightness = document.getElementById('val-brightness');
    const valContrast = document.getElementById('val-contrast');
    const valThreshold = document.getElementById('val-threshold');
    
    const canvasCropped = document.getElementById('canvas-cropped');
    const canvasPreprocessed = document.getElementById('canvas-preprocessed');
    
    // 辨識結果與歷史
    const btnRecognize = document.getElementById('btn-recognize');
    const btnSpinner = document.getElementById('btn-spinner');
    const btnText = document.getElementById('btn-text');
    
    const resultPlateDisplay = document.getElementById('result-plate-display');
    const resultPlateEdit = document.getElementById('result-plate-edit');
    const plateVisualBox = document.getElementById('plate-visual-box');
    const plateTagDisplay = document.getElementById('plate-tag-display');
    
    const resultConfidenceBar = document.getElementById('result-confidence-bar');
    const resultConfidenceText = document.getElementById('result-confidence-text');
    
    const btnTts = document.getElementById('btn-tts');
    const btnSaveLog = document.getElementById('btn-save-log');
    
    const btnExportCsv = document.getElementById('btn-export-csv');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const historyTbody = document.getElementById('history-tbody');

    // ==========================================================================
    // 初始化 Tesseract OCR
    // ==========================================================================
    async function initOcr() {
        setOcrStatus('loading', '載入 OCR 辨識引擎中...');
        try {
            // Tesseract.js v5: createWorker 是非同步的，且自動載入語系
            worker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'recognizing') {
                        setOcrStatus('processing', `辨識中... ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            // 設定字元白名單與頁面分割模式 (PSM 7: 單行文字)，這對提升車牌辨識準確率極為關鍵
            await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
                tessedit_pageseg_mode: '7'
            });
            
            setOcrStatus('ready', '辨識引擎準備就緒');
            checkReadyToRecognize();
        } catch (err) {
            console.error('OCR 引擎載入失敗:', err);
            setOcrStatus('error', '引擎載入失敗，請檢查網路連線');
        }
    }

    function setOcrStatus(status, text) {
        ocrStatus = status;
        const indicator = ocrStatusEl.querySelector('.status-indicator');
        const statusText = ocrStatusEl.querySelector('.status-text');
        
        indicator.className = 'status-indicator';
        statusText.textContent = text;
        
        if (status === 'ready') {
            indicator.classList.add('ready');
        } else if (status === 'loading' || status === 'processing') {
            indicator.classList.add('warning');
        } else {
            indicator.classList.add('error');
        }
    }

    // ==========================================================================
    // UI 控制 & 分頁切換
    // ==========================================================================
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetTab = btn.getAttribute('data-tab');
            document.getElementById(targetTab).classList.add('active');
            
            activeTab = targetTab;
            handleTabSwitch(targetTab);
        });
    });

    function handleTabSwitch(tabId) {
        // 切換分頁時，如果不是相機分頁，則關閉相機
        if (tabId !== 'webcam-tab') {
            stopCamera();
        }
        
        resetInputs();
        
        if (tabId === 'webcam-tab') {
            // 若為相機分頁，顯示相機視訊，隱藏圖片
            sourceImage.style.display = 'none';
            if (cameraStream) {
                videoFeed.style.display = 'block';
                cropOverlay.style.display = 'block';
                alignCropOverlay();
            } else {
                videoFeed.style.display = 'none';
                cropOverlay.style.display = 'none';
                cropperEmpty.style.display = 'flex';
            }
        } else if (tabId === 'upload-tab') {
            videoFeed.style.display = 'none';
            if (sourceImage.src && sourceImage.src !== window.location.href) {
                sourceImage.style.display = 'block';
                cropOverlay.style.display = 'block';
                cropperEmpty.style.display = 'none';
                alignCropOverlay();
            } else {
                sourceImage.style.display = 'none';
                cropOverlay.style.display = 'none';
                cropperEmpty.style.display = 'flex';
            }
        } else if (tabId === 'mock-tab') {
            videoFeed.style.display = 'none';
            if (sourceImage.src && sourceImage.src.includes('data:image')) {
                sourceImage.style.display = 'block';
                cropOverlay.style.display = 'block';
                cropperEmpty.style.display = 'none';
                alignCropOverlay();
            } else {
                sourceImage.style.display = 'none';
                cropOverlay.style.display = 'none';
                cropperEmpty.style.display = 'flex';
            }
        }
        
        checkReadyToRecognize();
        updatePreprocessing();
    }

    function resetInputs() {
        // 重設亮度與對比度，但保留二值化與自適應勾選狀態
        sliderBrightness.value = 0;
        sliderContrast.value = 0;
        valBrightness.textContent = 0;
        valContrast.textContent = 0;
    }

    // ==========================================================================
    // 即時相機模組
    // ==========================================================================
    async function loadCameraDevices() {
        try {
            // 請求權限以列出設備
            await navigator.mediaDevices.getUserMedia({ video: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            cameraSelect.innerHTML = '';
            
            if (videoDevices.length === 0) {
                cameraSelect.innerHTML = '<option value="">未偵測到任何相機</option>';
                return;
            }
            
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `相機 ${index + 1}`;
                cameraSelect.appendChild(option);
            });
        } catch (err) {
            console.error('無法列出相機設備:', err);
            cameraSelect.innerHTML = '<option value="">無法取得相機授權</option>';
        }
    }

    async function startCamera() {
        stopCamera();
        
        const deviceId = cameraSelect.value;
        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: 'environment', // 手機預設使用後鏡頭
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        try {
            cameraStatusEl.querySelector('.status-indicator').className = 'status-indicator warning';
            cameraStatusEl.querySelector('.status-text').textContent = '啟動相機中...';
            
            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoFeed.srcObject = cameraStream;
            videoFeed.style.display = 'block';
            cropperEmpty.style.display = 'none';
            
            btnStartCamera.disabled = true;
            btnStopCamera.disabled = false;
            
            cameraStatusEl.querySelector('.status-indicator').className = 'status-indicator ready';
            cameraStatusEl.querySelector('.status-text').textContent = '相機已連線';
            
            videoFeed.onloadedmetadata = () => {
                cropOverlay.style.display = 'block';
                alignCropOverlay();
                checkReadyToRecognize();
                // 啟動即時預處理 Canvas 渲染迴圈
                requestAnimationFrame(livePreprocessLoop);
            };
        } catch (err) {
            console.error('無法開啟相機:', err);
            cameraStatusEl.querySelector('.status-indicator').className = 'status-indicator error';
            cameraStatusEl.querySelector('.status-text').textContent = '相機開啟失敗';
            alert('無法存取相機，請確認瀏覽器相機權限已開啟。');
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        videoFeed.srcObject = null;
        videoFeed.style.display = 'none';
        
        btnStartCamera.disabled = false;
        btnStopCamera.disabled = true;
        
        cameraStatusEl.querySelector('.status-indicator').className = 'status-indicator';
        cameraStatusEl.querySelector('.status-text').textContent = '相機未啟動';
        
        if (activeTab === 'webcam-tab') {
            cropOverlay.style.display = 'none';
            cropperEmpty.style.display = 'flex';
        }
        checkReadyToRecognize();
    }

    // 即時預處理循環渲染
    function livePreprocessLoop() {
        if (activeTab === 'webcam-tab' && cameraStream && !videoFeed.paused && !videoFeed.ended) {
            updatePreprocessing();
            requestAnimationFrame(livePreprocessLoop);
        }
    }

    btnStartCamera.addEventListener('click', startCamera);
    btnStopCamera.addEventListener('click', stopCamera);
    cameraSelect.addEventListener('change', () => {
        if (cameraStream) startCamera();
    });

    // ==========================================================================
    // 檔案上傳模組
    // ==========================================================================
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleUploadedFile(fileInput.files[0]);
        }
    });

    function handleUploadedFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('請上傳影像格式檔案。');
            return;
        }
        
        fileNameText.textContent = file.name;
        fileInfoContainer.style.display = 'flex';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            sourceImage.src = e.target.result;
            sourceImage.style.display = 'block';
            cropperEmpty.style.display = 'none';
            
            sourceImage.onload = () => {
                cropOverlay.style.display = 'block';
                alignCropOverlay();
                checkReadyToRecognize();
                updatePreprocessing();
            };
        };
        reader.readAsDataURL(file);
    }

    btnRemoveFile.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        sourceImage.src = '';
        sourceImage.style.display = 'none';
        fileInfoContainer.style.display = 'none';
        cropOverlay.style.display = 'none';
        cropperEmpty.style.display = 'flex';
        checkReadyToRecognize();
        updatePreprocessing();
    });

    // ==========================================================================
    // 測試模擬車牌生成器
    // ==========================================================================
    function generateMockPlate() {
        const text = mockPlateText.value.trim().toUpperCase();
        if (!text) {
            alert('請輸入模擬車牌的文字。');
            return;
        }
        
        // 建立臨時 Canvas 來繪製車牌
        const canvas = document.createElement('canvas');
        canvas.width = 450;
        canvas.height = 140;
        
        drawMockPlateOnCanvas(text, mockPlateType.value, canvas);
        
        // 將繪製結果作為 Base64 DataURL 匯入來源影像
        sourceImage.src = canvas.toDataURL();
        sourceImage.style.display = 'block';
        cropperEmpty.style.display = 'none';
        
        sourceImage.onload = () => {
            cropOverlay.style.display = 'block';
            // 針對模擬車牌，我們將裁剪框貼合全圖 (100%)，讓辨識更專注
            cropBoxPercent = { x: 4, y: 4, w: 92, h: 92 };
            renderCropBox();
            alignCropOverlay();
            checkReadyToRecognize();
            updatePreprocessing();
        };
    }

    function drawMockPlateOnCanvas(text, type, canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        let bgColor = '#ffffff';
        let textColor = '#111827';
        let borderColor = '#111827';
        let isElectric = false;
        let isTaxi = false;
        
        switch (type) {
            case 'car-white':
                bgColor = '#ffffff';
                textColor = '#111827';
                borderColor = '#111827';
                break;
            case 'car-green':
                bgColor = '#047857'; // 綠色
                textColor = '#ffffff';
                borderColor = '#ffffff';
                isElectric = true;
                break;
            case 'moto-yellow':
                bgColor = '#facc15'; // 黃色
                textColor = '#111827';
                borderColor = '#111827';
                break;
            case 'moto-red':
                bgColor = '#b91c1c'; // 紅色
                textColor = '#ffffff';
                borderColor = '#ffffff';
                break;
            case 'taxi-yellow':
                bgColor = '#ffffff';
                textColor = '#b91c1c'; // 紅字
                borderColor = '#b91c1c';
                isTaxi = true;
                break;
        }
        
        // 1. 填滿底色
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);
        
        // 2. 繪製邊框
        ctx.lineWidth = 6;
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        
        // 電動車與計程車的內側飾條設計
        if (isElectric) {
            // 內側亮綠底線
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#047857';
            ctx.strokeRect(8, 8, w - 16, h - 16);
            ctx.lineWidth = 2;
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(12, 12, w - 24, h - 24);
        } else if (isTaxi) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeRect(8, 8, w - 16, h - 16);
            ctx.lineWidth = 2;
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(12, 12, w - 24, h - 24);
        }
        
        // 3. 繪製真實防盜螺絲孔效果
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(60, 20, 8, 0, Math.PI * 2);
        ctx.arc(w - 60, 20, 8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(58, 18, 4, 0, Math.PI * 2);
        ctx.arc(w - 62, 18, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // 4. 繪製頂端/底部副標籤文字
        ctx.fillStyle = textColor;
        if (isElectric) {
            ctx.font = 'bold 12px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('E L E C T R I C   V E H I C L E', w / 2, 22);
        } else {
            ctx.font = 'bold 12px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('T A I W A N', w / 2, 22);
        }
        
        // 5. 繪製中央大車牌字元 (模擬標準台灣車牌字體 Orbitron)
        ctx.fillStyle = textColor;
        ctx.font = '900 68px "Orbitron", "Impact", "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 微調高度
        ctx.fillText(text, w / 2, h / 2 + 10);
    }

    btnGenerateMock.addEventListener('click', generateMockPlate);

    // ==========================================================================
    // 裁剪框對齊與拖曳互動（Pointer Events）
    // ==========================================================================
    function getActiveSourceElement() {
        if (activeTab === 'webcam-tab') {
            return cameraStream ? videoFeed : null;
        } else {
            return (sourceImage.src && sourceImage.src !== window.location.href) ? sourceImage : null;
        }
    }

    function alignCropOverlay() {
        const activeEl = getActiveSourceElement();
        if (!activeEl || activeEl.style.display === 'none') {
            cropOverlay.style.display = 'none';
            return;
        }
        
        // 取得該元素在瀏覽器畫面上的實際渲染尺寸與位置
        const rect = activeEl.getBoundingClientRect();
        const parentRect = cropperWrapper.getBoundingClientRect();
        
        cropOverlay.style.left = `${rect.left - parentRect.left}px`;
        cropOverlay.style.top = `${rect.top - parentRect.top}px`;
        cropOverlay.style.width = `${rect.width}px`;
        cropOverlay.style.height = `${rect.height}px`;
        cropOverlay.style.display = 'block';
    }

    // 視窗大小變更時，自動重新計算對齊
    window.addEventListener('resize', alignCropOverlay);

    // 渲染裁剪框位置樣式 (套用百分比)
    function renderCropBox() {
        cropBox.style.left = `${cropBoxPercent.x}%`;
        cropBox.style.top = `${cropBoxPercent.y}%`;
        cropBox.style.width = `${cropBoxPercent.w}%`;
        cropBox.style.height = `${cropBoxPercent.h}%`;
    }

    // Pointer Down 監聽
    cropBox.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        isDragging = true;
        dragStart.pointerX = e.clientX;
        dragStart.pointerY = e.clientY;
        
        dragStart.boxX = cropBoxPercent.x;
        dragStart.boxY = cropBoxPercent.y;
        dragStart.boxW = cropBoxPercent.w;
        dragStart.boxH = cropBoxPercent.h;
        
        if (e.target.classList.contains('crop-handle')) {
            if (e.target.classList.contains('handle-nw')) dragType = 'nw';
            else if (e.target.classList.contains('handle-ne')) dragType = 'ne';
            else if (e.target.classList.contains('handle-se')) dragType = 'se';
            else if (e.target.classList.contains('handle-sw')) dragType = 'sw';
        } else {
            dragType = 'move';
        }
        
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    });

    function onPointerMove(e) {
        if (!isDragging) return;
        
        const dx = e.clientX - dragStart.pointerX;
        const dy = e.clientY - dragStart.pointerY;
        
        // 換算為 cropOverlay 寬高比例百分比
        const dxPct = (dx / cropOverlay.clientWidth) * 100;
        const dyPct = (dy / cropOverlay.clientHeight) * 100;
        
        const minW = 10;
        const minH = 5;
        
        if (dragType === 'move') {
            cropBoxPercent.x = Math.max(0, Math.min(100 - dragStart.boxW, dragStart.boxX + dxPct));
            cropBoxPercent.y = Math.max(0, Math.min(100 - dragStart.boxH, dragStart.boxY + dyPct));
        } else if (dragType === 'se') {
            cropBoxPercent.w = Math.max(minW, Math.min(100 - dragStart.boxX, dragStart.boxW + dxPct));
            cropBoxPercent.h = Math.max(minH, Math.min(100 - dragStart.boxY, dragStart.boxH + dyPct));
        } else if (dragType === 'sw') {
            const newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - minW, dragStart.boxX + dxPct));
            cropBoxPercent.w = dragStart.boxW + (dragStart.boxX - newX);
            cropBoxPercent.x = newX;
            cropBoxPercent.h = Math.max(minH, Math.min(100 - dragStart.boxY, dragStart.boxH + dyPct));
        } else if (dragType === 'ne') {
            cropBoxPercent.w = Math.max(minW, Math.min(100 - dragStart.boxX, dragStart.boxW + dxPct));
            const newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - minH, dragStart.boxY + dyPct));
            cropBoxPercent.h = dragStart.boxH + (dragStart.boxY - newY);
            cropBoxPercent.y = newY;
        } else if (dragType === 'nw') {
            const newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - minW, dragStart.boxX + dxPct));
            cropBoxPercent.w = dragStart.boxW + (dragStart.boxX - newX);
            cropBoxPercent.x = newX;
            const newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - minH, dragStart.boxY + dyPct));
            cropBoxPercent.h = dragStart.boxH + (dragStart.boxY - newY);
            cropBoxPercent.y = newY;
        }
        
        renderCropBox();
        updatePreprocessing();
    }

    function onPointerUp() {
        isDragging = false;
        dragType = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
    }

    // 初始化時先調用渲染一次
    renderCropBox();

    // ==========================================================================
    // 影像預處理與 Canvas 繪製運算
    // ==========================================================================
    function updatePreprocessing() {
        const activeEl = getActiveSourceElement();
        if (!activeEl) return;
        
        // 取得來源影像的原始解析度
        let sourceW = 0;
        let sourceH = 0;
        
        if (activeEl.tagName === 'VIDEO') {
            sourceW = activeEl.videoWidth;
            sourceH = activeEl.videoHeight;
        } else {
            sourceW = activeEl.naturalWidth;
            sourceH = activeEl.naturalHeight;
        }
        
        if (sourceW === 0 || sourceH === 0) return;
        
        // 計算原始比例坐標
        const cropX = Math.floor(sourceW * (cropBoxPercent.x / 100));
        const cropY = Math.floor(sourceH * (cropBoxPercent.y / 100));
        const cropW = Math.floor(sourceW * (cropBoxPercent.w / 100));
        const cropH = Math.floor(sourceH * (cropBoxPercent.h / 100));
        
        if (cropW <= 0 || cropH <= 0) return;
        
        // 1. 繪製裁剪後的原圖到 canvasCropped
        canvasCropped.width = cropW;
        canvasCropped.height = cropH;
        const ctxCropped = canvasCropped.getContext('2d');
        ctxCropped.drawImage(activeEl, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        
        // 2. 建立臨時畫布進行預處理運算 (在裁剪大小下運算，效能與精確度較佳)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropW;
        tempCanvas.height = cropH;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvasCropped, 0, 0);
        
        if (togglePreprocess.checked) {
            const imgData = tempCtx.getImageData(0, 0, cropW, cropH);
            const data = imgData.data;
            
            const brightness = parseInt(sliderBrightness.value);
            const contrastVal = parseInt(sliderContrast.value);
            const contrast = (contrastVal / 100) * 128;
            const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            
            // 灰階、亮度與對比調整
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                gray = gray + brightness;
                gray = contrastFactor * (gray - 128) + 128;
                gray = Math.max(0, Math.min(255, gray));
                
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            
            // 閥值二值化 (Adaptive 自適應 或 Global 固定閥值)
            if (chkAdaptive.checked) {
                const T = Math.max(3, Math.min(25, parseInt(sliderThreshold.value) / 10));
                const S = Math.floor(cropW / 8);
                adaptiveThresholdBradley(cropW, cropH, data, data, S, T);
            } else {
                const threshold = parseInt(sliderThreshold.value);
                for (let i = 0; i < data.length; i += 4) {
                    const gray = data[i];
                    const val = gray >= threshold ? 255 : 0;
                    data[i] = val;
                    data[i + 1] = val;
                    data[i + 2] = val;
                }
            }
            
            // 反轉顏色（當黑字變白底，或白字變黑底時實用）
            if (chkInvert.checked) {
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 255 - data[i];
                    data[i + 1] = 255 - data[i + 1];
                    data[i + 2] = 255 - data[i + 2];
                }
            }
            
            tempCtx.putImageData(imgData, 0, 0);
        }
        
        // 3. 將預處理後的結果等比例縮放至 targetHeight (120px)，並加上 20px 白色外框 (Padding) 繪製到 canvasPreprocessed
        // 這能保證 Tesseract 辨識時，字型大小最適合且不受邊緣切割線干擾
        const targetHeight = 120;
        const scaleFactor = targetHeight / cropH;
        const targetWidth = Math.floor(cropW * scaleFactor);
        const padding = 20;
        
        canvasPreprocessed.width = targetWidth + padding * 2;
        canvasPreprocessed.height = targetHeight + padding * 2;
        const ctxPreprocessed = canvasPreprocessed.getContext('2d');
        
        // 滿填純白背景
        ctxPreprocessed.fillStyle = '#ffffff';
        ctxPreprocessed.fillRect(0, 0, canvasPreprocessed.width, canvasPreprocessed.height);
        
        // 啟用高品質圖像平滑縮放
        ctxPreprocessed.imageSmoothingEnabled = true;
        ctxPreprocessed.imageSmoothingQuality = 'high';
        
        // 繪製縮放後的黑白圖於中央
        ctxPreprocessed.drawImage(tempCanvas, 0, 0, cropW, cropH, padding, padding, targetWidth, targetHeight);
    }

    // Bradley-Roth 自適應二值化 (Bradley Adaptive Thresholding)
    function adaptiveThresholdBradley(width, height, inputData, outputData, S, T) {
        // 先建立灰階快取陣列
        const grayscale = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            grayscale[i] = inputData[i * 4];
        }

        // 建立積分影像 (Integral Image) 用於 O(1) 快速取得局部區塊平均
        const integral = new Uint32Array(width * height);
        for (let x = 0; x < width; x++) {
            let sum = 0;
            for (let y = 0; y < height; y++) {
                const idx = y * width + x;
                sum += grayscale[idx];
                if (x === 0) {
                    integral[idx] = sum;
                } else {
                    integral[idx] = integral[idx - 1] + sum;
                }
            }
        }

        // 套用局部閾值
        const s2 = Math.floor(S / 2);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                
                const x1 = Math.max(0, x - s2);
                const x2 = Math.min(width - 1, x + s2);
                const y1 = Math.max(0, y - s2);
                const y2 = Math.min(height - 1, y + s2);
                
                const count = (x2 - x1 + 1) * (y2 - y1 + 1);
                
                // 透過積分影像計算加總
                let sum = integral[y2 * width + x2];
                if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
                if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
                if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];
                
                const avg = sum / count;
                const val = grayscale[idx];
                
                // 核心判定式：若當前點灰階值低於局部平均的一定比例，則為黑字 (0)，否則為背景 (255)
                const binarized = (val * 100 < avg * (100 - T)) ? 0 : 255;
                
                const outIdx = idx * 4;
                outputData[outIdx] = binarized;
                outputData[outIdx + 1] = binarized;
                outputData[outIdx + 2] = binarized;
                outputData[outIdx + 3] = 255;
            }
        }
    }

    // 監聽所有滑桿與勾選變更
    sliderBrightness.addEventListener('input', (e) => {
        valBrightness.textContent = e.target.value;
        updatePreprocessing();
    });
    sliderContrast.addEventListener('input', (e) => {
        valContrast.textContent = e.target.value;
        updatePreprocessing();
    });
    sliderThreshold.addEventListener('input', (e) => {
        valThreshold.textContent = e.target.value;
        updatePreprocessing();
    });
    
    togglePreprocess.addEventListener('change', updatePreprocessing);
    chkAdaptive.addEventListener('change', updatePreprocessing);
    chkInvert.addEventListener('change', updatePreprocessing);

    // ==========================================================================
    // Tesseract.js 車牌辨識控制
    // ==========================================================================
    function checkReadyToRecognize() {
        const activeEl = getActiveSourceElement();
        if (ocrStatus === 'ready' && activeEl) {
            btnRecognize.disabled = false;
        } else {
            btnRecognize.disabled = true;
        }
    }

    // 智慧型台灣車牌格式自動校正 (LPR Autocorrect Mapping)
    function correctPlateText(text) {
        let cleanText = text.replace(/[^A-Z0-9-]/g, '').trim();
        if (!cleanText) return '';
        
        // 1. 自動補上被漏辨識的連接號 '-'
        if (!cleanText.includes('-') && cleanText.length >= 5) {
            if (cleanText.length === 7) {
                // 例如 ABC1234 -> ABC-1234
                cleanText = cleanText.slice(0, 3) + '-' + cleanText.slice(3);
            } else if (cleanText.length === 6) {
                // 可能是 AB-1234 (舊式) 或 ABC-123 (機車)
                // 判斷第3碼是否為數字，若為數字通常是 AB-1234
                const thirdChar = cleanText[2];
                if (thirdChar >= '0' && thirdChar <= '9') {
                    cleanText = cleanText.slice(0, 2) + '-' + cleanText.slice(2);
                } else {
                    cleanText = cleanText.slice(0, 3) + '-' + cleanText.slice(3);
                }
            } else if (cleanText.length === 5) {
                // 可能是 123-AB 或 AB-123
                const secondChar = cleanText[1];
                const thirdChar = cleanText[2];
                if (secondChar >= '0' && secondChar <= '9' && thirdChar >= '0' && thirdChar <= '9') {
                    // 123-AB
                    cleanText = cleanText.slice(0, 3) + '-' + cleanText.slice(3);
                } else {
                    // AB-123
                    cleanText = cleanText.slice(0, 2) + '-' + cleanText.slice(2);
                }
            }
        }
        
        // 2. 格式化後之語意/字元替代修正 (解決 O/0, I/1, Z/2 等混淆)
        if (cleanText.includes('-')) {
            const parts = cleanText.split('-');
            if (parts.length === 2) {
                let part1 = parts[0];
                let part2 = parts[1];
                
                // 字母到數字的對照表 (用於數字區)
                const letterToNumber = { 'O': '0', 'D': '0', 'I': '1', 'L': '1', 'T': '1', 'Z': '2', 'S': '5', 'B': '8', 'G': '6', 'A': '4' };
                // 數字到字母的對照表 (用於字母區)
                const numberToLetter = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B' };
                
                const countLetters = str => (str.match(/[A-Z]/g) || []).length;
                const countNumbers = str => (str.match(/[0-9]/g) || []).length;
                
                // 格式 A：前英後數 (例如 ABC-1234, AB-1234, ABC-123)
                if (countLetters(part1) >= countNumbers(part1) && countNumbers(part2) >= countLetters(part2)) {
                    // 修正第一部分：英文字母區 (將其中的數字修正為對應字母，如 8 -> B)
                    let correctedPart1 = '';
                    for (let char of part1) {
                        if (char >= '0' && char <= '9') {
                            correctedPart1 += numberToLetter[char] || char;
                        } else {
                            correctedPart1 += char;
                        }
                    }
                    
                    // 修正第二部分：數字區 (將其中的字母修正為對應數字，如 O -> 0, I -> 1)
                    let correctedPart2 = '';
                    for (let char of part2) {
                        if (char >= 'A' && char <= 'Z') {
                            correctedPart2 += letterToNumber[char] || char;
                        } else {
                            correctedPart2 += char;
                        }
                    }
                    
                    return correctedPart1 + '-' + correctedPart2;
                }
                
                // 格式 B：前數後英 (例如 1234-AB, 12-3456, 123-ABC)
                if (countNumbers(part1) >= countLetters(part1) && countLetters(part2) >= countNumbers(part2)) {
                    // 修正第一部分：數字區 (將其中的字母修正為數字)
                    let correctedPart1 = '';
                    for (let char of part1) {
                        if (char >= 'A' && char <= 'Z') {
                            correctedPart1 += letterToNumber[char] || char;
                        } else {
                            correctedPart1 += char;
                        }
                    }
                    
                    // 修正第二部分：英文字母區 (將其中的數字修正為字母)
                    let correctedPart2 = '';
                    for (let char of part2) {
                        if (char >= '0' && char <= '9') {
                            correctedPart2 += numberToLetter[char] || char;
                        } else {
                            correctedPart2 += char;
                        }
                    }
                    
                    return correctedPart1 + '-' + correctedPart2;
                }
            }
        }
        
        return cleanText;
    }

    async function performOcr() {
        if (ocrStatus !== 'ready') return;
        
        btnRecognize.disabled = true;
        btnSpinner.style.display = 'block';
        btnText.textContent = '車牌解析中...';
        setOcrStatus('processing', '辨識中... 0%');

        try {
            // Tesseract 必須使用經過等比例放大與加白邊的 canvasPreprocessed 進行辨識
            const targetCanvas = canvasPreprocessed;
            
            const result = await worker.recognize(targetCanvas);
            const { text, confidence } = result.data;
            
            console.log('原始辨識結果:', text, '信心度:', confidence);
            
            // 透過智慧格式優化模組進行車牌修正
            const finalPlate = correctPlateText(text) || '未偵測到';
            
            // 呈現結果
            displayResult(finalPlate, confidence);
            
            setOcrStatus('ready', '辨識引擎準備就緒');
        } catch (err) {
            console.error('辨識出錯:', err);
            setOcrStatus('ready', '辨識引擎準備就緒');
            alert('辨識過程中發生錯誤，請再試一次。');
        } finally {
            btnRecognize.disabled = false;
            btnSpinner.style.display = 'none';
            btnText.textContent = '立即辨識車牌';
        }
    }

    function displayResult(plateText, confidence) {
        resultPlateDisplay.textContent = plateText;
        resultPlateEdit.value = plateText;
        resultPlateEdit.disabled = false;
        
        // 信心度長條圖
        resultConfidenceBar.style.width = `${confidence}%`;
        resultConfidenceText.textContent = `${Math.round(confidence)}%`;
        
        // 設定信心度色彩
        if (confidence >= 80) {
            resultConfidenceBar.style.background = 'var(--color-success)';
        } else if (confidence >= 55) {
            resultConfidenceBar.style.background = 'var(--color-warning)';
        } else {
            resultConfidenceBar.style.background = 'var(--color-danger)';
        }
        
        // 配合目前選取的車牌樣式更新結果顯示卡的底色
        updateResultPlateStyle();
        
        btnTts.disabled = false;
        btnSaveLog.disabled = false;
    }

    function updateResultPlateStyle() {
        // 依據當前模擬車牌選擇，或是預設樣式套用結果卡片
        plateVisualBox.className = 'plate-inner';
        
        if (activeTab === 'mock-tab') {
            plateVisualBox.classList.add(mockPlateType.value);
            if (mockPlateType.value === 'car-green') {
                plateTagDisplay.textContent = '電動車';
            } else {
                plateTagDisplay.textContent = 'TAIWAN';
            }
        } else {
            plateVisualBox.classList.add('car-white');
            plateTagDisplay.textContent = 'TAIWAN';
        }
    }

    // 監聽手動修正輸入框
    resultPlateEdit.addEventListener('input', (e) => {
        resultPlateDisplay.textContent = e.target.value.toUpperCase();
    });

    btnRecognize.addEventListener('click', performOcr);

    // ==========================================================================
    // 語音朗讀 (Web Speech API) 與歷史紀錄 (LocalStorage)
    // ==========================================================================
    
    // 語音朗讀
    function speakPlate() {
        const text = resultPlateDisplay.textContent;
        if (!text || text === '------' || text === '未偵測到') return;
        
        // 分離連字符，使朗讀更順暢
        const cleanTextForTts = text.replace('-', ' 減 ').split('').join(' ');
        
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // 停止目前的播放
            const utterance = new SpeechSynthesisUtterance(`辨識車牌號碼為： ${cleanTextForTts}`);
            utterance.lang = 'zh-TW';
            utterance.rate = 0.95; // 微慢的速度
            window.speechSynthesis.speak(utterance);
        } else {
            alert('您的瀏覽器不支援語音合成朗讀。');
        }
    }

    btnTts.addEventListener('click', speakPlate);

    // 歷史紀錄本地存檔
    function saveLog() {
        const plate = resultPlateDisplay.textContent;
        if (!plate || plate === '------' || plate === '未偵測到') return;
        
        const confidence = parseInt(resultConfidenceText.textContent);
        const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
        
        // 擷取目前預處理 Canvas 畫面作為預覽縮圖
        const cropImg = canvasCropped.toDataURL('image/jpeg', 0.85);
        
        const logEntry = {
            id: Date.now(),
            plate: plate,
            confidence: confidence,
            timestamp: timestamp,
            cropImg: cropImg
        };
        
        historyList.unshift(logEntry); // 插入最前面
        localStorage.setItem('lpr_history', JSON.stringify(historyList));
        
        renderHistory();
        
        // 按鈕動畫與停用
        btnSaveLog.textContent = '儲存成功！';
        btnSaveLog.disabled = true;
        setTimeout(() => {
            btnSaveLog.textContent = '確認儲存';
            btnSaveLog.disabled = false;
        }, 1500);
    }

    btnSaveLog.addEventListener('click', saveLog);

    // 渲染歷史紀錄表格
    function renderHistory() {
        historyTbody.innerHTML = '';
        
        if (historyList.length === 0) {
            historyTbody.innerHTML = `
                <tr class="empty-history-row">
                    <td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem 0;">無辨識紀錄</td>
                </tr>
            `;
            return;
        }
        
        historyList.forEach(log => {
            const tr = document.createElement('tr');
            
            // 信心度顏色標籤
            let confClass = 'low';
            if (log.confidence >= 80) confClass = 'high';
            else if (log.confidence >= 55) confClass = 'med';
            
            tr.innerHTML = `
                <td><img src="${log.cropImg}" class="history-crop-img" alt="車牌"></td>
                <td class="history-plate-num">${log.plate}</td>
                <td><span class="history-confidence ${confClass}">${log.confidence}%</span></td>
                <td class="history-time">${log.timestamp}</td>
                <td>
                    <button class="btn-delete-log" data-id="${log.id}" title="刪除此紀錄">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </td>
            `;
            
            // 綁定刪除事件
            tr.querySelector('.btn-delete-log').addEventListener('click', (e) => {
                const logId = parseInt(e.currentTarget.getAttribute('data-id'));
                deleteHistoryItem(logId);
            });
            
            historyTbody.appendChild(tr);
        });
    }

    function deleteHistoryItem(id) {
        historyList = historyList.filter(log => log.id !== id);
        localStorage.setItem('lpr_history', JSON.stringify(historyList));
        renderHistory();
    }

    function clearAllHistory() {
        if (confirm('確定要清除所有的辨識紀錄嗎？此動作無法復原。')) {
            historyList = [];
            localStorage.removeItem('lpr_history');
            renderHistory();
        }
    }

    btnClearHistory.addEventListener('click', clearAllHistory);

    // 匯出 CSV 檔
    function exportCsv() {
        if (historyList.length === 0) {
            alert('目前沒有辨識紀錄可以匯出。');
            return;
        }
        
        let csvContent = '\uFEFF'; // 加入 UTF-8 BOM 避免 Excel 開啟中文亂碼
        csvContent += 'ID,時間,車牌號碼,信賴度\n';
        
        historyList.forEach(log => {
            csvContent += `"${log.id}","${log.timestamp}","${log.plate}","${log.confidence}%"\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `車牌辨識歷史紀錄_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    btnExportCsv.addEventListener('click', exportCsv);

    // ==========================================================================
    // 網頁進入點載入載入
    // ==========================================================================
    function initApp() {
        // 讀取本地歷史紀錄
        const stored = localStorage.getItem('lpr_history');
        if (stored) {
            try {
                historyList = JSON.parse(stored);
            } catch (e) {
                historyList = [];
            }
        }
        renderHistory();
        
        // 載入相機清單
        loadCameraDevices();
        
        // 初始化 OCR 引擎
        initOcr();
    }

    // 當文件完全載入後啟動
    window.addEventListener('DOMContentLoaded', initApp);
})();
