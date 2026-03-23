/**
 * 最终集成测试 - 验证修复后的架构生成功能
 */
const fs = require('fs');
const path = require('path');
const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const CSPSolver = require('./services/CSPSolver');
const ConnectionGenerator = require('./services/ConnectionGenerator');
const ArchFileReader = require('./services/ArchFileReader');

async function runIntegrationTest() {
  console.log('=== 开始最终集成测试 ===\n');
  
  try {
    // 1. 加载输入模块数据
    const test001Path = path.join(__dirname, 'uploads/test001.json');
    const test001Data = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
    const modules = test001Data.modules;
    console.log(`1. 加载输入模块: ${modules.length} 个`);
    modules.forEach(m => console.log(`   - ${m.moduleName} (${m.moduleCategory})`));
    
    // 2. 加载产品库
    const productLibraryPath = path.join(__dirname, 'uploads/产品库.xlsx');
    if (!fs.existsSync(productLibraryPath)) {
      console.error('产品库文件不存在:', productLibraryPath);
      return;
    }
    
    console.log('\n2. 加载产品库...');
    const modulesLib = await ArchFileReader.readFile(productLibraryPath);
    const productLibrary = modulesLib.map(m => m.toDict ? m.toDict() : m);
    console.log(`   产品库模块数: ${productLibrary.length}`);
    
    // 3. 创建生成器实例
    const generator = new ArchitectureGenerator();
    
    // 4. 测试无产品库情况（应报错）
    console.log('\n3. 测试无产品库情况...');
    const noLibResult = await generator.generateSolutions(modules, [], Infinity, null);
    console.log(`   结果: ${noLibResult.success ? '成功（不应该！）' : '失败（正确）'}`);
    console.log(`   错误消息: ${noLibResult.error || '无'}`);
    if (noLibResult.success) {
      console.error('   ❌ 漏洞：无产品库时不应该成功！');
    } else if (noLibResult.error && noLibResult.error.includes('导入产品库')) {
      console.log('   ✅ 正确：无产品库时返回错误提示');
    }
    
    // 5. 测试有产品库情况
    console.log('\n4. 测试有产品库情况...');
    const withLibResult = await generator.generateSolutions(modules, [], Infinity, productLibrary);
    console.log(`   结果: ${withLibResult.success ? '成功' : '失败'}`);
    console.log(`   错误消息: ${withLibResult.error || '无'}`);
    console.log(`   方案数: ${withLibResult.count || 0}`);
    console.log(`   文件路径: ${withLibResult.filePath || '无'}`);
    
    if (withLibResult.success && withLibResult.count > 0) {
      console.log('   ✅ 成功：生成了解决方案');
      // 读取方案文件检查内容
      if (withLibResult.filePath && fs.existsSync(withLibResult.filePath)) {
        const solutionData = JSON.parse(fs.readFileSync(withLibResult.filePath, 'utf8'));
        console.log(`   实际方案数: ${solutionData.solutions?.length || 0}`);
        if (solutionData.solutions && solutionData.solutions.length > 0) {
          const firstSolution = solutionData.solutions[0];
          console.log(`   第一个方案叶子模块数: ${firstSolution.leafModules?.length || 0}`);
          console.log(`   第一个方案连接数: ${firstSolution.connections?.length || 0}`);
        }
      }
    } else {
      console.error('   ❌ 失败：应该有解决方案但未生成');
    }
    
    // 6. 测试单个CSP求解器
    console.log('\n5. 测试CSP求解器...');
    const csp = new CSPSolver();
    const leafModules = [
      { name: '电源', categories: ['电源'], properties: { cost: 8000, weight: 70, power: 1200, reliability: 0.9 }, quantity: 2 },
      { name: '控制器', categories: ['控制器'], properties: { cost: 2180, weight: 46, power: 350, reliability: 0.9 }, quantity: 2 },
      { name: '作动器', categories: ['作动器'], properties: { cost: 3300, weight: 70, power: 380, reliability: 0.9 }, quantity: 2 }
    ];
    const solutions = csp.generate(leafModules, productLibrary, {}, Infinity);
    console.log(`   CSP解决方案数: ${solutions.length}`);
    if (solutions.length > 0) {
      console.log(`   第一个方案模块: ${solutions[0].modules.map(m => m.name).join(', ')}`);
    }
    
    // 7. 测试连接生成器
    console.log('\n6. 测试连接生成器...');
    const connGen = new ConnectionGenerator();
    const connectionSchemes = connGen.generateAllConnectionSchemes(modules, []);
    console.log(`   所有连接方案数: ${connectionSchemes.length}`);
    if (connectionSchemes.length > 0) {
      console.log(`   第一个方案连接数: ${connectionSchemes[0].length}`);
    }
    
    console.log('\n=== 测试完成 ===');
    return {
      noLibSuccess: !noLibResult.success && noLibResult.error?.includes('导入产品库'),
      withLibSuccess: withLibResult.success && withLibResult.count > 0,
      cspSuccess: solutions.length > 0,
      connectionSuccess: connectionSchemes.length > 0,
      totalSolutions: withLibResult.count || 0
    };
    
  } catch (error) {
    console.error('测试过程中出错:', error);
    console.error(error.stack);
    throw error;
  }
}

// 执行测试
runIntegrationTest().then(result => {
  console.log('\n\n=== 测试结果汇总 ===');
  console.log(`1. 无产品库时正确报错: ${result.noLibSuccess ? '✅' : '❌'}`);
  console.log(`2. 有产品库时生成方案: ${result.withLibSuccess ? '✅' : '❌'}`);
  console.log(`3. CSP求解器找到方案: ${result.cspSuccess ? '✅' : '❌'}`);
  console.log(`4. 连接生成器工作: ${result.connectionSuccess ? '✅' : '❌'}`);
  console.log(`5. 总方案数: ${result.totalSolutions}`);
  
  if (result.noLibSuccess && result.withLibSuccess && result.cspSuccess && result.connectionSuccess) {
    console.log('\n✅ 所有测试通过！系统修复完成。');
    process.exit(0);
  } else {
    console.log('\n❌ 部分测试失败，需要进一步检查。');
    process.exit(1);
  }
}).catch(err => {
  console.error('测试脚本出错:', err);
  process.exit(1);
});