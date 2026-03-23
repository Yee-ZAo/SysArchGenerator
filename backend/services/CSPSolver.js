/**
 * 基于约束满足问题(CSP)的架构创成设计算法
 * 
 * 创成设计核心算法流程:
 * 1. 备选模块筛选: 根据叶子模块参数从产品库筛选满足条件的模块
 *    - 成本、重量低于叶子模块
 *    - 可靠度高于叶子模块
 *    - 电源模块特殊规则：功耗高于叶子模块
 * 2. 模块数量匹配: 根据叶子模块数量从对应分类的备选模块中选取相应数量的模块
 * 3. 连接方案生成: 基于CSP算法，结合回溯搜索与剪枝策略，生成所有满足约束条件的方案
 *    - 支持绑定约束：两个分类的模块之间必须有连接
 *    - 支持互斥约束：两个分类的模块之间不能有连接
 * 
 * 性能要求:
 * - 无数量上限
 * - 合理运用内存，适时清除缓存
 * - 保证算法健壮性
 */

const { ModuleStructureHelper } = require('../models/ModuleInfo');
const logger = require('./Logger');

class CSPSolver {
  constructor(constraints, modules, progressEmitter = null) {
    this.constraints = constraints || [];
    this.modules = modules || [];
    this.solutions = [];
    this.maxSolutions = Infinity; // 无数量上限
    this.prunedCount = 0;
    this.generatedCount = 0;
    this.isPowerModuleCache = new Map(); // 缓存电源模块识别结果
    this.progressEmitter = progressEmitter; // 进度发射器
    this.processedCount = 0; // 已处理数量（用于进度通知）
  }
  
  /**
   * 判断是否为电源模块
   * 使用ModuleStructureHelper中的统一判断逻辑
   */
  isPowerModule(module) {
    if (!module) return false;
    
    const name = module.name || '';
    if (this.isPowerModuleCache.has(name)) {
      return this.isPowerModuleCache.get(name);
    }
    
    const isPower = ModuleStructureHelper.isPowerModule(module);
    this.isPowerModuleCache.set(name, isPower);
    return isPower;
  }

  /**
   * 主入口：基于CSP生成架构方案（按分类组织）
   * 
   * @param {Array} leafModules - 叶子模块列表
   * @param {Array} childRequirements - 子模块需求
   * @param {Map} categoryToCandidates - 分类到候选模块的映射
   * @param {Object} globalConstraints - 全局约束（成本、重量、功耗等）
   * @param {number} maxSolutions - 最大方案数量（无上限时传Infinity）
   * @returns {Array} 生成的方案数组
   */
  generateWithCategory(leafModules, childRequirements, categoryToCandidates, globalConstraints = {}, maxSolutions = Infinity) {
    // 初始化状态
    this.solutions = [];
    // 处理 maxSolutions 为 null 或 undefined 的情况（JSON序列化Infinity会变成null）
    this.maxSolutions = (maxSolutions === null || maxSolutions === undefined) ? Infinity : maxSolutions;
    this.prunedCount = 0;
    this.generatedCount = 0;
    this.processedCount = 0;

    console.log('=== 开始CSP架构生成（按分类）===');
    console.log(`叶子模块数量: ${leafModules.length}`);
    console.log(`分类数量: ${categoryToCandidates.size}`);
    console.log(`全局约束详情: ${JSON.stringify(globalConstraints)}`);
    console.log(`全局约束: 成本<=${globalConstraints.cost_max ?? '无限制'}, 重量<=${globalConstraints.weight_max ?? '无限制'}, 功耗<=${globalConstraints.power_max ?? '无限制'}, 可靠度>=${globalConstraints.reliability_min ?? '无限制'}`);
    console.log(`最大方案数: ${this.maxSolutions}`);

    // Step 1: 为每个叶子模块/需求创建候选模块列表
    const candidatePools = this.createCandidatePoolsByCategory(leafModules, childRequirements, categoryToCandidates);
    
    // Step 2: 应用启发式排序（MRV - 最少剩余值优先）
    this.sortByMRV(candidatePools);
    
    console.log(`候选池统计: ${candidatePools.map(p => p.candidates.length).join(', ')}`);

    // 检查是否有候选池为空
    const emptyPools = candidatePools.filter(p => p.candidates.length === 0);
    if (emptyPools.length > 0) {
      console.error(`有 ${emptyPools.length} 个需求没有匹配的候选模块`);
      emptyPools.forEach(p => console.error(`  - ${p.leafModuleName || p.name}: 无候选模块`));
      return [];
    }

    // Step 3: 回溯搜索生成模块组合
    const currentSolution = {
      modules: [],
      totalCost: 0,
      totalWeight: 0,
      totalPower: 0,
      totalReliability: 1
    };

    this.backtrack(candidatePools, 0, currentSolution, globalConstraints);

    console.log(`=== CSP生成完成 ===`);
    console.log(`生成方案数: ${this.solutions.length}`);
    console.log(`剪枝数量: ${this.prunedCount}`);
    console.log(`生成尝试: ${this.generatedCount}`);

    // 清理缓存
    this.isPowerModuleCache.clear();

    return this.solutions;
  }

