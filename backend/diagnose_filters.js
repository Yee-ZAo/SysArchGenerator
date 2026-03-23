const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const CSPSolver = require('./services/CSPSolver');
const ConnectionGenerator = require('./services/ConnectionGenerator');
const fs = require('fs');
const path = require('path');

const test001Path = path.join(__dirname, 'uploads/test001.json');
const test001Data = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
const modules = test001Data.modules;

console.log('Diagnosing filter issues...\n');

// 模拟模块组合（一个简单的实例）
const mockModuleCombo = {
    modules: [
        { name: '电源', categories: ['电源'], quantity: 2, properties: { cost: 8000, weight: 70, power: 1200, reliability: 0.9 } },
        { name: '控制器', categories: ['控制器'], quantity: 2, properties: { cost: 2180, weight: 46, power: 350, reliability: 0.9 } },
        { name: '作动器', categories: ['作动器'], quantity: 2, properties: { cost: 3300, weight: 70, power: 380, reliability: 0.9 } }
    ]
};

// 模拟连接（空连接）
const mockConnections = [];

const generator = new ArchitectureGenerator();

// 计算属性
const properties = generator.calculateSolutionProperties(mockModuleCombo, mockConnections);
console.log('Properties:', properties);

// 根模块（模拟）
const rootModule = { name: '液压', properties: { cost: 50000, weight: 400, power: 2400, reliability: 0.8 } };

// 构建完整解决方案
const fullSolution = {
    id: 'sol_test',
    rootModule: rootModule,
    leafModules: mockModuleCombo.modules.map(m => ({ module: m, quantity: m.quantity || 1 })),
    connections: generator.formatConnections(mockConnections, mockModuleCombo.modules),
    properties: properties
};

console.log('\nSolution leafModules count:', fullSolution.leafModules.length);
console.log('Connections count:', fullSolution.connections.length);

// 全局约束
const globalConstraints = {
    cost_max: 50000,
    weight_max: 400,
    power_max: 2400,
    reliability_min: 0.8
};

// 测试 evaluateFeasibility
console.log('\n--- Testing evaluateFeasibility ---');
const feasible = generator.evaluateFeasibility(fullSolution, globalConstraints);
console.log('Feasible?', feasible);

// 测试 checkConnectionConstraints （无约束）
console.log('\n--- Testing checkConnectionConstraints (no constraints) ---');
const connectionOk = generator.checkConnectionConstraints(fullSolution, []);
console.log('Connection constraints satisfied?', connectionOk);

// 测试 calculateSolutionProperties 细节
console.log('\n--- Debug calculateSolutionProperties ---');
// 手动计算看看
const leafModules = mockModuleCombo.modules;
let totalCost = 0, totalWeight = 0, totalPower = 0, totalReliability = 1;
const powerModules = leafModules.filter(m => m.categories && m.categories.includes('电源'));
const nonPowerModules = leafModules.filter(m => !(m.categories && m.categories.includes('电源')));

for (const mod of leafModules) {
    const quantity = mod.quantity || 1;
    totalCost += (mod.properties?.cost || 0) * quantity;
    totalWeight += (mod.properties?.weight || 0) * quantity;
    // 电源模块功耗不计入总功耗
    if (!(mod.categories && mod.categories.includes('电源'))) {
        totalPower += (mod.properties?.power || 0) * quantity;
    }
    totalReliability *= Math.pow((mod.properties?.reliability || 1), quantity);
}
console.log('Total cost:', totalCost);
console.log('Total weight:', totalWeight);
console.log('Total power:', totalPower);
console.log('Total reliability:', totalReliability);
console.log('Power modules count:', powerModules.length);
console.log('Non-power modules count:', nonPowerModules.length);

