#!/usr/bin/env python3
"""
创建扩展图标文件 icon.png
需要安装 Pillow 库: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    # 创建 128x128 的图片
    size = 128
    img = Image.new('RGB', (size, size), color='#ff0050')
    draw = ImageDraw.Draw(img)
    
    # 尝试使用字体，如果失败则使用默认字体
    try:
        # Windows 系统字体路径
        font_path = 'C:/Windows/Fonts/msyh.ttc'  # 微软雅黑
        if os.path.exists(font_path):
            font = ImageFont.truetype(font_path, 60)
        else:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()
    
    # 绘制文字"关"
    text = "关"
    # 获取文字尺寸
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    # 居中绘制
    position = ((size - text_width) // 2, (size - text_height) // 2 - 10)
    draw.text(position, text, fill='white', font=font)
    
    # 保存图片
    img.save('icon.png')
    print('图标文件 icon.png 创建成功！')
    
except ImportError:
    print('错误：需要安装 Pillow 库')
    print('请运行: pip install Pillow')
    print('\n或者手动创建 icon.png 文件：')
    print('1. 尺寸：128x128 像素')
    print('2. 背景色：#ff0050（抖音红）')
    print('3. 文字：白色"关"字，居中显示')
except Exception as e:
    print(f'创建图标失败: {e}')
    print('\n请手动创建 icon.png 文件：')
    print('1. 尺寸：128x128 像素')
    print('2. 背景色：#ff0050（抖音红）')
    print('3. 文字：白色"关"字，居中显示')
