const ConnectionGenerator = require('./services/ConnectionGenerator');
const fs = require('fs');

// 使用修正后的测试数据
const testModules = [
  {
    name: '电源',
    moduleName: '电源',
    moduleCategory: '电源',
    quantity: 2,
    moduleInterface: [
      {
        interfaceName: '电源输出',
        interfaceType: '电气',
        interfaceDirection: 'out',
        interfaceQuantity: 1
      }
    ],
    moduleAttributes: {
      cost: 8000,
      weight: 70,
      power: 1200,
      reliability: 0.90,
      quantity: 2
    }
  },
  {
    name: '控制器',
    moduleName: '控制器',
    moduleCategory: '控制器',
    quantity: 2,
    moduleInterface: [
      {
        interfaceName: '电源输入',
        interfaceType: '电气',
        interfaceDirection: 'in',
        interfaceQuantity: 1
      },
      {
        interfaceName: '控制信号',
        interfaceType: '信号',
        interfaceDirection: 'out',
        interfaceQuantity: 1
      }
    ],
    moduleAttributes: {
      cost: 2180,
      weight: 46,
      power: 350,
      reliability: 0.90,
      quantity: 2
    }
  },
  {
    name: '作动器',
    moduleName: '作动器',
    moduleCategory: '作动器',
    quantity: 2,
    moduleInterface: [
      {
        interfaceName: '电源输入',
        interfaceType: '电气',
        interfaceDirection: 'in',
        interfaceQuantity: 1
      },
      {
        interfaceName: '控制信号',
        interfaceType: '信号',
        interfaceDirection: 'in',
        interfaceQuantity: 1
      }
    ],
    moduleAttributes: {
      cost: 3300,
      weight: 70,
      power: 380,
      reliability: 0.90,
      quantity: 2
    }
  }
];

// 测试连接约束
const constraints = [];

console.log('=== 连接生成器修复后测试 ===');
console.log('模块数量:', testModules.length);

const generator = new ConnectionGenerator(constraints);
const schemes = generator.generateAllConnectionSchemes(testModules, constraints);

console.log('生成连接方案数量:', schemes.length);

if (schemes.length > 0) {
  console.log('\n第一个连接方案:');
  console.log(JSON.stringify(schemes[0], null, 2));
  
  // 如果有实际连接，显示一些统计
  let totalConnections = 0;
  schemes.forEach((scheme, idx) => {
    totalConnections += scheme.length;
  });
  console.log('\n方案统计:');
  console.log(`  总方案数: ${schemes.length}`);
  console.log(`  平均连接数: ${(totalConnections / schemes.length).toFixed(2)}`);
  
  // 显示前5个方案的连接数
  console.log('\n前5个方案的连接数:');
  for (let i = 0; i < Math.min(schemes.length, 5); i++) {
    console.log(`  方案 ${i + 1}: ${schemes[i].length} 个连接`);
  }
} else {
  console.log('\n没有生成任何连接方案！');
  
  // 调试输出更多信息
  console.log('\n=== 调试信息 ===');
  
  // 手动测试接口提取
  const interfaces = generator.extractInterfaces(testModules);
  console.log('提取的接口数量:', interfaces.length);
  console.log('接口列表:');
  interfaces.forEach((intf, idx) => {
    console.log(`  ${idx + 1}. ${intf.instanceId}: ${intf.interfaceName} (${intf.interfaceType}, ${intf.ioType})`);
  });
  
  // 手动测试可能的连接
  const possibleConnections = generator.generatePossibleConnections(interfaces);
  console.log('\n可能连接数量:', possibleConnections.length);
  
  // 测试canConnect函数
  console.log('\n=== canConnect测试 ===');
  if (interfaces.length >= 2) {
    for (let i = 0; i < Math.min(interfaces.length, 3); i++) {
      for (let j = i + 1; j < Math.min(interfaces.length, 4); j++) {
        const intf1 = interfaces[i];
        const intf2 = interfaces[j];
        const canConnect = generator.canConnect(intf1, intf2);
        console.log(`${intf1.instanceId}(${intf1.interfaceType}/${intf1.ioType}) ↔ ${intf2.instanceId}(${intf2.interfaceType}/${intf2.ioType}): ${canConnect}`);
      }
    }
  }
}