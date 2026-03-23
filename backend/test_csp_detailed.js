const CSPSolver = require('./services/CSPSolver');
const { ModuleStructureHelper } = require('./models/ModuleInfo');

// 创建简单的叶子模块
const leafModules = [
  {
    name: '电源模块',
    categories: ['电源'],
    quantity: 2,
    properties: {
      cost: 8000,
      weight: 70,
      power: 1200,
      reliability: 0.90
    }
  },
  {
    name: '控制器模块',
    categories: ['控制器'],
    quantity: 2,
    properties: {
      cost: 2180,
      weight: 46,
      power: 350,
      reliability: 0.90
    }
  },
  {
    name: '作动器模块',
    categories: ['作动器'],
    quantity: 2,
    properties: {
      cost: 3300,
      weight: 70,
      power: 380,
      reliability: 0.90
    }
  }
];

console.log('=== CSP详细诊断测试 ===');

// 测试isPowerModule
console.log('\n1. isPowerModule测试:');
leafModules.forEach((mod, idx) => {
  const isPower = ModuleStructureHelper.isPowerModule(mod);
  console.log(`  模块${idx+1}: ${mod.name}, 分类: ${mod.categories[0]}, 是电源: ${isPower}`);
});

// 测试forwardCheckCostWeight逻辑
console.log('\n2. forwardCheckCostWeight逻辑模拟:');
const solution = {
  totalCost: 8000 * 2, // 两个电源模块
  totalWeight: 70 * 2,
  totalPower: 0, // 电源模块功耗被排除
  totalReliability: Math.pow(0.9, 2)
};

const globalConstraints = {
  cost_max: 50000,
  weight_max: 400,
  power_max: 2400,
  reliability_min: 0.8
};

console.log('  当前累计:');
console.log(`    - 成本: ${solution.totalCost} <= ${globalConstraints.cost_max}: ${solution.totalCost <= globalConstraints.cost_max}`);
console.log(`    - 重量: ${solution.totalWeight} <= ${globalConstraints.weight_max}: ${solution.totalWeight <= globalConstraints.weight_max}`);
console.log(`    - 功耗: ${solution.totalPower} <= ${globalConstraints.power_max}: ${solution.totalPower <= globalConstraints.power_max}`);
console.log(`    - 可靠度: ${solution.totalReliability} >= ${globalConstraints.reliability_min}: ${solution.totalReliability >= globalConstraints.reliability_min}`);

// 手动计算总功耗（包括所有模块）
const totalPowerAllModules = (1200 * 2) + (350 * 2) + (380 * 2); // 电源模块+控制器+作动器
console.log(`\n  所有模块总功耗: ${totalPowerAllModules}`);
console.log(`  功耗检查（包括电源）: ${totalPowerAllModules} <= ${globalConstraints.power_max}: ${totalPowerAllModules <= globalConstraints.power_max}`);

// 直接测试CSPSolver创建候选池和回溯
console.log('\n3. 直接测试生成函数:');
const categoryToCandidates = new Map();
leafModules.forEach(lm => {
  const cats = lm.categories || [];
  if (cats.length > 0) {
    cats.forEach(cat => {
      if (!categoryToCandidates.has(cat)) {
        categoryToCandidates.set(cat, []);
      }
      categoryToCandidates.get(cat).push({
        ...lm,
        _category: cat,
        _isPower: ModuleStructureHelper.isPowerModule(lm)
      });
    });
  }
});

console.log('  分类到候选映射:');
for (const [cat, cands] of categoryToCandidates) {
  console.log(`    - ${cat}: ${cands.length} 个候选`);
}

// 测试orderByLCV函数
console.log('\n4. 测试排序逻辑:');
const cspSolver = new CSPSolver([]);
const pools = [];

leafModules.forEach(lm => {
  const cats = lm.categories || [];
  if (cats.length > 0 && categoryToCandidates.has(cats[0])) {
    for (let i = 0; i < (lm.quantity || 1); i++) {
      pools.push({
        leafModuleName: lm.name,
        instanceIndex: i,
        categories: cats,
        candidates: categoryToCandidates.get(cats[0]),
        quantity: 1,
        selectedIndex: -1
      });
    }
  }
});

console.log(`  创建了 ${pools.length} 个池`);
console.log('  前3个池:');
pools.slice(0, 3).forEach((pool, idx) => {
  console.log(`    池${idx+1}: ${pool.leafModuleName}, 候选数: ${pool.candidates.length}`);
});

// 测试forwardCheckCostWeight函数
console.log('\n5. 直接调用forwardCheckCostWeight:');
const initialSolution = {
  modules: [],
  totalCost: 0,
  totalWeight: 0,
  totalPower: 0,
  totalReliability: 1
};

const checkResult = cspSolver.forwardCheckCostWeight(initialSolution, globalConstraints);
console.log(`  初始空解决方案检查: ${checkResult}`);

// 测试电源模块
const powerModule = leafModules[0];
const isPower = cspSolver.isPowerModule(powerModule);
console.log(`  "${powerModule.name}" 是电源模块: ${isPower}`);

// 创建一个解决方案，看看问题在哪里
console.log('\n6. 手动构建解决方案并检查:');
const testSolution = {
  modules: [powerModule, leafModules[1], leafModules[2]],
  totalCost: (8000*2) + (2180*2) + (3300*2),
  totalWeight: (70*2) + (46*2) + (70*2),
  totalPower: (350*2) + (380*2), // 电源模块被排除
  totalReliability: Math.pow(0.9, 6)
};

console.log('  手动构建的解决方案:');
console.log(`    - 模块数: ${testSolution.modules.length}`);
console.log(`    - 总成本: ${testSolution.totalCost}`);
console.log(`    - 总重量: ${testSolution.totalWeight}`);
console.log(`    - 总功耗: ${testSolution.totalPower} (电源模块被排除)`);
console.log(`    - 总可靠度: ${testSolution.totalReliability}`);

const finalCheck = cspSolver.forwardCheckCostWeight(testSolution, globalConstraints);
console.log(`  forwardCheckCostWeight结果: ${finalCheck}`);