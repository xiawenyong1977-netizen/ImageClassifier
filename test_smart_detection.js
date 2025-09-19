// 智能推理测试 - 身份证检测 + 通用物体检测
import ImageClassifierService from './src/services/ImageClassifierService.js';

async function testSmartDetection() {
  console.log('🎯 智能推理测试 - 身份证检测 + 通用物体检测\n');
  
  try {
    const classifier = new ImageClassifierService();
    
    // 显示模型配置
    console.log('📋 模型配置:');
    console.log('- idCard: 身份证识别专用模型 (优先级: 1)');
    console.log('- yolo8s: 通用物体检测模型 (优先级: 2)');
    console.log('');
    
    // 初始化服务（会自动加载所有模型）
    console.log('🔄 初始化服务...');
    await classifier.initialize();
    console.log('');
    
    // 测试智能推理
    console.log('🔍 测试智能推理...');
    
    // 模拟测试图片路径（你需要替换为实际图片）
    const testImages = [
      './test_id_card.jpg',      // 身份证图片
      './test_general.jpg',      // 普通物体图片
      './test_mixed.jpg'         // 混合图片
    ];
    
    for (const imagePath of testImages) {
      console.log(`\n📸 测试图片: ${imagePath}`);
      
      try {
        const result = await classifier.smartDetectObjects(imagePath, {
          idCardConfidenceThreshold: 0.3,
          generalConfidenceThreshold: 0.5,
          maxDetections: 10
        });
        
        console.log('🎯 推理结果:');
        console.log(`- 成功: ${result.success ? '是' : '否'}`);
        console.log(`- 使用模型: ${result.usedModels.join(' → ')}`);
        console.log(`- 检测到物体: ${result.totalDetections} 个`);
        console.log(`- 身份证检测: ${result.idCardDetected ? '是' : '否'}`);
        console.log(`- 处理时间: ${result.processingTime}ms`);
        console.log(`- 推理逻辑: ${result.reasoning}`);
        
        if (result.detections.length > 0) {
          console.log('📋 检测到的物体:');
          result.detections.forEach((detection, index) => {
            console.log(`  ${index + 1}. ${detection.class} (置信度: ${detection.confidence.toFixed(3)})`);
          });
          
          // 如果是身份证检测，显示详细信息
          if (result.idCardDetected) {
            const idCardDetails = classifier.getIdCardDetectionDetails(result.detections);
            console.log('🆔 身份证检测详情:');
            console.log(`- 检测到身份证: ${idCardDetails.detected ? '是' : '否'}`);
            console.log(`- 身份证数量: ${idCardDetails.count}`);
            idCardDetails.details.forEach((detail, index) => {
              console.log(`  ${index + 1}. ${detail.class} (${detail.type}) - 置信度: ${detail.confidence.toFixed(3)}`);
            });
          }
        }
        
      } catch (error) {
        console.log(`❌ 测试失败: ${error.message}`);
      }
    }
    
    console.log('\n🎉 智能推理测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testSmartDetection();
