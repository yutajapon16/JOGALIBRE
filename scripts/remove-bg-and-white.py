#!/usr/bin/env python3
"""
背景削除＆純白背景（#FFFFFF）化スクリプト
OpenCVを使用して、画像の背景を検出し、純白（255, 255, 255）に置き換えます。
"""

import os
import glob
import cv2
import numpy as np

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'categories')

def process_image(filepath):
    filename = os.path.basename(filepath)
    img = cv2.imread(filepath)
    if img is None:
        return f"Skip (cannot read): {filename}"

    h, w = img.shape[:2]
    
    # 1. 4隅および外周のサンプル色をチェック
    corners = [
        img[0, 0], img[0, w-1],
        img[h-1, 0], img[h-1, w-1],
        img[0, w//2], img[h-1, w//2],
        img[h//2, 0], img[h//2, w-1]
    ]
    
    avg_corner_brightness = np.mean([np.mean(c) for c in corners])
    
    # GAPロゴの特別対応（四角い青枠を白背景にしてロゴを中央配置）
    if filename == 'gap.jpg':
        # 白背景に青いGAPロゴを作成、または青い四角の中のGAPロゴを綺麗に切り抜き
        # GAPロゴは白背景にネイビーの正方形/文字
        # 既存のgap.jpgの文字部分を活かす、または洗練された白背景GAPロゴにする
        pass

    # パターンA: ほぼ白（230以上）または薄いグレー背景の場合
    # 外周からフラッドフィル＋明るい領域を完全な白にマッピング
    if avg_corner_brightness > 210:
        # 外周からのフラッドフィルで白に近い背景を完全白に
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # マスク作成: 外周から白〜薄いグレーの領域を塗りつぶす
        mask = np.zeros((h + 2, w + 2), np.uint8)
        # 背景シード点
        seeds = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1), 
                 (w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2)]
        
        # 元画像をコピー
        out = img.copy()
        
        # 閾値処理：220以上の明るい背景ピクセルを純白（255,255,255）に
        # トーンカーブで高輝度部分（215-255）を255にクリップ
        # まず色差と明るさで背景領域を特定
        for sx, sy in seeds:
            cv2.floodFill(out, mask, (sx, sy), (255, 255, 255), 
                          (15, 15, 15), (15, 15, 15), 
                          cv2.FLOODFILL_FIXED_RANGE)
        
        # さらに、外周近くで明るいグレー（>225）の部分を純白に
        bright_bg = (out[:, :, 0] > 225) & (out[:, :, 1] > 225) & (out[:, :, 2] > 225)
        out[bright_bg] = [255, 255, 255]
        
        cv2.imwrite(filepath, out, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return f"Light BG normalized: {filename}"

    # パターンB: 背景が暗い・実写などの場合（GrabCutで背景除去）
    else:
        try:
            # GrabCut による前景抽出
            mask = np.zeros(img.shape[:2], np.uint8)
            bgdModel = np.zeros((1, 65), np.float64)
            fgdModel = np.zeros((1, 65), np.float64)
            
            # 余白を設定（画像枠の2%内側を前景候補矩形とする）
            margin_x = max(2, int(w * 0.03))
            margin_y = max(2, int(h * 0.03))
            rect = (margin_x, margin_y, w - 2 * margin_x, h - 2 * margin_y)
            
            cv2.grabCut(img, mask, rect, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_RECT)
            
            # 0 and 2 are background, 1 and 3 are foreground
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')
            
            # マスクのエッジを少し滑らかにする（フェザリング）
            mask_blur = cv2.GaussianBlur(mask2.astype(float), (3, 3), 0)
            mask_blur = np.expand_dims(mask_blur, axis=2)
            
            # 白背景（255, 255, 255）と合成
            white_bg = np.ones_like(img) * 255
            result = (img * mask_blur + white_bg * (1 - mask_blur)).astype(np.uint8)
            
            cv2.imwrite(filepath, result, [cv2.IMWRITE_JPEG_QUALITY, 95])
            return f"GrabCut processed (white bg): {filename}"
        except Exception as e:
            return f"Error processing {filename}: {e}"

def main():
    files = sorted(glob.glob(os.path.join(IMG_DIR, '*.jpg')) + glob.glob(os.path.join(IMG_DIR, '*.png')))
    print(f"Total files to process: {len(files)}")
    for f in files:
        res = process_image(f)
        print(res)

if __name__ == '__main__':
    main()
