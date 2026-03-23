const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const CSPSolver = require('./services/CSPSolver');
const ConnectionGenerator = require('./services/ConnectionGenerator');
const fs = require('fs');
const path = require('path');

const test001Path = path.join(__dirname, 'uploads/test001.json');
const test001Data = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
const modules = test001Data.modules;

console.log('=== Debugging filter steps ===');

// 创建生成器实例
const generator = new ArchitectureGenerator();

// 模拟阶段6后的模块组合（模拟一个简单的组合）
const mockModuleCombo = {
    modules: [
        {
            name: '电源',
            moduleName: '电源',
            moduleCategory: '电源',
            categories: ['电源'],
            quantity: 2,
            properties: { cost: 8000, weight: 70, power: 1200, reliability: 0.9 },
            moduleAttributes: { cost: 8000, weight: 70, power: 1200, reliability: 0.9 }
        },
        {
            name: '控制器',
            moduleName: '控制器',
            moduleCategory: '控制器',
            categories: ['控制器'],
            quantity: 2,
            properties: { cost: 2180, weight: 46, power: 350, reliability: 0.9 },
            moduleAttributes: { cost: 2180, weight: 46, power: 350, reliability: 0.9 }
        },
        {
            name: '作动器',
            moduleName: '作动器',
            moduleCategory: '作动器',
            categories: ['作动器'],
            quantity: 2,
            properties: { cost: 3300, weight: 70, power: 380, reliability: 0.9 },
            moduleAttributes: { cost: 3300, weight: 70, power: 380, reliability: 0.9 }
        }
    ]
};

// 根模块
const rootModule = {
    name: '液压',
    properties: { cost: 50000, weight: 400, power: 2400, reliability: 0.8 }
};

// 全局约束
const globalConstraints = {
    cost_max: 50000,
    weight_max: 400,
    power_max: 2400,
    reliability_min: 0.8
};

// 测试1: 计算属性
console.log('\n1. Testing calculateSolutionProperties');
const props = generator.calculateSolutionProperties(mockModuleCombo, []);
console.log('Properties:', props);

// 测试2: 评估可行性
console.log('\n2. Testing evaluateFeasibility');
const fullSolution = {
    rootModule,
    leafModules: mockModuleCombo.modules.map(m => ({ module: m, quantity: m.quantity || 1 })),
    connections: [],
    properties: props
};
const feasible = generator.evaluateFeasibility(fullSolution, globalConstraints);
console.log('Feasible?', feasible);

// 测试3: 检查连接约束（无约束）
console.log('\n3. Testing checkConnectionConstraints (no constraints)');
const connectionOk = generator.checkConnectionConstraints(fullSolution, []);
console.log('Connection constraints satisfied?', connectionOk);

// 测试4: 检查连接约束（虚拟约束）
console.log('\n4. Testing checkConnectionConstraints (fake constraint)');
const fakeConstraint = {
    type: 'connection',
    module1: '电源',
    module2: '控制器',
    relation_type: '绑定'
};
const connectionOk2 = generator.checkConnectionConstraints(fullSolution, [fakeConstraint]);
console.log('With binding constraint satisfied?', connectionOk2);

// 测试5: 生成连接方案
console.log('\n5. Testing ConnectionGenerator');
const leafModulesReal = modules.filter(m => m.parentModule !== null);
const connGen = new ConnectionGenerator([]);
const schemes = connGen.generateAllConnectionSchemes(leafModulesReal, []);
console.log('Total schemes:', schemes.length);
console.log('Non-empty schemes:', schemes.filter(s => s.length > 0).length);

// 选取一个非空方案测试格式化
const nonEmpty = schemes.find(s => s.length > 0);
if (nonEmpty) {
    console.log('First non-empty scheme connections:', nonEmpty.length);
    const formatted = generator.formatConnections(nonEmpty, leafModulesReal);
    console.log('Formatted connections:', formatted.length);
    
    // 构建解决方案
    const fullSolutionWithConn = {
        rootModule,
        leafModules: mockModuleCombo.modules.map(m => ({ module: m, quantity: m.quantity || 1 })),
        connections: formatted,
        properties: generator.calculateSolutionProperties(mockModuleCombo, nonEmpty)
    };
    
    // 测试可行性
    const feasibleConn = generator.evaluateFeasibility(fullSolutionWithConn, globalConstraints);
    console.log('Feasible with connections?', feasibleConn);
    
    // 测试连接约束
    const connConstraintOk = generator.checkConnectionConstraints(fullSolutionWithConn, []);
    console.log('Connection constraints satisfied with connections?', connConstraintOk);
}

// 测试6: 模拟完整生成循环
console.log('\n6. Simulating full generation loop for one combo');
const connectionConstraints = [];
const connectionGenerator = new ConnectionGenerator(connectionConstraints);
const connectionSchemes = connectionGenerator.generateAllConnectionSchemes(
    mockModuleCombo.modules,
    connectionConstraints
);
console.log('Connection schemes for mock combo:', connectionSchemes.length);

let solutionCount = 0;
for (const connections of connectionSchemes.slice(0, 5)) { // limit to 5
    const properties = generator.calculateSolutionProperties(mockModuleCombo, connections);
    const solution = {
        rootModule,
        leafModules: mockModuleCombo.modules.map(m => ({ module: m, quantity: m.quantity || 1 })),
        connections: generator.formatConnections(connections, mockModuleCombo.modules),
        properties
    };
    
    const feasible = generator.evaluateFeasibility(solution, globalConstraints);
    const constraintOk = generator.checkConnectionConstraints(solution, connectionConstraints);
    
    console.log(`Scheme with ${connections.length} connections: feasible=${feasible}, constraints=${constraintOk}`);
    if (feasible && constraintOk) {
        solutionCount++;
    }
}
console.log(`Accepted solutions: ${solutionCount}`);

// 测试7: 检查可能出错的模块识别
console.log('\n7. Module identification in checkConnectionConstraints');
const modulesList = fullSolution.leafModules.map(lm => lm.module);
console.log('Modules in solution:', modulesList.map(m => ({ 
    name: m.name, 
    moduleName: m.moduleName,
    categories: m.categories,
    moduleCategory: m.moduleCategory 
})));