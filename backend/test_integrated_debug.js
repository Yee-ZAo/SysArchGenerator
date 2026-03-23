/**
 * 集成测试：模拟真实的ArchitectureGenerator流程
 */
const CSPSolver = require('./services/CSPSolver');
const ConnectionGenerator = require('./services/ConnectionGenerator');
const { ModuleStructureHelper } = require('./models/ModuleInfo');

// 模拟从test001.json读取的数据
const modules = [
  {
    name: '液压',
    moduleName: '液压',
    moduleCategory: '液压分系统',
    moduleInterface: [
      { interfaceName: null, interfaceType: null, interfaceDirection: null, interfaceQuantity: null }
    ],
    parentModule: null,
    moduleAttributes: { cost: 50000, weight: 400, power: 2400, reliability: 0.8, quantity: 1 }
  },
  {
    name: '电源',
    moduleName: '电源',
    moduleCategory: '电源',
    moduleInterface: [
      { interfaceName: '电源输出', interfaceType: '电气', interfaceDirection: 'out', interfaceQuantity: 1 }
    ],
    parentModule: '液压',
    moduleAttributes: { cost: 8000, weight: 70, power: 1200, reliability: 0.90, quantity: 2 }
  },
  {
    name: '控制器',
    moduleName: '控制器',
    moduleCategory: '控制器',
    moduleInterface: [
      { interfaceName: '电源输入', interfaceType: '电气', interfaceDirection: 'in', interfaceQuantity: 1 },
      { interfaceName: '控制信号', interfaceType: '信号', interfaceDirection: 'out', interfaceQuantity: 1 }
    ],
    parentModule: '液压',
    moduleAttributes: { cost: 2180, weight: 46, power: 350, reliability: 0.90, quantity: 2 }
  },
  {
    name: '作动器',
    moduleName: '作动器',
    moduleCategory: '作动器',
    moduleInterface: [
      { interfaceName: '电源输入', interfaceType: '电气', interfaceDirection: 'in', interfaceQuantity: 1 },
      { interfaceName: '控制信号', interfaceType: '信号', interfaceDirection: 'in', interfaceQuantity: 1 }
    ],
    parentModule: '液压',
    moduleAttributes: { cost: 3300, weight: 70, power: 380, reliability: 0.90, quantity: 2 }
  }
];

console.log('=== 集成测试：完整流程模拟 ===\n');

// 阶段2: 生成模块信息列表
const moduleInfoList = modules;
console.log(`[阶段2] 模块数量: ${moduleInfoList.length}`);

// 阶段3: 识别根模块和叶子模块
const rootModules = ModuleStructureHelper.identifyRootModules(modules);
const leafModules = ModuleStructureHelper.identifyLeafModules(modules);
console.log(`[阶段3] 根模块数量: ${rootModules.length}, 叶子模块数量: ${leafModules.length}`);

// 阶段4: 提取全局约束
const globalConstraints = ModuleStructureHelper.extractGlobalConstraints(rootModules);
console.log(`[阶段4] 全局约束: 成本<=${globalConstraints.cost_max}, 重量<=${globalConstraints.weight_max}, 功耗<=${globalConstraints.power_max}, 可靠度>=${globalConstraints.reliability_min}`);

// 阶段5: 筛选候选模块 (简化：直接用叶子模块作为候选)
const leafModuleNames = leafModules.map(m => m.name || m.moduleName);
console.log(`[阶段5] 叶子模块名称: ${leafModuleNames.join(', ')}`);

const categoryToCandidates = new Map();
for (const leaf of leafModules) {
  const cats = leaf.categories || (leaf.moduleCategory ? [leaf.moduleCategory] : []);
  for (const cat of cats) {
    if (!categoryToCandidates.has(cat)) {
      categoryToCandidates.set(cat, []);
    }
    categoryToCandidates.get(cat).push(leaf);
  }
}
console.log(`[阶段5] 分类到候选映射: ${Array.from(categoryToCandidates.keys()).join(', ')}`);

// 阶段6: CSP生成模块组合
const cspSolver = new CSPSolver([], [], null);
const moduleCombinations = cspSolver.generateWithCategory(
  leafModules,
  [],
  categoryToCandidates,
  globalConstraints,
  Infinity
);
console.log(`\n[阶段6] 生成模块组合数量: ${moduleCombinations.length}`);

// 调试：打印第一个模块组合的详情
if (moduleCombinations.length > 0) {
  console.log('\n[调试] 第一个模块组合详情:');
  const combo = moduleCombinations[0];
  console.log(`  模块数量: ${combo.modules.length}`);
  combo.modules.forEach((mod, idx) => {
    console.log(`  模块${idx+1}: ${mod.name || mod.moduleName}`);
    console.log(`    - moduleAttributes: ${JSON.stringify(mod.moduleAttributes || mod.properties)}`);
    console.log(`    - moduleInterface: ${JSON.stringify(mod.moduleInterface || mod.interfaces)}`);
  });
}

// 阶段7: 生成连接方案
const connectionConstraints = [];
const connectionGenerator = new ConnectionGenerator(connectionConstraints);

for (let comboIndex = 0; comboIndex < Math.min(moduleCombinations.length, 3); comboIndex++) {
  const moduleCombo = moduleCombinations[comboIndex];
  console.log(`\n[阶段7] 处理模块组合 ${comboIndex + 1}/${moduleCombinations.length}`);
  console.log(`  模块: ${moduleCombo.modules.map(m => m.name || m.moduleName).join(', ')}`);
  
  // 提取接口
  const interfaces = connectionGenerator.extractInterfaces(moduleCombo.modules);
  console.log(`  提取到接口数: ${interfaces.length}`);
  if (interfaces.length > 0) {
    console.log('  接口详情:');
    interfaces.slice(0, 6).forEach((intf, idx) => {
      console.log(`    ${idx+1}. ${intf.instanceId}: ${intf.interfaceName} (${intf.interfaceType}, ${intf.ioType})`);
    });
  }
  
  // 生成连接方案
  const connectionSchemes = connectionGenerator.generateAllConnectionSchemes(
    moduleCombo.modules,
    connectionConstraints
  );
  console.log(`  生成连接方案数: ${connectionSchemes.length}`);
  
  // 测试calculateSolutionProperties (修复后的版本)
  const properties = {
    totalCost: 0,
    totalWeight: 0,
    totalPower: 0,
    totalReliability: 1
  };
  
  for (const mod of moduleCombo.modules) {
    const quantity = mod.quantity || 1;
    // 使用修复后的逻辑：兼容 moduleAttributes
    const props = mod.properties || mod.moduleAttributes || {};
    const cost = props.cost_min || props.cost || 0;
    const weight = props.weight_min || props.weight || 0;
    const power = props.power_min || props.power || 0;
    const reliability = props.reliability_min || props.reliability || 0.9;
    
    const isPower = ModuleStructureHelper.isPowerModule(mod);
    
    properties.totalCost += cost * quantity;
    properties.totalWeight += weight * quantity;
    if (!isPower) {
      properties.totalPower += power * quantity;
    }
  }
  
  console.log(`  计算属性: 成本=${properties.totalCost}, 重量=${properties.totalWeight}, 功耗=${properties.totalPower}`);
  
  // 检查约束是否满足
  const isFeasible = 
    properties.totalCost <= globalConstraints.cost_max &&
    properties.totalWeight <= globalConstraints.weight_max &&
    properties.totalPower <= globalConstraints.power_max;
  console.log(`  可行性检查: ${isFeasible ? '通过' : '失败'}`);
}

console.log('\n=== 集成测试完成 ===');