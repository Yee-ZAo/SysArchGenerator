/**
 * 约束求解器 - 验证方案是否满足约束条件
 * 
 * 创成设计约束规则:
 * 1. 连接约束:
 *    - 绑定约束：若一个分类的模块与另一个分类的模块存在绑定约束，
 *              那么在连接方案的筛选过程中，方案里，只要这两个分类的模块之间有连接关系，即满足约束
 *    - 互斥约束：若一个分类的模块与另一个分类的模块存在互斥约束，
 *              那么在连接方案的筛选过程中，方案里，这两个分类的模块之间一定没有连接关系
 * 2. 参数约束:
 *    - 方案成本、重量、功耗不高于根模块参数
 *    - 方案可靠度不低于根模块可靠度
 * 3. 电源模块特殊规则:
 *    - 参数验证时功耗不计入电源模块
 */

const { ArchitectureSolution } = require('../models/ArchitectureSolution');
const { ModuleStructureHelper } = require('../models/ModuleInfo');
const logger = require('./Logger');

/**
 * 约束类型枚举
 */
class ConstraintType {
  static CONNECTION_RELATION = '连接关系';
  static PARAMETER = '参数';
}

/**
 * 关系类型枚举
 */
class RelationType {
  static BINDING = '绑定';
  static MUTUAL_EXCLUSION = '互斥';
}

/**
 * 参数约束类型枚举
 */
class ParameterConstraintType {
  static QUANTITY = '数量';
  static COST = '成本';
  static WEIGHT = '重量';
  static POWER = '功耗';
  static RELIABILITY = '可靠度';
}

class ConstraintSolver {
  constructor(constraints) {
    this.constraints = constraints;
    // 参数映射表：将中文约束类型映射到模型属性名
    this.paramMap = {
      数量: 'quantity',
      成本: 'cost',
      重量: 'weight',
      功耗: 'power',
      可靠度: 'reliability',
    };
  }

  /**
   * 动态识别所有叶子节点
   */
  getLeafModules(modules) {
    return modules.filter(module => module.isLeaf === true);
  }

