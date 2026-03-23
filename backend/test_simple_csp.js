const CSPSolver = require('./services/CSPSolver');

// 创建简单的叶子模块（无约束）
const leafModules = [
  {
    name: '电源',
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
    name: '控制器',
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
    name: '作动器',
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

// 创建分类到候选的映射（简单映射，就使用叶子模块本身）
const categoryToCandidates = new Map();
leafModules.forEach(lm => {
  const cats = lm.categories || [];
  if (cats.length > 0) {
    cats.forEach(cat => {
      if (!categoryToCandidates.has(cat)) {
        categoryToCandidates.set(cat, []);
      }
      categoryToCandidates.get(cat).push(lm);
    });
  }
});

console.log('=== 简单CSP测试（无约束） ===');
console.log('叶子模块:', leafModules.length);
console.log('分类映射:', categoryToCandidates.size);

// 无约束
const constraints = [];

const globalConstraints = {
  cost_max: 50000,
  weight_max: 400,
  power_max: 2400,
  reliability_min: 0.8
};

const cspSolver = new CSPSolver(constraints);
const solutions = cspSolver.generateWithCategory(
  leafModules,
  [],
  categoryToCandidates,
  globalConstraints,
  100
);

console.log('\n生成的模块组合方案数量:', solutions.length);

if (solutions.length > 0) {
  console.log('\n第一个模块组合:');
  console.log(JSON.stringify(solutions[0], null, 2));
} else {
  console.log('\n没有生成任何模块组合！');
  
  // 调试CSPSolver的行为
  console.log('\n=== 调试信息 ===');
  console.log('CSP Solver属性检查:');
  console.log('leafModules:', leafModules.length);
  console.log('categoryToCandidates keys:', [...categoryToCandidates.keys()]);
  console.log('categoryToCandidates values:', [...categoryToCandidates.values()].map(v => v.length));
}