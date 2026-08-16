#!/usr/bin/env python3
"""
高精度な背景白化＆余白ゼロ・カード最大化スクリプト
- 薄いグレーや床の四角い影（輝度 > 200）を完全な純白（255, 255, 255）に変換
- 車や商品の輪郭を検出し、四角い画像枠を完全除去
- タイヤ付きホイール (ll16, ll17, ll18) の外周を完全な純白に
- ロゴ・商品を余白ゼロで最大化リサイズ
"""

import os
import glob
import cv2
import numpy as np

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'categories')

def clean_and_whiten_image(filepath):
    filename = os.path.basename(filepath)
    img = cv2.imread(filepath)
    if img is None:
        return f"Skip: {filename}"
    
    h, w = img.shape[:2]
    
    # 1. タイヤ付きホイール (ll16, ll17, ll18) の円形切り抜き＆白背景化
    if filename in ['ll16.jpg', 'll17.jpg', 'll18.jpg']:
        # 円形マスク
        center_x, center_y = w // 2, h // 2
        radius = int(min(w, h) * 0.47)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(mask, (center_x, center_y), radius, 255, -1)
        
        # マスクの外側は完全な純白（255, 255, 255）
        img[mask == 0] = [255, 255, 255]
    
    # 2. 背景の純白化処理（特に四角い影や薄いグレーの除去）
    # 外周から白〜薄いグレーの領域をフラッドフィルで塗りつぶす
    # 種ポイント: 外周の全ピクセル
    mask = np.zeros((h + 2, w + 2), np.uint8)
    
    # 外周のポイントからフラッドフィル
    step = max(1, min(w, h) // 20)
    for x in range(0, w, step):
        for y in [0, h-1]:
            # ピクセルが暗すぎない（背景と思われる）場合
            b, g, r = int(img[y, x, 0]), int(img[y, x, 1]), int(img[y, x, 2])
            if (b + g + r) / 3 > 160:
                cv2.floodFill(img, mask, (x, y), (255, 255, 255),
                              (30, 30, 30), (30, 30, 30),
                              cv2.FLOODFILL_FIXED_RANGE)
    
    for y in range(0, h, step):
        for x in [0, w-1]:
            b, g, r = int(img[y, x, 0]), int(img[y, x, 1]), int(img[y, x, 2])
            if (b + g + r) / 3 > 160:
                cv2.floodFill(img, mask, (x, y), (255, 255, 255),
                              (30, 30, 30), (30, 30, 30),
                              cv2.FLOODFILL_FIXED_RANGE)
    
    # さらに、明るいピクセル（輝度 > 220）を純白（255, 255, 255）にトーンマッピング
    # ただしロゴや被写体のディテールを残すため、外周から連結した領域または高輝度部
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bright_mask = gray >= 222
    img[bright_mask] = [255, 255, 255]
    
    # 3. 被写体のバウンディングボックスを検出し、余白を完全にトリミング（tight crop）
    # 白判定: B, G, R すべてが 250 以上
    non_white = np.any(img < 250, axis=2)
    
    if np.any(non_white):
        y_indices, x_indices = np.where(non_white)
        min_y, max_y = np.min(y_indices), np.max(y_indices)
        min_x, max_x = np.min(x_indices), np.max(x_indices)
        
        # わずかなマージン（1px）
        crop_min_y = max(0, min_y - 1)
        crop_max_y = min(h, max_y + 2)
        crop_min_x = max(0, min_x - 1)
        crop_max_x = min(w, max_x + 2)
        
        cropped = img[crop_min_y:crop_max_y, crop_min_x:crop_max_x]
    else:
        cropped = img
    
    # 4. カード内最大サイズ（幅400px、高さ200px）に合わせてアスペクト比維持リサイズ
    ch, cw = cropped.shape[:2]
    target_max_w = 400
    target_max_h = 200
    
    scale = min(target_max_w / cw, target_max_h / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LANCZOS4
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=interpolation)
    
    # 5. 保存
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    
    return f"Done: {filename} -> {new_w}x{new_h}"

def main():
    files = sorted(glob.glob(os.path.join(IMG_DIR, '*.jpg')) + glob.glob(os.path.join(IMG_DIR, '*.png')))
    print(f"Processing {len(files)} files...")
    for f in files:
        res = clean_and_whiten_image(f)
        print(res)

if __name__ == '__main__':
    main()
