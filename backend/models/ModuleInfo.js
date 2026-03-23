/**
 * 模块信息模型 - 机载系统架构创成设计
 * 
 * 创成设计流程核心模型：
 * 1. 模块信息列表包含：ID、名称、类型、分类、层级、上级模块、数量、成本、重量、功耗、可靠度、输入/输出接口、是否为叶子模块
 * 2. 根模块识别：没有父模块的模块，其参数作为方案约束标准
 * 3. 叶子模块识别：没有子模块的模块，作为产品库匹配的筛选条件来源
 */

const { v4: uuidv4 } = require('uuid');

/**
 * 接口类型枚举
 */
class InterfaceType {
  static ELECTRICAL = '电气';
  static MECHANICAL = '机械';
  static DATA = '数据';
  static THERMAL = '热力';
  static FLUID = '流体';
  static SIGNAL = '信号';
  static CUSTOM = '自定义';

  /**
   * 从字符串创建接口类型，提供默认值
   */
  static fromString(value) {
    const types = {
      电气: InterfaceType.ELECTRICAL,
      机械: InterfaceType.MECHANICAL,
      数据: InterfaceType.DATA,
      热力: InterfaceType.THERMAL,
      流体: InterfaceType.FLUID,
      信号: InterfaceType.SIGNAL,
      自定义: InterfaceType.CUSTOM,
    };
    return types[value] || InterfaceType.ELECTRICAL;
  }
}

/**
 * 接口信息类，包含连接状态管理
 */
class InterfaceInfo {
  constructor(name = '', type = InterfaceType.ELECTRICAL, io_type = 'input', custom_type = '', max_connections = 1) {
    this.name = name;
    this.type = typeof type === 'string' ? InterfaceType.fromString(type) : type;
    this.io_type = io_type;
    this.custom_type = custom_type;
    this.max_connections = parseInt(max_connections) || 1;
    this.current_connections = 0;
    this.connected = false;
  }

  /**
   * 转换为字典格式，包含连接状态
   */
  toDict() {
    return {
      name: this.name,
      type: this.type,
      io_type: this.io_type,
      custom_type: this.custom_type,
      max_connections: this.max_connections,
      current_connections: this.current_connections,
      connected: this.connected,
    };
  }

  /**
   * 检查是否可以连接
   */
  canConnect() {
    return this.current_connections < this.max_connections;
  }

  /**
   * 添加连接
   */
  addConnection() {
    if (this.canConnect()) {
      this.current_connections++;
      this.connected = true;
      return true;
    }
    return false;
  }

  /**
   * 移除连接
   */
  removeConnection() {
    if (this.current_connections > 0) {
      this.current_connections--;
      this.connected = this.current_connections > 0;
      return true;
    }
    return false;
  }

  /**
   * 从字典格式创建接口信息对象
   */
  static fromDict(data) {
    if (!data) {
      return new InterfaceInfo();
    }

    try {
      return new InterfaceInfo(
        data.name || '未命名接口',
        data.type || '电气',
        data.io_type || 'input',
        data.custom_type || '',
        data.max_connections || 1,
      );
    } catch (error) {
      console.error('创建InterfaceInfo失败:', error);
      return new InterfaceInfo();
    }
  }
}

/**
 * 模块属性类，包含成本、重量、功耗、可靠度等属性
 * 用于创成设计的参数约束
 */
class ModuleProperty {
  constructor(
    cost = 0.0,
    weight = 0.0,
    power = 0.0,
    reliability = 0.0,
    slot_ratio = 1.0
  ) {
    this.cost = parseFloat(cost) || 0;
    this.weight = parseFloat(weight) || 0;
    this.power = parseFloat(power) || 0;
    this.reliability = parseFloat(reliability) || 0;
    this.slot_ratio = parseFloat(slot_ratio) || 1.0;
  }

  /**
   * 转换为字典格式
   */
  toDict() {
    return {
      cost: this.cost,
      weight: this.weight,
      power: this.power,
      reliability: this.reliability,
      slot_ratio: this.slot_ratio
    };
  }

