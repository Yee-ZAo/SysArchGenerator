const { v4: uuidv4 } = require('uuid');

class ArchitectureSolution {
  constructor(data) {
    // 支持两种构造函数格式：对象参数或多参数
    if (typeof data === 'object' && !Array.isArray(data)) {
      // 对象参数格式：{ id, name, modules, connections, parameters, level_connections }
      // 防御性赋值：确保所有关键字段存在缺省值
      this.id = data.id || data.solution_id || 0;
      this.name = data.name || `解决方案 ${this.id}`;
      this.modules = data.modules || [];
      this.connections = data.connections || [];
      this.level_connections = data.level_connections || {};

      // 设置总体参数（单值，非范围）
      if (data.parameters) {
        this.total_cost = data.parameters.total_cost || data.parameters.cost || 0.0;
        this.total_weight = data.parameters.total_weight || data.parameters.weight || 0.0;
        this.total_power = data.parameters.total_power || data.parameters.power || 0.0;
        this.total_reliability = data.parameters.total_reliability || data.parameters.reliability || 0.0;
      } else {
        this.total_cost = 0.0;
        this.total_weight = 0.0;
        this.total_power = 0.0;
        this.total_reliability = 0.0;
      }
    } else {
      // 多参数格式：constructor(id, modules, connections, level_connections)
      const id = data;
      const modules = arguments[1] || [];
      const connections = arguments[2] || [];
      const level_connections = arguments[3] || {};

      // 参数验证
      if (isNaN(id)) throw new Error('解决方案ID必须为数字');
      if (!Array.isArray(modules)) modules = [];
      if (!Array.isArray(connections)) connections = [];

      this.id = id;
      this.name = `解决方案 ${id}`;
      this.modules = modules;
      this.connections = connections;
      this.level_connections = level_connections;

      this.total_cost = 0.0;
      this.total_weight = 0.0;
      this.total_power = 0.0;
      this.total_reliability = 0.0;
    }

    this.calculateTotals();
  }
  // 计算系统总体参数（成本、重量、功耗、可靠度）- 单值版本
  calculateTotals() {
    // 找出叶子模块
    const leafModules = this.findLeafModules();

    if (leafModules.length === 0) {
      return;
    }

    // 重置所有总体参数（单值）
    this.total_cost = 0.0;
    this.total_weight = 0.0;
    this.total_power = 0.0;
    this.total_reliability = 1.0;

    // 计算成本、重量、功耗 - 累加叶子模块（单值）
    // 【修复】功耗计算排除分类为"电源"的模块
    leafModules.forEach((module) => {
      this.total_cost += module.properties.cost || 0;
      this.total_weight += module.properties.weight || 0;
      
      // 功耗计算排除电源模块
      if (!this.isPowerModule(module)) {
        this.total_power += module.properties.power || 0;
      }
    });

    // 计算系统可靠度 - 基于连接关系计算（单值）
    this.calculateReliabilityBasedOnConnections(leafModules);
  }

  // 【新增】判断模块是否为电源模块
  isPowerModule(module) {
    const categories = module.categories || module.module_type || '';
    return categories === '电源' || categories === 'power' || 
           categories === 'Power' || categories === 'POWER';
  }

  // 为向后兼容性添加别名
  calculateOverallParameters() {
    return this.calculateTotals();
  }

  findLeafModules() {
    const leafModules = [];
    const parentChildMap = new Map();

    // 构建父子关系映射
    this.modules.forEach((module) => {
      if (module.parent_module) {
        // 查找父模块ID
        const parentModule = this.modules.find((m) => m.name === module.parent_module);
        if (parentModule) {
          if (!parentChildMap.has(parentModule.id)) {
            parentChildMap.set(parentModule.id, []);
          }
          parentChildMap.get(parentModule.id).push(module.id);
        }
      }
    });

    // 叶子模块：没有子模块的模块
    this.modules.forEach((module) => {
      if (!parentChildMap.has(module.id) || parentChildMap.get(module.id).length === 0) {
        leafModules.push(module);
      }
    });

    return leafModules;
  }