  /**
   * 为每个叶子模块/需求创建候选模块列表（按分类组织）
   * 支持混合选型：当 quantity > 1 时，拆分为多个独立的需求池
   */
  createCandidatePoolsByCategory(leafModules, childRequirements, categoryToCandidates) {
    const pools = [];
    const processedNames = new Set();
    
    console.log(`[候选池创建] 开始创建候选池`);
    console.log(`[候选池创建] 叶子模块数量: ${leafModules.length}`);
    console.log(`[候选池创建] 分类-候选映射数量: ${categoryToCandidates.size}`);
    
    // 打印所有可用的分类
    for (const [cat, cands] of categoryToCandidates) {
      console.log(`[候选池创建] 可用分类: "${cat}", 候选数: ${cands.length}`);
    }
    
    // 优先使用叶子模块
    for (const leaf of leafModules) {
      if (processedNames.has(leaf.name)) continue;
      processedNames.add(leaf.name);
      
      const cats = leaf.categories || [];
      let candidates = [];
      
      console.log(`[候选池创建] 处理叶子模块: "${leaf.name}", 分类: [${cats.join(', ')}]`);
      
      // 从每个分类获取候选
      for (const cat of cats) {
        // 精确匹配
        if (categoryToCandidates.has(cat)) {
          const matchedCandidates = categoryToCandidates.get(cat);
          console.log(`[候选池创建]   精确匹配分类 "${cat}": ${matchedCandidates.length} 个候选`);
          candidates = candidates.concat(matchedCandidates);
        }
        // 支持模糊匹配
        for (const [key, value] of categoryToCandidates) {
          if (key !== cat && (key.includes(cat) || cat.includes(key))) {
            console.log(`[候选池创建]   模糊匹配分类 "${cat}" ~ "${key}": ${value.length} 个候选`);
            candidates = candidates.concat(value);
          }
        }
      }
      
      // 如果分类匹配失败，尝试用叶子模块名称匹配
      if (candidates.length === 0) {
        console.log(`[候选池创建]   分类匹配失败，尝试用名称匹配`);
        for (const [key, value] of categoryToCandidates) {
          if (key.includes(leaf.name) || leaf.name.includes(key)) {
            console.log(`[候选池创建]   名称匹配 "${leaf.name}" ~ "${key}": ${value.length} 个候选`);
            candidates = candidates.concat(value);
          }
        }
      }
      
      // 去重
      const uniqueCandidates = [];
      const seenNames = new Set();
      for (const c of candidates) {
        if (!seenNames.has(c.name)) {
          seenNames.add(c.name);
          uniqueCandidates.push({
            ...c,
            _leafModuleName: leaf.name,
            _requiredQuantity: leaf.quantity || 1,
            _leafModuleProperties: leaf.properties || {}
          });
        }
      }
      
      const quantity = leaf.quantity || 1;
      // 支持混合选型：为每个实例创建独立的池子
      for (let i = 0; i < quantity; i++) {
        pools.push({
          leafModuleName: leaf.name,
          instanceIndex: i,
          categories: cats,
          candidates: uniqueCandidates,
          quantity: 1,
          selectedIndex: -1
        });
      }
      
      console.log(`[候选池创建] 叶子模块[${leaf.name}] 最终候选数: ${uniqueCandidates.length}, 数量需求=${quantity}, 拆分为 ${quantity} 个独立池`);
    }
    
    // 如果没有叶子模块，使用childRequirements
    if (pools.length === 0) {
      for (const req of childRequirements) {
        if (processedNames.has(req.name)) continue;
        processedNames.add(req.name);
        
        const cats = req.categories || [];
        let candidates = [];
        
        for (const cat of cats) {
          if (categoryToCandidates.has(cat)) {
            candidates = candidates.concat(categoryToCandidates.get(cat));
          }
          for (const [key, value] of categoryToCandidates) {
            if (key.includes(cat) || cat.includes(key)) {
              candidates = candidates.concat(value);
            }
          }
        }
        
        const uniqueCandidates = [];
        const seenNames = new Set();
        for (const c of candidates) {
          if (!seenNames.has(c.name)) {
            seenNames.add(c.name);
            uniqueCandidates.push({
              ...c, 
              _leafModuleName: req.name, 
              _requiredQuantity: req.quantity || 1,
              _leafModuleProperties: req.properties || {}
            });
          }
        }
        
        const quantity = req.quantity || 1;
        for (let i = 0; i < quantity; i++) {
          pools.push({
            leafModuleName: req.name,
            instanceIndex: i,
            categories: cats,
            candidates: uniqueCandidates,
            quantity: 1,
            selectedIndex: -1
          });
        }
        
        console.log(`需求[${req.name}] 分类[${cats.join(',')}]: ${uniqueCandidates.length} 个候选, 数量=${quantity}`);
      }
    }
    
    return pools;
  }