  /**
   * 从字典格式创建模块属性对象
   * 兼容旧数据格式
   */
  static fromDict(data) {
    if (!data) {
      return new ModuleProperty();
    }

    // 兼容旧数据：如果存在范围字段，取平均值或第一个值
    const cost = data.cost !== undefined ? data.cost :
                (data.cost_min !== undefined ? data.cost_min : 0.0);
    const weight = data.weight !== undefined ? data.weight :
                  (data.weight_min !== undefined ? data.weight_min : 0.0);
    const power = data.power !== undefined ? data.power :
                 (data.power_min !== undefined ? data.power_min : 0.0);
    const reliability = data.reliability !== undefined ? data.reliability :
                       (data.reliability_min !== undefined ? data.reliability_min : 0.0);

    return new ModuleProperty(
      cost,
      weight,
      power,
      reliability,
      data.slot_ratio || 1.0
    );
  }
}

/**
 * 模块信息类，包含模块属性、接口、连接状态等
 * 
 * 创成设计关键属性：
 * - isLeaf: 是否为叶子模块（没有子模块）
 * - isRoot: 是否为根模块（没有父模块）
 * - properties: 成本、重量、功耗、可靠度参数
 */
class ModuleInfo {
  constructor(
    name = '',
    module_type = '',
    categories = [],
    level = 0,
    parent_module = '',
    child_modules = [],
    max_instances = 100,
    max_children = 100,
    quantity = 1,
    properties = new ModuleProperty(),
    interfaces = [],
    id = '',
    original_id = '',
    original_properties = null,
    isLeaf = false,
  ) {
    this.name = name;
    this.module_type = module_type;
    this.categories = Array.isArray(categories) ? categories : [];
    this.level = parseInt(level);
    this.parent_module = parent_module;
    this.child_modules = Array.isArray(child_modules) ? child_modules : [];

    // 确保最大实例数量有效
    this.max_instances = Math.max(1, parseInt(max_instances));
    
    // 确保最大子模块数量有效，支持 Infinity
    const parsedMaxChildren = parseInt(max_children);
    this.max_children = isFinite(parsedMaxChildren) ? Math.max(1, parsedMaxChildren) : max_children;

    // 设置数量（单一值）
    this.quantity = Math.max(1, parseInt(quantity));

    this.properties = properties instanceof ModuleProperty ? properties : ModuleProperty.fromDict(properties);
    this.interfaces = Array.isArray(interfaces) ? interfaces.map((i) => (i instanceof InterfaceInfo ? i : InterfaceInfo.fromDict(i))) : [];

    this.id = id || uuidv4().substring(0, 8);
    this.original_id = original_id || this.id;
    this.original_properties = original_properties || ModuleProperty.fromDict(this.properties.toDict());
    this.isLeaf = isLeaf;
  }

  /**
   * 转换为字典格式
   */
  toDict() {
    return {
      name: this.name,
      module_type: this.module_type,
      categories: this.categories,
      level: this.level,
      parent_module: this.parent_module,
      child_modules: this.child_modules,
      max_instances: this.max_instances,
      max_children: this.max_children,
      quantity: this.quantity,
      properties: this.properties.toDict(),
      interfaces: this.interfaces.map((i) => i.toDict()),
      id: this.id,
      original_id: this.original_id,
      original_properties: this.original_properties.toDict(),
      isLeaf: this.isLeaf,
    };
  }

