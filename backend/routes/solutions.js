const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const router = express.Router();
const ArchitectureGenerator = require('../services/ArchitectureGenerator');
const ConstraintSolver = require('../services/ConstraintSolver');
const ArchitectureSolution = require('../models/ArchitectureSolution');
const logger = require('../services/Logger');

/**
 * 从服务器内存或文件加载产品库数据
 * @param {Object} req - Express请求对象，用于访问app.locals
 * @returns {Array} 产品库模块数组
 */
async function loadProductLibrary(req) {
  try {
    // 优先使用服务器内存中的产品库数据（用户上传的）
    if (req && req.app && req.app.locals && req.app.locals.productLibraryData) {
      const memoryData = req.app.locals.productLibraryData;
      if (memoryData.length > 0) {
        console.log(`[产品库] 使用内存中的产品库数据，共 ${memoryData.length} 个产品`);
        return memoryData;
      }
    }
    
    // 如果内存中没有数据，尝试从默认文件加载
    // 尝试多个可能的产品库文件路径
    const possibleFiles = ['产品库002.xlsx', '产品库.xlsx'];
    let filePath = null;
    
    for (const filename of possibleFiles) {
      const testPath = path.join(__dirname, '../uploads', filename);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        console.log(`[产品库] 找到产品库文件: ${filename}`);
        break;
      }
    }
    
    if (!filePath) {
      console.warn('[产品库] 未找到产品库文件，请上传产品库');
      return [];
    }
    
    // 使用 ArchFileReader 解析产品库
    const ArchFileReader = require('../services/ArchFileReader');
    try {
      const moduleInfoObjs = await ArchFileReader.readFile(filePath);
      const products = moduleInfoObjs.map(m => m.toDict ? m.toDict() : m);
      console.log(`[产品库] 从文件加载产品库，共 ${products.length} 个产品`);
      return products;
    } catch (err) {
      console.error('[产品库] ArchFileReader解析失败，使用备用方式:', err.message);
      
      // 备用方式：直接解析
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      
      // 跳过标题行，转换数据格式
      const products = data.slice(1).filter(row => row.moduleName && row.moduleName !== '模块名称').map(row => ({
        name: row.moduleName,
        module_type: row.moduleType,
        categories: [row.moduleCategory],
        properties: {
          cost: parseFloat(row.cost) || 0,
          weight: parseFloat(row.weight) || 0,
          power: parseFloat(row.power) || 0,
          reliability: parseFloat(row.reliability) || 0.9
        }
      }));
      
      console.log(`[产品库] 备用方式加载，共 ${products.length} 个产品`);
      return products;
    }
  } catch (error) {
    console.error('加载产品库失败:', error);
    return [];
  }
}

// 存储解决方案的临时内存存储（在实际应用中应使用数据库）
const solutionsStore = new Map();
let nextSolutionId = 1;

/**
 * @api {post} /api/solutions/generate 生成架构解决方案
 * @apiName GenerateSolution
 * @apiGroup Solutions
 * @apiDescription 基于模块数据和约束生成架构解决方案
 *
 * @apiParam {Object[]} modules 模块数据数组
 * @apiParam {Object[]} constraints 约束数据数组
 * @apiParam {Object} [options] 生成选项
 * @apiParam {number} [options.maxSolutions=10] 最大解决方案数量
 * @apiParam {boolean} [options.applyConstraints=true] 是否应用约束
 *
 * @apiSuccess {Object[]} solutions 生成的解决方案数组
 * @apiSuccess {string} solutions.id 解决方案ID
 * @apiSuccess {Object[]} solutions.modules 模块实例数组
 * @apiSuccess {Object[]} solutions.connections 连接数组
 * @apiSuccess {Object} solutions.parameters 总体参数
 * @apiSuccess {number} solutions.parameters.reliability 可靠度
 * @apiSuccess {number} solutions.parameters.cost 成本
 * @apiSuccess {number} solutions.parameters.weight 重量
 * @apiSuccess {number} solutions.parameters.powerConsumption 功耗
 */
