const ArchFileReader = require('./services/ArchFileReader');
const { ModuleStructureHelper } = require('./models/ModuleInfo');
const path = require('path');

async function debugProductFilter() {
  console.log('=== 诊断产品库筛选逻辑 ===');
  
  // 加载测试架构数据
  const test001Path = path.join(__dirname, 'uploads/test001.json');
  const fs = require('fs');
  const testData = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
  const modules = testData.modules || testData;
  
  console.log(`加载了 ${modules.length} 个模块`);
  
  // 加载产品库文件
  const productLibs = ['产品库.xlsx', '产品库1.xlsx', '产品库2.xlsx'];
  let allProducts = [];
  
  for (const libFile of productLibs) {
    const libPath = path.join(__dirname, 'uploads', libFile);
    if (fs.existsSync(libPath)) {
      console.log(`\n分析产品库: ${libFile}`);
      try {
        // 使用静态方法
        const products = await ArchFileReader.readFile(libPath);
        console.log(`  读取到 ${products.length} 个产品`);
        
        // 转换为字典格式
        const productDicts = products.map(p => p.toDict ? p.toDict() : p);
        allProducts = allProducts.concat(productDicts);
        
        // 显示前几个产品
        for (let i = 0; i < Math.min(3, productDicts.length); i++) {
          const p = productDicts[i];
          console.log(`  产品${i+1}: ${p.name} (${p.module_type}), 分类: ${p.categories}`);
          if (p.properties) {
            console.log(`      成本: ${p.properties.cost}, 重量: ${p.properties.weight}, 功耗: ${p.properties.power}`);
          }
        }
      } catch (err) {
        console.log(`  读取失败: ${err.message}`);
      }
    }
  }
  
  console.log(`\n总共加载 ${allProducts.length} 个产品库模块`);
  
  if (allProducts.length === 0) {
    console.log('错误: 没有可用的产品库模块');
    return;
  }
  
  // 模拟筛选流程
  // 首先，识别叶子模块
  const rootModules = ModuleStructureHelper.identifyRootModules(modules);
  const leafModules = ModuleStructureHelper.identifyLeafModules(modules);
  
  console.log(`\n叶子模块识别: ${leafModules.length} 个`);
  leafModules.forEach((lm, idx) => {
    console.log(`  叶子模块${idx+1}: ${lm.name} (${lm.categories}), 数量: ${lm.quantity}`);
    const props = lm.properties || lm.moduleAttributes || {};
    console.log(`      成本: ${props.cost}, 重量: ${props.weight}, 功耗: ${props.power}, 可靠度: ${props.reliability}`);
  });
  
  // 按分类组织叶子模块
  const categoryToLeafModules = new Map();
  leafModules.forEach(lm => {
    const cats = lm.categories || [];
    if (cats.length > 0) {
      cats.forEach(cat => {
        if (!categoryToLeafModules.has(cat)) {
          categoryToLeafModules.set(cat, []);
        }
        categoryToLeafModules.get(cat).push(lm);
      });
    }
  });
  
  console.log(`\n按分类分析:`);
  
  // 对每个分类进行分析
  for (const [category, leafMods] of categoryToLeafModules) {
    console.log(`\n分类 "${category}":`);
    const refModule = leafMods[0];
    const refProps = refModule.properties || refModule.moduleAttributes || {};
    
    // 检查是否为电源分类
    const isPowerCategory = ModuleStructureHelper.isPowerCategory(category);
    console.log(`  是否为电源分类: ${isPowerCategory}`);
    console.log(`  参考参数: 成本=${refProps.cost}, 重量=${refProps.weight}, 功耗=${refProps.power}`);
    
    // 查找匹配的产品
    const matchingProducts = allProducts.filter(product => {
      const modCats = product.categories || [];
      // 分类匹配
      if (!modCats.includes(category) && !modCats.some(c => c.includes(category) || category.includes(c))) {
        return false;
      }
      
      const modProps = product.properties || product.moduleAttributes || {};
      
      // 成本检查
      if (refProps.cost !== undefined && refProps.cost > 0) {
        if ((modProps.cost || 0) > refProps.cost) {
          return false;
        }
      }
      
      // 重量检查
      if (refProps.weight !== undefined && refProps.weight > 0) {
        if ((modProps.weight || 0) > refProps.weight) {
          return false;
        }
      }
      
      // 功耗检查
      if (isPowerCategory) {
        // 电源模块：功耗需高于叶子模块
        if (refProps.power !== undefined && refProps.power > 0) {
          if ((modProps.power || 0) < refProps.power) {
            return false;
          }
        }
      } else {
        // 非电源模块：功耗需低于叶子模块
        if (refProps.power !== undefined && refProps.power > 0) {
          if ((modProps.power || 0) > refProps.power) {
            return false;
          }
        }
      }
      
      return true;
    });
    
    console.log(`  匹配的产品数量: ${matchingProducts.length}`);
    
    if (matchingProducts.length === 0) {
      console.log(`  原因分析:`);
      // 列出该分类的所有产品及其参数
      const categoryProducts = allProducts.filter(p => {
        const cats = p.categories || [];
        return cats.includes(category) || cats.some(c => c.includes(category) || category.includes(c));
      });
      
      console.log(`    该分类共有 ${categoryProducts.length} 个产品`);
      
      for (const p of categoryProducts) {
        const modProps = p.properties || p.moduleAttributes || {};
        console.log(`      产品: ${p.name}, 成本=${modProps.cost}, 重量=${modProps.weight}, 功耗=${modProps.power}`);
        
        if (refProps.cost !== undefined && refProps.cost > 0) {
          if ((modProps.cost || 0) > refProps.cost) {
            console.log(`        ❌ 成本过高: ${modProps.cost} > ${refProps.cost}`);
          }
        }
        
        if (refProps.weight !== undefined && refProps.weight > 0) {
          if ((modProps.weight || 0) > refProps.weight) {
            console.log(`        ❌ 重量过大: ${modProps.weight} > ${refProps.weight}`);
          }
        }
        
        if (isPowerCategory) {
          if (refProps.power !== undefined && refProps.power > 0) {
            if ((modProps.power || 0) < refProps.power) {
              console.log(`        ❌ 功耗不足: ${modProps.power} < ${refProps.power}`);
            }
          }
        } else {
          if (refProps.power !== undefined && refProps.power > 0) {
            if ((modProps.power || 0) > refProps.power) {
              console.log(`        ❌ 功耗过高: ${modProps.power} > ${refProps.power}`);
            }
          }
        }
      }
    } else {
      console.log(`  匹配的产品:`);
      matchingProducts.slice(0, 5).forEach(p => {
        const modProps = p.properties || p.moduleAttributes || {};
        console.log(`    - ${p.name}: 成本=${modProps.cost}, 重量=${modProps.weight}, 功耗=${modProps.power}`);
      });
      if (matchingProducts.length > 5) {
        console.log(`    ... 以及 ${matchingProducts.length - 5} 个更多`);
      }
    }
  }
  
  // 测试筛选函数的输出
  console.log('\n=== 测试筛选函数 ===');
  const ArchitectureGenerator = require('./services/ArchitectureGenerator');
  const gen = new ArchitectureGenerator();
  
  const candidates = gen.filterCandidatesFromProductLibrary(allProducts, leafModules);
  
  console.log(`筛选结果: ${candidates.size} 个分类有候选模块`);
  let totalCandidates = 0;
  for (const [cat, cands] of candidates) {
    console.log(`  分类 "${cat}": ${cands.length} 个候选`);
    totalCandidates += cands.length;
    
    if (cands.length === 0) {
      console.log(`    警告: 没有候选模块，CSP将无法生成该分类的方案！`);
    }
  }
  
  if (totalCandidates === 0) {
    console.log('\n⚠️ 严重问题: 所有分类都没有候选模块！');
    console.log('这解释了为什么使用实际产品库时方案数为 0');
    console.log('建议放宽筛选条件，例如：');
    console.log('1. 允许成本、重量、功耗有容差');
    console.log('2. 为没有候选的分类创建虚拟候选模块');
    console.log('3. 修改电源模块的功耗比较逻辑');
  } else {
    console.log(`\n总候选模块数: ${totalCandidates}`);
  }
}

debugProductFilter().catch(err => {
  console.error('诊断失败:', err);
});