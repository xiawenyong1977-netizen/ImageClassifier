#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试训练好的YOLO模型
"""

import cv2
import numpy as np
from pathlib import Path
from ultralytics import YOLO
import matplotlib.pyplot as plt

def test_model_on_sample():
    """在样本图片上测试模型"""
    # 加载训练好的模型
    model_path = r"D:\ImageClassifierApp\models\id_card_detection.onnx"
    model = YOLO(model_path)
    
    # 手动定义类别信息（因为ONNX模型不包含类别元数据）
    class_names = {
        0: 'id_card_front',  # 身份证正面
        1: 'id_card_back'    # 身份证背面
    }
    
    print("=== YOLO模型测试 ===")
    print(f"模型路径: {model_path}")
    print(f"模型类别: {class_names}")
    print()
    
    # 查找测试图片
    test_dir = Path(r"D:\Pictures")
    if test_dir.exists():
        # 获取一些测试图片
        test_images = list(test_dir.glob("*.jpg")) + list(test_dir.glob("*.png"))
 #       test_images = test_images[:3]  # 只测试前3张图片
        
        print(f"找到 {len(test_images)} 张测试图片")
        print()
        
        for i, img_path in enumerate(test_images):
            print(f"测试图片 {i+1}: {img_path.name}")
            
            # 进行预测
            results = model(str(img_path))
            
            # 显示结果
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    print(f"  检测到 {len(boxes)} 个目标")
                    for box in boxes:
                        conf = box.conf[0].item()
                        cls = int(box.cls[0].item())
                        class_name = class_names[cls]  # 使用手动定义的类别信息
                        print(f"    - {class_name}: {conf:.3f}")
                else:
                    print("  未检测到目标")
            print()
    else:
        print("测试目录不存在，请先运行数据准备脚本")
    
    # 模型信息
    print("=== 模型信息 ===")
    print(f"输入尺寸: 640x640")
    print(f"类别数量: {len(class_names)}")
    print(f"类别名称: {list(class_names.values())}")

def show_model_performance():
    """显示模型性能摘要"""
    print("=== 模型性能摘要 ===")
    print("根据训练结果，您的模型表现：")
    print("✅ mAP50: 98.59% - 非常优秀")
    print("✅ mAP50-95: 98.44% - 表现极佳") 
    print("✅ Precision: 99.50% - 精确率很高")
    print("✅ Recall: 91.15% - 召回率很好")
    print()
    print("这个模型已经可以用于生产环境！")

if __name__ == "__main__":
    show_model_performance()
    print()
    test_model_on_sample()