router.post('/generate', async (req, res) => {
  try {
    const { modules, constraints, options, max_solutions } = req.body;

    // 每次工具运行前清空临时方案文件
    if (req.app && req.app._router && req.app.get) {
      try {
        // 通过req访问服务器的清空函数
        const serverModule = require('../server');
        if (serverModule.clearTempBeforeToolRun) {
          const cleared = serverModule.clearTempBeforeToolRun();
          logger.log('solutions.js', '清空临时文件', `已清理 ${cleared} 个临时方案文件`);
        }
      } catch (e) {
        console.log('[清空] 跳过自动清理（服务初始化中）');
      }
    }

    logger.logStart('solutions.js', `开始生成解决方案 - 模块数: ${modules ? modules.length : 0}, 约束数: ${constraints ? constraints.length : 0}`);

    console.log('[后端] 收到生成请求');
    console.log(`[后端] 模块数量: ${modules ? modules.length : 0}`);
    console.log(`[后端] 约束数量: ${constraints ? constraints.length : 0}`);
    console.log(`[后端] max_solutions: ${max_solutions}`);
    console.log(`[后端] options: ${JSON.stringify(options)}`);

    if (!modules || !Array.isArray(modules) || modules.length === 0) {
      logger.logError('solutions.js', '参数验证', '模块数据不能为空');
      return res.status(400).json({ error: '模块数据不能为空' });
    }

    // 调试：打印前几个模块的字段
    console.log('[后端] 模块样例:', modules.slice(0, 2).map(m => ({
      name: m.name || m.moduleName,
      categories: m.categories,
      moduleCategory: m.moduleCategory,
      parentModule: m.parentModule || m.parent_module,
      properties: m.properties || m.moduleAttributes
    })));

    const generator = new ArchitectureGenerator();
    const solver = new ConstraintSolver();

    // 设置生成选项 - 支持两种参数格式
    // 注意：前端可能发送 Infinity，但 JSON 序列化后变成 null，需要正确处理
    let maxSolutions = Infinity;
    if (max_solutions !== null && max_solutions !== undefined && max_solutions !== Infinity) {
      maxSolutions = max_solutions;
    } else if (options?.maxSolutions !== null && options?.maxSolutions !== undefined) {
      maxSolutions = options.maxSolutions;
    }
    console.log(`[后端] 最大方案数设置为: ${maxSolutions}`);

    // 加载产品库数据（优先使用用户上传的产品库）
    const productLibrary = await loadProductLibrary(req);
    console.log(`[后端] 加载产品库: ${productLibrary.length} 个模块`);

    // 【修复】设置SSE响应头，支持流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用nginx缓冲

    // 辅助函数：发送SSE消息
    const sendSSE = (type, data) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    // 监听生成器的进度事件
    generator.on('progress', (progressData) => {
      try {
        sendSSE(progressData.type, progressData);
      } catch (e) {
        console.error('[SSE] 发送进度失败:', e);
      }
    });

    // 生成解决方案 - 传入产品库数据
    const genResult = await generator.generateSolutions(modules, constraints, maxSolutions, productLibrary);

    if (!genResult.success) {
      sendSSE('error', { message: genResult.error || '生成解决方案失败' });
      res.end();
      return;
    }

    // 读取生成的解决方案文件
    let solutionsArray = [];
    try {
      const fullPath = path.resolve(__dirname, '..', genResult.filePath);
      const data = await fs.readFile(fullPath);
      solutionsArray = JSON.parse(data);
    } catch (e) {
      console.error('读取解决方案文件失败:', e);
      sendSSE('error', { message: `读取文件失败: ${e.message}` });
      res.end();
      return;
    }

    // 为每个解决方案创建完整的ArchitectureSolution对象
    if (!genResult.count || genResult.count === 0) {
      sendSSE('complete', { solutions: [], count: 0 });
      res.end();
      return;
    }

    const fullSolutions = solutionsArray.map((solution, index) => {
      // 【修复】正确转换生成的解决方案格式
      // 生成的解决方案格式: { id, rootModule, leafModules: [{module, quantity}], connections, properties }
      // ArchitectureSolution 期望格式: { id, modules, connections, parameters }
      
      const { ModuleInfo } = require('../models/ModuleInfo');
      const Connection = require('../models/Connection');
      
      // 提取叶子模块列表
      const leafModules = solution.leafModules || [];
      const rawModules = leafModules.map(lm => lm.module || lm).filter(m => m);
      
      // 【修复】将普通模块对象转换为ModuleInfo实例
      const modules = rawModules.map((modData, modIndex) => {
        // 如果已经是ModuleInfo实例，直接使用
        if (modData instanceof ModuleInfo) {
          return modData;
        }
        // 否则从普通对象创建ModuleInfo实例
        return ModuleInfo.fromDict({
          id: modData.id || `mod-${Date.now()}-${index}-${modIndex}`,
          name: modData.name || `模块${modIndex + 1}`,
          module_type: modData.module_type || modData.type || '',
          categories: modData.categories || (modData.type ? [modData.type] : []),
          level: modData.level || 0,
          parent_module: modData.parent_module || '',
          child_modules: modData.child_modules || [],
          max_instances: modData.max_instances || 100,
          max_children: modData.max_children || 100,
          quantity: modData.quantity || 1,
          properties: {
            cost: modData.cost !== undefined ? modData.cost : (modData.properties?.cost || 0),
            weight: modData.weight !== undefined ? modData.weight : (modData.properties?.weight || 0),
            power: modData.power !== undefined ? modData.power : (modData.properties?.power || modData.powerConsumption || 0),
            reliability: modData.reliability !== undefined ? modData.reliability : (modData.properties?.reliability || 0.9),
          },
          interfaces: modData.interfaces || modData.moduleInterface || [],
          isLeaf: modData.isLeaf !== undefined ? modData.isLeaf : true
        });
      });
      
      // 如果有根模块，也转换并添加到模块列表
      if (solution.rootModule) {
        const rootData = solution.rootModule;
        const rootModule = (rootData instanceof ModuleInfo) ? rootData : ModuleInfo.fromDict({
          id: rootData.id || `root-${Date.now()}-${index}`,
          name: rootData.name || '根模块',
          module_type: rootData.module_type || rootData.type || '',
          categories: rootData.categories || [],
          level: rootData.level || 0,
          parent_module: '',
          child_modules: rootData.child_modules || [],
          properties: rootData.properties || {},
          interfaces: rootData.interfaces || [],
          isLeaf: false
        });
        modules.unshift(rootModule);
      }
      
      // 【修复】将连接对象转换为Connection实例或兼容格式
      const rawConnections = solution.connections || [];
      
      // 【重要】创建模块名称到ID的映射，用于连接的ID转换
      const moduleNameToId = new Map();
      modules.forEach(mod => {
        moduleNameToId.set(mod.name, mod.id);
        // 同时存储小写名称以支持大小写不敏感匹配
        moduleNameToId.set(mod.name.toLowerCase(), mod.id);
      });
      
      const connections = rawConnections.map((connData, connIndex) => {
        // 如果已经是Connection实例，直接使用
        if (connData instanceof Connection) {
          return connData;
        }
        // 生成器输出格式: { source, target, sourceIntf, targetIntf, type, interface_type }
        // source和target是模块名称，需要转换为模块ID
        
        let sourceId = connData.source_module_id || connData.sourceId || '';
        let targetId = connData.target_module_id || connData.targetId || '';
        
        // 【修复】如果sourceId/targetId是模块名称，通过映射查找对应的模块ID
        const sourceName = connData.source || connData.source_module_id || '';
        const targetName = connData.target || connData.target_module_id || '';
        
        if (!sourceId || sourceId === sourceName) {
          // 尝试通过名称查找ID
          sourceId = moduleNameToId.get(sourceName) || moduleNameToId.get(sourceName.toLowerCase()) || sourceName;
        }
        if (!targetId || targetId === targetName) {
          // 尝试通过名称查找ID
          targetId = moduleNameToId.get(targetName) || moduleNameToId.get(targetName.toLowerCase()) || targetName;
        }
        
        console.log(`连接转换: source="${sourceName}"->"${sourceId}", target="${targetName}"->"${targetId}"`);
        
        // 创建包含完整信息的连接对象（包含名称和接口信息）
        return new Connection(
          sourceId,                                          // source_module_id
          connData.source_interface_name || connData.sourceIntf || '',  // source_interface_name
          targetId,                                          // target_module_id
          connData.target_interface_name || connData.targetIntf || '',  // target_interface_name
          connData.interface_type || connData.type || '数据',              // interface_type
          connData.bandwidth || 0,
          connData.latency || 0,
          connData.reliability || 1.0
        );
      });
      
      // 提取参数
      const properties = solution.properties || {};
      const parameters = {
        total_cost: properties.totalCost || 0,
        total_weight: properties.totalWeight || 0,
        total_power: properties.totalPower || 0,
        total_reliability: properties.totalReliability || 0.8,
        cost: properties.totalCost || 0,
        weight: properties.totalWeight || 0,
        power: properties.totalPower || 0,
        reliability: properties.totalReliability || 0.8
      };
      
      const solutionObj = new ArchitectureSolution({
        id: solution.id || `sol-${Date.now()}-${index}`,
        name: solution.name || `解决方案 ${index + 1}`,
        modules: modules,
        connections: connections,
        parameters: parameters,
      });

      // 计算总体参数
      solutionObj.calculateOverallParameters();

      return solutionObj;
    });

    // 按可靠度降序排序
    fullSolutions.sort((a, b) => b.parameters.reliability - a.parameters.reliability);

    // 【修复】使用SSE发送最终结果
    const solutionsJson = fullSolutions.map((sol) => sol.toJSON());
    sendSSE('complete', {
      solutions: solutionsJson,
      count: fullSolutions.length,
      filePath: genResult.filePath
    });
    res.end();
  } catch (error) {
    console.error('生成解决方案时出错:', error);
    // 如果响应头已发送，使用SSE发送错误
    if (res.headersSent) {
      sendSSE('error', { message: error.message });
      res.end();
    } else {
      res.status(500).json({
        error: '生成解决方案失败',
        details: error.message,
      });
    }
  }
});