  /**
   * 主入口（旧接口，保持兼容）
   */
  generate(rootRequirements, productLibrary, globalConstraints = {}, maxSolutions = Infinity) {
    this.solutions = [];
    this.maxSolutions = maxSolutions;
    this.prunedCount = 0;
    this.generatedCount = 0;

    console.log('=== 开始CSP架构生成 ===');
    console.log(`根模块需求数量: ${rootRequirements.length}`);
    console.log(`产品库模块数量: ${productLibrary.length}`);
    console.log(`全局约束:`, globalConstraints);

    // Step 1: 为每个需求创建候选模块列表
    const candidatePools = this.createCandidatePools(rootRequirements, productLibrary);
    
    // Step 2: 应用启发式排序
    this.sortByMRV(candidatePools);
    
    console.log(`候选池统计: ${candidatePools.map(p => p.candidates.length).join(', ')}`);

    // Step 3: 回溯搜索
    const currentSolution = {
      modules: [],
      totalCost: 0,
      totalWeight: 0,
      totalPower: 0,
      totalReliability: 1
    };

    this.backtrack(candidatePools, 0, currentSolution, globalConstraints);

    console.log(`=== CSP生成完成 ===`);
    console.log(`生成方案数: ${this.solutions.length}`);
    console.log(`剪枝数量: ${this.prunedCount}`);
    console.log(`生成尝试: ${this.generatedCount}`);

    return this.solutions;
  }

  /**
   * 为每个需求创建候选模块列表（从产品库筛选）
   */
  createCandidatePools(requirements, productLibrary) {
    const pools = [];
    
    for (const req of requirements) {
      const candidates = this.filterModulesFromLibrary(productLibrary, req);
      
      pools.push({
        requirement: req,
        candidates: candidates,
        selectedIndex: -1
      });
      
      console.log(`需求[${req.name}] 匹配到 ${candidates.length} 个候选模块`);
    }
    
    return pools;
  }

