#!/usr/bin/env python3
"""
全カテゴリ画像「余白ゼロ・カード最大化リサイズ」スクリプト（背景変更なし）
- 背景の色やピクセルは一切変更・削除・白化しません
- 外周の余白（パディング）のみを自動検出し、タイトクロップ
- カードの最大サイズ（幅400px、高さ200px）いっぱいにアスペクト比維持で最大化
"""

import os
import glob
import cv2
import numpy as np

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'categories')

def crop_and_maximize_only(filepath):
    filename = os.path.basename(filepath)
    img = cv2.imread(filepath)
    if img is None:
        return f"Skip: {filename}"
    
    h, w = img.shape[:2]
    
    # 4隅の色を取得（背景色とみなす）
    corners = [
        img[0, 0].astype(int),
        img[0, w-1].astype(int),
        img[h-1, 0].astype(int),
        img[h-1, w-1].astype(int)
    ]
    bg_color = np.median(corners, axis=0)
    
    # 背景色との色差分を計算
    diff = np.abs(img.astype(int) - bg_color)
    is_subject = np.any(diff > 10, axis=2)
    
    # 白背景（>245）の場合も考慮
    is_non_white = np.any(img < 246, axis=2)
    
    # どちらかで被写体領域を判定
    # コーナーが白に近い（>240）なら is_non_white を優先、そうでなければ diff を使用
    if np.mean(bg_color) > 235:
        subject_mask = is_non_white
    else:
        subject_mask = is_subject
    
    if np.any(subject_mask):
        y_indices, x_indices = np.where(subject_mask)
        min_y, max_y = np.min(y_indices), np.max(y_indices)
        min_x, max_x = np.min(x_indices), np.max(x_indices)
        
        # 1pxマージン
        crop_min_y = max(0, min_y - 1)
        crop_max_y = min(h, max_y + 2)
        crop_min_x = max(0, min_x - 1)
        crop_max_x = min(w, max_x + 2)
        
        cropped = img[crop_min_y:crop_max_y, crop_min_x:crop_max_x]
    else:
        cropped = img
    
    ch, cw = cropped.shape[:2]
    target_max_w = 400
    target_max_h = 200
    
    scale = min(target_max_w / cw, target_max_h / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LANCZOS4
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=interpolation)
    
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    return f"Maximized (no bg change): {filename} -> {cw}x{ch} to {new_w}x{new_h}"

def main():
    files = sorted(glob.glob(os.path.join(IMG_DIR, '*.jpg')) + glob.glob(os.path.join(IMG_DIR, '*.png')))
    print(f"Processing {len(files)} files (Crop & Maximize only, no bg change)...")
    for f in files:
        res = crop_and_maximize_only(f)
        print(res)

if __name__ == '__main__':
    main()
