const ConnectionGenerator = require('./services/ConnectionGenerator');

// 测试数据
const testModules = [
  {
    name: '电源模块',
    categories: ['电源'],
    quantity: 1,
    interfaces: [
      { type: '电气', io_type: 'out', name: '电气输出1' }
    ]
  },
  {
    name: '控制器',
    categories: ['控制器'],
    quantity: 1,
    interfaces: [
      { type: '电气', io_type: 'in', name: '电气输入' },
      { type: '信号', io_type: 'out', name: '信号输出' }
    ]
  },
  {
    name: '作动器',
    categories: ['作动器'],
    quantity: 1,
    interfaces: [
      { type: '电气', io_type: 'in', name: '电气输入' },
      { type: '信号', io_type: 'in', name: '信号输入' }
    ]
  }
];

// 测试连接约束
const testConstraints = [];

console.log('=== 连接生成器测试 ===');
console.log('模块数量:', testModules.length);

const generator = new ConnectionGenerator(testConstraints);
const schemes = generator.generateAllConnectionSchemes(testModules, testConstraints);

console.log('生成连接方案数量:', schemes.length);
console.log('====================');

if (schemes.length > 0) {
  console.log('\n第一个连接方案:');
  console.log(JSON.stringify(schemes[0], null, 2));
  
  console.log('\n所有方案统计:');
  schemes.forEach((scheme, index) => {
    console.log(`方案 ${index + 1}: ${scheme.length} 个连接`);
  });
} else {
  console.log('没有生成任何连接方案！');
  
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
  console.log('可能连接列表:');
  possibleConnections.forEach((conn, idx) => {
    console.log(`  ${idx + 1}. ${conn.source.instanceId}(${conn.source.interfaceName}) -> ${conn.target.instanceId}(${conn.target.interfaceName})`);
  });
  
  // 测试canConnect函数
  console.log('\n=== canConnect测试 ===');
  if (interfaces.length >= 2) {
    const intf1 = interfaces[0];
    const intf2 = interfaces[1];
    const canConnect = generator.canConnect(intf1, intf2);
    console.log(`${intf1.instanceId}(${intf1.interfaceName}, ${intf1.ioType}) <-> ${intf2.instanceId}(${intf2.interfaceName}, ${intf2.ioType})`);
    console.log('canConnect结果:', canConnect);
    console.log('intf1.interfaceType:', intf1.interfaceType);
    console.log('intf2.interfaceType:', intf2.interfaceType);
  }
}