/**
 * @api {post} /api/solutions 保存解决方案
 * @apiName SaveSolution
 * @apiGroup Solutions
 * @apiDescription 保存架构解决方案到存储
 *
 * @apiParam {Object} solution 解决方案数据
 * @apiParam {string} [solution.name] 解决方案名称
 * @apiParam {Object[]} solution.modules 模块实例数组
 * @apiParam {Object[]} solution.connections 连接数组
 * @apiParam {Object} solution.parameters 总体参数
 *
 * @apiSuccess {Object} solution 保存的解决方案
 * @apiSuccess {string} solution.id 解决方案ID
 */
router.post('/', (req, res) => {
  try {
    const solutionData = req.body;

    if (!solutionData.modules || !Array.isArray(solutionData.modules)) {
      return res.status(400).json({ error: '解决方案必须包含模块数据' });
    }

    const solutionId = `sol-${nextSolutionId++}`;
    const solution = new ArchitectureSolution({
      id: solutionId,
      name: solutionData.name || `解决方案 ${solutionId}`,
      modules: solutionData.modules,
      connections: solutionData.connections || [],
      parameters: solutionData.parameters || {},
    });

    // 计算总体参数
    solution.calculateOverallParameters();

    // 保存到存储
    solutionsStore.set(solutionId, solution);

    res.status(201).json({
      success: true,
      solution: solution.toJSON(),
    });
  } catch (error) {
    console.error('保存解决方案时出错:', error);
    res.status(500).json({
      error: '保存解决方案失败',
      details: error.message,
    });
  }
});

