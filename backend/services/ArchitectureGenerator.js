/**
 * 航空电子架构生成器 - 基于约束满足问题(CSP)的创成设计算法
 * 
 * 创成设计算法流程:
 * 1. 输入数据准备: 产品库作为库文件，模块信息文件作为初始架构构型
 * 2. 模块信息列表生成: 识别根模块与叶子模块
 *    - 根模块的"成本、重量、功耗、可靠度"参数作为方案约束标准
 *    - 叶子模块的参数用于从产品库筛选满足条件的模块
 * 3. 产品库匹配: 根据叶子模块的分类和参数从产品库筛选候选模块
 *    - 成本、重量低于叶子模块
 *    - 可靠度高于叶子模块
 *    - 电源模块特殊规则：功耗高于叶子模块
 * 4. 约束输入: 用户根据模块的category输入连接关系约束与参数约束
 * 5. 创成设计: 基于CSP算法生成所有满足约束条件的方案
 *    - 支持绑定约束：两个分类的模块之间必须有连接
 *    - 支持互斥约束：两个分类的模块之间不能有连接
 * 6. 方案输出: 生成过程中实时显示进度，支持停止操作
 * 
 * 性能与健壮性要求:
 * - 不设置任何数量上限
 * - 合理运用内存，适时清除缓存
 * - 保证算法健壮性
 */

const CSPSolver = require('./CSPSolver');
const ConnectionGenerator = require('./ConnectionGenerator');
const { ModuleStructureHelper } = require('../models/ModuleInfo');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const logger = require('./Logger');

class ArchitectureGenerator extends EventEmitter {
  constructor() {
    super();
    this.heapLimitMB = process.env.HEAP_LIMIT_MB ? parseInt(process.env.HEAP_LIMIT_MB, 10) : 4096;
    this.memoryLogging = process.env.LOG_MEMORY === 'true';
    this.solutionOutputDir = process.env.SOLUTION_OUTPUT_DIR || 'backend/uploads';
    this.solutionCount = 0;
    this.solutionRankings = [];
    this.shouldStop = false;
    this.totalCombinations = 0;
    this.processedCombinations = 0;
  }

  /**
   * 停止生成过程
   */
  stopGeneration() {
    this.shouldStop = true;
    console.log('[ArchitectureGenerator] 收到停止生成请求');
  }

  /**
   * 内存使用检查函数
   */
  checkMemoryUsage() {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    if (this.memoryLogging) {
      console.log(`[ArchitectureGenerator] 内存使用: ${Math.round(used)}MB`);
    }
    return used;
  }

