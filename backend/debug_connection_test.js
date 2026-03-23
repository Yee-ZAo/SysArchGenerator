const ConnectionGenerator = require('./services/ConnectionGenerator');
const fs = require('fs');
const path = require('path');

const test001Path = path.join(__dirname, 'uploads/test001.json');
const test001Data = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
const modules = test001Data.modules;

console.log('Modules:', modules.length);
modules.forEach(m => console.log(`  - ${m.moduleName} (parent: ${m.parentModule}) quantity: ${m.moduleAttributes?.quantity}`));

// 模拟产品库选出的模块组合（假设是叶子模块）
const leafModules = modules.filter(m => m.parentModule !== null);
console.log('\nLeaf modules:', leafModules.length);
leafModules.forEach(m => console.log(`  - ${m.moduleName} (category: ${m.moduleCategory}) interfaces: ${m.moduleInterface?.length}`));

console.log('\n--- Testing ConnectionGenerator ---');
// enable verbose logging
console.log = (...args) => {
    process.stdout.write('[LOG] ' + args.join(' ') + '\n');
};

const connGen = new ConnectionGenerator([]);
console.log('Generating connection schemes...');
const schemes = connGen.generateAllConnectionSchemes(leafModules, []);
console.log('\nResults:');
console.log('Connection schemes count:', schemes.length);
if (schemes.length > 0) {
  console.log('First scheme connections:', schemes[0].length);
  console.log('First connection sample:', JSON.stringify(schemes[0][0], null, 2));
} else {
  console.log('No connection schemes generated!');
}