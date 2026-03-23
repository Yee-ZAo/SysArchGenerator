const ConnectionGenerator = require('./services/ConnectionGenerator');
const fs = require('fs');
const path = require('path');

// 加载test001.json数据
const testData = require('./uploads/test001.json');
const modules = testData.modules;

console.log('=== 使用实际测试数据调试连接生成 ===');
console.log('模块数量:', modules.length);
modules.forEach((mod, idx) => {
  console.log(`${idx + 1}. ${mod.moduleName}:`);
  console.log(`   分类: ${mod.moduleCategory}`);
  console.log(`   接口:`, mod.moduleInterface);
});

// 测试连接约束（无约束）
const constraints = [];

const generator = new ConnectionGenerator(constraints);

console.log('\n=== 测试extractInterfaces ===');
const interfaces = generator.extractInterfaces(modules);
console.log('提取的接口数量:', interfaces.length);
interfaces.forEach((intf, idx) => {
  console.log(`  ${idx + 1}. ${intf.instanceId}: ${intf.interfaceName} (${intf.interfaceType}, ${intf.ioType})`);
});

console.log('\n=== 测试generatePossibleConnections ===');
const possibleConnections = generator.generatePossibleConnections(interfaces);
console.log('可能连接数量:', possibleConnections.length);
possibleConnections.forEach((conn, idx) => {
  console.log(`  ${idx + 1}. ${conn.source.instanceId}(${conn.source.interfaceName}) -> ${conn.target.instanceId}(${conn.target.interfaceName})`);
});

console.log('\n=== 测试canConnect 对每组接口 ===');
for (let i = 0; i < Math.min(interfaces.length, 3); i++) {
  for (let j = i + 1; j < Math.min(interfaces.length, 4); j++) {
    const intf1 = interfaces[i];
    const intf2 = interfaces[j];
    const canConnect = generator.canConnect(intf1, intf2);
    console.log(`${intf1.instanceId}(${intf1.interfaceType}) ↔ ${intf2.instanceId}(${intf2.interfaceType}): ${canConnect}`);
  }
}

console.log('\n=== 测试完整连接方案生成 ===');
const schemes = generator.generateAllConnectionSchemes(modules, constraints);
console.log('生成的连接方案数量:', schemes.length);

if (schemes.length === 0) {
  console.log('\n=== 分析原因 ===');
  
  // 检查接口类型问题
  console.log('\n接口类型统计:');
  const typeMap = {};
  interfaces.forEach(intf => {
    const type = intf.interfaceType || 'null';
    typeMap[type] = (typeMap[type] || 0) + 1;
  });
  console.log(typeMap);
  
  // 检查接口方向
  const dirMap = {};
  interfaces.forEach(intf => {
    const dir = intf.ioType || 'unknown';
    dirMap[dir] = (dirMap[dir] || 0) + 1;
  });
  console.log('接口方向统计:', dirMap);
  
  // 手动测试几对接口的连接可能性
  const powerInterface = interfaces.find(intf => intf.moduleId === '电源' && intf.ioType === 'out');
  const controllerInInterface = interfaces.find(intf => intf.moduleId === '控制器' && intf.interfaceName === '电源输入');
  const controllerOutInterface = interfaces.find(intf => intf.moduleId === '控制器' && intf.interfaceName === '控制信号');
  
  console.log('\n特定接口检查:');
  console.log('电源模块输出接口:', powerInterface);
  console.log('控制器输入接口:', controllerInInterface);
  console.log('控制器输出接口:', controllerOutInterface);
  
  if (powerInterface && controllerInInterface) {
    console.log(`电源输出 -> 控制器输入: ${generator.canConnect(powerInterface, controllerInInterface)}`);
  }
}