const ArchitectureGenerator = require('./services/ArchitectureGenerator');
const fs = require('fs');

// 创建测试数据
const testModules = [
  {
    name: '液压',
    moduleName: '液压',
    moduleType: '系统',
    categories: ['液压分系统'],
    parentModule: null,
    properties: {
      cost: 50000,
      weight: 400,
      power: 2400,
      reliability: 0.8,
      quantity: 1
    }
  },
  {
    name: '电源',
    moduleName: '电源',
    moduleType: '设备',
    categories: ['电源'],
    parentModule: '液压',
    properties: {
      cost: 8000,
      weight: 70,
      power: 1200,
      reliability: 0.90,
      quantity: 2
    }
  },
  {
    name: '控制器',
    moduleName: '控制器',
    moduleType: '设备',
    categories: ['控制器'],
    parentModule: '液压',
    properties: {
      cost: 2180,
      weight: 46,
      power: 350,
      reliability: 0.90,
      quantity: 2
    }
  },
  {
    name: '作动器',
    moduleName: '作动器',
    moduleType: '设备',
    categories: ['作动器'],
    parentModule: '液压',
    properties: {
      cost: 3300,
      weight: 70,
      power: 380,
      reliability: 0.90,
      quantity: 2
    }
  }
];

// 添加接口数据
testModules.forEach(mod => {
  if (mod.name === '电源') {
    mod.interfaces = [
      { type: '电气', io_type: 'out', name: '电源输出' }
    ];
  } else if (mod.name === '控制器') {
    mod.interfaces = [
      { type: '电气', io_type: 'in', name: '电源输入' },
      { type: '信号', io_type: 'out', name: '控制信号' }
    ];
  } else if (mod.name === '作动器') {
    mod.interfaces = [
      { type: '电气', io_type: 'in', name: '电源输入' },
      { type: '信号', io_type: 'in', name: '控制信号' }
    ];
  }
});

// 测试约束
const constraints = [
  // 绑定约束：电源必须连接到控制器
  {
    type: 'connection',
    module1: '电源',
    module2: '控制器',
    relation_type: '绑定'
  },
  // 绑定约束：控制器必须连接到作动器
  {
    type: 'connection',
    module1: '控制器',
    module2: '作动器',
    relation_type: '绑定'
  }
];

console.log('=== 架构创成设计集成测试 ===');
console.log('模块数量:', testModules.length);
console.log('约束数量:', constraints.length);

// 创建架构生成器
const generator = new ArchitectureGenerator();

// 设置事件监听器
generator.on('progress', (data) => {
  if (data.type === 'phase') {
    console.log(`[进度] 阶段 ${data.phase}: ${data.message}`);
  } else if (data.type === 'solution') {
    console.log(`[进度] 生成第 ${data.count} 个方案`);
  }
});

// 运行生成器（不使用产品库，只使用给定模块）
(async () => {
  try {
    console.log('\n开始架构创成设计...');
    const result = await generator.generateSolutions(
      testModules,
      constraints,
      100, // 最大100个方案
      []   // 无产品库，直接使用现有模块
    );
    
    console.log('\n=== 生成结果 ===');
    console.log('成功:', result.success);
    console.log('方案数量:', result.count);
    if (result.filePath) {
      console.log('输出文件:', result.filePath);
    }
    if (result.error) {
      console.log('错误:', result.error);
    }
    
    // 如果有方案，显示一个示例
    if (result.success && result.solutions && result.solutions.length > 0) {
      const sample = result.solutions[0];
      console.log('\n=== 示例方案 ===');
      console.log('方案ID:', sample.id);
      console.log('模块数量:', sample.leafModules.length);
      console.log('连接数量:', sample.connections ? sample.connections.length : 0);
      console.log('属性:', sample.properties);
      
      if (sample.connections && sample.connections.length > 0) {
        console.log('\n连接列表:');
        sample.connections.forEach((conn, idx) => {
          console.log(`  ${idx + 1}. ${conn.source} -> ${conn.target}`);
        });
      }
    } else if (result.error) {
      console.log('\n错误原因分析:');
      console.log('1. 模块组合可能不可行');
      console.log('2. 连接约束可能不满足');
      console.log('3. 全局参数约束可能不满足');
    }
    
  } catch (error) {
    console.error('架构生成失败:', error);
  }
})();