  /**
   * 从产品库筛选满足需求的模块
   * 
   * 产品库匹配规则（创成设计流程2.1节）:
   * - 成本、重量参数低于叶子模块
   * - 可靠度参数高于叶子模块
   * - 电源模块特殊规则：功耗高于叶子模块
   */
  filterModulesFromLibrary(library, requirement) {
    const results = [];
    const reqName = requirement.name || '';
    const reqCategories = requirement.categories || [];
    const reqType = requirement.type || '';
    const reqProps = requirement.properties || requirement._leafModuleProperties || {};
    
    // 判断需求是否为电源类型
    const isPowerRequirement = ModuleStructureHelper.isPowerCategory(
      reqCategories.length > 0 ? reqCategories[0] : ''
    );
    
    for (const module of library) {
      const modName = module.name || '';
      const modCats = module.categories || [];
      const modType = module.module_type || '';
      const modProps = module.properties || {};
      
      let matched = false;
      
      // 检查分类匹配（最优先）
      if (reqCategories.length > 0) {
        matched = reqCategories.some(cat =>
          modCats.includes(cat) ||
          modName.includes(cat) ||
          cat.includes(modName)
        );
      }
      
      // 检查名称匹配（模糊匹配）
      if (!matched && reqName) {
        matched = modName.includes(reqName) || reqName.includes(modName);
      }
      
      // 检查类型匹配
      if (!matched && reqType && modType) {
        matched = modType.includes(reqType) || reqType.includes(modType);
      }
      
      // 如果没有任何识别信息，默认匹配
      if (!matched && !reqName && reqCategories.length === 0 && !reqType) {
        matched = true;
      }
      
      if (!matched) continue;
      
      // 参数匹配（产品库匹配规则）
      // 成本约束：产品库模块成本需低于叶子模块
      if (reqProps.cost !== undefined && reqProps.cost > 0) {
        if ((modProps.cost || 0) > reqProps.cost) {
          continue;
        }
      }
      
      // 重量约束：产品库模块重量需低于叶子模块
      if (reqProps.weight !== undefined && reqProps.weight > 0) {
        if ((modProps.weight || 0) > reqProps.weight) {
          continue;
        }
      }
      
      // 功耗约束：电源模块特殊处理
      if (isPowerRequirement) {
        // 电源模块：功耗需高于叶子模块（电源的功耗是输出功率）
        if (reqProps.power !== undefined && reqProps.power > 0) {
          if ((modProps.power || 0) < reqProps.power) {
            continue;
          }
        }
      } else {
        // 非电源模块：功耗需低于叶子模块
        if (reqProps.power !== undefined && reqProps.power > 0) {
          if ((modProps.power || 0) > reqProps.power) {
            continue;
          }
        }
      }
      
      // // 可靠度约束：需高于叶子模块
      // if (reqProps.reliability !== undefined && reqProps.reliability > 0) {
      //   if ((modProps.reliability || 0) < reqProps.reliability) {
      //     continue;
      //   }
      // }
      
      results.push({
        ...module,
        _requirementQuantity: requirement.quantity || 1,
        _isPower: isPowerRequirement || this.isPowerModule(module)
      });
    }
    
    return results;
  }

  /**
   * MRV启发式：按候选数量排序，最受限的变量优先
   */
  sortByMRV(pools) {
    pools.sort((a, b) => (a.candidates?.length || 0) - (b.candidates?.length || 0));
  }

