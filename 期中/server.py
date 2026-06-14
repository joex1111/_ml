# -*- coding: utf-8 -*-
"""
智能車牌辨識系統 - EasyOCR 深度學習後端服務
"""

import os
import re
import base64
import numpy as np
import cv2
import easyocr
from flask import Flask, request, jsonify, send_from_directory
from threading import Timer
import webbrowser

app = Flask(__name__, static_folder='.', static_url_path='')

# 宣告全域變數讀取器
reader = None

def init_easyocr():
    global reader
    print("\n" + "="*60)
    print(" 正在載入 EasyOCR 深度學習模型 (第一次執行需要下載約 50MB 權重檔)...")
    print("="*60)
    # 使用 'en' 語系（車牌只包含英文字母與數字），gpu=False 強制在 CPU 上執行以獲得最高相容性
    reader = easyocr.Reader(['en'], gpu=False)
    print("\nEasyOCR 載入成功！系統準備就緒。")
    print("="*60 + "\n")

# 託管前端靜態首頁
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# 連線健康檢查 (前端用來偵測後端是否開機完畢)
@app.route('/api/health')
def health():
    if reader is not None:
        return jsonify({'status': 'ok', 'message': 'EasyOCR online'})
    else:
        return jsonify({'status': 'loading', 'message': 'EasyOCR is loading'}), 503

# 車牌辨識主 API
@app.route('/api/recognize', methods=['POST'])
def recognize():
    if reader is None:
        return jsonify({'error': '辨識引擎尚未載入完成'}), 503
        
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': '未提供影像資料'}), 400
            
        img_data = data['image']
        # 移除 Base64 的標頭 (如 data:image/jpeg;base64,)
        if ',' in img_data:
            img_data = img_data.split(',')[1]
            
        # 解碼 Base64
        img_bytes = base64.b64decode(img_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({'error': '影像資料解碼失敗'}), 400
            
        # 使用 EasyOCR 進行文字偵測與辨識
        # detail=1 會回傳 偵測框坐標、文字內容、信心度
        results = reader.readtext(img, detail=1)
        
        if not results:
            return jsonify({'plate': '', 'confidence': 0})
            
        # 按照偵測框的 X 軸左側坐標由左至右排序，確保車牌字元順序正確 (例如 ABC 與 1234 合併)
        results = sorted(results, key=lambda x: x[0][0][0])
        
        texts = []
        confidences = []
        
        for bbox, text, conf in results:
            # 清理文字：只保留英文字母、數字以及連接號 -
            text_cleaned = re.sub(r'[^a-zA-Z0-9-]', '', text).upper()
            if text_cleaned:
                texts.append(text_cleaned)
                confidences.append(conf * 100)
                
        if not texts:
            return jsonify({'plate': '', 'confidence': 0})
            
        # 合併辨識出的車牌區段
        final_plate = "".join(texts)
        # 計算平均信心度
        avg_confidence = sum(confidences) / len(confidences)
        
        print(f"[辨識成功] 車牌結果: {final_plate} | 信心度: {avg_confidence:.2f}%")
        
        return jsonify({
            'plate': final_plate,
            'confidence': avg_confidence
        })
        
    except Exception as e:
        print(f"[辨識錯誤] 伺服器異常: {str(e)}")
        return jsonify({'error': f'伺服器辨識異常: {str(e)}'}), 500

def open_browser():
    webbrowser.open("http://localhost:5000/")

if __name__ == '__main__':
    # 延遲 1.5 秒後在預設瀏覽器中開啟系統網頁
    Timer(1.5, open_browser).start()
    
    # 初始化 EasyOCR 模型
    init_easyocr()
    
    # 啟動 Flask 伺服器，運行於 5000 端口
    app.run(host='0.0.0.0', port=5000, debug=False)
