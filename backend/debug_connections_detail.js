const ConnectionGenerator = require('./services/ConnectionGenerator');
const fs = require('fs');
const path = require('path');

const test001Path = path.join(__dirname, 'uploads/test001.json');
const test001Data = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
const modules = test001Data.modules;
const leafModules = modules.filter(m => m.parentModule !== null);

const connGen = new ConnectionGenerator([]);
const schemes = connGen.generateAllConnectionSchemes(leafModules, []);

console.log('Total schemes:', schemes.length);
if (schemes.length > 0) {
    // 找一个非空的 scheme
    const nonEmpty = schemes.find(s => s.length > 0);
    if (nonEmpty) {
        console.log('Found non-empty scheme with', nonEmpty.length, 'connections');
        console.log('First connection structure:', JSON.stringify(nonEmpty[0], null, 2));
        
        // 检查 source 和 target 的字段
        const src = nonEmpty[0].source;
        const tgt = nonEmpty[0].target;
        console.log('Source keys:', Object.keys(src));
        console.log('Target keys:', Object.keys(tgt));
        console.log('Source moduleId:', src.moduleId);
        console.log('Source instanceId:', src.instanceId);
        console.log('Source interfaceName:', src.interfaceName);
        console.log('Target moduleId:', tgt.moduleId);
        console.log('Target instanceId:', tgt.instanceId);
        console.log('Target interfaceName:', tgt.interfaceName);
    } else {
        console.log('All schemes are empty?!');
        // 检查 schemes[0] 是否为 []
        console.log('schemes[0] === []?', schemes[0] instanceof Array && schemes[0].length === 0);
    }
}

// 测试 formatConnections
const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const generator = new ArchitectureGenerator();

if (nonEmpty) {
    const formatted = generator.formatConnections(nonEmpty, leafModules);
    console.log('\nFormatted connections:', JSON.stringify(formatted, null, 2));
    console.log('Formatted length:', formatted.length);
    
    // 检查是否丢失了连接
    if (formatted.length !== nonEmpty.length) {
        console.error('Mismatch: original', nonEmpty.length, '-> formatted', formatted.length);
    }
}

// 测试 extractInterfaces 的细节
console.log('\n--- Extracting interfaces using ConnectionGenerator method ---');
// 使用反射调用 extractInterfaces
const extractInterfaces = connGen.extractInterfaces.bind(connGen);
const interfaces = extractInterfaces(leafModules);
console.log('Interfaces count:', interfaces.length);
console.log('First interface:', interfaces[0]);