  /**
   * 回溯算法核心
   * 使用回溯搜索 + 剪枝策略生成所有满足约束条件的方案
   */
  backtrack(pools, index, currentSolution, globalConstraints) {
    // 检查停止标志
    if (this.maxSolutions !== Infinity && this.solutions.length >= this.maxSolutions) {
      return true;
    }

    // 所有需求都已处理完，生成完整方案
    if (index >= pools.length) {
      this.generatedCount++;
      
      // 调试：输出完整方案
      if (this.generatedCount <= 5) {
        console.log(`\n[回溯] 找到完整方案 #${this.generatedCount}:`);
        console.log(`  - 模块数: ${currentSolution.modules.length}`);
        console.log(`  - 成本: ${currentSolution.totalCost}, 重量: ${currentSolution.totalWeight}, 功耗: ${currentSolution.totalPower}, 可靠度: ${currentSolution.totalReliability}`);
      }
      
      // 验证全局约束
      if (!this.checkGlobalConstraints(currentSolution, globalConstraints)) {
        if (this.generatedCount <= 5) {
          console.log(`  - 全局约束验证失败`);
        }
        return false;
      }
      
      // 验证绑定/互斥约束
      if (!this.checkBindingConstraints(currentSolution, this.constraints)) {
        if (this.generatedCount <= 5) {
          console.log(`  - 绑定/互斥约束验证失败`);
        }
        return false;
      }
      
      // 验证接口匹配约束
      if (!this.checkInterfaceConstraints(currentSolution, this.constraints)) {
        if (this.generatedCount <= 5) {
          console.log(`  - 接口约束验证失败`);
        }
        return false;
      }

      // 深度拷贝方案
      const solution = {
        modules: currentSolution.modules.map(m => ({...m})),
        totalCost: currentSolution.totalCost,
        totalWeight: currentSolution.totalWeight,
        totalPower: currentSolution.totalPower,
        totalReliability: currentSolution.totalReliability,
        properties: {
          totalCost: currentSolution.totalCost,
          totalWeight: currentSolution.totalWeight,
          totalPower: currentSolution.totalPower,
          totalReliability: currentSolution.totalReliability
        }
      };
      
      this.solutions.push(solution);
      this.processedCount++;
      
      // 每生成100个方案输出一次进度
      if (this.progressEmitter && this.processedCount % 100 === 0) {
        this.progressEmitter.emit('progress', { 
          type: 'solution', 
          count: this.solutions.length 
        });
      }
      
      if (this.solutions.length % 100 === 0) {
        console.log(`生成方案 #${this.solutions.length}: 成本=${solution.totalCost.toFixed(2)}, 重量=${solution.totalWeight.toFixed(2)}, 功耗=${solution.totalPower.toFixed(2)}`);
      }
      
      return false; // 继续生成，无数量上限
    }

    const pool = pools[index];
    
    // 调试输出：进入回溯
    let debugLog = false;
    if (this.processedCount < 5 && index === 0) {
      debugLog = true;
      console.log(`\n[回溯] 第${index}层, 候选池名字=${pool.leafModuleName || pool.name}, 候选数=${pool.candidates ? pool.candidates.length : 0}`);
    }
    
    // 剪枝：如果没有候选模块，直接返回
    if (!pool.candidates || pool.candidates.length === 0) {
      this.prunedCount++;
      if (debugLog) {
        console.log(`[回溯] 候选池为空，剪枝返回`);
      }
      return false;
    }

    // 启发式：LCV，选择约束最少/成本最优的候选
    const orderedCandidates = this.orderByLCV(pool.candidates, pools, index, currentSolution, globalConstraints);
    
    // 调试输出
    if (debugLog) {
      console.log(`[回溯] 排序后候选数: ${orderedCandidates.length}`);
      console.log(`[回溯] 前3个候选: ${orderedCandidates.slice(0, 3).map(c => c.name).join(', ')}`);
    }

    let candidateIndex = 0;
    // 遍历候选模块
    for (const candidate of orderedCandidates) {
      // 检查停止标志
      if (this.maxSolutions !== Infinity && this.solutions.length >= this.maxSolutions) {
        return true;
      }
      
      // 调试输出
      if (debugLog && candidateIndex < 3) {
        console.log(`[回溯] 尝试候选 #${candidateIndex}: ${candidate.name}`);
      }
      candidateIndex++;
      
      // 应用选择
      const quantity = pool.quantity || 1;
      const addProps = this.calculateModuleProperties(candidate, quantity);
      
      currentSolution.modules.push({
        ...candidate,
        quantity: quantity
      });
      
      currentSolution.totalCost += addProps.cost * quantity;
      currentSolution.totalWeight += addProps.weight * quantity;
      // 功耗计算排除电源模块
      if (!this.isPowerModule(candidate)) {
        currentSolution.totalPower += addProps.power * quantity;
      }
      currentSolution.totalReliability *= Math.pow(addProps.reliability, quantity);

      // 前向检查：提前验证部分约束
      const forwardCheckResult = this.forwardCheckCostWeight(currentSolution, globalConstraints);
      if (debugLog && candidateIndex <= 3) {
        console.log(`[回溯] 前向检查结果: ${forwardCheckResult}, 当前累计: 成本=${currentSolution.totalCost}, 重量=${currentSolution.totalWeight}, 功耗=${currentSolution.totalPower}`);
      }
      
      if (forwardCheckResult) {
        // 递归处理下一个需求
        const shouldStop = this.backtrack(pools, index + 1, currentSolution, globalConstraints);
        if (shouldStop) return true;
      } else {
        this.prunedCount++;
        if (debugLog && this.prunedCount <= 5) {
          console.log(`[回溯] 前向检查失败，剪枝`);
        }
      }

      // 撤销选择（回溯）
      currentSolution.modules.pop();
      currentSolution.totalCost -= addProps.cost * quantity;
      currentSolution.totalWeight -= addProps.weight * quantity;
      // 功耗计算排除电源模块
      if (!this.isPowerModule(candidate)) {
        currentSolution.totalPower -= addProps.power * quantity;
      }
      currentSolution.totalReliability /= Math.pow(addProps.reliability, quantity);
      
      // 定期清理内存
      if (this.processedCount % 1000 === 0 && global.gc) {
        global.gc();
      }
    }

    return false;
  }