  // 计算系统可靠度 - 基于连接关系计算（单值版本）
  calculateReliabilityBasedOnConnections(leafModules) {
    // 构建模块之间的连接关系图
    const graph = new Map();

    this.connections.forEach((connection) => {
      // 只考虑叶子模块之间的连接
      const sourceIsLeaf = leafModules.some((m) => m.id === connection.source_module_id);
      const targetIsLeaf = leafModules.some((m) => m.id === connection.target_module_id);

      if (sourceIsLeaf && targetIsLeaf) {
        if (!graph.has(connection.source_module_id)) {
          graph.set(connection.source_module_id, new Set());
        }
        if (!graph.has(connection.target_module_id)) {
          graph.set(connection.target_module_id, new Set());
        }

        graph.get(connection.source_module_id).add(connection.target_module_id);
        graph.get(connection.target_module_id).add(connection.source_module_id);
      }
    });

    // 如果没有连接关系，则按串联计算
    if (graph.size === 0) {
      this.calculateSeriesReliability(leafModules);
      return;
    }

    // 查找连接组件（连通分量）
    const visited = new Set();
    const components = [];

    for (const [moduleId, _] of graph.entries()) {
      if (!visited.has(moduleId)) {
        const component = new Set();
        const stack = [moduleId];
        visited.add(moduleId);

        while (stack.length > 0) {
          const current = stack.pop();
          component.add(current);

          const neighbors = graph.get(current) || new Set();
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              stack.push(neighbor);
            }
          }
        }

        components.push(component);
      }
    }

    // 计算每个组件的可靠度（单值）
    let componentReliability = 1.0;

    components.forEach((component) => {
      // 获取组件中的模块
      const modulesInComponent = leafModules.filter((module) => component.has(module.id));

      if (modulesInComponent.length === 0) {
        return;
      }

      // 检查连接类型
      let componentRel;

      if (modulesInComponent.length > 1) {
        // 并联计算：R_parallel = 1 - Π(1 - R_i)
        let parallelProduct = 1.0;

        modulesInComponent.forEach((module) => {
          const r = Math.max(0.0, Math.min(1.0, module.properties.reliability || 0));
          parallelProduct *= (1 - r);
        });

        componentRel = 1 - parallelProduct;
      } else {
        // 单个模块，直接使用其可靠度
        componentRel = Math.max(0.0, Math.min(1.0, modulesInComponent[0].properties.reliability || 0));
      }

      // 组件之间按串联计算
      componentReliability *= componentRel;
    });

    // 处理没有连接的叶子模块（按串联计算）
    const unconnectedModules = leafModules.filter((module) => !visited.has(module.id));

    if (unconnectedModules.length > 0) {
      const unconnectedRel = this.calculateSeriesReliabilityForModules(unconnectedModules);
      componentReliability *= unconnectedRel;
    }

    // 确保最终可靠度在有效范围内
    this.total_reliability = Math.max(0.0, Math.min(1.0, componentReliability));
  }

  // 计算系统可靠度 - 基于串联关系计算（单值版本）
  calculateSeriesReliability(modules) {
    this.total_reliability = 1.0;

    modules.forEach((module) => {
      const r = Math.max(0.0, Math.min(1.0, module.properties.reliability || 0));
      if (r > 0) {
        this.total_reliability *= r;
      }
    });
  }

  // 计算系统可靠度 - 基于串联关系计算（单值版本）- 辅助函数
    calculateSeriesReliabilityForModules(modules) {
        let reliability = 1.0;

        modules.forEach((module) => {
            // 添加防御性处理，避免NaN
            const r = Math.max(0.0, Math.min(1.0, module.properties.reliability ?? 0));
            reliability *= r;
        });

    return reliability;
  }

  getModuleCount() {
    return this.modules?.length || 0;
  }

  getTotalConnections() {
    return this.connections?.length || 0;
  }

  // 转换为字典格式，适合JSON序列化（单值版本）
    toDict() {
        const levelConnectionsDict = {};
        // 防御性处理：确保level_connections存在
        const levelConnections = this.level_connections || {};
        for (const [level, connections] of Object.entries(levelConnections)) {
            // 过滤无效值
            levelConnectionsDict[level] = (connections || [])
                .map((conn) => conn?.toDict?.())
                .filter(Boolean);
        }

    return {
      id: this.id,
      module_count: this.getModuleCount(),
      connection_count: this.getTotalConnections(),
      total_cost: this.total_cost,
      total_weight: this.total_weight,
      total_power: this.total_power,
      total_reliability: this.total_reliability,
      modules: (this.modules || []).map((module) => module.toDict?.()),
      connections: (this.connections || []).map((conn) => conn.toDict?.()),
      level_connections: levelConnectionsDict,
    };
  }

  // 转换为JSON格式，用于前端显示（单值版本）
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      modules: this.modules.map((module) => module.toDict()),
      connections: this.connections.map((conn) => conn.toDict()),
      // 直接返回前端期望的字段（单值）
      total_cost: this.total_cost,
      total_weight: this.total_weight,
      total_power: this.total_power,
      total_reliability: this.total_reliability,
      // 为了向后兼容，保留旧字段名（使用单值填充）
      total_cost_min: this.total_cost,
      total_cost_max: this.total_cost,
      total_weight_min: this.total_weight,
      total_weight_max: this.total_weight,
      total_power_min: this.total_power,
      total_power_max: this.total_power,
      total_reliability_min: this.total_reliability,
      total_reliability_max: this.total_reliability,
      // 保留平均值字段以供其他用途（与单值相同）
      reliability: this.total_reliability,
      cost: this.total_cost,
      weight: this.total_weight,
      powerConsumption: this.total_power,
    };
  }

  // 获取参数对象（用于向后兼容）
  get parameters() {
    return {
      reliability: this.total_reliability,
      cost: this.total_cost,
      weight: this.total_weight,
      powerConsumption: this.total_power,
      reliability_min: this.total_reliability,
      reliability_max: this.total_reliability,
      cost_min: this.total_cost,
      cost_max: this.total_cost,
      weight_min: this.total_weight,
      weight_max: this.total_weight,
      power_min: this.total_power,
      power_max: this.total_power,
    };
  }

  // 设置参数对象（用于向后兼容）
  set parameters(params) {
    if (params) {
      this.total_cost = params.total_cost || params.cost || 0.0;
      this.total_weight = params.total_weight || params.weight || 0.0;
      this.total_power = params.total_power || params.power || 0.0;
      this.total_reliability = params.total_reliability || params.reliability || 0.0;
    }
  }

  // 从字典创建架构解决方案（单值版本）
    static fromDict(data) {
        try {
            const { ModuleInfo } = require('./ModuleInfo');
            const Connection = require('./Connection');

            // 防御性处理：确保数据存在
            const safeData = data || {};
            const modules = (safeData.modules || []).map((moduleData) => moduleData ? ModuleInfo.fromDict(moduleData) : null);
            const connections = (safeData.connections || []).map((connData) => connData ? Connection.fromDict(connData) : null);
            
            // 过滤无效模块和连接
            const validModules = modules.filter(Boolean);
            const validConnections = connections.filter(Boolean);

      const level_connections = {};
      if (data.level_connections) {
        for (const [levelStr, connList] of Object.entries(data.level_connections)) {
          const level = parseInt(levelStr);
          // 防御无效连接数据
          if (!isNaN(level)) {
            level_connections[level] = (connList || []).map((connData) => (connData ? Connection.fromDict(connData) : null)).filter(Boolean);
          }
        }
      }

      return new ArchitectureSolution({
        id: data.solution_id || 0,
        modules,
        connections,
        level_connections,
        parameters: data.total_parameters || {},
      });
    } catch (error) {
      console.error(`Error creating ArchitectureSolution from dict: ${error.message}`);
      return new ArchitectureSolution({ id: 0 });
    }
  }
}

module.exports = ArchitectureSolution;