/**
 * @api {get} /api/solutions 获取所有解决方案
 * @apiName GetAllSolutions
 * @apiGroup Solutions
 * @apiDescription 获取所有保存的架构解决方案
 *
 * @apiSuccess {Object[]} solutions 解决方案数组
 */
router.get('/', (req, res) => {
  try {
    const solutions = Array.from(solutionsStore.values()).map((sol) => sol.toJSON());

    res.json({
      success: true,
      count: solutions.length,
      solutions,
    });
  } catch (error) {
    console.error('获取解决方案时出错:', error);
    res.status(500).json({
      error: '获取解决方案失败',
      details: error.message,
    });
  }
});

/**
 * @api {get} /api/solutions/:id 获取特定解决方案
 * @apiName GetSolution
 * @apiGroup Solutions
 * @apiDescription 根据ID获取特定架构解决方案
 *
 * @apiParam {string} id 解决方案ID
 *
 * @apiSuccess {Object} solution 解决方案数据
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const solution = solutionsStore.get(id);

    if (!solution) {
      return res.status(404).json({ error: '解决方案未找到' });
    }

    // 添加前端所需的字段
    const solutionData = solution.toJSON();
    solutionData.total_cost_min = solutionData.parameters.cost;
    solutionData.total_cost_max = solutionData.parameters.cost;
    solutionData.total_weight_min = solutionData.parameters.weight;
    solutionData.total_weight_max = solutionData.parameters.weight;
    solutionData.total_power_min = solutionData.parameters.powerConsumption;
    solutionData.total_power_max = solutionData.parameters.powerConsumption;
    solutionData.total_reliability_min = solutionData.parameters.reliability;
    solutionData.total_reliability_max = solutionData.parameters.reliability;

    res.json({
      success: true,
      solution: solutionData,
    });
  } catch (error) {
    console.error('获取解决方案时出错:', error);
    res.status(500).json({
      error: '获取解决方案失败',
      details: error.message,
    });
  }
});

/**
 * @api {put} /api/solutions/:id 更新解决方案
 * @apiName UpdateSolution
 * @apiGroup Solutions
 * @apiDescription 更新特定架构解决方案
 *
 * @apiParam {string} id 解决方案ID
 * @apiParam {Object} solution 更新的解决方案数据
 *
 * @apiSuccess {Object} solution 更新后的解决方案
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const solutionData = req.body;

    const existingSolution = solutionsStore.get(id);
    if (!existingSolution) {
      return res.status(404).json({ error: '解决方案未找到' });
    }

    // 更新解决方案
    if (solutionData.name) existingSolution.name = solutionData.name;
    if (solutionData.modules) existingSolution.modules = solutionData.modules;
    if (solutionData.connections) existingSolution.connections = solutionData.connections;
    if (solutionData.parameters) existingSolution.parameters = solutionData.parameters;

    // 重新计算总体参数
    existingSolution.calculateOverallParameters();

    // 保存更新
    solutionsStore.set(id, existingSolution);

    res.json({
      success: true,
      solution: existingSolution.toJSON(),
    });
  } catch (error) {
    console.error('更新解决方案时出错:', error);
    res.status(500).json({
      error: '更新解决方案失败',
      details: error.message,
    });
  }
});

/**
 * @api {delete} /api/solutions/:id 删除解决方案
 * @apiName DeleteSolution
 * @apiGroup Solutions
 * @apiDescription 删除特定架构解决方案
 *
 * @apiParam {string} id 解决方案ID
 *
 * @apiSuccess {boolean} success 删除是否成功
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!solutionsStore.has(id)) {
      return res.status(404).json({ error: '解决方案未找到' });
    }

    solutionsStore.delete(id);

    res.json({
      success: true,
      message: '解决方案已删除',
    });
  } catch (error) {
    console.error('删除解决方案时出错:', error);
    res.status(500).json({
      error: '删除解决方案失败',
      details: error.message,
    });
  }
});

/**
 * @api {post} /api/solutions/:id/validate 验证解决方案
 * @apiName ValidateSolution
 * @apiGroup Solutions
 * @apiDescription 验证解决方案是否满足约束条件
 *
 * @apiParam {string} id 解决方案ID
 * @apiParam {Object[]} constraints 约束数据数组
 *
 * @apiSuccess {boolean} valid 解决方案是否有效
 * @apiSuccess {Object[]} violations 违反的约束列表（如果存在）
 */