  /**
   * 从字典格式创建模块信息对象
   */
  static fromDict(data) {
    if (!data) {
      return new ModuleInfo();
    }

    try {
      // 读取叶子节点标识
      const isLeaf = data.isLeaf !== undefined ? 
        data.isLeaf : 
        (data.child_modules || []).length === 0;
      
      // 处理最大实例数和子节点容量
      let max_instances = 1;
      let max_children = 1;
      
      if (data.max_instances !== undefined) {
        max_instances = data.max_instances;
      } else if (data.quantity_max !== undefined) {
        max_instances = data.quantity_max;
      }
      
      if (data.max_children !== undefined) {
        max_children = data.max_children;
      } else {
        max_children = isLeaf ? 1 : Infinity;
      }
      
      max_instances = Math.max(1, parseInt(max_instances));
      if (max_children !== Infinity) {
        max_children = Math.max(1, parseInt(max_children));
      }
      
      // 根据是否为叶子节点调整默认值
      if (max_instances === 1 && !data.max_instances && !data.quantity_max) {
        max_instances = isLeaf ? Infinity : 1;
      }
      
      // 处理接口数据
      let interfaces = [];
      const interfacesData = data.interfaces || [];

      if (interfacesData.length > 0) {
        interfaces = interfacesData.map((i) => InterfaceInfo.fromDict(i));
      } else {
        // 尝试从旧格式中读取接口
        const inputInterfaces = data.input_interfaces || [];
        const outputInterfaces = data.output_interfaces || [];

        inputInterfaces.forEach((interfaceStr) => {
          if (typeof interfaceStr === 'string') {
            if (interfaceStr.includes('(') && interfaceStr.includes(')')) {
              const namePart = interfaceStr.split('(')[0].trim();
              const typePart = interfaceStr.split('(')[1].split(')')[0].trim();
              interfaces.push(new InterfaceInfo(namePart, InterfaceType.fromString(typePart), 'input'));
            }
          }
        });

        outputInterfaces.forEach((interfaceStr) => {
          if (typeof interfaceStr === 'string') {
            if (interfaceStr.includes('(') && interfaceStr.includes(')')) {
              const namePart = interfaceStr.split('(')[0].trim();
              const typePart = interfaceStr.split('(')[1].split(')')[0].trim();
              interfaces.push(new InterfaceInfo(namePart, InterfaceType.fromString(typePart), 'output'));
            }
          }
        });
      }
      
      // 获取数量
      let quantity = 1;
      if (data.quantity !== undefined) {
        if (typeof data.quantity === 'object') {
          quantity = parseInt(data.quantity.min || 1);
        } else {
          quantity = parseInt(data.quantity);
        }
      } else if (data.quantity_min !== undefined) {
        quantity = parseInt(data.quantity_min || 1);
      } else if (data.quantity_max !== undefined) {
        quantity = parseInt(data.quantity_max || 1);
      }

      // 创建模块属性
      let propertiesData = data.properties || {};
      if (!propertiesData || Object.keys(propertiesData).length === 0) {
        propertiesData = {
          cost: data.cost || data.cost_min || 0.0,
          weight: data.weight || data.weight_min || 0.0,
          power: data.power || data.power_min || 0.0,
          reliability: data.reliability || data.reliability_min || 0.0,
        };
      }

      const properties = ModuleProperty.fromDict(propertiesData);

      return new ModuleInfo(
        data.name || '未命名模块',
        data.module_type || '',
        data.categories || [],
        parseInt(data.level || 0),
        data.parent_module || (data.parent_modules && data.parent_modules[0]) || '',
        data.child_modules || [],
        max_instances,
        max_children,
        quantity,
        properties,
        interfaces,
        data.id || '',
        data.original_id || data.id || '',
        ModuleProperty.fromDict(propertiesData),
        isLeaf
      );
    } catch (error) {
      console.error('创建ModuleInfo失败:', error);
      return new ModuleInfo();
    }
  }
}

/**
 * 模块结构辅助类
 * 用于识别根模块和叶子模块，支持创成设计流程
 * 
 * 根模块识别规则：没有父模块的模块，其参数作为方案约束标准
 * 叶子模块识别规则：没有子模块的模块，作为产品库匹配的筛选条件来源
 */
class ModuleStructureHelper {
  