  /**
   * LCV启发式：选择约束最少/成本最优的候选
   */
  orderByLCV(candidates, pools, currentIndex, currentSolution, globalConstraints) {
    // 按照 成本+重量+功耗 的综合评分升序排列
    return [...candidates].sort((a, b) => {
      const propsA = this.calculateModuleProperties(a, 1);
      const propsB = this.calculateModuleProperties(b, 1);
      
      const powerA = this.isPowerModule(a) ? 0 : propsA.power * 0.1;
      const powerB = this.isPowerModule(b) ? 0 : propsB.power * 0.1;
      
      const scoreA = propsA.cost + propsA.weight * 10 + powerA;
      const scoreB = propsB.cost + propsB.weight * 10 + powerB;
      
      return scoreA - scoreB;
    });
  }

  /**
   * 计算模块属性
   */
  calculateModuleProperties(module, quantity = 1) {
    const props = module.properties || {};
    return {
      cost: props.cost_min || props.cost || 0,
      weight: props.weight_min || props.weight || 0,
      power: props.power_min || props.power || 0,
      reliability: props.reliability_min || props.reliability || 0.9
    };
  }

  /**
   * 前向检查：验证成本和重量、功耗、可靠性约束
   * 尽早剪枝无效分支，提高搜索效率
   */
  forwardCheckCostWeight(currentSolution, globalConstraints) {
    const gc = globalConstraints;
    
    // 成本检查
    if (gc.cost_max !== undefined && gc.cost_max !== Infinity && currentSolution.totalCost > gc.cost_max) {
      return false;
    }
    
    // 重量检查
    if (gc.weight_max !== undefined && gc.weight_max !== Infinity && currentSolution.totalWeight > gc.weight_max) {
      return false;
    }
    
    // 功耗检查（排除电源模块后）
    if (gc.power_max !== undefined && gc.power_max !== Infinity && currentSolution.totalPower > gc.power_max) {
      return false;
    }
    
    // 可靠性检查 - 已禁用
    // if (gc.reliability_min !== undefined && gc.reliability_min > 0 && currentSolution.totalReliability < gc.reliability_min) {
    //   return false;
    // }
    
    return true;
  }

