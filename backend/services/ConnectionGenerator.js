/**
 * 连接生成器 - 基于约束生成模块间的所有可能连接方案
 * 
 * 创成设计连接规则:
 * 1. 根据模块的输入/输出接口生成所有可能的连接
 * 2. 支持绑定约束：两个分类的模块之间必须有连接关系
 * 3. 支持互斥约束：两个分类的模块之间不能有连接关系
 * 4. 创成设计过程中，可能会生成没有连线的方案，只要满足约束条件，此时不需要过滤
 * 5. 不设置任何数量上限，合理运用内存
 */

const { ModuleStructureHelper } = require('../models/ModuleInfo');
const logger = require('./Logger');

class ConnectionGenerator {
  constructor(constraints = []) {
    this.constraints = constraints;
    this.connectionCache = new Map(); // 缓存连接结果
  }

  /**
   * 生成所有可能的连接方案
   * 
   * @param {Array} modules - 选中的模块数组
   * @param {Array} constraints - 连接约束（绑定/互斥）
   * @returns {Array} 连接方案数组
   */
  generateAllConnectionSchemes(modules, constraints = []) {
    const schemes = [];
    
    console.log(`[ConnectionGenerator] 开始生成连接方案，模块数量: ${modules.length}`);

    if (modules.length <= 1) {
      // 单个模块无需连接，返回空连接方案
      schemes.push([]);
      console.log(`[ConnectionGenerator] 单模块，返回空连接方案`);
      return schemes;
    }

    // Step 1: 获取接口信息
    const moduleInterfaces = this.extractInterfaces(modules);
    console.log(`[ConnectionGenerator] 提取到 ${moduleInterfaces.length} 个接口`);

    // Step 2: 生成所有可能的接口连接对
    const possibleConnections = this.generatePossibleConnections(moduleInterfaces);
    console.log(`[ConnectionGenerator] 生成 ${possibleConnections.length} 个可能连接`);

    // Step 3: 筛选满足接口类型匹配的连接
    const validConnections = this.filterValidConnections(possibleConnections, constraints);
    console.log(`[ConnectionGenerator] 有效连接: ${validConnections.length}`);
    
    // Step 4: 生成不同的连接组合（子集）
    // 创成设计过程中，可能会生成没有连线的方案，只要满足约束条件，此时不需要过滤
    const connectionCombinations = this.generateConnectionCombinations(validConnections);
    console.log(`[ConnectionGenerator] 生成 ${connectionCombinations.length} 个连接组合`);
    
    // Step 5: 过滤满足绑定/互斥约束的组合
    let validSchemeCount = 0;
    for (const connections of connectionCombinations) {
      if (this.satisfyConnectionConstraints(connections, modules, constraints)) {
        schemes.push(connections);
        validSchemeCount++;
      }
      
      // 定期清理内存
      if (validSchemeCount % 1000 === 0 && global.gc) {
        global.gc();
      }
    }
    
    console.log(`[ConnectionGenerator] 满足约束的连接方案: ${validSchemeCount}`);
    
    // 清理缓存
    this.connectionCache.clear();
    
    return schemes;
  }

