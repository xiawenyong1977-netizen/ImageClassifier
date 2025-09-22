// 测试异步并行对计算密集型任务的效果

// 模拟计算密集型任务
function heavyComputation(name, duration) {
  return new Promise((resolve) => {
    console.log(`${name} 开始计算`);
    const start = Date.now();
    
    // 模拟计算密集型任务
    let result = 0;
    for (let i = 0; i < duration * 1000000; i++) {
      result += Math.random();
    }
    
    const end = Date.now();
    console.log(`${name} 完成，耗时: ${end - start}ms`);
    resolve({ name, result, duration: end - start });
  });
}

// 串行执行
async function serialExecution() {
  console.log('=== 串行执行 ===');
  const start = Date.now();
  
  const result1 = await heavyComputation('任务1', 50);
  const result2 = await heavyComputation('任务2', 50);
  const result3 = await heavyComputation('任务3', 50);
  
  const end = Date.now();
  console.log(`串行总耗时: ${end - start}ms`);
  return [result1, result2, result3];
}

// 并行执行
async function parallelExecution() {
  console.log('=== 并行执行 ===');
  const start = Date.now();
  
  const results = await Promise.all([
    heavyComputation('任务1', 50),
    heavyComputation('任务2', 50),
    heavyComputation('任务3', 50)
  ]);
  
  const end = Date.now();
  console.log(`并行总耗时: ${end - start}ms`);
  return results;
}

// 运行测试
async function runTest() {
  console.log('开始性能测试...\n');
  
  // 串行测试
  await serialExecution();
  console.log('');
  
  // 并行测试
  await parallelExecution();
  console.log('');
  
  console.log('测试完成！');
}

// 在浏览器中运行
if (typeof window !== 'undefined') {
  runTest();
} else {
  console.log('请在浏览器中运行此测试');
}