  /**
   * 识别根模块（没有父模块的模块）
   * 根模块的"成本、重量、功耗、可靠度"参数作为创成设计的约束标准
   * 
   * @param {Array} modules - 模块列表
   * @returns {Array} 根模块列表
   */
  static identifyRootModules(modules) {
    if (!Array.isArray(modules) || modules.length === 0) {
      return [];
    }

    // 构建父子关系映射
    const childModulesSet = new Set();
    modules.forEach(m => {
      const parentName = m.parent_module || m.parentModule;
      const myName = m.name || m.moduleName;
      if (parentName && parentName.trim() !== '') {
        childModulesSet.add(myName);
      }
    });

    // 查找根模块：没有父模块的模块，或者有子模块但不是其他模块的子模块
    const rootModules = modules.filter(m => {
      const hasParent = (m.parent_module || m.parentModule) &&
                        (m.parent_module || m.parentModule).trim() !== '';
      const myName = m.name || m.moduleName;
      const hasChildren = (m.child_modules && m.child_modules.length > 0) ||
                          modules.some(other => (other.parent_module || other.parentModule) === myName);
      
      // 根模块：没有父模块，或者有子模块的顶层模块
      return !hasParent || (hasChildren && !hasParent);
    }).map(m => {
      // 确保正确提取所有属性
      const props = m.properties || m.moduleAttributes || {};
      const name = m.name || m.moduleName || '';
      const categories = m.categories || (m.moduleCategory ? [m.moduleCategory] : []);
      
      return {
        ...m,
        name: name,
        categories: categories,
        properties: {
          cost: props.cost || 0,
          weight: props.weight || 0,
          power: props.power || 0,
          reliability: props.reliability || 0
        }
      };
    });

    console.log(`[ModuleStructureHelper] 识别到 ${rootModules.length} 个根模块`);
    rootModules.forEach((rm, i) => {
      console.log(`  根模块[${i}]: ${rm.name}, 属性: ${JSON.stringify(rm.properties)}`);
    });
    return rootModules;
  }

  /**
   * 识别叶子模块（没有子模块的模块）
   * 叶子模块的参数用于从产品库筛选匹配的模块
   * 
   * @param {Array} modules - 模块列表
   * @returns {Array} 叶子模块列表
   */
  static identifyLeafModules(modules) {
    if (!Array.isArray(modules) || modules.length === 0) {
      return [];
    }

    // 构建父模块名称集合
    const parentNames = new Set();
    modules.forEach(m => {
      const parentName = m.parent_module || m.parentModule;
      if (parentName && parentName.trim() !== '') {
        parentNames.add(parentName);
      }
    });

    // 查找叶子模块：没有子模块的模块
    const leafModules = modules.filter(m => {
      // 检查是否有显式的isLeaf标记
      if (m.isLeaf === true) {
        return true;
      }

      // 检查是否有子模块
      const hasChildrenViaArray = m.child_modules && m.child_modules.length > 0;
      const nameToMatch = m.name || m.moduleName;
      const hasChildrenViaParent = modules.some(other =>
        (other.parent_module || other.parentModule) === nameToMatch
      );

      return !hasChildrenViaArray && !hasChildrenViaParent;
    }).map(m => {
      // 确保正确提取所有属性
      const props = m.properties || m.moduleAttributes || {};
      const name = m.name || m.moduleName || '';
      const quantity = m.quantity || props.quantity || 1;
      const categories = m.categories || (m.moduleCategory ? [m.moduleCategory] : []);
      
      return {
        ...m,
        name: name,
        categories: categories,
        quantity: quantity,
        properties: {
          cost: props.cost || 0,
          weight: props.weight || 0,
          power: props.power || 0,
          reliability: props.reliability || 0
        }
      };
    });

    console.log(`[ModuleStructureHelper] 识别到 ${leafModules.length} 个叶子模块`);
    leafModules.forEach((lm, i) => {
      console.log(`  叶子模块[${i}]: ${lm.name}, 分类=[${lm.categories.join(',')}], 数量=${lm.quantity}`);
    });
    return leafModules;
  }

