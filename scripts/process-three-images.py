#!/usr/bin/env python3
"""
指定3画像（moto.jpg, training.jpg, iphone.jpg）専用の背景純白化＆カード最大化スクリプト
- 被写体の本体・ディテールを一切欠けさせずに保護
- 外周のグレー/ベージュ/シャドウ背景領域を純白（255, 255, 255）に変換
- 余白をトリミングしてカードサイズ（最大幅400px、高さ200px）いっぱいに最大化
"""

import os
import cv2
import numpy as np

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'categories')

def process_training():
    """
    training.jpg: ベージュ/グレー [238, 227, 223] 背景を純白に変換し、シューズを最大化
    """
    filepath = os.path.join(IMG_DIR, 'training.jpg')
    img = cv2.imread(filepath)
    if img is None:
        print("Error reading training.jpg")
        return
    
    h, w = img.shape[:2]
    
    # 1. 背景のフラッドフィル（外周からベージュ背景を白に）
    mask = np.zeros((h + 2, w + 2), np.uint8)
    seeds = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1),
             (w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2),
             (w//4, 0), (3*w//4, 0), (w//4, h-1), (3*w//4, h-1)]
    
    for sx, sy in seeds:
        cv2.floodFill(img, mask, (sx, sy), (255, 255, 255),
                      (20, 20, 20), (20, 20, 20),
                      cv2.FLOODFILL_FIXED_RANGE)
    
    # さらに明るいベージュ/グレー（輝度 > 220）を純白に
    # ただしシューズ本体が極端に白くない限り、背景領域を白化
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # 外周寄りで明るい部分を白に
    for y in range(h):
        for x in range(w):
            if gray[y, x] >= 222:
                img[y, x] = [255, 255, 255]
    
    # 2. 被写体のトリミング
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
    
    # 3. 最大化リサイズ（400x200）
    ch, cw = cropped.shape[:2]
    scale = min(400 / cw, 200 / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    print(f"training.jpg done: {new_w}x{new_h}")

def process_moto():
    """
    moto.jpg: バイクの下の薄いグレーや影を白化し、バイク本体を最大化
    """
    filepath = os.path.join(IMG_DIR, 'moto.jpg')
    img = cv2.imread(filepath)
    if img is None:
        print("Error reading moto.jpg")
        return
    
    h, w = img.shape[:2]
    
    # 外周からのフラッドフィルで白に近い背景を純白に
    mask = np.zeros((h + 2, w + 2), np.uint8)
    seeds = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1),
             (w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2)]
    
    for sx, sy in seeds:
        cv2.floodFill(img, mask, (sx, sy), (255, 255, 255),
                      (15, 15, 15), (15, 15, 15),
                      cv2.FLOODFILL_FIXED_RANGE)
    
    # 輝度 235 以上の明るい背景を純白に
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    img[gray >= 235] = [255, 255, 255]
    
    # 被写体のトリミング
    non_white = np.any(img < 250, axis=2)
    if np.any(non_white):
        y_indices, x_indices = np.where(non_white)
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
    scale = min(400 / cw, 200 / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    print(f"moto.jpg done: {new_w}x{new_h}")

def process_iphone():
    """
    iphone.jpg: 周囲の薄いグレー [247, 245, 245] を純白に変換し、iPhone本体を最大化
    """
    filepath = os.path.join(IMG_DIR, 'iphone.jpg')
    img = cv2.imread(filepath)
    if img is None:
        print("Error reading iphone.jpg")
        return
    
    h, w = img.shape[:2]
    
    # 外周からのフラッドフィル
    mask = np.zeros((h + 2, w + 2), np.uint8)
    seeds = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1),
             (w//2, 0), (w//2, h-1), (0, h//2), (w-1, h//2)]
    
    for sx, sy in seeds:
        cv2.floodFill(img, mask, (sx, sy), (255, 255, 255),
                      (12, 12, 12), (12, 12, 12),
                      cv2.FLOODFILL_FIXED_RANGE)
    
    # 輝度 238 以上の外周背景を純白に
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    img[gray >= 238] = [255, 255, 255]
    
    # 被写体のトリミング
    non_white = np.any(img < 250, axis=2)
    if np.any(non_white):
        y_indices, x_indices = np.where(non_white)
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
    scale = min(400 / cw, 200 / ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    
    resized = cv2.resize(cropped, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(filepath, resized, [cv2.IMWRITE_JPEG_QUALITY, 96])
    print(f"iphone.jpg done: {new_w}x{new_h}")

def main():
    process_moto()
    process_training()
    process_iphone()

if __name__ == '__main__':
    main()
