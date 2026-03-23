/**
 * 测试有产品库时的筛选
 */
const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const fs = require('fs');
const path = require('path');

// 创建模拟产品库数据
const mockProductLibrary = [
  {
    moduleName: "电源1",
    name: "电源1",
    moduleCategory: "电源",
    categories: ["电源"],
    moduleInterface: [
      { interfaceName: "电源输出", interfaceType: "电气", interfaceDirection: "out", interfaceQuantity: 1 }
    ],
    moduleAttributes: {
      cost: 7500,
      weight: 65,
      power: 1100,
      reliability: 0.92,
      quantity: 1
    }
  },
  {
    moduleName: "控制器1",
    name: "控制器1",
    moduleCategory: "控制器",
    categories: ["控制器"],
    moduleInterface: [
      { interfaceName: "电源输入", interfaceType: "电气", interfaceDirection: "in", interfaceQuantity: 1 },
      { interfaceName: "控制信号", interfaceType: "信号", interfaceDirection: "out", interfaceQuantity: 1 }
    ],
    moduleAttributes: {
      cost: 2000,
      weight: 40,
      power: 300,
      reliability: 0.95,
      quantity: 1
    }
  },
  {
    moduleName: "作动器1",
    name: "作动器1",
    moduleCategory: "作动器",
    categories: ["作动器"],
    moduleInterface: [
      { interfaceName: "电源输入", interfaceType: "电气", interfaceDirection: "in", interfaceQuantity: 1 },
      { interfaceName: "控制信号", interfaceType: "信号", interfaceDirection: "in", interfaceQuantity: 1 }
    ],
    moduleAttributes: {
      cost: 3000,
      weight: 65,
      power: 350,
      reliability: 0.95,
      quantity: 1
    }
  }
];

// 读取测试模块
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploads', 'test001.json'), 'utf8'));

console.log('=== 测试有产品库的生成流程 ===\n');

// 创建生成器
const generator = new ArchitectureGenerator();

// 监听进度
generator.on('progress', (data) => {
  console.log('[进度]', data);
});

console.log('开始生成方案...');
generator.generateSolutions(
  testData.modules,
  [{ type: 'connection', module1: '电源', module2: '控制器', relation_type: '绑定' }],
  Infinity,
  mockProductLibrary
).then(result => {
  console.log('\n=== 生成结果 ===');
  console.log('成功:', result.success);
  console.log('方案数:', result.count);
  console.log('错误:', result.error);
  
  if (result.success && result.count > 0) {
    const solutions = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
    console.log('第一个方案模块:');
    solutions[0].leafModules.forEach((lm, i) => {
      console.log(`  ${i+1}. ${lm.module.moduleName || lm.module.name} (${lm.module.moduleCategory})`);
    });
    console.log('连接数:', solutions[0].connections.length);
    console.log('属性:', solutions[0].properties);
  }
}).catch(err => {
  console.error('生成失败:', err);
});