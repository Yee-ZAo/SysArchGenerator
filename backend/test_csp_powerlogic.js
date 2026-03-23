// 直接测试CSPSolver中的功耗计算逻辑
const CSPSolver = require('./services/CSPSolver');

// 创建一个实例
const cspSolver = new CSPSolver([]);

// 测试一个电源模块
const powerModule = {
  name: '电源模块',
  categories: ['电源'],
  quantity: 2,
  properties: {
    cost: 8000,
    weight: 70,
    power: 1200,
    reliability: 0.90
  }
};

// 测试一个控制器模块
const controllerModule = {
  name: '控制器模块',
  categories: ['控制器'],
  quantity: 2,
  properties: {
    cost: 2180,
    weight: 46,
    power: 350,
    reliability: 0.90
  }
};

// 测试一个作动器模块
const actuatorModule = {
  name: '作动器模块',
  categories: ['作动器'],
  quantity: 2,
  properties: {
    cost: 3300,
    weight: 70,
    power: 380,
    reliability: 0.90
  }
};

console.log('=== 功耗逻辑测试 ===\n');

// 测试isPowerModule函数
console.log('1. 模块识别:');
console.log(`   电源模块 isPower: ${cspSolver.isPowerModule(powerModule)}`);
console.log(`   控制器 isPower: ${cspSolver.isPowerModule(controllerModule)}`);
console.log(`   作动器 isPower: ${cspSolver.isPowerModule(actuatorModule)}`);

// 测试calculateModuleProperties函数（如果存在）
if (typeof cspSolver.calculateModuleProperties === 'function') {
  console.log('\n2. 单个模块属性计算:');
  const powerProps = cspSolver.calculateModuleProperties(powerModule, 2);
  const controllerProps = cspSolver.calculateModuleProperties(controllerModule, 2);
  const actuatorProps = cspSolver.calculateModuleProperties(actuatorModule, 2);
  
  console.log(`   电源模块 x2: 成本=${powerProps.cost}, 重量=${powerProps.weight}, 功耗=${powerProps.power}, 可靠度=${powerProps.reliability}`);
  console.log(`   控制器 x2: 成本=${controllerProps.cost}, 重量=${controllerProps.weight}, 功耗=${controllerProps.power}, 可靠度=${controllerProps.reliability}`);
  console.log(`   作动器 x2: 成本=${actuatorProps.cost}, 重量=${actuatorProps.weight}, 功耗=${actuatorProps.power}, 可靠度=${actuatorProps.reliability}`);
}

// 手动构建一个解决方案并测试forwardCheckCostWeight
console.log('\n3. 构建解决方案并测试约束:');
const testSolution = {
  modules: [powerModule, controllerModule, actuatorModule],
  totalCost: (8000*2) + (2180*2) + (3300*2),
  totalWeight: (70*2) + (46*2) + (70*2),
  totalPower: 0, // 将被计算
  totalReliability: Math.pow(0.9, 6)
};

// 手动计算总功耗（排除电源模块）
let totalPowerExcludingPower = 0;
if (!cspSolver.isPowerModule(controllerModule)) {
  totalPowerExcludingPower += controllerModule.properties.power * controllerModule.quantity;
}
if (!cspSolver.isPowerModule(actuatorModule)) {
  totalPowerExcludingPower += actuatorModule.properties.power * actuatorModule.quantity;
}
testSolution.totalPower = totalPowerExcludingPower;

console.log('   手动计算的解决方案:');
console.log(`     总成本: ${testSolution.totalCost}`);
console.log(`     总重量: ${testSolution.totalWeight}`);
console.log(`     总功耗（排除电源）: ${testSolution.totalPower}`);
console.log(`     总可靠度: ${testSolution.totalReliability}`);

const globalConstraints = {
  cost_max: 50000,
  weight_max: 400,
  power_max: 2400,
  reliability_min: 0.8
};

console.log('\n4. 直接调用forwardCheckCostWeight:');
const result = cspSolver.forwardCheckCostWeight(testSolution, globalConstraints);
console.log(`   forwardCheckCostWeight结果: ${result}`);

console.log('\n5. 检查各约束条件:');

// 手动检查每个约束
console.log(`   a) 成本检查: ${testSolution.totalCost} <= ${globalConstraints.cost_max}? ${testSolution.totalCost <= globalConstraints.cost_max}`);
console.log(`   b) 重量检查: ${testSolution.totalWeight} <= ${globalConstraints.weight_max}? ${testSolution.totalWeight <= globalConstraints.weight_max}`);
console.log(`   c) 功耗检查: ${testSolution.totalPower} <= ${globalConstraints.power_max}? ${testSolution.totalPower <= globalConstraints.power_max}`);
console.log(`   d) 可靠度检查: ${testSolution.totalReliability} >= ${globalConstraints.reliability_min}? ${testSolution.totalReliability >= globalConstraints.reliability_min}`);

// 测试一个失败的场景（把power_max设置得很低）
console.log('\n6. 测试失败场景 (power_max=1000):');
const strictConstraints = { ...globalConstraints, power_max: 1000 };
const strictResult = cspSolver.forwardCheckCostWeight(testSolution, strictConstraints);
console.log(`   forwardCheckCostWeight (power_max=1000): ${strictResult}`);

// 调试totalPower在不同情况下的计算
console.log('\n7. 测试totalPower计算函数:');
if (cspSolver.calculateModuleProperties) {
  // 创建一个简单的测试解决方案，只包含电源模块
  const onlyPowerSolution = {
    modules: [powerModule],
    totalCost: 8000 * 2,
    totalWeight: 70 * 2,
    totalPower: 0,
    totalReliability: Math.pow(0.9, 2)
  };
  
  // 计算totalPower（应排除电源模块功耗）
  let powerInSolution = 0;
  if (!cspSolver.isPowerModule(powerModule)) {
    powerInSolution += powerModule.properties.power * powerModule.quantity;
  }
  onlyPowerSolution.totalPower = powerInSolution;
  console.log(`   仅电源模块的解决方案: totalPower = ${onlyPowerSolution.totalPower}`);
  const onlyPowerResult = cspSolver.forwardCheckCostWeight(onlyPowerSolution, globalConstraints);
  console.log(`   forwardCheckCostWeight结果: ${onlyPowerResult}`);
}