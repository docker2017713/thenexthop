#!/bin/bash

# 图片调整大小脚本
# 使用方法: ./scripts/resize-images.sh

echo "开始调整图片大小..."

# 创建不同尺寸的文件夹
mkdir -p images/small
mkdir -p images/medium
mkdir -p images/large

# 调整图片大小
for img in images/*.png; do
    if [ -f "$img" ]; then
        filename=$(basename "$img" .png)
        
        echo "处理: $filename"
        
        # 小尺寸 (400px宽度)
        sips -Z 400 "$img" --out "images/small/${filename}-small.png"
        
        # 中等尺寸 (600px宽度)
        sips -Z 600 "$img" --out "images/medium/${filename}-medium.png"
        
        # 大尺寸 (800px宽度)
        sips -Z 800 "$img" --out "images/large/${filename}-large.png"
        
        echo "✅ $filename 处理完成"
    fi
done

echo "🎉 所有图片调整完成！"
echo "小尺寸: images/small/"
echo "中等尺寸: images/medium/"
echo "大尺寸: images/large/"