  /**
   * 提取模块的接口信息
   */
  extractInterfaces(modules) {
    const result = [];
    
    for (const mod of modules) {
      // 处理不同格式的接口：interfaces 或 moduleInterface
      let interfaces = [];
      if (mod.interfaces && Array.isArray(mod.interfaces)) {
        interfaces = mod.interfaces;
      } else if (mod.moduleInterface && Array.isArray(mod.moduleInterface)) {
        // 转换 moduleInterface 格式
        interfaces = mod.moduleInterface.map(item => ({
          name: item.interfaceName || `${item.interfaceType || '未知'}_${item.interfaceDirection}`,
          type: item.interfaceType || '通用',
          io_type: item.interfaceDirection || 'out'
        }));
      }
      
      // 获取模块的 name 属性（支持 moduleName 和 name）
      const moduleName = mod.name || mod.moduleName || '';
      const moduleQuantity = mod.quantity || mod.moduleAttributes?.quantity || 1;
      const categories = mod.categories || (mod.moduleCategory ? [mod.moduleCategory] : []);
      
      // 如果有多个实例，每个实例一个唯一ID
      for (let i = 0; i < moduleQuantity; i++) {
        const instanceId = moduleQuantity > 1 ? `${moduleName}_${i + 1}` : moduleName;
        
        for (const intf of interfaces) {
          result.push({
            moduleId: moduleName,
            instanceId: instanceId,
            interfaceName: intf.name || `${intf.type}_${intf.io_type}`,
            interfaceType: intf.type || '通用',
            ioType: intf.io_type || 'out',
            maxConnections: 999
          });
        }
        
        // 如果没有接口，根据模块分类添加默认接口
        if (interfaces.length === 0) {
          const defaultInterfaces = this.getDefaultInterfaces({
            name: moduleName,
            categories,
            module_type: mod.moduleType,
            quantity: 1
          }, instanceId);
          result.push(...defaultInterfaces);
        }
      }
    }
    
    return result;
  }

  /**
   * 根据模块分类获取默认接口
   */
  getDefaultInterfaces(mod, instanceId) {
    const result = [];
    const categories = mod.categories || [];
    const moduleType = mod.module_type || '';
    
    if (ModuleStructureHelper.isPowerModule(mod) || 
        categories.includes('电源') || 
        moduleType.includes('电源')) {
      // 电源模块默认有电气输出
      result.push({
        moduleId: mod.name,
        instanceId: instanceId,
        interfaceName: '电气_out',
        interfaceType: '电气',
        ioType: 'out',
        maxConnections: 999
      });
    } else if (categories.includes('控制器') || moduleType.includes('控制器')) {
      // 控制器默认有电气输入和信号输出
      result.push({
        moduleId: mod.name,
        instanceId: instanceId,
        interfaceName: '电气_in',
        interfaceType: '电气',
        ioType: 'in',
        maxConnections: 999
      });
      result.push({
        moduleId: mod.name,
        instanceId: instanceId,
        interfaceName: '信号_out',
        interfaceType: '信号',
        ioType: 'out',
        maxConnections: 999
      });
    } else if (categories.includes('作动器') || moduleType.includes('作动器')) {
      // 作动器默认有电气输入和信号输入
      result.push({
        moduleId: mod.name,
        instanceId: instanceId,
        interfaceName: '电气_in',
        interfaceType: '电气',
        ioType: 'in',
        maxConnections: 999
      });
      result.push({
        moduleId: mod.name,
        instanceId: instanceId,
        interfaceName: '信号_in',
        interfaceType: '信号',
        ioType: 'in',
        maxConnections: 999
      });
    } else {
      // 通用模块默认有电气输入输出
      result.push({
        moduleId: mod.name,
        instanceId: instanceId,
        interfaceName: '电气_in',
        interfaceType: '电气',
        ioType: 'in',
        maxConnections: 999
      });
      result.push({
        moduleId: mod.name,
        instanceId: instanceId,
        interfaceName: '电气_out',
        interfaceType: '电气',
        ioType: 'out',
        maxConnections: 999
      });
    }
    
    return result;
  }

  /**
   * 生成所有可能的接口连接对
   */
  generatePossibleConnections(moduleInterfaces) {
    const connections = [];
    const interfaces = moduleInterfaces;
    
    // 遍历所有接口组合
    for (let i = 0; i < interfaces.length; i++) {
      for (let j = i + 1; j < interfaces.length; j++) {
        const intf1 = interfaces[i];
        const intf2 = interfaces[j];
        
        // 同一个模块的接口不能互连
        if (intf1.moduleId === intf2.moduleId) continue;
        
        // 检查接口方向是否可以匹配 (input <-> output)
        const canMatch = this.canConnect(intf1, intf2);
        
        if (canMatch) {
          connections.push({
            source: intf1,
            target: intf2,
            interfaceType: intf1.interfaceType
          });
        }
      }
    }
    
    return connections;
  }

