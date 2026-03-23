const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const fs = require('fs');
const path = require('path');

const test001Path = path.join(__dirname, 'uploads/test001.json');
const test001Data = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
const modules = test001Data.modules;

// 模拟产品库（简化）
const productLibrary = [
    {
        name: '电源模块A',
        categories: ['电源'],
        properties: { cost: 7000, weight: 60, power: 1300, reliability: 0.92 },
        moduleAttributes: { cost: 7000, weight: 60, power: 1300, reliability: 0.92 }
    },
    {
        name: '控制器模块A',
        categories: ['控制器'],
        properties: { cost: 2000, weight: 40, power: 300, reliability: 0.95 },
        moduleAttributes: { cost: 2000, weight: 40, power: 300, reliability: 0.95 }
    },
    {
        name: '作动器模块A',
        categories: ['作动器'],
        properties: { cost: 3000, weight: 60, power: 350, reliability: 0.93 },
        moduleAttributes: { cost: 3000, weight: 60, power: 350, reliability: 0.93 }
    }
];

console.log('=== Starting debug generation ===');
console.log('Modules:', modules.length);
console.log('Product library:', productLibrary.length);

const generator = new ArchitectureGenerator();

// 监听进度事件
generator.on('progress', (data) => {
    if (data.type === 'error') {
        console.error('Progress error:', data);
    } else if (data.type === 'complete') {
        console.log('Generation complete:', data);
    } else {
        console.log('Progress:', data);
    }
});

// 运行生成
(async () => {
    try {
        console.log('\n--- Calling generateSolutions ---');
        const result = await generator.generateSolutions(modules, [], Infinity, productLibrary);
        console.log('\nResult:', {
            success: result.success,
            count: result.count,
            error: result.error
        });
        if (result.success) {
            console.log('Generated solutions:', result.count);
        } else {
            console.log('Generation failed:', result.error);
        }
    } catch (error) {
        console.error('Unexpected error:', error);
    }
})();