  /**
   * 生成架构解决方案的主入口方法
   * 
   * @param {Array} modules - 模块定义数组
   * @param {Object} constraints - 约束条件对象
   * @param {number} maxSolutions - 最大解决方案数量限制（无上限时传Infinity）
   * @param {Array} productLibrary - 产品库数据
   * @returns {Promise<Object>} 包含生成结果的对象
   */
  async generateSolutions(modules, constraints, maxSolutions = Infinity, productLibrary = null) {
    this.solutionCount = 0;
    this.solutionRankings = [];
    this.shouldStop = false;
    this.processedCombinations = 0;
    
    try {
      // 记录生成开始
      logger.logStart('ArchitectureGenerator.js', `开始创成设计 - 模块数: ${modules ? modules.length : 0}, 约束数: ${constraints ? constraints.length : 0}, 最大方案数: ${maxSolutions}`);

      console.log('\n========================================');
      console.log('[创成设计] 开始创成设计算法');
      console.log('========================================\n');
      
      // 调试：打印接收到的模块数据
      console.log('[调试] 接收到的模块数量:', modules ? modules.length : 0);
      if (modules && modules.length > 0) {
        console.log('[调试] 第一个模块字段:', Object.keys(modules[0]));
        console.log('[调试] 第一个模块数据:', JSON.stringify(modules[0], null, 2).substring(0, 500));
      }
      
      // ==================== 阶段1: 文件路径准备 ====================
      const timestamp = new Date().toISOString().replace(/[:\.]/g, '-');
      let solutionFileName = `solutions_${timestamp}.json`;
      const solutionDir = path.join(__dirname, `../${this.solutionOutputDir}`);
      
      if (!fs.existsSync(solutionDir)) {
        fs.mkdirSync(solutionDir, { recursive: true });
      }

      let solutionFilePath = path.join(solutionDir, solutionFileName);
      if (fs.existsSync(solutionFilePath)) {
        solutionFileName = `solutions_${timestamp}_${Math.floor(Math.random() * 10000)}.json`;
        solutionFilePath = path.join(solutionDir, solutionFileName);
      }

      // 文件流初始化
      const writeStream = fs.createWriteStream(solutionFilePath);
      writeStream.write('[');
      let isFirstSolution = true;

      // ==================== 阶段2: 模块信息列表生成 ====================
      console.log('[阶段2] 生成模块信息列表...');
      logger.log('ArchitectureGenerator.js', '阶段2: 生成模块信息列表', '开始生成');
      const moduleInfoList = this.generateModuleInfoList(modules);
      console.log(`[阶段2] 模块信息列表生成完成，共 ${moduleInfoList.length} 个模块\n`);
      logger.log('ArchitectureGenerator.js', '阶段2: 模块信息列表生成完成', `共 ${moduleInfoList.length} 个模块`);

      // ==================== 阶段3: 识别根模块与叶子模块 ====================
      console.log('[阶段3] 识别根模块与叶子模块...');
      logger.log('ArchitectureGenerator.js', '阶段3: 识别根模块与叶子模块', '开始识别');
      const rootModules = ModuleStructureHelper.identifyRootModules(modules);
      const leafModules = ModuleStructureHelper.identifyLeafModules(modules);
      
      console.log(`[阶段3] 识别到 ${rootModules.length} 个根模块`);
      console.log(`[阶段3] 识别到 ${leafModules.length} 个叶子模块\n`);
      logger.log('ArchitectureGenerator.js', '阶段3: 模块识别完成', `根模块: ${rootModules.length}, 叶子模块: ${leafModules.length}`);

      if (leafModules.length === 0) {
        console.warn('[阶段3] 没有叶子模块，无法生成方案');
        logger.logError('ArchitectureGenerator.js', '阶段3: 无叶子模块', '没有叶子模块，无法生成方案');
        await this.closeWriteStream(writeStream);
        return { success: false, error: '没有叶子模块需求', count: 0, filePath: solutionFilePath };
      }

      // ==================== 阶段4: 提取全局约束（根模块参数） ====================
      console.log('[阶段4] 提取全局约束（根模块参数作为标准）...');
      logger.log('ArchitectureGenerator.js', '阶段4: 提取全局约束', '开始提取');
      const globalConstraints = ModuleStructureHelper.extractGlobalConstraints(rootModules);
      
      // 合并用户输入的外部约束
      this.mergeExternalConstraints(globalConstraints, constraints);
      
      console.log(`[阶段4] 全局约束: 成本<=${globalConstraints.cost_max}, 重量<=${globalConstraints.weight_max}, 功耗<=${globalConstraints.power_max}, 可靠度>=${globalConstraints.reliability_min}\n`);
      logger.log('ArchitectureGenerator.js', '阶段4: 全局约束提取完成', `成本<=${globalConstraints.cost_max}, 重量<=${globalConstraints.weight_max}, 功耗<=${globalConstraints.power_max}, 可靠度>=${globalConstraints.reliability_min}`);

      // ==================== 阶段5: 从产品库筛选候选模块 ====================
      console.log('[阶段5] 从产品库筛选满足参数约束的候选模块...');
      logger.log('ArchitectureGenerator.js', '阶段5: 从产品库筛选候选模块', '开始筛选');
      
      let categoryToCandidates = new Map();
      
      if (productLibrary && productLibrary.length > 0) {
        // 按创成设计流程的匹配规则筛选
        categoryToCandidates = this.filterCandidatesFromProductLibrary(productLibrary, leafModules);
        console.log(`[阶段5] 从产品库筛选完成\n`);
        logger.log('ArchitectureGenerator.js', '阶段5: 产品库筛选完成', `产品库模块数: ${productLibrary.length}`);
      } else {
        console.error('[阶段5] 没有产品库数据，无法生成方案');
        logger.logError('ArchitectureGenerator.js', '阶段5: 无产品库', '没有产品库数据，无法生成方案');
        await this.closeWriteStream(writeStream);
        return { success: false, error: '请先导入产品库！', count: 0, filePath: solutionFilePath };
      }

      // 检查是否有有效的候选模块
      let totalCandidates = 0;
      for (const [, candidates] of categoryToCandidates) {
        totalCandidates += candidates.length;
      }
      
      if (totalCandidates === 0) {
        console.error('[阶段5] 产品库中没有匹配的候选模块');
        await this.closeWriteStream(writeStream);
        return { success: false, error: '产品库中没有匹配的候选模块', count: 0, filePath: solutionFilePath };
      }

      // ==================== 阶段6: CSP回溯生成模块组合 ====================
      console.log('[阶段6] 使用CSP回溯算法生成模块组合...');
      logger.log('ArchitectureGenerator.js', '阶段6: CSP回溯生成模块组合', '开始生成');
      
      // 提取连接约束
      const connectionConstraints = (constraints || []).filter(c => c.type === 'connection');
      console.log(`[阶段6] 连接约束数量: ${connectionConstraints.length}`);
      logger.log('ArchitectureGenerator.js', '阶段6: 连接约束', `数量: ${connectionConstraints.length}`);
      
      // 估算总组合数（用于进度条）
      const estimatedCombinations = this.estimateTotalCombinations(categoryToCandidates, leafModules);
      console.log(`[阶段6] 预估模块组合数量: ${estimatedCombinations}`);
      logger.log('ArchitectureGenerator.js', '阶段6: 预估组合数', `预估: ${estimatedCombinations}`);
      
      // 发送进度信息
      this.emitProgress('phase', { phase: 6, message: '生成模块组合...', total: estimatedCombinations });
      
      const cspSolver = new CSPSolver(connectionConstraints, [], this);
      
      // 生成模块组合
      const moduleCombinations = cspSolver.generateWithCategory(
        leafModules,
        [], // childRequirements
        categoryToCandidates,
        globalConstraints,
        maxSolutions
      );
      
      console.log(`[阶段6] 生成 ${moduleCombinations.length} 个模块组合方案\n`);
      logger.log('ArchitectureGenerator.js', '阶段6: 模块组合生成完成', `生成了 ${moduleCombinations.length} 个模块组合方案`);

      if (moduleCombinations.length === 0) {
        console.error('[阶段6] 没有生成有效的模块组合方案');
        await this.closeWriteStream(writeStream);
        return { success: false, error: '没有生成有效的模块组合方案', count: 0, filePath: solutionFilePath };
      }

      // ==================== 阶段7: 生成连接方案 ====================
      console.log('[阶段7] 为每个模块组合生成连接方案...');
      logger.log('ArchitectureGenerator.js', '阶段7: 生成连接方案', `模块组合数: ${moduleCombinations.length}`);
      // 发送阶段更新进度
      this.emitProgress('phase', { phase: 7, message: '生成连接方案...', total: moduleCombinations.length });
      // 连接约束提取
      const connectionGenerator = new ConnectionGenerator(connectionConstraints);
      // 生成方案列表
      let allSolutions = [];
      let connectionSchemeIndex = 0;
      // 调试统计
      let debugTotalSchemes = 0;
      let debugAcceptedSchemes = 0;
      let debugRejectedByFeasibility = 0;
      let debugRejectedByConstraints = 0;
      // 方案生成主循环
      for (let comboIndex = 0; comboIndex < moduleCombinations.length; comboIndex++) {
        if (this.shouldStop) {
          console.log('[阶段7] 用户请求停止生成');
          break;
        }
        // 方案数量限制检查
        if (this.solutionCount >= maxSolutions && maxSolutions !== Infinity) break;
        
        // 内存检查
        if (this.checkMemoryUsage() > this.heapLimitMB * 0.8) {
          console.error('[阶段7] 内存不足，终止生成');
          this.emitProgress('warning', { message: '内存不足，终止生成' });
          break;
        }

        // 发送进度更新
        if (comboIndex % 10 === 0) {
          this.emitProgress('module_combo', { current: comboIndex, total: moduleCombinations.length });
        }

        const moduleCombo = moduleCombinations[comboIndex];
        
        // 获取根模块
        const rootModule = rootModules[0] || { name: 'Root', properties: {} };

        // 生成连接方案
        const connectionSchemes = connectionGenerator.generateAllConnectionSchemes(
          moduleCombo.modules,
          connectionConstraints
        );
        
        // 创成设计过程中，可能会生成没有连线的方案，只要满足约束条件，此时不需要过滤
        if (connectionSchemes.length === 0) {
          connectionSchemes.push([]);
        }

        // 每个连接方案生成一个完整方案
        for (const connections of connectionSchemes) {
          if (this.shouldStop) break;
          if (this.solutionCount >= maxSolutions && maxSolutions !== Infinity) break;
          
          if (this.checkMemoryUsage() > this.heapLimitMB * 0.8) {
            console.error('[阶段7] 内存不足，终止生成');
            break;
          }

          // 计算方案属性（包括电源模块特殊处理：功耗不计入总功耗）
          const properties = this.calculateSolutionProperties(moduleCombo, connections);

          // 构建完整解决方案
          const fullSolution = {
            id: `sol_${connectionSchemeIndex++}`,
            rootModule: rootModule,
            leafModules: moduleCombo.modules.map(m => ({ module: m, quantity: m.quantity || 1 })),
            connections: this.formatConnections(connections, moduleCombo.modules),
            properties: properties,
            _score: this.calculateSolutionScore(properties, globalConstraints)
          };

          // 验证可行性（基于根模块参数）
          debugTotalSchemes++;
          if (!this.evaluateFeasibility(fullSolution, globalConstraints)) {
            debugRejectedByFeasibility++;
            continue;
          }

          // 验证约束（绑定/互斥）
          if (!this.checkConnectionConstraints(fullSolution, connectionConstraints)) {
            debugRejectedByConstraints++;
            continue;
          }
          debugAcceptedSchemes++;

          allSolutions.push(fullSolution);
          this.solutionCount++;
          
          // 发送方案生成进度
          if (this.solutionCount % 100 === 0) {
            this.emitProgress('solution', { count: this.solutionCount });
          }
          
          // 写入文件
          if (!isFirstSolution) {
            writeStream.write(',');
          } else {
            isFirstSolution = false;
          }

          const writeErr = await this.writeSolution(writeStream, fullSolution);
          if (writeErr) {
            console.error('[阶段7] 写入解决方案失败:', writeErr);
            return { success: false, error: writeErr.message };
          }
          
          if (this.solutionCount <= 10 || this.solutionCount % 100 === 0) {
            console.log(`[阶段7] 方案 #${this.solutionCount}: 成本=${properties.totalCost.toFixed(2)}, 重量=${properties.totalWeight.toFixed(2)}, 功耗=${properties.totalPower.toFixed(2)}, 可靠度=${properties.totalReliability.toFixed(4)}`);
          }
        }
        
        // 适时清理缓存
        if (comboIndex % 100 === 0) {
          if (global.gc) {
            global.gc();
          }
        }
      }

      // ==================== 阶段8: 排序并返回结果 ====================
      allSolutions.sort((a, b) => b._score - a._score);
      
      // 清理临时属性
      allSolutions.forEach(s => delete s._score);

      // 关闭文件流
      await this.closeWriteStream(writeStream);

      console.log('\n========================================');
      console.log(`[创成设计] 完成: ${this.solutionCount}个方案`);
      console.log(`[创成设计] 输出文件: ${solutionFilePath}`);
      console.log('========================================\n');
      
      // 记录生成完成
      logger.logEnd('ArchitectureGenerator.js', `生成完成 - 方案数: ${this.solutionCount}, 输出文件: ${solutionFileName}`);
      
      // 发送完成事件
      this.emitProgress('complete', { count: this.solutionCount, filePath: solutionFilePath });

      return {
        success: this.solutionCount > 0,
        count: this.solutionCount,
        filePath: solutionFilePath,
        solutions: allSolutions
      };
      
    } catch (error) {
      console.error('[创成设计] 创成设计失败:', error);
      logger.logError('ArchitectureGenerator.js', '创成设计失败', error.message);
      this.emitProgress('error', { message: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 发送进度事件
   */
  emitProgress(type, data) {
    this.emit('progress', { type, ...data });
  }

  /**
   * 生成模块信息列表
   * 包含字段：ID、名称、类型、分类、层级、上级模块、数量、成本、重量、功耗、可靠度、输入/输出接口、是否为叶子模块
   */
  generateModuleInfoList(modules) {
    const moduleInfoList = [];
    
    // 创建模块映射
    const moduleMap = new Map();
    modules.forEach(m => moduleMap.set(m.name, m));
    
    // 查找父子关系
    const parentToChildren = new Map();
    modules.forEach(m => {
      const parentName = m.parent_module || m.parentModule;
      if (parentName) {
        if (!parentToChildren.has(parentName)) {
          parentToChildren.set(parentName, []);
        }
        parentToChildren.get(parentName).push(m);
      }
    });
    
    // 为每个模块生成信息
    modules.forEach((module, index) => {
      const childrenByRef = parentToChildren.get(module.name) || [];
      const hasChildren = (module.children && module.children.length > 0) || childrenByRef.length > 0;
      const hasParent = (module.parent_module || module.parentModule) && 
                        (module.parent_module || module.parentModule).trim() !== '';
      
      // 判断是否为叶子模块：没有子模块
      const isLeaf = !hasChildren;
      
      // 提取属性
      const props = module.properties || module.moduleAttributes || {};
      const interfaces = module.interfaces || module.moduleInterface || [];
      
      // 分离输入/输出接口
      const inputInterfaces = interfaces.filter(i => i.io_type === 'input' || i.io_type === 'in' || i.interfaceDirection === 'in');
      const outputInterfaces = interfaces.filter(i => i.io_type === 'output' || i.io_type === 'out' || i.interfaceDirection === 'out');
      
      // 提取 quantity（可能在顶层或 properties 中）
      const quantity = module.quantity || props.quantity || 1;
      
      // 提取分类（可能是 categories 或 moduleCategory）
      const categories = module.categories || (module.moduleCategory ? [module.moduleCategory] : []);
      
      const info = {
        id: module.id || index + 1,
        name: module.name || module.moduleName || '',
        type: module.module_type || module.moduleType || '',
        categories: categories,
        level: module.level || 0,
        parentModule: module.parent_module || module.parentModule || '',
        quantity: quantity,
        cost: props.cost || 0,
        weight: props.weight || 0,
        power: props.power || 0,
        reliability: props.reliability || 0,
        inputInterfaces: inputInterfaces,
        outputInterfaces: outputInterfaces,
        isLeaf: isLeaf,
        properties: props  // 保留原始属性
      };
      
      moduleInfoList.push(info);
    });
    
    return moduleInfoList;
  }

  /**
   * 从产品库筛选候选模块（按创成设计流程的匹配规则）
   * 
   * 产品库匹配规则:
   * 1. 解析并识别叶子模块的类型与分类
   * 2. 根据叶子模块的分类，从产品库中匹配到同样分类的模块
   * 3. 参数对比：
   *    - 成本、重量参数低于叶子模块
   *    - 可靠度参数高于叶子模块
   *    - 电源模块特殊规则：功耗高于叶子模块
   */
  filterCandidatesFromProductLibrary(productLibrary, leafModules) {
    const categoryToCandidates = new Map();
    
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
    
    console.log(`[filterCandidates] 识别到 ${categoryToLeafModules.size} 个分类`);
    
    // 对每个分类进行筛选
    for (const [category, leafMods] of categoryToLeafModules) {
      const candidates = [];
      
      // 获取该分类的参考参数（取第一个叶子模块作为参考）
      const refModule = leafMods[0];
      const refProps = refModule.properties || refModule.moduleAttributes || {};
      
      // 检查是否为电源分类
      const isPowerCategory = ModuleStructureHelper.isPowerCategory(category);
      
      console.log(`[filterCandidates] 分类[${category}]: ${isPowerCategory ? '电源类（特殊规则：功耗需高于叶子模块）' : '普通类'}`);
      
      for (const module of productLibrary) {
        const modCats = module.categories || [];
        
        // 匹配分类
        if (!modCats.includes(category) && !modCats.some(c => c.includes(category) || category.includes(c))) {
          continue;
        }
        
        const modProps = module.properties || module.moduleAttributes || {};
        
        // 参数匹配（产品库匹配规则）
        // 成本：产品库模块成本需低于叶子模块
        if (refProps.cost !== undefined && refProps.cost > 0) {
          if ((modProps.cost || 0) > refProps.cost) {
            continue;
          }
        }
        
        // 重量：产品库模块重量需低于叶子模块
        if (refProps.weight !== undefined && refProps.weight > 0) {
          if ((modProps.weight || 0) > refProps.weight) {
            continue;
          }
        }
        
        // 功耗：电源模块特殊处理
        if (isPowerCategory) {
          // 电源模块：功耗需高于叶子模块（电源的功耗是输出功率）
          if (refProps.power !== undefined && refProps.power > 0) {
            if ((modProps.power || 0) < refProps.power) {
              continue;
            }
          }
        } else {
          // 非电源模块：功耗需低于叶子模块
          if (refProps.power !== undefined && refProps.power > 0) {
            if ((modProps.power || 0) > refProps.power) {
              continue;
            }
          }
        }
        
        // // 可靠度：需高于叶子模块
        // if (refProps.reliability !== undefined && refProps.reliability > 0) {
        //   if ((modProps.reliability || 0) < refProps.reliability) {
        //     continue;
        //   }
        // }
        
        // 添加到候选列表
        candidates.push({
          ...module,
          _category: category,
          _isPower: isPowerCategory
        });
      }
      
      console.log(`[filterCandidates]   分类[${category}] 筛选到 ${candidates.length} 个候选模块`);
      categoryToCandidates.set(category, candidates);
    }
    
    return categoryToCandidates;
  }

  /**
   * 合并外部约束到全局约束
   */
  mergeExternalConstraints(globalConstraints, externalConstraints) {
    if (!externalConstraints || !Array.isArray(externalConstraints)) return;
    
    externalConstraints.forEach(c => {
      if (c.type === 'parameter') {
        if (c.param_type === '成本' || c.param === 'cost') {
          globalConstraints.cost_max = c.value_max || globalConstraints.cost_max;
        }
        if (c.param_type === '重量' || c.param === 'weight') {
          globalConstraints.weight_max = c.value_max || globalConstraints.weight_max;
        }
        if (c.param_type === '功耗' || c.param === 'power') {
          globalConstraints.power_max = c.value_max || globalConstraints.power_max;
        }
        if (c.param_type === '可靠度' || c.param === 'reliability') {
          globalConstraints.reliability_min = c.value_min || globalConstraints.reliability_min;
        }
      }
    });
  }

  /**
   * 估算总组合数
   */
  estimateTotalCombinations(categoryToCandidates, leafModules) {
    let total = 1;
    
    const categoryCount = new Map();
    for (const [cat, candidates] of categoryToCandidates) {
      categoryCount.set(cat, candidates.length);
    }
    
    const processedCategories = new Set();
    
    leafModules.forEach(lm => {
      const cats = lm.categories || [];
      if (cats.length > 0) {
        const cat = cats[0];
        if (!processedCategories.has(cat) && categoryCount.has(cat)) {
          const count = categoryCount.get(cat);
          const quantity = lm.quantity || 1;
          total *= Math.pow(count, quantity);
          processedCategories.add(cat);
        }
      }
    });
    
    return Math.min(total, 1000000); // 限制最大估算值
  }

  /**
   * 计算方案属性（成本、重量、功耗、可靠度）
   * 注意：功耗计算时排除分类为"电源"的模块
   */
  calculateSolutionProperties(moduleCombo, connections) {
    let totalCost = 0;
    let totalWeight = 0;
    let totalPower = 0;
    let totalReliability = 1;
    
    const modules = moduleCombo.modules || [];
    
    for (const mod of modules) {
      const quantity = mod.quantity || 1;
      const props = mod.properties || mod.moduleAttributes || {};
      
      const cost = props.cost_min || props.cost || 0;
      const weight = props.weight_min || props.weight || 0;
      const power = props.power_min || props.power || 0;
      const reliability = props.reliability_min || props.reliability || 0.9;
      
      // 检查模块是否为电源模块
      const isPower = ModuleStructureHelper.isPowerModule(mod);
      
      totalCost += cost * quantity;
      totalWeight += weight * quantity;
      // 功耗计算排除电源模块（电源模块的功耗不计入总功耗）
      if (!isPower) {
        totalPower += power * quantity;
      }
      // 可靠度计算 - 已禁用
      // totalReliability *= Math.pow(reliability, quantity);
    }
    
    return {
      totalCost,
      totalWeight,
      totalPower,
      totalReliability
    };
  }

  /**
   * 计算方案评分（用于排序）
   */
  calculateSolutionScore(properties, constraints) {
    let score = 1000;
    
    // 成本越低越好
    if (constraints.cost_max && constraints.cost_max !== Infinity && properties.totalCost < constraints.cost_max) {
      score += (constraints.cost_max - properties.totalCost) / Math.max(constraints.cost_max, 1) * 100;
    }
    
    // 重量越低越好
    if (constraints.weight_max && constraints.weight_max !== Infinity && properties.totalWeight < constraints.weight_max) {
      score += (constraints.weight_max - properties.totalWeight) / Math.max(constraints.weight_max, 1) * 100;
    }
    
    // 可靠度越高越好
    if (constraints.reliability_min && constraints.reliability_min > 0 && properties.totalReliability >= constraints.reliability_min) {
      score += (properties.totalReliability - constraints.reliability_min) * 100;
    }
    
    return score;
  }

  /**
   * 评估方案可行性（基于根模块参数）
   * 方案可行当且仅当：
   * - 成本 <= 根模块成本
   * - 重量 <= 根模块重量
   * - 功耗（非电源模块总和）<= 根模块功耗
   * - 可靠度 >= 根模块可靠度
   */
  evaluateFeasibility(solution, constraints) {
    if (!constraints) return true;
    
    const props = solution.properties;
    const gc = constraints;
    
    // 成本检查
    if (gc.cost_max !== undefined && gc.cost_max !== Infinity && props.totalCost > gc.cost_max) {
      return false;
    }
    
    // 重量检查
    if (gc.weight_max !== undefined && gc.weight_max !== Infinity && props.totalWeight > gc.weight_max) {
      return false;
    }
    
    // 功耗检查：非电源模块功耗总和必须 <= 根模块功耗需求
    if (gc.power_max !== undefined && gc.power_max !== Infinity && props.totalPower > gc.power_max) {
      return false;
    }
    
    // 可靠度检查 - 已禁用
    // if (gc.reliability_min !== undefined && gc.reliability_min > 0 && props.totalReliability < gc.reliability_min) {
    //   return false;
    // }
    
    return true;
  }

  /**
   * 验证连接约束条件（绑定/互斥）
   * 
   * 绑定约束：若一个分类的模块与另一个分类的模块存在绑定约束，
   *          那么在连接方案的筛选过程中，方案里，只要这两个分类的模块之间有连接关系，即满足约束
   * 互斥约束：若一个分类的模块与另一个分类的模块存在互斥约束，
   *          那么在连接方案的筛选过程中，方案里，这两个分类的模块之间一定没有连接关系
   */
  checkConnectionConstraints(solution, constraints) {
    if (!constraints || !Array.isArray(constraints) || constraints.length === 0) {
      console.log('[DEBUG checkConnectionConstraints] No constraints, returning true');
      return true;
    }
    
    console.log(`[DEBUG checkConnectionConstraints] Checking ${constraints.length} constraints`);
    const modules = solution.leafModules.map(lm => lm.module);
    const connections = solution.connections || [];
    console.log(`[DEBUG checkConnectionConstraints] Modules: ${modules.length}, connections: ${connections.length}`);
    
    for (const constraint of constraints) {
      if (constraint.type !== 'connection') continue;
      
      const module1 = constraint.module1;
      const module2 = constraint.module2;
      const relation = constraint.relation_type;
      
      // 获取方案中涉及这两个分类的模块（兼容name和moduleName）
      const mods1 = modules.filter(m => {
        const name = m.name || m.moduleName || '';
        const cats = m.categories || (m.moduleCategory ? [m.moduleCategory] : []);
        return name === module1 || cats.includes(module1);
      });
      const mods2 = modules.filter(m => {
        const name = m.name || m.moduleName || '';
        const cats = m.categories || (m.moduleCategory ? [m.moduleCategory] : []);
        return name === module2 || cats.includes(module2);
      });
      
      // 如果方案中不包含指定的分类，跳过该约束
      if (mods1.length === 0 && mods2.length === 0) continue;
      
      // 绑定约束：两个分类必须都有模块，且它们之间有连接
      if (relation === '绑定') {
        // 如果只有一个分类存在模块，不满足绑定约束
        if ((mods1.length > 0 && mods2.length === 0) || (mods1.length === 0 && mods2.length > 0)) {
          return false;
        }
        
        // 如果两个分类都存在模块，检查是否有连接关系
        if (mods1.length > 0 && mods2.length > 0) {
          const hasConnection = connections.some(conn => {
            const sourceId = conn.source;
            const targetId = conn.target;
            
            // 获取源模块和目标模块（支持name/moduleName）
            const sourceMod = modules.find(m => {
              const name = m.name || m.moduleName || '';
              return name === sourceId || m.instanceId === sourceId;
            });
            const targetMod = modules.find(m => {
              const name = m.name || m.moduleName || '';
              return name === targetId || m.instanceId === targetId;
            });
            
            // 检查源模块是否属于分类1
            const sourceIsMod1 = sourceMod && (() => {
              const name = sourceMod.name || sourceMod.moduleName || '';
              const cats = sourceMod.categories || (sourceMod.moduleCategory ? [sourceMod.moduleCategory] : []);
              return name === module1 || cats.includes(module1);
            })();
            
            // 检查目标模块是否属于分类2
            const targetIsMod2 = targetMod && (() => {
              const name = targetMod.name || targetMod.moduleName || '';
              const cats = targetMod.categories || (targetMod.moduleCategory ? [targetMod.moduleCategory] : []);
              return name === module2 || cats.includes(module2);
            })();
            
            // 检查源模块是否属于分类2
            const sourceIsMod2 = sourceMod && (() => {
              const name = sourceMod.name || sourceMod.moduleName || '';
              const cats = sourceMod.categories || (sourceMod.moduleCategory ? [sourceMod.moduleCategory] : []);
              return name === module2 || cats.includes(module2);
            })();
            
            // 检查目标模块是否属于分类1
            const targetIsMod1 = targetMod && (() => {
              const name = targetMod.name || targetMod.moduleName || '';
              const cats = targetMod.categories || (targetMod.moduleCategory ? [targetMod.moduleCategory] : []);
              return name === module1 || cats.includes(module1);
            })();
            
            return (sourceIsMod1 && targetIsMod2) || (sourceIsMod2 && targetIsMod1);
          });
          
          if (!hasConnection) {
            return false;
          }
        }
      }
      
      // 互斥约束：两个分类的模块之间不能有连接
      if (relation === '互斥') {
        if (mods1.length > 0 && mods2.length > 0) {
          const hasConnection = connections.some(conn => {
            const sourceId = conn.source;
            const targetId = conn.target;
            
            // 获取源模块和目标模块（支持name/moduleName）
            const sourceMod = modules.find(m => {
              const name = m.name || m.moduleName || '';
              return name === sourceId || m.instanceId === sourceId;
            });
            const targetMod = modules.find(m => {
              const name = m.name || m.moduleName || '';
              return name === targetId || m.instanceId === targetId;
            });
            
            // 检查源模块是否属于分类1
            const sourceIsMod1 = sourceMod && (() => {
              const name = sourceMod.name || sourceMod.moduleName || '';
              const cats = sourceMod.categories || (sourceMod.moduleCategory ? [sourceMod.moduleCategory] : []);
              return name === module1 || cats.includes(module1);
            })();
            
            // 检查目标模块是否属于分类2
            const targetIsMod2 = targetMod && (() => {
              const name = targetMod.name || targetMod.moduleName || '';
              const cats = targetMod.categories || (targetMod.moduleCategory ? [targetMod.moduleCategory] : []);
              return name === module2 || cats.includes(module2);
            })();
            
            // 检查源模块是否属于分类2
            const sourceIsMod2 = sourceMod && (() => {
              const name = sourceMod.name || sourceMod.moduleName || '';
              const cats = sourceMod.categories || (sourceMod.moduleCategory ? [sourceMod.moduleCategory] : []);
              return name === module2 || cats.includes(module2);
            })();
            
            // 检查目标模块是否属于分类1
            const targetIsMod1 = targetMod && (() => {
              const name = targetMod.name || targetMod.moduleName || '';
              const cats = targetMod.categories || (targetMod.moduleCategory ? [targetMod.moduleCategory] : []);
              return name === module1 || cats.includes(module1);
            })();
            
            return (sourceIsMod1 && targetIsMod2) || (sourceIsMod2 && targetIsMod1);
          });
          
          if (hasConnection) {
            return false;
          }
        }
      }
    }
    
    return true;
  }

  /**
   * 格式化连接为输出格式
   */
  formatConnections(connections, modules) {
    if (!connections || connections.length === 0) return [];
    
    return connections.map(conn => ({
      source: conn.source?.instanceId || conn.source?.name || conn.source,
      target: conn.target?.instanceId || conn.target?.name || conn.target,
      source_type: conn.source?.interfaceType || conn.source_type,
      target_type: conn.target?.interfaceType || conn.target_type
    }));
  }

  /**
   * 写入单个方案到文件
   */
  async writeSolution(writeStream, solution) {
    return new Promise((resolve) => {
      try {
        const output = {
          id: solution.id,
          rootModule: {
            name: solution.rootModule?.name,
            properties: solution.rootModule?.properties || {}
          },
          leafModules: solution.leafModules.map(lm => ({
            name: lm.module?.name,
            module_type: lm.module?.module_type,
            categories: lm.module?.categories || [],
            quantity: lm.quantity,
            properties: lm.module?.properties || {}
          })),
          connections: solution.connections,
          properties: solution.properties
        };
        
        writeStream.write(JSON.stringify(output, null, 2));
        resolve(null);
      } catch (error) {
        resolve(error);
      }
    });
  }

  /**
   * 关闭文件流
   */
  async closeWriteStream(writeStream) {
    return new Promise((resolve) => {
      writeStream.write(']');
      writeStream.end();
      writeStream.on('finish', () => resolve(null));
      writeStream.on('error', (err) => resolve(err));
    });
  }
}

module.exports = ArchitectureGenerator;