router.post('/:id/validate', (req, res) => {
  try {
    const { id } = req.params;
    const { constraints } = req.body;

    const solution = solutionsStore.get(id);
    if (!solution) {
      return res.status(404).json({ error: '解决方案未找到' });
    }

    if (!constraints || !Array.isArray(constraints)) {
      return res.status(400).json({ error: '约束数据不能为空' });
    }

    const solver = new ConstraintSolver();
    const validationResult = solver.checkConstraints(solution, constraints);

    res.json({
      success: true,
      valid: validationResult.valid,
      violations: validationResult.violations || [],
    });
  } catch (error) {
    console.error('验证解决方案时出错:', error);
    res.status(500).json({
      error: '验证解决方案失败',
      details: error.message,
    });
  }
});

/**
 * @api {post} /api/solutions/compare 比较解决方案
 * @apiName CompareSolutions
 * @apiGroup Solutions
 * @apiDescription 比较多个解决方案的参数
 *
 * @apiParam {string[]} solutionIds 要比较的解决方案ID数组
 *
 * @apiSuccess {Object[]} comparison 比较结果
 * @apiSuccess {string} comparison.id 解决方案ID
 * @apiSuccess {string} comparison.name 解决方案名称
 * @apiSuccess {Object} comparison.parameters 参数对象
 * @apiSuccess {Object} comparison.normalized 归一化参数（0-1范围）
 */