  /**
   * 判断两个接口是否可以连接
   */
  canConnect(intf1, intf2) {
    // 必须是不同模块
    if (intf1.moduleId === intf2.moduleId) return false;
    
    // 接口类型必须相同，或者任一方为空/通用（表示兼容其他类型）
    const type1 = (intf1.interfaceType || '').trim();
    const type2 = (intf2.interfaceType || '').trim();
    const isTypeMatch = (type1 === type2) || (type1 === '' || type1 === '通用') || (type2 === '' || type2 === '通用');
    if (!isTypeMatch) return false;
    
    // 接口方向必须互补 (in <-> out)
    const dir1 = (intf1.ioType || '').toLowerCase().trim();
    const dir2 = (intf2.ioType || '').toLowerCase().trim();
    
    // 标准化方向值
    const normalizedDir1 = (dir1 === 'input') ? 'in' : (dir1 === 'output' ? 'out' : dir1);
    const normalizedDir2 = (dir2 === 'input') ? 'in' : (dir2 === 'output' ? 'out' : dir2);
    
    // 方向必须互补：一个输入，一个输出
    if ((normalizedDir1 === 'in' && normalizedDir2 === 'out') ||
        (normalizedDir1 === 'out' && normalizedDir2 === 'in')) {
      return true;
    }
    
    // 如果接口类型为空或通用，默认允许连接
    if (type1 === '' || type1 === '通用' || type2 === '' || type2 === '通用') {
      return true;
    }
    
    return false;
  }

