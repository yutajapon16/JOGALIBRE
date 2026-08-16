#!/usr/bin/env python3
"""
カテゴリ画像一括最適化スクリプト
1. 被写体（車、ホイール、ロゴ、商品）の境界を自動検出し、余白を完全にトリミング（tight crop）
2. カード内で「サイズギリギリいっぱい」に表示されるよう、余白ゼロでリサイズ
3. 背景を完全な純白（#FFFFFF）にノーマライズ
4. 実写背景のホイール（ll16, ll17, ll18）などを円形/矩形マスクで背景除去
"""

import os
import glob
import cv2
import numpy as np

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'categories')

def normalize_white_bg(img, threshold=225):
    """
    明るいグレー〜白の背景領域を純白(255, 255, 255)に変換
    """
    h, w = img.shape[:2]
    # 外周からフラッドフィルで白に近い背景を完全白に
    mask = np.zeros((h + 2, w + 2), np.uint8)
    seeds = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1),
             (w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2),
             (w//4, 0), (3*w//4, 0), (w//4, h-1), (3*w//4, h-1)]
    
    out = img.copy()
    for sx, sy in seeds:
        if sx < w and sy < h:
            cv2.floodFill(out, mask, (sx, sy), (255, 255, 255),
                          (20, 20, 20), (20, 20, 20),
                          cv2.FLOODFILL_FIXED_RANGE)
    
    # 閾値以上の明るいピクセル（特に四角い枠の原因となる薄いグレー）を完全な白に
    # 明るさ(R+G+B)/3 が threshold より大きい外周寄りの領域を純白に
    gray = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    bright_pixels = (gray >= threshold)
    out[bright_pixels] = [255, 255, 255]
    
    return out

def crop_and_maximize_subject(img, is_logo=False, filename=""):
    """
    非白領域（被写体）を検出し、余白をトリミングして画像いっぱいに最大化
    """
    h, w = img.shape[:2]
    
    # タイヤ付きホイール (ll16, ll17, ll18) の特別対応: 円形/楕円形マスクで背景除去
    if filename in ['ll16.jpg', 'll17.jpg', 'll18.jpg']:
        # 円形マスクを作成してタイヤ・ホイール本体を抽出
        center_x, center_y = w // 2, h // 2
        radius = int(min(w, h) * 0.46)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(mask, (center_x, center_y), radius, 255, -1)
        
        # マスク外を白にする
        out = img.copy()
        out[mask == 0] = [255, 255, 255]
        img = out
    
    # 非白ピクセル（被写体）のバウンディングボックスを検出
    # 白判定: B, G, R すべてが 245 以上
    non_white = np.any(img < 242, axis=2)
    
    # 非白ピクセルが存在する場合
    if np.any(non_white):
        y_indices, x_indices = np.where(non_white)
        min_y, max_y = np.min(y_indices), np.max(y_indices)
        min_x, max_x = np.min(x_indices), np.max(x_indices)
        
        # わずかなマージン（1〜2%）を追加
        margin_y = max(1, int((max_y - min_y) * 0.02))
        margin_x = max(1, int((max_x - min_x) * 0.02))
        
        crop_min_y = max(0, min_y - margin_y)
        crop_max_y = min(h, max_y + margin_y + 1)
        crop_min_x = max(0, min_x - margin_x)
        crop_max_x = min(w, max_x + margin_x + 1)
        
        cropped = img[crop_min_y:crop_max_y, crop_min_x:crop_max_x]
    else:
        cropped = img
    
    # 最大サイズにリサイズ（カードの比率に合わせて最大幅400px、最大高さ200px）
    ch, cw = cropped.shape[:2]
    target_max_w = 400
    target_max_h = 200
    
    # アスペクト比を維持して最大化
    scale = min(target_max_w / cw, target_max_h / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LANCZOS4
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=interpolation)
    
    # 背景白のキャンバスに配置（中央揃え、またはリサイズそのまま）
    # 余白なしでそのまま保存
    return resized

def process_file(filepath):
    filename = os.path.basename(filepath)
    img = cv2.imread(filepath)
    if img is None:
        return f"Skip: {filename}"
    
    # 1. 背景の純白化
    img_white_bg = normalize_white_bg(img)
    
    # 2. オートクロップ＆最大化
    is_logo = filename in [
        'nike.jpg', 'adidas.jpg', 'newbalance.jpg', 'ape.jpg',
        'abercrombie.jpg', 'converse.jpg', 'diesel.jpg', 'gap.jpg',
        'lacoste.jpg', 'michaelkors.jpg', 'puma.jpg', 'tommyhilfiger.jpg',
        'uniqlo.jpg', 'vans.jpg', 'zara.jpg'
    ]
    
    result = crop_and_maximize_subject(img_white_bg, is_logo=is_logo, filename=filename)
    
    # 3. 保存
    cv2.imwrite(filepath, result, [cv2.IMWRITE_JPEG_QUALITY, 95])
    
    h, w = result.shape[:2]
    return f"Processed: {filename} -> {w}x{h}"

def main():
    files = sorted(glob.glob(os.path.join(IMG_DIR, '*.jpg')) + glob.glob(os.path.join(IMG_DIR, '*.png')))
    print(f"Total files to process: {len(files)}")
    for f in files:
        res = process_file(f)
        print(res)

if __name__ == '__main__':
    main()