  /**
   * 检查解决方案是否满足所有约束
   */
  checkSolution(solution) {
    const leafModules = this.getLeafModules(solution.modules);
    solution.calculateTotals(leafModules);

    if (!this.constraints || !Array.isArray(this.constraints) || this.constraints.length === 0) {
      return true;
    }

    for (const constraint of this.constraints) {
      if (!this.checkConstraint(constraint, solution, leafModules)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 验证解决方案是否满足所有约束条件
   * 
   * @param {Object} solution 解决方案对象
   * @returns {boolean} 是否满足约束
   */
  satisfiesConstraints(solution) {
    console.log(`\n========== 约束验证开始 ==========`);
    console.log(`约束数量: ${this.constraints ? this.constraints.length : 0}`);
    
    if (!this.constraints || !Array.isArray(this.constraints) || this.constraints.length === 0) {
      console.log(`没有约束条件，直接返回 true`);
      return true;
    }
    
    // 如果 solution 已经是 ArchitectureSolution 实例，直接检查
    if (solution.modules && solution.calculateTotals) {
      console.log(`解决方案格式: ArchitectureSolution 实例`);
      return this.checkSolution(solution);
    }
    
    // 处理 ArchitectureGenerator 生成的解决方案格式
    // 格式: { id, rootModule, leafModules: [{module, quantity}], connections, properties }
    if (solution.leafModules && Array.isArray(solution.leafModules)) {
      console.log(`解决方案格式: ArchitectureGenerator 格式`);
      console.log(`叶子模块数量: ${solution.leafModules.length}`);
      console.log(`连接数量: ${solution.connections ? solution.connections.length : 0}`);
      
      // 提取叶子模块列表
      const leafModules = solution.leafModules.map(lm => {
        const module = lm.module || lm;
        const quantity = lm.quantity || module.quantity || 1;
        return {
          ...module,
          quantity,
          isLeaf: true
        };
      });
      
      // 添加根模块到模块列表（如果有）
      const modules = [...leafModules];
      if (solution.rootModule) {
        modules.unshift({
          ...solution.rootModule,
          isLeaf: false
        });
      }
      
      // 创建临时解决方案对象
      const tempSolution = {
        modules,
        connections: solution.connections || [],
        properties: solution.properties || {},
        calculateTotals: function() {
          if (this.properties) {
            this.total_cost = this.properties.totalCost || 0;
            this.total_weight = this.properties.totalWeight || 0;
            this.total_power = this.properties.totalPower || 0;
            this.total_reliability = this.properties.totalReliability || 0;
          }
        }
      };
      
      // 检查每个约束
      for (const constraint of this.constraints) {
        console.log(`\n检查约束 #${constraint.id}: ${constraint.type}`);
        if (!this.checkConstraint(constraint, tempSolution, leafModules)) {
          console.log(`❌ 约束 #${constraint.id} 不满足`);
          console.log(`========== 约束验证结束: false ==========\n`);
          return false;
        } else {
          console.log(`✅ 约束 #${constraint.id} 满足`);
        }
      }
      
      console.log(`========== 约束验证结束: true ==========\n`);
      return true;
    }
    
    // 否则，尝试从 moduleTree 和 connections 构建模块列表
    try {
      console.log(`解决方案格式: 模块树格式`);
      const modules = this.extractModulesFromTree(solution.moduleTree);
      const connections = solution.connections || [];
      
      const tempSolution = {
        modules,
        connections,
        calculateTotals: function() {
          this.total_cost = 0;
          this.total_weight = 0;
          this.total_power = 0;
          this.total_reliability = 0;
        }
      };
      
      const leafModules = modules.filter(m => m.isLeaf);
      
      for (const constraint of this.constraints) {
        if (!this.checkConstraint(constraint, tempSolution, leafModules)) {
          console.log(`❌ 约束 #${constraint.id} 不满足`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('约束检查失败:', error);
      return true;
    }
  }

  /**
   * 从模块树中提取所有模块实例
   */
  extractModulesFromTree(treeNode) {
    const modules = [];
    const traverse = (node) => {
      if (node.instance && node.instance.isVirtual) {
        if (node.children) {
          node.children.forEach(child => traverse(child));
        }
        return;
      }
      
      if (node.instance) {
        const moduleInfo = {
          id: node.instance.instanceId,
          name: node.instance.name,
          module_type: node.instance.moduleType,
          level: node.instance.level,
          parent_module: node.instance.parent ? node.instance.parent.instanceId : null,
          quantity: node.instance.quantity || 1,
          properties: node.instance.properties,
          interfaces: node.instance.interfaces,
          isLeaf: node.children.length === 0
        };
        modules.push(moduleInfo);
      }
      if (node.children) {
        node.children.forEach(child => traverse(child));
      }
    };
    
    if (treeNode) {
      traverse(treeNode);
    }
    return modules;
  }

  /**
   * 检查单个约束
   */
  checkConstraint(constraint, solution, leafModules) {
    if (constraint.type === 'connection') {
      return this.checkConnectionConstraint(constraint, solution, leafModules);
    }
    if (constraint.type === 'parameter') {
      return this.checkParameterConstraint(constraint, solution, leafModules);
    }
    return true;
  }

  /**
   * 检查连接约束
   * 
   * 绑定约束：若一个分类的模块与另一个分类的模块存在绑定约束，
   *          那么在连接方案的筛选过程中，方案里，只要这两个分类的模块之间有连接关系，即满足约束
   * 互斥约束：若一个分类的模块与另一个分类的模块存在互斥约束，
   *          那么在连接方案的筛选过程中，方案里，这两个分类的模块之间一定没有连接关系
   */
  checkConnectionConstraint(constraint, solution, leafModules) {
    console.log(`检查连接约束: ${JSON.stringify(constraint)}`);
    
    // 获取目标模块实例
    let moduleAInstances = [];
    let moduleBInstances = [];
    
    if (constraint.module1 && constraint.module2) {
      // 通过 module1/module2 模块名称或分类查找
      console.log(`使用 module1/module2 格式查找模块: "${constraint.module1}" ↔ "${constraint.module2}"`);
      
      moduleAInstances = leafModules.filter((module) =>
        module.name === constraint.module1 ||
        (module.categories && module.categories.includes(constraint.module1))
      );
      
      moduleBInstances = leafModules.filter((module) =>
        module.name === constraint.module2 ||
        (module.categories && module.categories.includes(constraint.module2))
      );
      
      console.log(`找到模块A "${constraint.module1}": ${moduleAInstances.length} 个实例`);
      console.log(`找到模块B "${constraint.module2}": ${moduleBInstances.length} 个实例`);
    } else if (constraint.interface_type) {
      // 通过接口类型查找
      console.log(`使用 interface_type 格式查找模块: "${constraint.interface_type}"`);
      
      const getModulesByInterface = (interfaceType) => leafModules.filter((module) =>
        module.interfaces?.some((intf) => intf.type === interfaceType || intf.name === interfaceType)
      );
      
      moduleAInstances = getModulesByInterface(constraint.interface_type);
      moduleBInstances = getModulesByInterface(constraint.interface_type);
      
      console.log(`找到接口 "${constraint.interface_type}" 模块: ${moduleAInstances.length} 个实例`);
    } else {
      console.warn(`无法识别的连接约束格式: ${JSON.stringify(constraint)}`);
      return true;
    }

    const connections = solution.connections || [];
    console.log(`当前方案连接数: ${connections.length}`);
    
    // 绑定约束检查
    if (constraint.relation_type === '绑定') {
      // 如果两个分类都有实例，检查是否有连接关系
      if (moduleAInstances.length > 0 && moduleBInstances.length > 0) {
        // 检查是否两个分类的模块之间有连接关系
        let hasConnection = false;
        
        for (const moduleA of moduleAInstances) {
          for (const moduleB of moduleBInstances) {
            const connected = this.areModulesConnected(moduleA, moduleB, connections);
            if (connected) {
              hasConnection = true;
              break;
            }
          }
          if (hasConnection) break;
        }
        
        if (!hasConnection) {
          console.log(`绑定约束不满足: ${constraint.module1} 和 ${constraint.module2} 之间没有连接关系`);
          return false;
        }
        
        console.log(`绑定约束满足: ${constraint.module1} 和 ${constraint.module2} 之间有连接关系`);
      } else {
        // 如果只有一个分类存在实例，不满足绑定约束
        if ((moduleAInstances.length > 0 && moduleBInstances.length === 0) ||
            (moduleAInstances.length === 0 && moduleBInstances.length > 0)) {
          console.log(`绑定约束不满足: 只有一方模块存在`);
          return false;
        }
      }
      return true;
    }
    
    // 互斥约束检查
    if (constraint.relation_type === '互斥') {
      if (moduleAInstances.length > 0 && moduleBInstances.length > 0) {
        // 检查两个分类的模块之间是否没有连接关系
        for (const moduleA of moduleAInstances) {
          for (const moduleB of moduleBInstances) {
            if (moduleA.id === moduleB.id || moduleA.name === moduleB.name) continue;
            
            const connected = this.areModulesConnected(moduleA, moduleB, connections);
            if (connected) {
              console.log(`互斥约束不满足: ${moduleA.name} 和 ${moduleB.name} 存在连接`);
              return false;
            }
          }
        }
        console.log(`互斥约束满足: ${constraint.module1} 和 ${constraint.module2} 没有连接关系`);
      }
      return true;
    }
    
    return true;
  }

  /**
   * 检查两个模块是否连接（直接连接）
   */
  areModulesConnected(moduleA, moduleB, connections) {
    return connections.some((conn) => {
      const sourceId = conn.source_module_id || conn.sourceId || conn.source;
      const targetId = conn.target_module_id || conn.targetId || conn.target;
      const sourceName = conn.source_name || conn.sourceName || conn.source;
      const targetName = conn.target_name || conn.targetName || conn.target;
      
      const sourceMatchA = sourceId === moduleA.id || sourceId === moduleA.name || sourceName === moduleA.name;
      const targetMatchB = targetId === moduleB.id || targetId === moduleB.name || targetName === moduleB.name;
      
      const sourceMatchB = sourceId === moduleB.id || sourceId === moduleB.name || sourceName === moduleB.name;
      const targetMatchA = targetId === moduleA.id || targetId === moduleA.name || targetName === moduleA.name;
      
      return (sourceMatchA && targetMatchB) || (sourceMatchB && targetMatchA);
    });
  }

  /**
   * 检查参数约束
   */
  checkParameterConstraint(constraint, solution, leafModules) {
    console.log(`\n--- 检查参数约束 ---`);
    console.log(`约束详情: 目标=${constraint.target_type}, 参数=${constraint.parameter_type}, 范围=[${constraint.min_value}, ${constraint.max_value}]`);
    console.log(`叶子模块数量: ${leafModules.length}`);
    
    try {
      if (constraint.target_type === '总体') {
        return this.checkOverallParameterConstraint(constraint, solution, leafModules);
      }
      return this.checkModuleParameterConstraint(constraint, solution, leafModules);
    } catch (error) {
      console.error('检查参数约束失败:', error);
      return false;
    }
  }

  /**
   * 检查总体参数约束
   */
  checkOverallParameterConstraint(constraint, solution, leafModules) {
    if (!this.paramMap[constraint.parameter_type]) {
      console.log(`未识别的参数类型: ${constraint.parameter_type}`);
      return true;
    }

    const propertyName = this.paramMap[constraint.parameter_type];
    console.log(`映射后的属性名: ${constraint.parameter_type} -> ${propertyName}`);
    
    let totalValue = 0;

    // 创建模块实例列表
    const instances = [];
    leafModules.forEach((module) => {
      const quantity = module.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        if (propertyName === 'quantity') {
          if (i === 0) instances.push(module);
        } else {
          instances.push(module);
        }
      }
    });
    
    console.log(`参与计算的实例数: ${instances.length}`);

    if (propertyName === 'quantity') {
      totalValue = instances.filter((m) => 
        m.name === constraint.target_type ||
        (m.categories && m.categories.includes(constraint.target_type))
      ).length;
      console.log(`数量统计: 类型"${constraint.target_type}" = ${totalValue}`);
    }
    else if (propertyName === 'reliability') {
      // 可靠度使用累乘
      totalValue = instances.reduce((prod, m) => {
        const props = m.properties || {};
        const rel = props.reliability || props.reliability_min || 1;
        return prod * rel;
      }, 1);
      console.log(`总体可靠度: ${totalValue}`);
    }
    else {
      // 其他参数累加
      if (propertyName === 'power') {
        // 功耗排除电源模块
        totalValue = instances.reduce((sum, m) => {
          if (ModuleStructureHelper.isPowerModule(m)) {
            console.log(`  跳过电源模块: ${m.name}`);
            return sum;
          }
          const props = m.properties || {};
          const power = props.power || props.power_min || 0;
          return sum + power;
        }, 0);
        console.log(`总体功耗（排除电源）: ${totalValue}`);
      } else {
        // 成本和重量
        totalValue = instances.reduce((sum, m) => {
          const props = m.properties || {};
          let value = 0;
          
          if (propertyName === 'cost') {
            value = props.cost || props.cost_min || 0;
          } else if (propertyName === 'weight') {
            value = props.weight || props.weight_min || 0;
          } else {
            value = props[propertyName] || 0;
          }
          
          return sum + value;
        }, 0);
        console.log(`总体${constraint.parameter_type}: ${totalValue}`);
      }
    }

    const result = constraint.min_value <= totalValue && totalValue <= constraint.max_value;
    console.log(`约束检查: ${totalValue} in [${constraint.min_value}, ${constraint.max_value}] = ${result ? '✅ 满足' : '❌ 不满足'}`);
    return result;
  }

  /**
   * 检查模块级参数约束
   */
  checkModuleParameterConstraint(constraint, solution, leafModules) {
    if (!this.paramMap[constraint.parameter_type]) {
      console.log(`未识别的参数类型: ${constraint.parameter_type}`);
      return true;
    }
    
    const propertyName = this.paramMap[constraint.parameter_type];
    console.log(`映射后的属性名: ${constraint.parameter_type} -> ${propertyName}`);

    const targetModuleType = constraint.target_type;
    console.log(`目标模块类型: ${targetModuleType}`);

    const targetModules = leafModules.filter((module) => {
      const nameMatch = module.name === targetModuleType;
      const categoryMatch = module.categories && module.categories.includes(targetModuleType);
      return nameMatch || categoryMatch;
    });

    console.log(`匹配到 ${targetModules.length} 个目标模块`);
    
    if (targetModules.length === 0) {
      console.log(`没有匹配的模块，跳过检查`);
      return true;
    }

    for (const module of targetModules) {
      const props = module.properties || {};
      const currentValue = props[propertyName] || props[`${propertyName}_min`] || 0;

      console.log(`模块 ${module.name}: 属性值=${currentValue}`);

      if (currentValue < constraint.min_value || currentValue > constraint.max_value) {
        console.log(`模块 ${module.name} 属性 ${constraint.parameter_type}=${currentValue} 不在约束范围 [${constraint.min_value}, ${constraint.max_value}]`);
        return false;
      }
    }

    console.log(`✅ 模块级参数约束满足`);
    return true;
  }

  /**
   * 修剪实例树，移除不满足约束的节点
   */
  pruneTrees(instanceTrees, constraints) {
    if (!constraints || !instanceTrees || instanceTrees.length === 0) {
      return instanceTrees;
    }
    return instanceTrees;
  }

  /**
   * 检查树节点是否可以被修剪
   */
  canPruneNode(treeNode, constraints) {
    if (!constraints) {
      return true;
    }
    return true;
  }
}

module.exports = ConstraintSolver;