router.post('/compare', (req, res) => {
  try {
    const { solutionIds } = req.body;

    if (!solutionIds || !Array.isArray(solutionIds) || solutionIds.length < 2) {
      return res.status(400).json({ error: '需要至少两个解决方案ID进行比较' });
    }

    // 获取所有解决方案
    const solutions = solutionIds.map((id) => solutionsStore.get(id));

    // 检查是否所有解决方案都存在
    const missingIndex = solutions.findIndex((sol) => !sol);
    if (missingIndex !== -1) {
      return res.status(404).json({
        error: `解决方案未找到: ${solutionIds[missingIndex]}`,
      });
    }

    // 提取参数用于比较
    const comparison = solutions.map((solution) => {
      const params = solution.parameters;
      return {
        id: solution.id,
        name: solution.name,
        parameters: params,
        normalized: {
          reliability: params.reliability / 100, // 假设可靠度是0-100%
          cost: 1 - Math.min(params.cost / 1000000, 1), // 成本越低越好，假设最大成本100万
          weight: 1 - Math.min(params.weight / 1000, 1), // 重量越轻越好，假设最大重量1000kg
          powerConsumption: 1 - Math.min(params.powerConsumption / 10000, 1), // 功耗越低越好，假设最大功耗10kW
        },
      };
    });

    res.json({
      success: true,
      comparison,
    });
  } catch (error) {
    console.error('比较解决方案时出错:', error);
    res.status(500).json({
      error: '比较解决方案失败',
      details: error.message,
    });
  }
});

module.exports = router;