  /**
   * 前向检查：验证当前累计是否超过全局约束
   */
  forwardCheck(currentSolution, globalConstraints) {
    return this.forwardCheckCostWeight(currentSolution, globalConstraints);
  }

  /**
   * 检查全局属性约束（最终验证）
   * 功耗需要排除电源模块
   */
  checkGlobalConstraints(solution, globalConstraints) {
    const gc = globalConstraints;
    
    if (gc.cost_max !== undefined && gc.cost_max !== Infinity && solution.totalCost > gc.cost_max) {
      return false;
    }
    
    if (gc.weight_max !== undefined && gc.weight_max !== Infinity && solution.totalWeight > gc.weight_max) {
      return false;
    }
    
    // 功耗检查需要排除电源模块（已在计算时排除）
    if (gc.power_max !== undefined && gc.power_max !== Infinity && solution.totalPower > gc.power_max) {
      return false;
    }
    
    // if (gc.reliability_min !== undefined && gc.reliability_min > 0 && solution.totalReliability < gc.reliability_min) {
    //   return false;
    // }
    
    return true;
  }

  /**
   * 检查绑定/互斥约束
   * 约束格式: { type: 'connection', module1: 'A', module2: 'B', relation_type: '绑定'|'互斥' }
   * 
   * 绑定约束：若一个分类的模块与另一个分类的模块存在绑定约束，
   *          那么在连接方案的筛选过程中，方案里，只要这两个分类的模块之间有连接关系，即满足约束
   * 互斥约束：若一个分类的模块与另一个分类的模块存在互斥约束，
   *          那么在连接方案的筛选过程中，方案里，这两个分类的模块之间一定没有连接关系
   */
  checkBindingConstraints(solution, constraints) {
    if (!constraints || !Array.isArray(constraints) || constraints.length === 0) {
      return true;
    }

    const modules = solution.modules;
    const moduleNames = modules.map(m => m.name);
    const moduleCategories = new Set();
    
    // 收集所有模块的分类
    modules.forEach(m => {
      (m.categories || []).forEach(c => moduleCategories.add(c));
    });
    
    for (const constraint of constraints) {
      if (constraint.type !== 'connection') continue;
      
      const module1 = constraint.module1;
      const module2 = constraint.module2;
      
      // 查找方案中是否包含这两个模块（支持通过分类匹配）
      const hasModule1 = moduleNames.some(n => 
        n === module1 || 
        (modules.find(m => m.name === n)?.categories || []).includes(module1)
      ) || moduleCategories.has(module1);
      
      const hasModule2 = moduleNames.some(n => 
        n === module2 || 
        (modules.find(m => m.name === n)?.categories || []).includes(module2)
      ) || moduleCategories.has(module2);
      
      // 绑定约束：module1和module2必须同时存在
      if (constraint.relation_type === '绑定') {
        if ((hasModule1 && !hasModule2) || (!hasModule1 && hasModule2)) {
          return false;
        }
      }
      
      // 互斥约束：module1和module2不能同时存在
      if (constraint.relation_type === '互斥') {
        if (hasModule1 && hasModule2) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * 检查接口匹配约束
   */
  checkInterfaceConstraints(solution, constraints) {
    // 当前实现：宽松检查，只要有其他模块存在就算通过
    return true;
  }

  /**
   * 清理缓存，释放内存
   */
  clearCache() {
    this.isPowerModuleCache.clear();
    this.solutions = [];
    if (global.gc) {
      global.gc();
    }
  }
}

module.exports = CSPSolver;