  /**
   * 筛选满足约束的有效连接
   * 根据互斥约束过滤
   */
  filterValidConnections(connections, constraints) {
    if (!constraints || constraints.length === 0) {
      return connections;
    }
    
    // 获取互斥约束
    const mutexConstraints = constraints.filter(c => 
      c.type === 'connection' && c.relation_type === '互斥'
    );
    
    if (mutexConstraints.length === 0) {
      return connections;
    }
    
    return connections.filter(conn => {
      for (const constraint of mutexConstraints) {
        const module1 = constraint.module1;
        const module2 = constraint.module2;
        
        const sourceIsModule1 = conn.source.moduleId === module1 || 
                                (conn.source.moduleId?.categories || []).includes(module1);
        const targetIsModule2 = conn.target.moduleId === module2 ||
                                (conn.target.moduleId?.categories || []).includes(module2);
        
        // 如果连接涉及互斥的模块对，过滤掉
        if (sourceIsModule1 && targetIsModule2) {
          return false;
        }
        
        const sourceIsModule2 = conn.source.moduleId === module2 ||
                                (conn.source.moduleId?.categories || []).includes(module2);
        const targetIsModule1 = conn.target.moduleId === module1 ||
                                (conn.target.moduleId?.categories || []).includes(module1);
        
        if (sourceIsModule2 && targetIsModule1) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * 生成连接组合（使用幂集，但限制数量以防止组合爆炸）
   * 创成设计过程中，可能会生成没有连线的方案
   */
  generateConnectionCombinations(connections) {
    const combinations = [];
    
    if (connections.length === 0) {
      combinations.push([]);
      return combinations;
    }
    
    // 使用二进制位运算生成所有子集
    // 为避免组合爆炸，限制最大数量
    const maxCombinations = 10000;
    const totalSubsets = Math.pow(2, connections.length);
    const limitSubsets = Math.min(totalSubsets, maxCombinations);
    
    for (let i = 0; i < limitSubsets; i++) {
      const subset = [];
      for (let j = 0; j < connections.length; j++) {
        if (i & (1 << j)) {
          subset.push(connections[j]);
        }
      }
      combinations.push(subset);
    }
    
    // 添加空连接（创成设计中允许无连接方案）
    if (!combinations.some(c => c.length === 0)) {
      combinations.push([]);
    }
    
    return combinations;
  }

  /**
   * 检查连接方案是否满足绑定/互斥约束
   * 
   * 绑定约束：若一个分类的模块与另一个分类的模块存在绑定约束，
   *          那么在连接方案的筛选过程中，方案里，只要这两个分类的模块之间有连接关系，即满足约束
   * 互斥约束：若一个分类的模块与另一个分类的模块存在互斥约束，
   *          那么在连接方案的筛选过程中，方案里，这两个分类的模块之间一定没有连接关系
   */
  satisfyConnectionConstraints(connections, modules, constraints) {
    if (!constraints || constraints.length === 0) {
      return true;
    }

    // 构建连接图
    const adjacency = new Map();
    
    // 初始化所有模块的邻接表
    for (const mod of modules) {
      const quantity = mod.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        const instanceId = quantity > 1 ? `${mod.name}_${i + 1}` : mod.name;
        if (!adjacency.has(instanceId)) {
          adjacency.set(instanceId, new Set());
        }
      }
    }
    
    // 填充邻接表
    for (const conn of connections) {
      const src = conn.source?.instanceId || conn.source?.moduleId || conn.source;
      const tgt = conn.target?.instanceId || conn.target?.moduleId || conn.target;
      
      if (!adjacency.has(src)) adjacency.set(src, new Set());
      if (!adjacency.has(tgt)) adjacency.set(tgt, new Set());
      
      adjacency.get(src).add(tgt);
      adjacency.get(tgt).add(src);
    }
    
    // 计算图的连通性（使用BFS）
    const reachable = new Map();
    
    const bfs = (start) => {
      const visited = new Set();
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = adjacency.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      return visited;
    };
    
    for (const instanceId of adjacency.keys()) {
      reachable.set(instanceId, bfs(instanceId));
    }
    
    // 检查每个连接约束
    for (const constraint of constraints) {
      if (constraint.type !== 'connection') continue;
      
      const module1 = constraint.module1;
      const module2 = constraint.module2;
      const relation = constraint.relation_type;
      
      // 找到涉及这两个模块的实例
      const module1Instances = this.findModuleInstances(modules, module1);
      const module2Instances = this.findModuleInstances(modules, module2);
      
      // 如果方案中不包含任何约束涉及的模块，跳过该约束
      if (module1Instances.length === 0 && module2Instances.length === 0) {
        continue;
      }
      
      // 绑定约束：只要这两个分类的模块之间有连接关系，即满足约束
      if (relation === '绑定') {
        // 如果只有一个分类存在实例，不满足绑定约束
        if ((module1Instances.length > 0 && module2Instances.length === 0) ||
            (module1Instances.length === 0 && module2Instances.length > 0)) {
          return false;
        }
        
        // 检查是否有连接关系
        if (module1Instances.length > 0 && module2Instances.length > 0) {
          let hasConnection = false;
          
          for (const inst1 of module1Instances) {
            const reachableSet = reachable.get(inst1) || new Set();
            if (module2Instances.some(inst2 => reachableSet.has(inst2))) {
              hasConnection = true;
              break;
            }
          }
          
          if (!hasConnection) {
            return false;
          }
        }
      }
      
      // 互斥约束：这两个分类的模块之间一定没有连接关系
      if (relation === '互斥') {
        if (module1Instances.length > 0 && module2Instances.length > 0) {
          for (const inst1 of module1Instances) {
            const reachableSet = reachable.get(inst1) || new Set();
            if (module2Instances.some(inst2 => reachableSet.has(inst2))) {
              return false;
            }
          }
        }
      }
    }
    
    return true;
  }

  /**
   * 查找模块的所有实例ID
   */
  findModuleInstances(modules, moduleNameOrCategory) {
    const instances = [];
    
    for (const mod of modules) {
      const isMatch = mod.name === moduleNameOrCategory || 
                     (mod.categories || []).includes(moduleNameOrCategory);
      
      if (isMatch) {
        const quantity = mod.quantity || 1;
        for (let i = 0; i < quantity; i++) {
          instances.push(quantity > 1 ? `${mod.name}_${i + 1}` : mod.name);
        }
      }
    }
    
    return instances;
  }

  /**
   * 清理缓存，释放内存
   */
  clearCache() {
    this.connectionCache.clear();
    if (global.gc) {
      global.gc();
    }
  }
}

module.exports = ConnectionGenerator;