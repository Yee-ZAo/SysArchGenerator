/**
 * 完整流程调试：模拟实际前端调用
 */
const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const fs = require('fs');
const path = require('path');

// 读取测试数据
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploads', 'test001.json'), 'utf8'));

// 读取产品库（实际从Excel解析后的数据）
let productLibrary = [];
try {
  // 尝试读取已解析的产品库缓存
  const libPath = path.join(__dirname, '..', 'uploads', '产品库.json');
  if (fs.existsSync(libPath)) {
    productLibrary = JSON.parse(fs.readFileSync(libPath, 'utf8'));
  }
} catch (e) {
  console.log('未找到产品库缓存');
}

console.log('=== 完整流程调试 ===');
console.log('模块数据:', JSON.stringify(testData.modules.map(m => ({
  name: m.moduleName,
  category: m.moduleCategory,
  interface: m.moduleInterface,
  parent: m.parentModule,
  attr: m.moduleAttributes
})), null, 2).substring(0, 1000));
console.log('\n产品库模块数:', productLibrary.length);
if (productLibrary.length > 0) {
  console.log('产品库第一个模块:', JSON.stringify(productLibrary[0], null, 2).substring(0, 500));
}

// 创建生成器
const generator = new ArchitectureGenerator();

// 监听进度事件
generator.on('progress', (data) => {
  console.log('[进度]', JSON.stringify(data));
});

// 模拟前端调用
console.log('\n开始生成方案...');
generator.generateSolutions(
  testData.modules,           // 模块定义
  [{ type: 'connection', module1: '电源', module2: '控制器', relation_type: '绑定' }], // 约束
  Infinity,                   // 最大方案数
  productLibrary              // 产品库
).then(result => {
  console.log('\n=== 生成结果 ===');
  console.log('成功:', result.success);
  console.log('方案数:', result.count);
  console.log('文件:', result.filePath);
  
  if (result.success && result.count > 0) {
    // 读取生成的方案
    const solutions = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
    console.log('\n第一个方案:');
    console.log('  模块:', solutions[0].leafModules.map(lm => lm.module.moduleName || lm.module.name).join(', '));
    console.log('  连接数:', solutions[0].connections.length);
    console.log('  属性:', solutions[0].properties);
  }
}).catch(err => {
  console.error('生成失败:', err);
});