// 检查是否超出约束
const withinCost = totalCost <= globalConstraints.cost_max;
const withinWeight = totalWeight <= globalConstraints.weight_max;
const withinPower = totalPower <= globalConstraints.power_max;
console.log('\nWithin cost?', withinCost, `${totalCost} <= ${globalConstraints.cost_max}`);
console.log('Within weight?', withinWeight, `${totalWeight} <= ${globalConstraints.weight_max}`);
console.log('Within power?', withinPower, `${totalPower} <= ${globalConstraints.power_max}`);

// 测试 ConnectionGenerator 更详细
console.log('\n--- Testing ConnectionGenerator with leaf modules (实际数据) ---');
const leafModulesReal = modules.filter(m => m.parentModule !== null);
console.log('Leaf modules:', leafModulesReal.length);
console.log('Leaf modules details:');
leafModulesReal.forEach(m => console.log(`  ${m.moduleName}, quantity: ${m.moduleAttributes?.quantity}, interfaces: ${m.moduleInterface?.length}`));

const connGen = new ConnectionGenerator([]);
// 临时覆盖 console.log 以捕获输出
const originalLog = console.log;
let logs = [];
console.log = (...args) => {
    const str = args.join(' ');
    logs.push(str);
    originalLog(str);
};

const schemes = connGen.generateAllConnectionSchemes(leafModulesReal, []);
console.log = originalLog;
console.log('Total connection schemes:', schemes.length);
if (schemes.length > 0) {
    console.log('First scheme connection count:', schemes[0].length);
    if (schemes[0].length > 0) {
        console.log('Sample connection:', JSON.stringify(schemes[0][0], null, 2));
    }
}

// 检查是否所有 scheme 都是空的
const emptySchemes = schemes.filter(s => s.length === 0);
const nonEmptySchemes = schemes.filter(s => s.length > 0);
console.log(`Empty schemes: ${emptySchemes.length}, Non-empty schemes: ${nonEmptySchemes.length}`);

// 检查可能连接
console.log('\n--- Checking possible connections ---');
console.log('Extracting interfaces...');
const extractInterfaces = (modules) => {
    const result = [];
    for (const mod of modules) {
        const interfaces = mod.moduleInterface || [];
        const quantity = mod.moduleAttributes?.quantity || 1;
        const moduleName = mod.moduleName;
        for (let i = 0; i < quantity; i++) {
            const instanceId = quantity > 1 ? `${moduleName}_${i + 1}` : moduleName;
            for (const intf of interfaces) {
                result.push({
                    moduleId: moduleName,
                    instanceId: instanceId,
                    interfaceName: intf.interfaceName || `${intf.interfaceType}_${intf.interfaceDirection}`,
                    interfaceType: intf.interfaceType || '通用',
                    ioType: intf.interfaceDirection || 'out',
                    maxConnections: 999
                });
            }
        }
    }
    return result;
};
const interfaces = extractInterfaces(leafModulesReal);
console.log('Total interfaces:', interfaces.length);
interfaces.forEach(intf => console.log(`  ${intf.instanceId}.${intf.interfaceName} (${intf.interfaceType}, ${intf.ioType})`));

// 生成可能连接对
console.log('\nPossible connections:');
let possible = 0;
for (let i = 0; i < interfaces.length; i++) {
    for (let j = i + 1; j < interfaces.length; j++) {
        const intf1 = interfaces[i];
        const intf2 = interfaces[j];
        if (intf1.moduleId === intf2.moduleId) continue;
        // 检查方向匹配
        if ((intf1.ioType === 'in' && intf2.ioType === 'out') || (intf1.ioType === 'out' && intf2.ioType === 'in')) {
            // 类型匹配
            const typeMatch = (intf1.interfaceType === intf2.interfaceType) || 
                               (intf1.interfaceType === '' || intf1.interfaceType === '通用') ||
                               (intf2.interfaceType === '' || intf2.interfaceType === '通用');
            if (typeMatch) {
                // console.log(`  ${intf1.instanceId}.${intf1.interfaceName} (${intf1.ioType}) <-> ${intf2.instanceId}.${intf2.interfaceName} (${intf2.ioType})`);
                possible++;
            }
        }
    }
}
console.log('Total possible connections:', possible);