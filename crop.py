from PIL import Image

def crop_white_space(image_path, output_path):
    img = Image.open(image_path)
    img = img.convert("RGBA")
    data = img.getdata()
    
    width, height = img.size
    
    # Find bounding box
    left, top, right, bottom = width, height, 0, 0
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = data[y * width + x]
            # Ignore pixels that are white or transparent
            if not (r > 240 and g > 240 and b > 240) and a > 0:
                if x < left: left = x
                if x > right: right = x
                if y < top: top = y
                if y > bottom: bottom = y

    if left < right and top < bottom:
        # Add a tiny bit of padding (e.g. 5px)
        pad = 5
        left = max(0, left - pad)
        top = max(0, top - pad)
        right = min(width, right + pad)
        bottom = min(height, bottom + pad)
        
        cropped_img = img.crop((left, top, right, bottom))
        cropped_img.save(output_path)
        print(f"Cropped {image_path} from {img.size} to {cropped_img.size}")
    else:
        print("Image is entirely white!")

crop_white_space("public/icons/logo-text.png", "public/icons/logo-text-cropped.png")
