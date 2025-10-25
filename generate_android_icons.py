#!/usr/bin/env python3
"""
Android图标生成脚本
将单个PNG图标文件生成不同尺寸的Android图标
"""

import os
from PIL import Image
import sys

def generate_android_icons(source_icon_path, output_dir="android/app/src/main/res"):
    """
    生成Android所需的不同尺寸图标
    
    Args:
        source_icon_path: 源图标文件路径
        output_dir: 输出目录
    """
    
    # Android图标尺寸配置
    icon_sizes = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192
    }
    
    try:
        # 打开源图标
        with Image.open(source_icon_path) as img:
            print(f"✅ 源图标尺寸: {img.size}")
            
            # 确保是RGBA模式
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # 为每个尺寸生成图标
            for folder, size in icon_sizes.items():
                # 创建输出目录
                output_folder = os.path.join(output_dir, folder)
                os.makedirs(output_folder, exist_ok=True)
                
                # 调整尺寸
                resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
                
                # 保存图标
                output_path = os.path.join(output_folder, 'ic_launcher.png')
                resized_img.save(output_path, 'PNG')
                
                print(f"✅ 生成 {folder}/ic_launcher.png ({size}x{size})")
            
            print("\n🎉 所有Android图标生成完成！")
            print("📱 现在可以重新构建APK了")
            
    except FileNotFoundError:
        print(f"❌ 找不到源图标文件: {source_icon_path}")
        return False
    except Exception as e:
        print(f"❌ 生成图标时出错: {e}")
        return False
    
    return True

if __name__ == "__main__":
    # 检查命令行参数
    if len(sys.argv) > 1:
        source_path = sys.argv[1]
    else:
        # 默认使用public目录下的图标
        source_path = "public/icon.png"
    
    print(f"🎨 开始生成Android图标...")
    print(f"📁 源文件: {source_path}")
    
    if os.path.exists(source_path):
        generate_android_icons(source_path)
    else:
        print(f"❌ 源图标文件不存在: {source_path}")
        print("💡 请将你的图标文件放在 public/icon.png 或指定正确的路径")