  /**
   * 从根模块提取全局约束参数
   * 根模块的参数作为方案约束标准：
   * - 成本、重量、功耗不高于根模块
   * - 可靠度不低于根模块
   * 
   * @param {Array} rootModules - 根模块列表
   * @returns {Object} 全局约束对象
   */
  static extractGlobalConstraints(rootModules) {
    const constraints = {
      cost_max: Infinity,
      weight_max: Infinity,
      power_max: Infinity,
      reliability_min: 0
    };

    if (!rootModules || rootModules.length === 0) {
      console.log(`[ModuleStructureHelper] 无根模块，使用默认约束(全部无限制)`);
      return constraints;
    }

    // 取第一个根模块的参数作为约束
    const root = rootModules[0];
    const props = root.properties || root.moduleAttributes || {};

    // 只有当值存在且大于0时才设置为约束，否则使用无限制
    // 注意：如果属性值为0，视为无约束
    constraints.cost_max = (props.cost !== undefined && props.cost > 0) ? props.cost : Infinity;
    constraints.weight_max = (props.weight !== undefined && props.weight > 0) ? props.weight : Infinity;
    constraints.power_max = (props.power !== undefined && props.power > 0) ? props.power : Infinity;
    constraints.reliability_min = (props.reliability !== undefined && props.reliability > 0) ? props.reliability : 0;

    console.log(`[ModuleStructureHelper] 提取全局约束: 成本<=${constraints.cost_max}, 重量<=${constraints.weight_max}, 功耗<=${constraints.power_max}, 可靠度>=${constraints.reliability_min}`);
    console.log(`[ModuleStructureHelper] 根模块属性: ${JSON.stringify(props)}`);
    
    return constraints;
  }

  /**
   * 判断模块是否为电源模块
   * 电源模块的特殊规则：
   * - 从产品库匹配时，功耗需高于叶子模块功耗
   * - 方案总功耗计算时不计入电源模块功耗
   * 
   * @param {Object} module - 模块对象
   * @returns {boolean} 是否为电源模块
   */
  static isPowerModule(module) {
    if (!module) return false;

    const name = module.name || '';
    const categories = module.categories || [];
    const moduleType = module.module_type || module.moduleType || '';

    // 名称中包含电源关键词
    if (name.includes('电源') || name.toLowerCase().includes('power')) {
      return true;
    }

    // 分类中包含电源关键词
    if (categories.some(c => 
      c.includes('电源') || 
      c.toLowerCase().includes('power') ||
      c === '电源模块'
    )) {
      return true;
    }

    // 模块类型为电源
    if (moduleType.includes('电源') || moduleType.toLowerCase() === 'power') {
      return true;
    }

    // 显式属性标记
    if (module._isPower === true || module.module_type === '电源') {
      return true;
    }

    return false;
  }

  /**
   * 判断分类是否为电源分类
   * 
   * @param {string} category - 分类名称
   * @returns {boolean} 是否为电源分类
   */
  static isPowerCategory(category) {
    if (!category) return false;
    const powerKeywords = ['电源', 'power', 'Power', 'POWER', '供电', '配电'];
    return powerKeywords.some(kw => 
      category.includes(kw) || category.toLowerCase().includes(kw.toLowerCase())
    );
  }

  /**
   * 构建模块层级结构
   * 
   * @param {Array} modules - 模块列表
   * @returns {Object} 层级结构信息
   */
  static buildModuleHierarchy(modules) {
    if (!Array.isArray(modules) || modules.length === 0) {
      return { rootModules: [], leafModules: [], hierarchy: new Map() };
    }

    const rootModules = this.identifyRootModules(modules);
    const leafModules = this.identifyLeafModules(modules);
    
    // 构建层级映射
    const hierarchy = new Map();
    modules.forEach(m => {
      const level = m.level || 0;
      if (!hierarchy.has(level)) {
        hierarchy.set(level, []);
      }
      hierarchy.get(level).push(m);
    });

    return {
      rootModules,
      leafModules,
      hierarchy,
      totalModules: modules.length,
      totalRoots: rootModules.length,
      totalLeaves: leafModules.length
    };
  }
}

module.exports = {
  InterfaceType,
  InterfaceInfo,
  ModuleProperty,
  ModuleInfo,
  ModuleStructureHelper,
};
