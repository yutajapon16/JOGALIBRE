#!/usr/bin/env python3
"""
指定画像専用のサイズ統一＆背景処理スクリプト
1. ホイール4枚 (ar16, ar17, ar18, aros):
   - 背景改善は行わない（元画像のピクセル色を維持）
   - ホイールの余白をトリミングし、4枚すべて同じ200x200pxいっぱいのサイズに統一
2. adidas 2枚 (adidas_men_shoes, adidas_women_clothing):
   - 背景の薄いグレー [234, 238, 239] を完全な純白 (255, 255, 255) に変換
   - 余白をトリミングし、カードサイズ（幅400px、高さ200px以内）いっぱいに最大化
"""

import os
import cv2
import numpy as np

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'categories')

def process_wheel(filename):
    """
    ホイール画像: 背景色には手を加えず、余白をトリミングして200x200pxに統一
    """
    filepath = os.path.join(IMG_DIR, filename)
    img = cv2.imread(filepath)
    if img is None:
        print(f"Error reading {filename}")
        return
    
    h, w = img.shape[:2]
    
    # ホイールの非白領域（被写体）を検出
    # 背景ピクセル色（コーナーの色）を取得
    bg_color = img[0, 0].astype(int)
    
    # 背景色との差分が一定以上のピクセルを被写体とする
    diff = np.abs(img.astype(int) - bg_color)
    is_subject = np.any(diff > 12, axis=2)
    
    if np.any(is_subject):
        y_indices, x_indices = np.where(is_subject)
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
    
    # 200x200 正方形にアスペクト比を維持して最大化
    ch, cw = cropped.shape[:2]
    target_size = 200
    scale = target_size / max(cw, ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LANCZOS4
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=interpolation)
    
    # 保存
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    print(f"Wheel processed: {filename} -> {new_w}x{new_h}")

def process_adidas(filename):
    """
    adidas画像: 背景のグレー [234, 238, 239] を完全な白に変換し、余白をトリミングして最大化
    """
    filepath = os.path.join(IMG_DIR, filename)
    img = cv2.imread(filepath)
    if img is None:
        print(f"Error reading {filename}")
        return
    
    h, w = img.shape[:2]
    
    # 1. 背景の薄いグレー [234, 238, 239] を検出して純白に変換
    # コーナーの色を基準に外周からフラッドフィル
    mask = np.zeros((h + 2, w + 2), np.uint8)
    seeds = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1),
             (w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2)]
    
    for sx, sy in seeds:
        cv2.floodFill(img, mask, (sx, sy), (255, 255, 255),
                      (18, 18, 18), (18, 18, 18),
                      cv2.FLOODFILL_FIXED_RANGE)
    
    # さらに、外周近くの明るいピクセル（輝度 > 230）を純白に
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bright = gray >= 232
    img[bright] = [255, 255, 255]
    
    # 2. 被写体のバウンディングボックスを検出してトリミング
    non_white = np.any(img < 250, axis=2)
    if np.any(non_white):
        y_indices, x_indices = np.where(non_white)
        min_y, max_y = np.min(y_indices), np.max(y_indices)
        min_x, max_x = np.min(x_indices), np.max(x_indices)
        
        crop_min_y = max(0, min_y - 2)
        crop_max_y = min(h, max_y + 3)
        crop_min_x = max(0, min_x - 2)
        crop_max_x = min(w, max_x + 3)
        
        cropped = img[crop_min_y:crop_max_y, crop_min_x:crop_max_x]
    else:
        cropped = img
    
    # 3. カード最大サイズ（幅400px、高さ200px）にリサイズ
    ch, cw = cropped.shape[:2]
    target_max_w = 400
    target_max_h = 200
    
    scale = min(target_max_w / cw, target_max_h / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LANCZOS4
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=interpolation)
    
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    print(f"Adidas processed: {filename} -> {new_w}x{new_h}")

def process_crop_only(filename, max_w=400, max_h=200):
    """
    背景色には手を加えず、余白のみをトリミングして最大化
    """
    filepath = os.path.join(IMG_DIR, filename)
    img = cv2.imread(filepath)
    if img is None:
        print(f"Error reading {filename}")
        return
    
    h, w = img.shape[:2]
    bg_color = img[0, 0].astype(int)
    diff = np.abs(img.astype(int) - bg_color)
    is_subject = np.any(diff > 10, axis=2)
    
    if np.any(is_subject):
        y_indices, x_indices = np.where(is_subject)
        min_y, max_y = np.min(y_indices), np.max(y_indices)
        min_x, max_x = np.min(x_indices), np.max(x_indices)
        
        crop_min_y = max(0, min_y - 1)
        crop_max_y = min(h, max_y + 2)
        crop_min_x = max(0, min_x - 1)
        crop_max_x = min(w, max_x + 2)
        
        cropped = img[crop_min_y:crop_max_y, crop_min_x:crop_max_x]
    else:
        cropped = img
    
    ch, cw = cropped.shape[:2]
    scale = min(max_w / cw, max_h / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LANCZOS4
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=interpolation)
    
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    print(f"Crop-only processed: {filename} -> {new_w}x{new_h}")

def main():
    # 1. ホイール4枚（背景改善なし、サイズ統一）
    wheel_files = ['ar16.jpg', 'ar17.jpg', 'ar18.jpg', 'aros.jpg']
    for f in wheel_files:
        process_wheel(f)
    
    # 2. adidas 2枚（背景白化＋サイズ最大化）
    adidas_files = ['adidas_men_shoes.jpg', 'adidas_women_clothing.jpg']
    for f in adidas_files:
        process_adidas(f)

    # 3. electronics.jpg（背景改善なし、余白トリミング最大化）
    process_crop_only('electronics.jpg', max_w=400, max_h=200)

if __name__ == '__main__':
    main()
