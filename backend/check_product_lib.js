/**
 * 检查产品库数据
 */
const fs = require('fs');
const path = require('path');
const ArchitectureGenerator = require('./services/ArchitectureGenerator');

// 读取test001.json的叶子模块
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'uploads', 'test001.json'), 'utf8'));

// 从Excel文件读取产品库数据（模拟）
// 实际应该从解析的Excel数据读取，这里我们先假设有一个解析好的文件
let productLibrary = [];

console.log('=== 分析产品库匹配问题 ===\n');

console.log('叶子模块信息:');
const leafModules = [
  { name: '电源', category: '电源', props: { cost: 8000, weight: 70, power: 1200, reliability: 0.9, quantity: 2 } },
  { name: '控制器', category: '控制器', props: { cost: 2180, weight: 46, power: 350, reliability: 0.9, quantity: 2 } },
  { name: '作动器', category: '作动器', props: { cost: 3300, weight: 70, power: 380, reliability: 0.9, quantity: 2 } }
];

leafModules.forEach(lm => {
  console.log(`  ${lm.name} (${lm.category}): 成本=${lm.props.cost}, 重量=${lm.props.weight}, 功耗=${lm.props.power}, 可靠度=${lm.props.reliability}`);
});

// 手动检查每个分类的筛选规则
console.log('\n电源模块特殊规则:');
console.log('  功耗: 产品库模块功耗 > 叶子模块功耗 (因电源是提供功率)');
console.log('  即: 产品库电源功耗 > 1200');

console.log('\n非电源模块规则:');
console.log('  功耗: 产品库模块功耗 < 叶子模块功耗');
console.log('  成本: 产品库模块成本 < 叶子模块成本');
console.log('  重量: 产品库模块重量 < 叶子模块重量');
console.log('  可靠度: 产品库模块可靠度 > 叶子模块可靠度');

// 如果有产品库，分析
console.log('\n=== 建议 ===');
console.log('1. 电源分类需要功耗 > 1200 的模块');
console.log('2. 控制器分类需要功耗 < 350, 成本 < 2180, 重量 < 46, 可靠度 > 0.9 的模块');
console.log('3. 作动器分类需要功耗 < 380, 成本 < 3300, 重量 < 70, 可靠度 > 0.9 的模块');

// 检查现有产品库文件
const uploadsDir = path.join(__dirname, 'uploads');
const files = fs.readdirSync(uploadsDir);
const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));
console.log(`\n找到 ${xlsxFiles.length} 个Excel产品库文件:`, xlsxFiles);

// 尝试读取可能的JSON缓存
for (const fileName of xlsxFiles) {
  const jsonName = fileName.replace('.xlsx', '.json');
  const jsonPath = path.join(uploadsDir, jsonName);
  if (fs.existsSync(jsonPath)) {
    console.log(`\n解析 ${jsonName}:`);
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (Array.isArray(data)) {
        console.log(`  模块数: ${data.length}`);
        // 分析电源模块
        const powerModules = data.filter(m => 
          (m.moduleCategory === '电源' || m.categories?.includes('电源')) && 
          (m.moduleAttributes?.power || 0) > 1200
        );
        console.log(`  符合电源规则的模块: ${powerModules.length}`);
      }
    } catch (e) {
      console.log(`  解析失败: ${e.message}`);
    }
  }
}