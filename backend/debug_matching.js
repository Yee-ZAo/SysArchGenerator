/**
 * 产品库匹配调试脚本 - 检测匹配失败问题
 */
const ArchFileReader = require('./services/ArchFileReader');
const { ModuleStructureHelper } = require('./models/ModuleInfo');
const fs = require('fs');
const path = require('path');

async function debugMatching() {
  try {
    console.log('===== 开始调试 =====\n');
    
    // 加载test001.json
    const test001Path = path.join(__dirname, 'uploads/test001.json');
    const test001Data = JSON.parse(fs.readFileSync(test001Path, 'utf8'));
    const modules = test001Data.modules;
    
    console.log('=== 步骤1: 加载输入模块数据 (test001.json) ===');
    console.log('模块数量:', modules.length);
    modules.forEach(m => {
      console.log('  -', m.moduleName, '/', m.moduleCategory, '/ parent:', m.parentModule);
    });
    
    // 识别叶子模块
    const leafModules = ModuleStructureHelper.identifyLeafModules(modules);
    console.log('\n=== 步骤2: 识别叶子模块 ===');
    leafModules.forEach(lm => {
      console.log('  - 名称:', lm.name, '| 分类:', lm.categories, '| 数量:', lm.quantity);
      console.log('    属性: cost=', lm.properties?.cost, 'weight=', lm.properties?.weight,
                  'power=', lm.properties?.power, 'reliability=', lm.properties?.reliability);
    });
    
    // 检查 uploads 目录有哪些产品库文件
    const uploadsDir = path.join(__dirname, 'uploads');
    console.log('\n=== 步骤3: 检查可用产品库文件 ===');
    const files = fs.readdirSync(uploadsDir);
    const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));
    console.log('Excel文件:', xlsxFiles);
    
    // 尝试加载产品库 (按优先级)
    let productLibrary = [];
    const possibleFiles = ['产品库002.xlsx', '产品库.xlsx', '产品库1.xlsx', '产品库2.xlsx'];
    
    for (const filename of possibleFiles) {
      const filePath = path.join(uploadsDir, filename);
      if (fs.existsSync(filePath)) {
        console.log('\n=== 步骤4: 加载产品库文件 -', filename, '===');
        const modulesLib = await ArchFileReader.readFile(filePath);
        productLibrary = modulesLib.map(m => m.toDict ? m.toDict() : m);
        console.log('产品库模块数量:', productLibrary.length);
        console.log('前3个模块:');
        productLibrary.slice(0, 3).forEach(p => {
          console.log('  - 名称:', p.name, '| 分类:', p.categories,
                      '| cost:', p.properties?.cost, '| weight:', p.properties?.weight);
        });
        break;
      }
    }
    
    if (productLibrary.length === 0) {
      console.log('\n错误: 没有找到产品库文件!');
      return;
    }
    
    // 尝试匹配
    console.log('\n=== 步骤5: 产品库匹配测试 ===');
    for (const leaf of leafModules) {
      const leafCats = leaf.categories || [];
      const leafName = leaf.name;
      const leafProps = leaf.properties || {};
      
      console.log('\n--- 叶子模块:', leafName, '---');
      console.log('  分类:', leafCats);
      console.log('  参数: cost<=', leafProps.cost, ', weight<=', leafProps.weight,
                  ', power', leafProps.power, ', reliability>=', leafProps.reliability);
      
      // 精确匹配
      let matched = productLibrary.filter(p => {
        const pCats = p.categories || [];
        return leafCats.some(cat => pCats.includes(cat));
      });
      console.log('  精确分类匹配:', matched.length, '个');
      
      // 模糊匹配
      if (matched.length === 0) {
        matched = productLibrary.filter(p => {
          const pCats = p.categories || [];
          return leafCats.some(cat => pCats.some(pc => pc.includes(cat) || cat.includes(pc)));
        });
        console.log('  模糊分类匹配:', matched.length, '个');
      }
      
      // 参数筛选
      if (matched.length > 0) {
        const afterParamFilter = matched.filter(p => {
          const pProps = p.properties || {};
          // 成本检查 (产品库需<=叶子)
          if (leafProps.cost && pProps.cost > leafProps.cost) return false;
          // 重量检查
          if (leafProps.weight && pProps.weight > leafProps.weight) return false;
          // 功耗检查
          if (leafProps.power) {
            // 电源类需要大于等于，其他需要小于等于
            const isPower = leafCats.includes('电源') || leafName.includes('电源');
            if (isPower) {
              if (pProps.power < leafProps.power) return false;
            } else {
              if (pProps.power > leafProps.power) return false;
            }
          }
          // 可靠度检查
          if (leafProps.reliability && pProps.reliability < leafProps.reliability) return false;
          return true;
        });
        console.log('  参数筛选后:', afterParamFilter.length, '个');
        
        if (afterParamFilter.length > 0) {
          console.log('  匹配成功! 示例:', afterParamFilter[0].name);
        }
      }
    }
    
    console.log('\n===== 调试完成 =====');
    
  } catch (e) {
    console.error('Error:', e);
    console.error(e.stack);
  }
}

debugMatching();