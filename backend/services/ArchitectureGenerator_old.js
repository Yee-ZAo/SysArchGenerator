const ConstraintSolver = require('./ConstraintSolver');
const fs = require('fs');
const path = require('path');

/**
 * 新架构生成算法 - 基于产品库匹配和连接组装
 * 重写原有树形生成算法，采用需求驱动的模块匹配方法
 */
class ArchitectureGenerator {
  constructor() {
    this.heapLimitMB = process.env.HEAP_LIMIT_MB ? parseInt(process.env.HEAP_LIMIT_MB, 10) : 4096;
    this.memoryLogging = process.env.LOG_MEMORY === 'true';
    this.solutionOutputDir = process.env.SOLUTION_OUTPUT_DIR || 'backend/uploads';
    this.solutionCount = 0;
  }

  /**
   * 生成架构解决方案的主入口方法
   * 新算法步骤：
   * 1. 识别根模块（非叶子模块）
   * 2. 从产品库获取候选叶子模块
   * 3. 为每个根模块需求生成可能的叶子模块组合
   * 4. 为每个组合生成连接方案
   * 5. 进行可行性评估（成本、重量、功耗、可靠度）
   * 6. 过滤满足约束的方案
   * 
   * @param {Array} modules - 模块定义数组
   * @param {Object} constraints - 约束条件对象
   * @param {number} maxSolutions - 最大解决方案数量限制
   * @param {Array} productLibrary - 产品库数据（可选）
   * @returns {Promise<Object>} 包含生成结果的对象
   */
  async generateSolutions(modules, constraints, maxSolutions = 99999, productLibrary = null) {
    this.solutionCount = 0;
    this.constraintSolver = new ConstraintSolver(constraints);
    
    // 内存使用检查函数
    const checkMemoryUsage = () => {
      const used = process.memoryUsage().heapUsed / 1024 / 1024;
      if (this.memoryLogging) {
        console.log(`内存使用: ${Math.round(used)}MB`);
      }
      return used;
    };

    try {
      // ==================== 文件路径准备阶段 ====================
      const timestamp = new Date().toISOString().replace(/[:\\.]/g, '-');
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

      // ==================== 文件流初始化 ====================
      const writeStream = fs.createWriteStream(solutionFilePath);
      writeStream.write('[');
      let isFirstSolution = true;

      // ==================== 算法核心阶段 ====================
      console.log('开始新架构生成算法...');
      
      // 1. 分离根模块和叶子模块
      const { rootModules, leafModules } = this.separateModules(modules);
      console.log(`识别到 ${rootModules.length} 个根模块, ${leafModules.length} 个叶子模块`);
      
      // 2. 【修复】获取产品库候选模块，返回映射结构
      const candidateResult = await this.getCandidateModules(productLibrary, leafModules);
      const leafToCandidatesMap = candidateResult.leafToCandidatesMap;
      const candidateModules = candidateResult.allCandidates;
      console.log(`从产品库获取到 ${candidateModules.length} 个候选模块, ${leafToCandidatesMap.size} 个叶子模块映射`);
      
      // 3. 【修复】为每个根模块生成可能的叶子模块组合，传入映射结构
      const rootSolutions = [];
      for (const rootModule of rootModules) {
        console.log(`处理根模块: ${rootModule.name}`);
        const solutionsForRoot = await this.generateSolutionsForRoot(
          rootModule,
          candidateModules,
          constraints,
          maxSolutions,
          leafToCandidatesMap  // 【修复】传入叶子模块到候选实例的映射
        );
        rootSolutions.push(...solutionsForRoot);
        
        // 内存检查
        if (checkMemoryUsage() > this.heapLimitMB * 0.8) {
          console.error('内存不足中止生成');
          await this.closeWriteStream(writeStream);
          return {
            success: false,
            error: "内存不足终止生成",
            count: this.solutionCount,
            filePath: solutionFilePath
          };
        }
      }

      // 4. 【修复】生成所有可能的连接方案组合并评估可行性
      // 不再只生成一种全覆盖连接，而是生成多种可能的连接组合
      const allSolutions = [];
      for (const solution of rootSolutions) {
        if (this.solutionCount >= maxSolutions) break;
        
        // 【修复】生成所有可能的连接方案组合
        const connectionSchemes = this.generateAllPossibleConnectionSchemes(solution, constraints, maxSolutions - this.solutionCount);
        console.log(`模块组合生成 ${connectionSchemes.length} 种连接方案`);
        
        // 遍历每种连接方案
        for (const connections of connectionSchemes) {
          if (this.solutionCount >= maxSolutions) break;
          
          // 构建完整解决方案
          const fullSolution = {
            id: `sol_${this.solutionCount}`,
            rootModule: solution.rootModule,
            leafModules: solution.leafModules,
            connections: connections,
            properties: this.calculateSolutionProperties(solution, connections)
          };

          // 可行性评估
          if (!this.evaluateFeasibility(fullSolution, constraints)) {
            continue;
          }

          // 约束条件验证
          if (!this.constraintSolver.satisfiesConstraints(fullSolution)) {
            continue;
          }

          // 写入文件
          if (!isFirstSolution) {
            writeStream.write(',');
          } else {
            isFirstSolution = false;
          }

          const writeErr = await this.writeSolution(writeStream, fullSolution);
          if (writeErr) {
            console.error('写入解决方案失败:', writeErr);
            return { success: false, error: writeErr.message };
          }

          this.solutionCount++;
          allSolutions.push(fullSolution);
          
          // 内存检查
          if (checkMemoryUsage() > this.heapLimitMB * 0.8) {
            console.error('内存不足中止生成');
            await this.closeWriteStream(writeStream);
            return {
              success: false,
              error: "内存不足终止生成",
              count: this.solutionCount,
              filePath: solutionFilePath
            };
          }
        }
      }

      // ==================== 文件流关闭阶段 ====================
      const closeErr = await this.closeWriteStream(writeStream);
      if (closeErr) {
        return { success: false, error: closeErr.message };
      }

      // ==================== 生成结果返回 ====================
      console.log(`新算法生成完成: ${this.solutionCount}个完整方案, 路径: ${solutionFilePath}`);
      // 【修复】不再将整个文件读入内存，只返回文件路径和数量
      // 调用方可以根据需要自行读取文件
      return {
        success: this.solutionCount > 0,
        count: this.solutionCount,
        filePath: solutionFilePath
      };
    } catch (error) {
      console.error('新算法方案生成失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 分离根模块和叶子模块，并提取每个根模块的子模块需求
   * 【修复】支持通过 parentModule 属性反向查找子模块
   * @param {Array} modules - 所有模块
   * @returns {Object} 包含根模块（带子模块需求）和叶子模块的对象
   */
  separateModules(modules) {
    const rootModules = [];
    const leafModules = [];
    
    // 创建模块名称到模块的映射，便于查找
    const moduleMap = new Map();
    modules.forEach(module => {
      moduleMap.set(module.name, module);
    });
    
    // 【修复】创建父模块到子模块的映射
    const parentToChildrenMap = new Map();
    modules.forEach(module => {
      const parentName = module.parent_module || module.parentModule;
      if (parentName) {
        if (!parentToChildrenMap.has(parentName)) {
          parentToChildrenMap.set(parentName, []);
        }
        parentToChildrenMap.get(parentName).push(module);
      }
    });
    
    modules.forEach(module => {
      // 检查是否有子模块（children属性）
      const hasChildren = module.children && Array.isArray(module.children) && module.children.length > 0;
      
      // 【修复】检查是否有模块引用此模块作为父模块
      const hasChildrenByParentRef = parentToChildrenMap.has(module.name) && parentToChildrenMap.get(module.name).length > 0;
      
      // 检查是否为叶子模块（isLeaf属性）
      const isLeaf = module.isLeaf === true;
      
      // 检查父模块引用
      const hasParent = (module.parent_module || module.parentModule) && (module.parent_module || module.parentModule).trim() !== '';
      
      // 【修复】根模块判断：没有父模块且不是叶子模块，或者有子模块，或者有其他模块引用它作为父模块
      if ((!hasParent && !isLeaf) || hasChildren || hasChildrenByParentRef) {
        // 提取子模块需求信息
        const childRequirements = this.extractChildRequirements(module, moduleMap, parentToChildrenMap);
        
        rootModules.push({
          ...module,
          childRequirements: childRequirements
        });
      } else {
        leafModules.push(module);
      }
    });
    
    console.log(`分离结果: ${rootModules.length} 个根模块, ${leafModules.length} 个叶子模块`);
    rootModules.forEach(m => {
      console.log(`根模块: ${m.name}`);
      if (m.childRequirements && m.childRequirements.length > 0) {
        m.childRequirements.forEach(req => {
          console.log(`  - 需要子模块: ${req.type || req.name}, 数量: ${req.quantity}`);
        });
      }
    });
    leafModules.forEach(m => console.log(`叶子模块: ${m.name}`));
    
    return { rootModules, leafModules };
  }

  /**
   * 提取根模块的子模块需求
   * 【修复】支持从 children 属性和 parentModule 反向查找两种方式
   * 从 children 属性中提取每个子模块的类型和数量需求
   * @param {Object} rootModule - 根模块
   * @param {Map} moduleMap - 模块名称到模块的映射
   * @param {Map} parentToChildrenMap - 父模块名称到子模块数组的映射
   * @returns {Array} 子模块需求数组，每项包含 {type, name, quantity, categories, properties}
   */
  extractChildRequirements(rootModule, moduleMap, parentToChildrenMap) {
    const requirements = [];
    
    // 方式1：从 children 属性提取
    if (rootModule.children && Array.isArray(rootModule.children)) {
      rootModule.children.forEach(child => {
        // child 可能是字符串（模块名称）或对象
        let childName = '';
        let childType = '';
        let childQuantity = 1;
        let childCategories = [];
        let childProperties = {};
        
        if (typeof child === 'string') {
          // child 是模块名称
          childName = child;
          const childModule = moduleMap.get(child);
          if (childModule) {
            childType = childModule.module_type || childModule.moduleType || '';
            childCategories = childModule.categories || [];
            childProperties = childModule.properties || {};
          }
        } else if (typeof child === 'object') {
          // child 是对象
          childName = child.name || '';
          childType = child.type || child.module_type || child.moduleType || '';
          childQuantity = child.quantity || 1;
          childCategories = child.categories || [];
          childProperties = child.properties || {};
          
          // 如果有名称但没有类型，尝试从 moduleMap 获取
          if (childName && !childType) {
            const childModule = moduleMap.get(childName);
            if (childModule) {
              childType = childModule.module_type || childModule.moduleType || '';
              childCategories = childModule.categories || childCategories;
              childProperties = childModule.properties || childProperties;
            }
          }
        }
        
        // 创建需求对象
        const requirement = {
          name: childName,
          type: childType,
          quantity: childQuantity,
          categories: childCategories,
          properties: childProperties
        };
        
        requirements.push(requirement);
      });
    }
    
    // 【修复】方式2：从 parentToChildrenMap 反向查找子模块
    if (parentToChildrenMap && parentToChildrenMap.has(rootModule.name)) {
      const childModules = parentToChildrenMap.get(rootModule.name);
      childModules.forEach(childModule => {
        // 检查是否已经存在相同名称的需求
        const existingReq = requirements.find(r => r.name === childModule.name);
        if (!existingReq) {
          const requirement = {
            name: childModule.name,
            type: childModule.module_type || childModule.moduleType || '',
            quantity: childModule.quantity || 1,
            categories: childModule.categories || [],
            properties: childModule.properties || {}
          };
          requirements.push(requirement);
        }
      });
    }
    
    return requirements;
  }

  /**
   * 获取候选模块（从产品库或现有叶子模块）
   * 【修复】返回叶子模块到候选实例的映射，确保每个叶子模块有独立的候选池
   * 根据用户要求，叶子模块的参数用作从产品库里匹配模块实例的约束条件
   * 根模块参数仅用于整体方案约束，不用于匹配
   * @param {Array} productLibrary - 产品库数据
   * @param {Array} existingLeafModules - 现有叶子模块（包含需求参数）
   * @returns {Promise<Object>} 包含 leafToCandidatesMap（映射）和 allCandidates（所有候选模块数组）
   */
  async getCandidateModules(productLibrary, existingLeafModules) {
    // 【修复】返回映射结构：叶子模块名称 -> 候选实例数组
    const leafToCandidatesMap = new Map();
    let allCandidates = [];
    
    // 如果提供了产品库，根据叶子模块需求筛选产品库模块
    if (productLibrary && Array.isArray(productLibrary) && productLibrary.length > 0) {
      if (existingLeafModules && existingLeafModules.length > 0) {
        // 【修复】根据叶子模块需求筛选产品库模块，返回映射关系
        const filteredMap = this.filterProductLibraryByLeafRequirements(productLibrary, existingLeafModules);
        
        // 将映射合并到返回结果中
        filteredMap.forEach((candidates, leafName) => {
          leafToCandidatesMap.set(leafName, candidates);
          allCandidates.push(...candidates);
        });
        
        console.log(`根据叶子模块需求筛选产品库: ${leafToCandidatesMap.size} 个叶子模块已建立映射`);
      } else {
        // 没有叶子模块需求，使用所有产品库模块
        allCandidates.push(...productLibrary);
        console.log(`使用全部产品库数据: ${productLibrary.length} 个模块`);
      }
    }
    
    // 【修复】为现有叶子模块也建立映射关系（每个叶子模块可以作为自己的候选）
    if (existingLeafModules && existingLeafModules.length > 0) {
      existingLeafModules.forEach(leafModule => {
        // 如果该叶子模块还没有候选映射，为其创建一个
        if (!leafToCandidatesMap.has(leafModule.name)) {
          leafToCandidatesMap.set(leafModule.name, [leafModule]);
        } else {
          // 如果已有映射，检查是否需要添加自身作为候选
          const existingCandidates = leafToCandidatesMap.get(leafModule.name);
          const hasSelf = existingCandidates.some(c => c.name === leafModule.name);
          if (!hasSelf) {
            existingCandidates.push(leafModule);
          }
        }
      });
      console.log(`添加现有叶子模块作为候选: ${existingLeafModules.length} 个模块`);
    }
    
    // 去重（基于模块名称）- 用于 allCandidates 数组
    const uniqueCandidates = [];
    const seenNames = new Set();
    
    allCandidates.forEach(module => {
      if (module.name && !seenNames.has(module.name)) {
        seenNames.add(module.name);
        uniqueCandidates.push(module);
      }
    });
    
    console.log(`最终候选模块数量: ${uniqueCandidates.length}, 叶子模块映射数量: ${leafToCandidatesMap.size}`);
    
    // 【修复】返回包含映射和数组的对象
    return {
      leafToCandidatesMap: leafToCandidatesMap,
      allCandidates: uniqueCandidates
    };
  }

  /**
   * 根据叶子模块需求筛选产品库模块
   * 【修复】为每个叶子模块独立筛选候选实例，返回映射关系而非合并的候选池
   * 匹配规则：
   * 1. 产品库模块的分类必须与叶子模块的分类匹配（module_type 或 categories）
   * 2. 产品库模块的成本、重量、功耗参数必须低于叶子模块的对应参数（cost_min, weight_min, power_min）
   * 3. 产品库模块的可靠度必须高于叶子模块的可靠度（reliability_min）
   * 4. 对于电源模块，功耗参数要求相反：产品库模块的功耗必须大于叶子模块的功耗需求
   * @param {Array} productLibrary - 产品库模块数组
   * @param {Array} leafModules - 叶子模块数组（包含需求参数）
   * @returns {Map} 叶子模块名称到候选实例数组的映射
   */
  filterProductLibraryByLeafRequirements(productLibrary, leafModules) {
    // 【修复】返回映射关系：叶子模块名称 -> 匹配的候选实例数组
    const leafToCandidatesMap = new Map();
    
    leafModules.forEach(leafModule => {
      const matchedForThisLeaf = [];
      
      // 提取叶子模块的需求参数
      const leafProps = leafModule.properties || {};
      const leafCost = leafProps.cost_min || leafProps.cost || leafProps.cost_max || 0;
      const leafWeight = leafProps.weight_min || leafProps.weight || leafProps.weight_max || 0;
      const leafPower = leafProps.power_min || leafProps.power || leafProps.power_max || 0;
      const leafReliability = leafProps.reliability_min || leafProps.reliability || leafProps.reliability_max || 0;
      
      // 获取叶子模块的分类信息
      const leafModuleType = leafModule.module_type || leafModule.moduleType || '';
      const leafCategories = leafModule.categories || [];
      
      // 判断是否为电源模块
      const isPowerModule = this.isPowerModule(leafModule);
      
      // 遍历产品库，寻找匹配的模块
      productLibrary.forEach(productModule => {
        // 提取产品库模块的参数
        const productProps = productModule.properties || {};
        const productCost = productProps.cost_min || productProps.cost || productProps.cost_max || 0;
        const productWeight = productProps.weight_min || productProps.weight || productProps.weight_max || 0;
        const productPower = productProps.power_min || productProps.power || productProps.power_max || 0;
        const productReliability = productProps.reliability_min || productProps.reliability || productProps.reliability_max || 0;
        
        // 1. 分类匹配：检查模块类型或分类是否匹配
        const productModuleType = productModule.module_type || productModule.moduleType || '';
        const productCategories = productModule.categories || [];
        
        let categoryMatch = false;
        
        // 【修复】优先使用分类进行精确匹配
        if (leafCategories.length > 0 && productCategories.length > 0) {
          // 分类精确匹配：叶子模块的分类必须与产品模块的分类有交集
          categoryMatch = leafCategories.some(cat => productCategories.includes(cat));
        } else if (leafModuleType && productModuleType) {
          // 如果没有分类信息，则使用模块类型匹配
          categoryMatch = leafModuleType === productModuleType;
        } else {
          // 如果没有分类和类型信息，则默认匹配
          categoryMatch = true;
        }
        
        if (!categoryMatch) {
          return; // 分类不匹配，跳过
        }
        
        // 2. 参数匹配（成本、重量、可靠度）
        const costMatch = productCost <= leafCost;
        const weightMatch = productWeight <= leafWeight;
        const reliabilityMatch = productReliability >= leafReliability;
        
        // 3. 功耗匹配：电源模块特殊处理
        let powerMatch;
        if (isPowerModule) {
          // 电源模块：产品库功耗必须大于等于叶子模块功耗（提供足够功率）
          powerMatch = productPower >= leafPower;
        } else {
          // 非电源模块：产品库功耗必须小于等于叶子模块功耗（更节能）
          powerMatch = productPower <= leafPower;
        }
        
        // 所有条件都满足
        if (costMatch && weightMatch && powerMatch && reliabilityMatch) {
          // 【修复】为当前叶子模块添加匹配的候选实例
          const existing = matchedForThisLeaf.find(m => m.name === productModule.name);
          if (!existing) {
            matchedForThisLeaf.push(productModule);
          }
        }
      });
      
      // 【修复】将叶子模块名称映射到其候选实例数组
      leafToCandidatesMap.set(leafModule.name, matchedForThisLeaf);
      console.log(`叶子模块 "${leafModule.name}" 匹配到 ${matchedForThisLeaf.length} 个候选实例`);
    });
    
    // 打印映射摘要
    console.log(`根据叶子模块需求筛选产品库: ${leafModules.length} 个叶子模块已建立候选映射`);
    return leafToCandidatesMap;
  }

  /**
   * 为单个根模块生成解决方案
   * 【修复】使用叶子模块到候选实例的映射，确保每个叶子模块需求都有对应类型的实例
   * 根据用户要求：
   * 1. 从产品库中找到满足所有条件的每个叶子模块的模块实例
   * 2. 结合叶子模块的数量、根据接口、约束条件，生成所有满足约束条件的可能的模块实例连接方案
   * 3. 每个方案中都要包含指定数量的叶子模块的实例，并且建立了连接关系
   * 4. 将每个方案的成本、重量参数与根模块的成本、重量需求做对比
   * 5. 将每个方案除去电源模块后的功耗与根模块的功耗需求做对比
   * 6. 将每个方案的可靠度与根模块的可靠度做对比
   * 7. 若方案的成本、功耗、重量低于根模块、且可靠度高于根模块，那么这个方案可行
   * @param {Object} rootModule - 根模块（包含 childRequirements 子模块需求）
   * @param {Array} candidateModules - 候选模块（已从产品库匹配的模块实例）
   * @param {Object} constraints - 约束条件
   * @param {number} maxSolutions - 最大解决方案数
   * @param {Map} leafToCandidatesMap - 【修复】叶子模块名称到候选实例数组的映射
   * @returns {Promise<Array>} 解决方案数组
   */
  async generateSolutionsForRoot(rootModule, candidateModules, constraints, maxSolutions, leafToCandidatesMap = null) {
    const solutions = [];
    
    // 获取根模块的需求（属性要求）
    const rootRequirements = this.extractRootRequirements(rootModule);
    console.log(`根模块 ${rootModule.name} 参数（用于整体约束）:`, rootRequirements);
    
    // 获取根模块的子模块需求（从 children 属性提取）
    const childRequirements = rootModule.childRequirements || [];
    console.log(`根模块 ${rootModule.name} 子模块需求:`, childRequirements);
    
    // 候选模块已经是从产品库中匹配的满足条件的模块实例
    console.log(`候选模块数量: ${candidateModules.length} 个`);
    
    if (candidateModules.length === 0) {
      console.warn(`根模块 ${rootModule.name} 没有合适的候选模块`);
      return solutions;
    }
    
    // 如果有子模块需求，根据需求筛选和组合候选模块
    if (childRequirements.length > 0) {
      // 【修复】使用映射结构为每个需求获取对应的候选模块
      const requirementMatches = this.matchCandidatesToRequirementsWithMap(
        childRequirements,
        candidateModules,
        leafToCandidatesMap
      );
      console.log(`子模块需求匹配结果:`);
      requirementMatches.forEach((match, index) => {
        console.log(`  需求 ${index + 1}: 类型=${match.requirement.type || match.requirement.name}, 数量=${match.requirement.quantity}, 匹配候选数=${match.matchedCandidates.length}`);
      });
      
      // 检查是否所有需求都有匹配的候选模块
      const hasUnmatchedRequirement = requirementMatches.some(match => match.matchedCandidates.length === 0);
      if (hasUnmatchedRequirement) {
        console.warn(`根模块 ${rootModule.name} 存在没有匹配候选的子模块需求，跳过该根模块`);
        return solutions;
      }
      
      // 【修复】根据子模块需求生成组合，确保每个需求都有对应类型的实例
      const combinations = this.generateCombinationsByRequirementsWithMapping(requirementMatches);
      console.log(`根据子模块需求生成 ${combinations.length} 个候选组合`);
      
      // 【修复】只生成模块组合方案，连接方案由主流程统一生成多种组合
      // 这样可以确保不同方案的连接数量不同
      for (const combination of combinations) {
        if (solutions.length >= maxSolutions) break;
        
        // 构建解决方案对象（仅包含模块组合，不生成连接）
        const solution = {
          rootModule: rootModule,
          leafModules: combination.map(module => ({
            module: module,
            quantity: 1 // 每个模块实例数量为1，总数量由组合中的模块数量决定
          })),
          // 连接方案将在主流程中通过 generateAllPossibleConnectionSchemes 生成多种组合
          connections: []
        };
        
        // 先计算方案属性用于基本可行性预筛选（不含连接验证）
        solution.properties = this.calculateSolutionProperties(solution, []);
        
        // 只进行基本的可行性评估（不含连接约束验证）
        // 完整的可行性评估在主流程中进行，包括连接约束验证
        const basicFeasibility = this.evaluateBasicFeasibility(solution, constraints);
        if (!basicFeasibility) {
          continue; // 基本参数不满足要求，跳过
        }
        
        solutions.push(solution);
      }
    } else {
      // 没有子模块需求时，使用原有逻辑（按分类分组生成组合）
      console.log(`根模块 ${rootModule.name} 没有明确的子模块需求，使用分类分组方式生成组合`);
      
      // 按分类对候选模块进行分组，以便生成包含不同类型模块的组合
      const modulesByCategory = this.groupModulesByCategory(candidateModules);
      console.log(`候选模块分类分组: ${Object.keys(modulesByCategory).join(', ')}`);
      
      // 生成叶子模块组合（每个组合包含指定数量的模块实例）
      // 组合大小限制为合理范围
      const maxLeafCount = Math.min(candidateModules.length, 10);
      const combinations = this.generateCombinationsWithQuantity(candidateModules, maxLeafCount);
      console.log(`生成 ${combinations.length} 个候选组合`);
      
      // 【修复】同样只生成模块组合，连接方案由主流程统一生成
      for (const combination of combinations) {
        if (solutions.length >= maxSolutions) break;
        
        // 构建解决方案对象（仅包含模块组合，不生成连接）
        const solution = {
          rootModule: rootModule,
          leafModules: combination.map(module => ({
            module: module,
            quantity: module.quantity || 1 // 使用模块的quantity属性，指定所需数量
          })),
          // 连接方案将在主流程中通过 generateAllPossibleConnectionSchemes 生成多种组合
          connections: []
        };
        
        // 先计算方案属性用于基本可行性预筛选
        solution.properties = this.calculateSolutionProperties(solution, []);
        
        // 只进行基本的可行性评估（不含连接约束验证）
        const basicFeasibility = this.evaluateBasicFeasibility(solution, constraints);
        if (!basicFeasibility) {
          continue; // 基本参数不满足要求，跳过
        }
        
        solutions.push(solution);
      }
    }
    
    console.log(`生成 ${solutions.length} 个可行方案（考虑叶子模块数量和连接约束）`);
    return solutions;
  }

  /**
   * 根据子模块需求匹配候选模块
   * @param {Array} requirements - 子模块需求数组
   * @param {Array} candidates - 候选模块数组
   * @returns {Array} 匹配结果数组，每项包含 {requirement, matchedCandidates}
   */
  matchCandidatesToRequirements(requirements, candidates) {
    const matches = [];
    
    requirements.forEach(requirement => {
      const matchedCandidates = [];
      
      // 获取需求的类型和分类信息
      const reqType = requirement.type || '';
      const reqCategories = requirement.categories || [];
      const reqName = requirement.name || '';
      
      candidates.forEach(candidate => {
        // 获取候选模块的类型和分类信息
        const candType = candidate.module_type || candidate.moduleType || '';
        const candCategories = candidate.categories || [];
        
        let isMatch = false;
        
        // 1. 类型匹配：候选模块类型与需求类型相同
        if (reqType && candType && reqType === candType) {
          isMatch = true;
        }
        
        // 2. 分类匹配：候选模块分类与需求分类有交集
        if (!isMatch && reqCategories.length > 0 && candCategories.length > 0) {
          isMatch = reqCategories.some(cat => candCategories.includes(cat));
        }
        
        // 3. 名称匹配：候选模块名称与需求名称相同
        if (!isMatch && reqName && candidate.name === reqName) {
          isMatch = true;
        }
        
        // 4. 如果需求没有明确的类型/分类/名称，则根据模块属性匹配
        if (!isMatch && !reqType && reqCategories.length === 0 && !reqName) {
          // 检查候选模块是否满足需求的属性约束
          const reqProps = requirement.properties || {};
          const candProps = candidate.properties || {};
          
          // 如果需求有属性约束，检查候选是否满足
          if (Object.keys(reqProps).length > 0) {
            isMatch = this.checkPropertiesMatch(candProps, reqProps);
          } else {
            // 没有属性约束，默认匹配
            isMatch = true;
          }
        }
        
        if (isMatch) {
          matchedCandidates.push(candidate);
        }
      });
      
      matches.push({
        requirement: requirement,
        matchedCandidates: matchedCandidates
      });
    });
    
    return matches;
  }

  /**
   * 检查候选模块属性是否满足需求属性约束
   * @param {Object} candProps - 候选模块属性
   * @param {Object} reqProps - 需求属性约束
   * @returns {boolean} 是否满足
   */
  checkPropertiesMatch(candProps, reqProps) {
    // 成本：候选成本应小于等于需求成本
    const reqCost = reqProps.cost_min || reqProps.cost || reqProps.cost_max || 0;
    const candCost = candProps.cost_min || candProps.cost || candProps.cost_max || 0;
    if (reqCost > 0 && candCost > reqCost) {
      return false;
    }
    
    // 重量：候选重量应小于等于需求重量
    const reqWeight = reqProps.weight_min || reqProps.weight || reqProps.weight_max || 0;
    const candWeight = candProps.weight_min || candProps.weight || candProps.weight_max || 0;
    if (reqWeight > 0 && candWeight > reqWeight) {
      return false;
    }
    
    // 功耗：候选功耗应小于等于需求功耗
    const reqPower = reqProps.power_min || reqProps.power || reqProps.power_max || 0;
    const candPower = candProps.power_min || candProps.power || candProps.power_max || 0;
    if (reqPower > 0 && candPower > reqPower) {
      return false;
    }
    
    // 可靠度：候选可靠度应大于等于需求可靠度
    const reqReliability = reqProps.reliability_min || reqProps.reliability || reqProps.reliability_max || 0;
    const candReliability = candProps.reliability_min || candProps.reliability || candProps.reliability_max || 0;
    if (reqReliability > 0 && candReliability < reqReliability) {
      return false;
    }
    
    return true;
  }

  /**
   * 【修复】根据子模块需求匹配候选模块（使用映射结构）
   * 优先使用叶子模块到候选实例的映射来获取匹配的候选模块
   * @param {Array} requirements - 子模块需求数组
   * @param {Array} candidates - 候选模块数组（备用）
   * @param {Map} leafToCandidatesMap - 叶子模块名称到候选实例数组的映射
   * @returns {Array} 匹配结果数组，每项包含 {requirement, matchedCandidates}
   */
  matchCandidatesToRequirementsWithMap(requirements, candidates, leafToCandidatesMap) {
    const matches = [];
    
    requirements.forEach(requirement => {
      let matchedCandidates = [];
      
      // 获取需求的类型和分类信息
      const reqType = requirement.type || '';
      const reqCategories = requirement.categories || [];
      const reqName = requirement.name || '';
      
      console.log(`匹配需求: 名称="${reqName}", 类型="${reqType}", 分类=[${reqCategories.join(', ')}]`);
      
      // 【修复】优先从映射中获取候选模块
      if (leafToCandidatesMap && leafToCandidatesMap.size > 0) {
        // 尝试通过需求名称从映射中获取
        if (reqName && leafToCandidatesMap.has(reqName)) {
          matchedCandidates = [...leafToCandidatesMap.get(reqName)];
          console.log(`需求 "${reqName}" 从映射中获取到 ${matchedCandidates.length} 个候选`);
        } else {
          // 【修复】尝试通过分类精确匹配映射中的叶子模块
          // 优先使用分类匹配，因为分类更精确（如"控制器" vs "作动器"）
          if (reqCategories.length > 0) {
            leafToCandidatesMap.forEach((cands, leafName) => {
              // 检查候选模块的分类是否与需求的分类完全匹配
              const relevantCandidates = cands.filter(candidate => {
                const candCategories = candidate.categories || [];
                // 【修复】分类必须完全匹配（需求的分类是候选分类的子集）
                return reqCategories.every(cat => candCategories.includes(cat));
              });
              
              if (relevantCandidates.length > 0) {
                matchedCandidates.push(...relevantCandidates);
                console.log(`  从叶子模块 "${leafName}" 获取到 ${relevantCandidates.length} 个分类匹配的候选`);
              }
            });
          }
          
          // 如果分类匹配没有结果，再尝试类型匹配
          if (matchedCandidates.length === 0 && reqType) {
            leafToCandidatesMap.forEach((cands, leafName) => {
              const relevantCandidates = cands.filter(candidate => {
                const candType = candidate.module_type || candidate.moduleType || '';
                return reqType === candType;
              });
              
              if (relevantCandidates.length > 0) {
                matchedCandidates.push(...relevantCandidates);
                console.log(`  从叶子模块 "${leafName}" 获取到 ${relevantCandidates.length} 个类型匹配的候选`);
              }
            });
          }
          
          // 去重
          const seen = new Set();
          matchedCandidates = matchedCandidates.filter(c => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
          });
        }
      }
      
      // 如果映射中没有找到，回退到原有逻辑
      if (matchedCandidates.length === 0 && candidates && candidates.length > 0) {
        console.log(`需求 "${reqName || reqType}" 从映射中未找到候选，使用原有匹配逻辑`);
        candidates.forEach(candidate => {
          const candType = candidate.module_type || candidate.moduleType || '';
          const candCategories = candidate.categories || [];
          
          let isMatch = false;
          
          // 【修复】优先进行分类精确匹配
          if (reqCategories.length > 0 && candCategories.length > 0) {
            // 需求的分类必须完全匹配候选的分类
            isMatch = reqCategories.every(cat => candCategories.includes(cat));
          }
          
          // 2. 如果分类匹配失败，再尝试类型匹配
          if (!isMatch && reqType && candType && reqType === candType) {
            isMatch = true;
          }
          
          // 3. 名称匹配
          if (!isMatch && reqName && candidate.name === reqName) {
            isMatch = true;
          }
          
          // 4. 属性匹配
          if (!isMatch && !reqType && reqCategories.length === 0 && !reqName) {
            const reqProps = requirement.properties || {};
            const candProps = candidate.properties || {};
            if (Object.keys(reqProps).length > 0) {
              isMatch = this.checkPropertiesMatch(candProps, reqProps);
            } else {
              isMatch = true;
            }
          }
          
          if (isMatch) {
            matchedCandidates.push(candidate);
          }
        });
      }
      
      matches.push({
        requirement: requirement,
        matchedCandidates: matchedCandidates
      });
    });
    
    return matches;
  }

  /**
   * 【修复】根据子模块需求生成组合（使用映射结构确保类型对应）
   * 确保每个叶子模块需求都有对应类型的实例
   * @param {Array} requirementMatches - 需求匹配结果数组
   * @returns {Array} 组合数组，每个组合是一个模块数组
   */
  generateCombinationsByRequirementsWithMapping(requirementMatches) {
    // 使用笛卡尔积生成所有可能的组合
    // 每个需求对应一个候选模块集合，需要从中选择指定数量的模块
    
    const generateForRequirement = (requirement, candidates) => {
      const quantity = requirement.quantity || 1;
      const result = [];
      
      // 从 candidates 中选择 quantity 个模块的组合
      const selectN = (arr, n) => {
        if (n === 0) return [[]];
        if (arr.length < n) return [];
        if (arr.length === n) return [arr];
        
        const result = [];
        const first = arr[0];
        const rest = arr.slice(1);
        
        // 包含第一个元素
        const withFirst = selectN(rest, n - 1);
        withFirst.forEach(combo => {
          result.push([first, ...combo]);
        });
        
        // 不包含第一个元素
        const withoutFirst = selectN(rest, n);
        result.push(...withoutFirst);
        
        return result;
      };
      
      return selectN(candidates, quantity);
    };
    
    // 递归生成笛卡尔积
    const cartesian = (arrays) => {
      if (arrays.length === 0) return [[]];
      if (arrays.length === 1) return arrays[0].map(item => [item]);
      
      const [first, ...rest] = arrays;
      const restCartesian = cartesian(rest);
      
      const result = [];
      first.forEach(item => {
        restCartesian.forEach(restCombo => {
          result.push([item, ...restCombo]);
        });
      });
      
      return result;
    };
    
    // 【修复】为每个需求生成选择组合，并记录需求信息
    const selectionsPerRequirement = requirementMatches.map(match => {
      const selections = generateForRequirement(match.requirement, match.matchedCandidates);
      // 【修复】为每个选择添加需求标记，用于验证
      return selections.map(selection => ({
        modules: selection,
        requirement: match.requirement
      }));
    });
    
    // 检查是否有需求没有可用的选择
    if (selectionsPerRequirement.some(s => s.length === 0)) {
      console.log('存在没有候选的需求，无法生成组合');
      return [];
    }
    
    // 【优化】限制笛卡尔积的总组合数量，避免组合爆炸
    // 计算理论最大组合数
    const maxCombinations = Math.min(10000, Math.max(100, requirementMatches.length * 10));
    
    // 【优化】生成笛卡尔积时添加提前退出机制
    const generateCartesianWithValidation = (selectionArrays, limit) => {
      if (selectionArrays.length === 0) return [[]];
      if (selectionArrays.length === 1) {
        return selectionArrays[0].slice(0, limit).map(item => [item]);
      }
      
      const [first, ...rest] = selectionArrays;
      const restCartesian = generateCartesianWithValidation(rest, limit);
      
      const result = [];
      for (const item of first) {
        if (result.length >= limit) break;
        for (const restCombo of restCartesian) {
          if (result.length >= limit) break;
          result.push([item, ...restCombo]);
        }
      }
      
      return result;
    };
    
    const allCombinations = generateCartesianWithValidation(selectionsPerRequirement, maxCombinations);
    
    // 【修复】展平每个组合，并验证每个需求都有对应的模块
    return allCombinations.map(combo => {
      const flatModules = [];
      combo.forEach(item => {
        flatModules.push(...item.modules);
      });
      return flatModules;
    }).filter(combo => {
      // 【修复】验证组合中每个需求类型都有对应的模块
      let valid = true;
      requirementMatches.forEach(match => {
        const reqType = match.requirement.type || '';
        const reqCategories = match.requirement.categories || [];
        const reqName = match.requirement.name || '';
        
        const hasMatchingModule = combo.some(module => {
          const modType = module.module_type || module.moduleType || '';
          const modCategories = module.categories || [];
          
          if (reqType && modType && reqType === modType) return true;
          if (reqCategories.length > 0 && modCategories.length > 0) {
            if (reqCategories.some(cat => modCategories.includes(cat))) return true;
          }
          if (reqName && module.name === reqName) return true;
          
          return false;
        });
        
        if (!hasMatchingModule && match.matchedCandidates.length > 0) {
          console.log(`组合验证失败: 需求 "${reqName || reqType}" 没有对应的模块`);
          valid = false;
        }
      });
      
      return valid;
    });
  }

  /**
   * 根据子模块需求生成组合
   * 每个需求需要选择指定数量的模块实例
   * @param {Array} requirementMatches - 需求匹配结果数组
   * @returns {Array} 组合数组，每个组合是一个模块数组
   */
  generateCombinationsByRequirements(requirementMatches) {
    // 使用笛卡尔积生成所有可能的组合
    // 每个需求对应一个候选模块集合，需要从中选择指定数量的模块
    
    const generateForRequirement = (requirement, candidates) => {
      const quantity = requirement.quantity || 1;
      const result = [];
      
      // 从 candidates 中选择 quantity 个模块的组合
      const selectN = (arr, n) => {
        if (n === 0) return [[]];
        if (arr.length < n) return [];
        if (arr.length === n) return [arr];
        
        const result = [];
        const first = arr[0];
        const rest = arr.slice(1);
        
        // 包含第一个元素
        const withFirst = selectN(rest, n - 1);
        withFirst.forEach(combo => {
          result.push([first, ...combo]);
        });
        
        // 不包含第一个元素
        const withoutFirst = selectN(rest, n);
        result.push(...withoutFirst);
        
        return result;
      };
      
      return selectN(candidates, quantity);
    };
    
    // 【优化】限制笛卡尔积的总组合数量，避免组合爆炸
    const maxCombinations = Math.min(10000, Math.max(100, requirementMatches.length * 10));
    
    // 递归生成笛卡尔积（带限制）
    const cartesian = (arrays, limit) => {
      if (arrays.length === 0) return [[]];
      if (arrays.length === 1) return arrays[0].slice(0, limit).map(item => [item]);
      
      const [first, ...rest] = arrays;
      const restCartesian = cartesian(rest, limit);
      
      const result = [];
      for (const item of first) {
        if (result.length >= limit) break;
        for (const restCombo of restCartesian) {
          if (result.length >= limit) break;
          result.push([item, ...restCombo]);
        }
      }
      
      return result;
    };
    
    // 为每个需求生成选择组合
    const selectionsPerRequirement = requirementMatches.map(match => {
      return generateForRequirement(match.requirement, match.matchedCandidates);
    });
    
    // 检查是否有需求没有可用的选择
    if (selectionsPerRequirement.some(s => s.length === 0)) {
      return [];
    }
    
    // 生成笛卡尔积并展平（带限制）
    const allCombinations = cartesian(selectionsPerRequirement, maxCombinations);
    
    // 展平每个组合（将嵌套的模块数组展平为单个模块数组）
    return allCombinations.map(combo => combo.flat());
  }

  /**
   * 按分类对模块进行分组
   * @param {Array} modules - 模块数组
   * @returns {Object} 按分类分组的模块对象
   */
  groupModulesByCategory(modules) {
    const groups = {};
    
    modules.forEach(module => {
      // 获取模块分类（优先使用categories数组，其次使用module_type）
      let categories = module.categories || [];
      if (categories.length === 0 && module.module_type) {
        categories = [module.module_type];
      }
      if (categories.length === 0 && module.moduleType) {
        categories = [module.moduleType];
      }
      
      // 按分类分组
      categories.forEach(cat => {
        if (!groups[cat]) {
          groups[cat] = [];
        }
        groups[cat].push(module);
      });
    });
    
    return groups;
  }

  /**
   * 生成包含指定数量模块的组合
   * @param {Array} candidates - 候选模块数组
   * @param {number} maxCount - 最大组合大小
   * @returns {Array} 组合数组
   */
  generateCombinationsWithQuantity(candidates, maxCount) {
    const combinations = [];
    const n = candidates.length;
    
    // 生成所有非空子集，大小从1到maxCount
    for (let size = 1; size <= maxCount && size <= n; size++) {
      // 使用递归生成组合
      const generate = (start, current) => {
        if (current.length === size) {
          combinations.push([...current]);
          return;
        }
        for (let i = start; i < n; i++) {
          current.push(candidates[i]);
          generate(i + 1, current);
          current.pop();
        }
      };
      generate(0, []);
    }
    
    return combinations;
  }

  /**
   * 验证连接方案是否满足约束条件
   * @param {Object} solution - 解决方案
   * @param {Object} constraints - 约束条件
   * @returns {boolean} 是否满足约束
   */
  validateConnections(solution, constraints) {
    const connections = solution.connections || [];
    
    // 【修复】放宽连接验证约束：
    // 1. 如果没有显式的连接约束条件，则允许任何连接状态（包括无连接）
    // 2. 只有当存在显式连接约束时，才验证连接是否满足约束
    
    // 检查连接约束（如果有约束条件）
    if (constraints && constraints.connectionConstraints && constraints.connectionConstraints.length > 0) {
      for (const constraint of constraints.connectionConstraints) {
        if (!this.checkConnectionConstraint(solution, constraint)) {
          return false;
        }
      }
    }
    
    // 【修复】没有显式连接约束时，直接返回 true
    // 允许方案在没有连接的情况下也能通过验证
    // 连接生成是基于接口匹配的，如果没有匹配的接口对，则不生成连接
    return true;
  }

  /**
   * 检查单个连接约束
   * @param {Object} solution - 解决方案
   * @param {Object} constraint - 连接约束
   * @returns {boolean} 是否满足约束
   */
  checkConnectionConstraint(solution, constraint) {
    const connections = solution.connections || [];
    
    // 检查绑定约束：指定的模块对必须连接
    if (constraint.type === '绑定' || constraint.type === 'binding') {
      const source = constraint.source || constraint.module1;
      const target = constraint.target || constraint.module2;
      
      const hasConnection = connections.some(conn =>
        (conn.source === source && conn.target === target) ||
        (conn.source === target && conn.target === source)
      );
      
      if (!hasConnection) {
        console.log(`绑定约束不满足: ${source} - ${target}`);
        return false;
      }
    }
    
    // 检查互斥约束：指定的模块对不能连接
    if (constraint.type === '互斥' || constraint.type === 'exclusion') {
      const source = constraint.source || constraint.module1;
      const target = constraint.target || constraint.module2;
      
      const hasConnection = connections.some(conn =>
        (conn.source === source && conn.target === target) ||
        (conn.source === target && conn.target === source)
      );
      
      if (hasConnection) {
        console.log(`互斥约束不满足: ${source} - ${target}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * 提取根模块的需求（属性要求）
   * 根据用户要求，根模块参数仅用作对所有架构方案的参数进行约束筛选的条件
   * 根模块节点不需要匹配产品库中的模块进行实例化
   * @param {Object} rootModule - 根模块
   * @returns {Object} 需求对象
   */
  extractRootRequirements(rootModule) {
    const props = rootModule.properties || {};
    // 支持多种属性命名方式：cost_min, cost, cost_max
    const cost = props.cost_min || props.cost || props.cost_max || 0;
    const weight = props.weight_min || props.weight || props.weight_max || 0;
    const power = props.power_min || props.power || props.power_max || 0;
    const reliability = props.reliability_min || props.reliability || props.reliability_max || 0;
    
    const requirements = {
      cost: cost,
      weight: weight,
      power: power,
      reliability: reliability,
      // 根模块不需要匹配产品库中的模块类型和分类，这些字段留空
      moduleType: '',
      categories: []
    };
    
    console.log(`根模块 ${rootModule.name} 参数提取（仅用于整体方案约束）:`, { cost, weight, power, reliability });
    return requirements;
  }

  /**
   * 根据需求筛选候选模块
   * 根据用户要求，根模块参数仅用于整体方案约束，不用于筛选候选模块
   * 叶子模块参数用于从产品库匹配模块实例，但此函数暂时返回所有候选模块
   * 后续需要根据叶子模块需求进行筛选
   * @param {Array} candidates - 候选模块
   * @param {Object} requirements - 需求对象（根模块需求，仅用于日志）
   * @returns {Array} 筛选后的候选模块
   */
  filterCandidatesByRequirements(candidates, requirements) {
    // 根模块不需要匹配产品库中的模块，因此不进行筛选
    // 直接返回所有候选模块，由后续的组合总属性检查进行约束
    console.log(`根模块需求仅用于整体方案约束，不筛选候选模块。候选模块数量: ${candidates.length}`);
    return candidates;
  }

  /**
   * 【新增】生成所有可能的连接方案组合
   * 根据接口匹配规则，生成多种不同的连接组合，而不是只生成一种全覆盖连接
   * 这样不同方案的连接数量可以不同
   * @param {Object} solution - 解决方案
   * @param {Object} constraints - 约束条件
   * @param {number} maxSchemes - 最大连接方案数量限制
   * @returns {Array} 连接方案数组，每个方案是一个连接数组
   */
  generateAllPossibleConnectionSchemes(solution, constraints, maxSchemes = 10000) {
    const allSchemes = [];
    const leafModules = solution.leafModules;
    
    if (!leafModules || leafModules.length === 0) {
      console.log('没有叶子模块，无法生成连接方案');
      return [[]]; // 返回空连接方案
    }
    
    console.log(`开始生成所有可能的连接方案，共 ${leafModules.length} 个叶子模块`);
    
    // 【步骤1】收集所有可能的有效连接（候选连接列表）
    const candidateConnections = this.collectCandidateConnections(leafModules);
    
    if (candidateConnections.length === 0) {
      console.log('没有匹配的接口，无法生成连接');
      return [[]];
    }
    
    console.log(`收集到 ${candidateConnections.length} 个候选连接，详情:`);
    candidateConnections.forEach((conn, idx) => {
      console.log(`  候选连接${idx}: ${conn.source} -> ${conn.target} (${conn.type || conn.interface_type})`);
    });
    
    // 【步骤2】检查绑定约束（必须存在的连接）
    const bindingConstraints = this.extractBindingConstraints(constraints);
    console.log(`绑定约束数量: ${bindingConstraints.length}, 详情:`, bindingConstraints.map(c => `${c.source || c.module1} - ${c.target || c.module2}`));
    
    // 【修复】传递leafModules用于分类匹配
    const mandatoryConnections = this.filterMandatoryConnections(candidateConnections, bindingConstraints, leafModules);
    
    // 【步骤3】检查互斥约束（不能同时存在的连接对）
    const exclusionConstraints = this.extractExclusionConstraints(constraints);
    
    // 【步骤4】生成连接子集组合
    // 从候选连接中选择不同的子集，形成不同的连接方案
    const schemes = this.generateConnectionSubsets(
      candidateConnections,
      mandatoryConnections,
      exclusionConstraints,
      bindingConstraints,
      maxSchemes,
      leafModules
    );
    
    console.log(`生成了 ${schemes.length} 种不同的连接方案组合`);
    return schemes;
  }
  
  /**
   * 收集所有可能的有效候选连接
   * @param {Array} leafModules - 叶子模块数组
   * @returns {Array} 候选连接数组
   */
  collectCandidateConnections(leafModules) {
    const candidateConnections = [];
    
    // 收集所有输出接口和输入接口
    const allOutputInterfaces = new Map(); // 接口类型 -> [{module, interface}]
    const allInputInterfaces = new Map();  // 接口类型 -> [{module, interface}]
    
    leafModules.forEach(leafModuleInfo => {
      const module = leafModuleInfo.module;
      if (!module) {
        console.log('跳过无效模块');
        return;
      }
      
      console.log(`处理模块: name="${module.name}", categories=${JSON.stringify(module.categories)}`);
      
      const interfaces = module.interfaces || [];
      interfaces.forEach(intf => {
        const ioType = (intf.io_type || intf.direction || '').toLowerCase();
        const isOutput = ioType === 'output' || ioType === 'out';
        const isInput = ioType === 'input' || ioType === 'in';
        const intfType = intf.type || '';
        
        console.log(`  接口: name="${intf.name}", type="${intfType}", io="${ioType}"`);
        
        if (!intfType) return;
        
        if (isOutput) {
          if (!allOutputInterfaces.has(intfType)) {
            allOutputInterfaces.set(intfType, []);
          }
          allOutputInterfaces.get(intfType).push({ module, interface: intf });
        } else if (isInput) {
          if (!allInputInterfaces.has(intfType)) {
            allInputInterfaces.set(intfType, []);
          }
          allInputInterfaces.get(intfType).push({ module, interface: intf });
        }
      });
    });
    
    // 为每对匹配的输出-输入接口创建候选连接
    allOutputInterfaces.forEach((outputInterfaces, intfType) => {
      const inputInterfaces = allInputInterfaces.get(intfType) || [];
      
      outputInterfaces.forEach(outputInfo => {
        inputInterfaces.forEach(inputInfo => {
          // 跳过自连接
              if (outputInfo.module.name === inputInfo.module.name) return;
              
              // 【修复】同时包含模块名称、模块ID和模块分类，方便约束匹配
              candidateConnections.push({
                source: outputInfo.module.name,
                target: inputInfo.module.name,
                source_module_id: outputInfo.module.id,
                target_module_id: inputInfo.module.id,
                // 【重要】添加模块分类信息，用于约束匹配
                source_categories: outputInfo.module.categories || [],
                target_categories: inputInfo.module.categories || [],
                sourceIntf: outputInfo.interface.name,
                targetIntf: inputInfo.interface.name,
                source_interface_name: outputInfo.interface.name,
                target_interface_name: inputInfo.interface.name,
                type: intfType,
                interface_type: intfType,
                sourceType: outputInfo.interface.type,
                targetType: inputInfo.interface.type,
                key: `${outputInfo.module.name}|${outputInfo.interface.name}|${inputInfo.module.name}|${inputInfo.interface.name}`
              });
        });
      });
    });
    
    return candidateConnections;
  }
  
  /**
   * 提取绑定约束（必须存在的连接）
   * 【修复】支持前端直接发送的约束数组格式
   * @param {Object|Array} constraints - 约束条件
   * @returns {Array} 绑定约束数组
   */
  extractBindingConstraints(constraints) {
    const bindingConstraints = [];
    if (!constraints) return bindingConstraints;
    
    // 【修复】支持多种约束格式
    let constraintList = [];
    
    // 格式1: 数组格式 - 前端直接发送的格式 [{id, type: 'connection', relation_type: '绑定', module1, module2}]
    if (Array.isArray(constraints)) {
      constraintList = constraints;
    }
    // 格式2: 对象格式 - 包含 connectionConstraints 属性
    else if (constraints.connectionConstraints) {
      constraintList = constraints.connectionConstraints;
    }
    // 格式3: 对象格式 - 包含 connection 属性
    else if (constraints.connection && Array.isArray(constraints.connection)) {
      constraintList = constraints.connection;
    }
    
    // 提取绑定类型约束
    constraintList.forEach(c => {
      // 检查 relation_type 或 type 字段
      const relationType = c.relation_type || c.type || '';
      const isBinding = relationType === '绑定' || relationType === 'binding' ||
                        relationType === 'Binding' || c.constraint_type === 'binding';
      
      if (isBinding) {
        const source = c.module1 || c.source;
        const target = c.module2 || c.target;
        console.log(`提取绑定约束: source="${source}", target="${target}"`);
        bindingConstraints.push({
          ...c,
          source: source,
          target: target,
          // 存储原始约束类型，供后续匹配使用
          constraintType: 'category' // 标识这是分类级别的约束
        });
      }
    });
    
    console.log(`提取到 ${bindingConstraints.length} 个绑定约束`);
    return bindingConstraints;
  }
  
  /**
   * 提取互斥约束（不能同时存在的连接）
   * 【修复】支持前端直接发送的约束数组格式
   * @param {Object|Array} constraints - 约束条件
   * @returns {Array} 互斥约束数组
   */
  extractExclusionConstraints(constraints) {
    const exclusionConstraints = [];
    if (!constraints) return exclusionConstraints;
    
    // 【修复】支持多种约束格式
    let constraintList = [];
    
    if (Array.isArray(constraints)) {
      constraintList = constraints;
    } else if (constraints.connectionConstraints) {
      constraintList = constraints.connectionConstraints;
    } else if (constraints.connection && Array.isArray(constraints.connection)) {
      constraintList = constraints.connection;
    }
    
    // 提取互斥类型约束
    constraintList.forEach(c => {
      const relationType = c.relation_type || c.type || '';
      const isExclusion = relationType === '互斥' || relationType === 'exclusion' ||
                          relationType === 'Exclusion' || c.constraint_type === 'exclusion';
      
      if (isExclusion) {
        exclusionConstraints.push({
          ...c,
          source: c.module1 || c.source,
          target: c.module2 || c.target
        });
      }
    });
    
    console.log(`提取到 ${exclusionConstraints.length} 个互斥约束`);
    return exclusionConstraints;
  }
  
  /**
   * 筛选必须存在的连接（基于绑定约束）
   * 【修复】支持通过模块分类名匹配连接（如"作动器"和"控制器"）
   * @param {Array} candidates - 候选连接数组
   * @param {Array} bindingConstraints - 绑定约束数组
   * @param {Array} leafModules - 叶子模块数组（可选，用于分类匹配）
   * @returns {Array} 必须存在的连接数组
   */
  filterMandatoryConnections(candidates, bindingConstraints, leafModules = null) {
    const mandatory = [];
    
    // 【新增】构建模块名到分类的映射（用于分类匹配）
    const moduleToCategories = new Map();
    if (leafModules && Array.isArray(leafModules)) {
      leafModules.forEach(lm => {
        const module = lm.module || lm;
        if (module && module.name) {
          const categories = module.categories || [];
          moduleToCategories.set(module.name, categories);
        }
      });
    }
    
    bindingConstraints.forEach(constraint => {
      const constraintSource = constraint.source || constraint.module1;
      const constraintTarget = constraint.target || constraint.module2;
      
      if (!constraintSource || !constraintTarget) {
        console.log(`绑定约束缺少模块信息: ${JSON.stringify(constraint)}`);
        return;
      }
      
      // 【重要修改】绑定约束不强制要求特定连接，只需要确保类型间有连接
      // 筛选出所有可能的匹配连接，供连接子集生成使用
      const matchingConns = candidates.filter(c => {
        const connSource = c.source;
        const connTarget = c.target;
        
        // 获取连接两端模块的分类
        const sourceCategories = moduleToCategories.get(connSource) || [];
        const targetCategories = moduleToCategories.get(connTarget) || [];
        
        // 匹配方式1：精确名称匹配
        const exactMatch = (connSource === constraintSource && connTarget === constraintTarget) ||
                          (connSource === constraintTarget && connTarget === constraintSource);
        
        // 匹配方式2：分类匹配（约束中的source是分类名）
        const categoryMatch1 = sourceCategories.includes(constraintSource) &&
                               targetCategories.includes(constraintTarget);
        const categoryMatch2 = sourceCategories.includes(constraintTarget) &&
                               targetCategories.includes(constraintSource);
        
        // 匹配方式3：模块名包含分类名匹配
        const nameMatch1 = connSource.includes(constraintSource) && connTarget.includes(constraintTarget);
        const nameMatch2 = connSource.includes(constraintTarget) && connTarget.includes(constraintSource);
        
        return exactMatch || categoryMatch1 || categoryMatch2 || nameMatch1 || nameMatch2;
      });
      
      // 【重要修改】不再强制添加所有匹配连接，而是允许连接子集算法选择
      // 绑定约束的验证在 satisfiesBindingConstraints 中完成
      if (matchingConns.length > 0) {
        console.log(`绑定约束 ${constraintSource} - ${constraintTarget} 有 ${matchingConns.length} 个候选连接`);
      } else {
        console.log(`绑定约束 ${constraintSource} - ${constraintTarget} 无可用连接，可能导致无效方案`);
      }
    });
    
    console.log(`绑定约束处理完成（共${bindingConstraints.length}个约束），返回空必须连接数组，由验证阶段检查约束 satisfaction`);
    return mandatory;
  }
  
  /**
   * 生成连接子集组合
   * 【核心算法】生成多种不同大小和组合的连接方案
   * @param {Array} candidates - 候选连接数组
   * @param {Array} mandatory - 必须包含的连接
   * @param {Array} exclusions - 互斥约束
   * @param {Array} bindingConstraints - 绑定约束数组
   * @param {number} maxSchemes - 最大方案数量
   * @param {Array} leafModules - 叶子模块数组（用于实例级约束验证）
   * @returns {Array} 连接方案数组
   */
  generateConnectionSubsets(candidates, mandatory, exclusions, bindingConstraints, maxSchemes, leafModules = null) {
    // 【新增】如果候选连接数量较少（<=12），直接生成所有非空子集
    // 这样可以确保所有可能的连接方案都被考虑，不会遗漏任何有效的绑定约束组合
    // 【重要】限制子集生成数量，避免组合爆炸和日志刷屏
    // 12个候选连接最多2^12=4096个子集，需要限制
    if (candidates.length <= 12) {
      // 限制最大子集数量
      const maxSubsets = Math.min(500, Math.pow(2, candidates.length));
      const allSubsets = this.generateAllSubsetsLimited(candidates, maxSubsets);
      
      // 过滤满足约束的方案
      const validSchemes = allSubsets.filter(scheme => {
        if (this.violatesExclusionConstraints(scheme, exclusions)) {
          return false;
        }
        return this.satisfiesBindingConstraints(scheme, bindingConstraints, leafModules);
      });
      
      return validSchemes.slice(0, maxSchemes);
    }
    
    // 【核心改进】候选连接数量超过12时，使用约束导向的定向搜索算法
    // 该算法确保不会遗漏满足约束的有效方案，避免采样随机性问题
    if (bindingConstraints && bindingConstraints.length > 0 && leafModules && leafModules.length > 0) {
      console.log(`候选连接数量(${candidates.length})较多且存在绑定约束，使用约束导向搜索算法`);
      
      // 使用约束导向搜索生成满足所有约束的方案
      const constraintGuidedSchemes = this.constraintGuidedSearch(
        candidates, mandatory, exclusions, bindingConstraints, maxSchemes, leafModules
      );
      
      if (constraintGuidedSchemes.length > 0) {
        console.log(`约束导向搜索生成了 ${constraintGuidedSchemes.length} 个有效方案`);
        return constraintGuidedSchemes;
      }
      
      // 如果约束导向搜索未生成方案，回退到传统采样+验证策略
      console.log('约束导向搜索未能生成方案，回退到传统采样策略');
    }
    
    // 【保留原始采样策略作为补充】当无绑定约束时使用
    const schemes = [];
    const mandatoryKeys = new Set(mandatory.map(m => m.key));
    
    // 排除已经作为必须连接的候选
    const optionalCandidates = candidates.filter(c => !mandatoryKeys.has(c.key));
    
    // 【策略1】生成不同大小的子集
    // 从最小有效连接数到全覆盖
    const minSize = mandatory.length;
    const maxSize = candidates.length;
    
    // 限制组合数量，避免组合爆炸
    const maxSubsetSize = Math.min(optionalCandidates.length, 10);
    
    // 【策略2】优先生成包含所有必须连接的基础方案
    if (mandatory.length > 0) {
      schemes.push([...mandatory]);
    }
    
    // 【策略3】生成不同规模的连接方案
    // 按连接数量分组，每种规模生成若干代表性方案
    
    // 小规模方案：仅必须连接 + 少量可选连接
    // 【修复】如果有绑定约束，空方案无效，必须至少有一个满足约束的连接
    for (let addCount = 0; addCount <= Math.min(3, optionalCandidates.length); addCount++) {
      if (schemes.length >= maxSchemes) break;
      
      if (addCount === 0 && mandatory.length === 0) {
        // 无必须连接时，仅当无绑定约束时空方案才有效
        if (bindingConstraints.length === 0) {
          schemes.push([]);
        }
        // 有绑定约束时，跳过空方案
        continue;
      } else if (addCount === 0 && mandatory.length > 0) {
        // 已添加过纯必须连接的方案
        continue;
      } else {
        // 生成必须连接 + addCount 个可选连接的组合
        const combos = this.selectNFromArray(optionalCandidates, addCount, 5); // 每种规模最多5个方案
        combos.forEach(combo => {
          if (schemes.length >= maxSchemes) return;
          const scheme = [...mandatory, ...combo];
          schemes.push(scheme);
        });
      }
    }
    
    // 中等规模方案：约一半的可选连接
    const halfCount = Math.floor(optionalCandidates.length / 2);
    if (halfCount > 1 && schemes.length < maxSchemes) {
      const combos = this.selectNFromArray(optionalCandidates, halfCount, 3);
      combos.forEach(combo => {
        if (schemes.length >= maxSchemes) return;
        const scheme = [...mandatory, ...combo];
        schemes.push(scheme);
      });
    }
    
    // 大规模方案：大部分可选连接
    for (let addCount = Math.max(halfCount + 1, optionalCandidates.length - 2); addCount <= optionalCandidates.length; addCount++) {
      if (schemes.length >= maxSchemes) break;
      
      const combos = this.selectNFromArray(optionalCandidates, addCount, 3);
      combos.forEach(combo => {
        if (schemes.length >= maxSchemes) return;
        const scheme = [...mandatory, ...combo];
        schemes.push(scheme);
      });
    }
    
    // 全覆盖方案（原算法的行为）
    if (schemes.length < maxSchemes && candidates.length > 0) {
      const fullScheme = [...candidates];
      if (!schemes.some(s => s.length === fullScheme.length)) {
        schemes.push(fullScheme);
      }
    }
    
    // 【策略4】验证互斥和绑定约束，过滤无效方案
    const validSchemes = schemes.filter(scheme => {
      // 检查是否违反互斥约束
      if (this.violatesExclusionConstraints(scheme, exclusions)) {
        return false;
      }
      
      // 【修复】检查是否满足绑定约束（传递leafModules进行实例级验证）
      return this.satisfiesBindingConstraints(scheme, bindingConstraints, leafModules);
    });
    
    console.log(`生成 ${schemes.length} 个初始方案，过滤后剩余 ${validSchemes.length} 个有效方案`);
    return validSchemes;
  }

 /**
  * 分析绑定约束，返回每个约束所需的候选连接及其覆盖信息
  * @param {Array} candidates - 候选连接数组
  * @param {Array} bindingConstraints - 绑定约束数组
  * @param {Array} leafModules - 叶子模块数组
  * @returns {Object} 约束分析结果 { constraint, requiredConnections, uncoveredInstances }
  */
 analyzeBindingConstraints(candidates, bindingConstraints, leafModules = null) {
   const results = [];
   
   if (!bindingConstraints || bindingConstraints.length === 0 || !leafModules || leafModules.length === 0) {
     return results;
   }

   // 构建模块信息映射
   const moduleInfoMap = new Map();
   leafModules.forEach(lm => {
     const module = lm.module || lm;
     const quantity = lm.quantity || module.quantity || 1;
     const categories = module.categories || [];
     moduleInfoMap.set(module.name, { name: module.name, categories, quantity });
     
     // 同时按分类索引
     categories.forEach(cat => {
       if (!moduleInfoMap.has(cat)) {
         moduleInfoMap.set(cat, { name: module.name, categories, quantity, isCategory: true });
       }
     });
   });

   // 分析每个约束
   for (const constraint of bindingConstraints) {
     const constraintSource = constraint.source || constraint.module1;
     const constraintTarget = constraint.target || constraint.module2;
     
     if (!constraintSource || !constraintTarget) continue;

     // 找出匹配的候选连接
     const matchingConns = candidates.filter(c => {
       const connSource = c.source;
       const connTarget = c.target;
       
       // 获取连接两端模块的分类
       const sourceCategories = c.source_categories || [];
       const targetCategories = c.target_categories || [];
       
       // 精确名称匹配
       const exactMatch = (connSource === constraintSource && connTarget === constraintTarget) ||
                         (connSource === constraintTarget && connTarget === constraintSource);
       
       // 分类/类型匹配
       const typeMatch = (sourceCategories.includes(constraintSource) && targetCategories.includes(constraintTarget)) ||
                        (sourceCategories.includes(constraintTarget) && targetCategories.includes(constraintSource));
       
       // 名称包含匹配
       const nameContains = (connSource.includes(constraintSource) && connTarget.includes(constraintTarget)) ||
                           (connSource.includes(constraintTarget) && connTarget.includes(constraintSource));
       
       return exactMatch || typeMatch || nameContains;
     });

     results.push({
       constraint,
       source: constraintSource,
       target: constraintTarget,
       requiredConnections: matchingConns,
       // 计算需要连接的两端实例数
       sourceInstanceCount: this.countMatchingInstances(leafModules, constraintSource),
       targetInstanceCount: this.countMatchingInstances(leafModules, constraintTarget)
     });
   }
   
   return results;
 }

 /**
  * 计算匹配指定约束的实例数量
  */
 countMatchingInstances(leafModules, matchTarget) {
   let count = 0;
   leafModules.forEach(lm => {
     const module = lm.module || lm;
     const quantity = lm.quantity || module.quantity || 1;
     const name = module.name;
     const categories = module.categories || [];
     
     const nameMatch = name === matchTarget;
     const categoryMatch = categories.includes(matchTarget);
     const nameContains = name.includes(matchTarget);
     
     if (nameMatch || categoryMatch || nameContains) {
       count += quantity;
     }
   });
   return count;
 }

 /**
  * 基于约束的定向回溯搜索算法
  * 确保不遗漏任何满足约束的有效方案
  * @param {Array} candidates - 候选连接数组
  * @param {Array} mandatory - 必须包含的连接
  * @param {Array} exclusions - 互斥约束
  * @param {Array} bindingConstraints - 绑定约束数组
  * @param {number} maxSchemes - 最大方案数量
  * @param {Array} leafModules - 叶子模块数组
  * @returns {Array} 满足约束的方案数组
  */
 constraintGuidedSearch(candidates, mandatory, exclusions, bindingConstraints, maxSchemes, leafModules) {
   const schemes = [];
   const mandatoryKeys = new Set(mandatory.map(m => m.key));
   
   // 过滤出必须连接和可选连接
   const mustConnections = [...mandatory];
   const optionalCandidates = candidates.filter(c => !mandatoryKeys.has(c.key));
   
   // 构建约束分析
   const constraintAnalysis = this.analyzeBindingConstraints(candidates, bindingConstraints, leafModules);
   
   // 如果没有绑定约束或分析结果为空，使用全部子集生成
   if (constraintAnalysis.length === 0) {
     console.log('无绑定约束，使用全部子集生成策略');
     const allSubsets = this.generateAllSubsets(optionalCandidates);
     return allSubsets.filter(scheme => {
       const fullScheme = [...mustConnections, ...scheme];
       if (this.violatesExclusionConstraints(fullScheme, exclusions)) {
         return false;
       }
       return this.satisfiesBindingConstraints(fullScheme, bindingConstraints, leafModules);
     }).slice(0, maxSchemes);
   }

   // 检查约束是否可满足
   for (const analysis of constraintAnalysis) {
     if (analysis.requiredConnections.length === 0) {
       console.log(`警告：约束 ${analysis.source} <-> ${analysis.target} 没有可用候选连接`);
     }
   }

   // 使用贪心+回溯策略生成满足约束的方案
   // 策略：优先最小方案，逐步增加连接，直到满足所有约束
   
   // 生成多种不同大小的方案
   const targetSizes = [];
   
   // 1. 最小满足方案：找到满足所有约束的最小连接数
   const minSatisfying = this.findMinimumSatisfyingScheme(
     mustConnections, optionalCandidates, constraintAnalysis, exclusions, bindingConstraints, leafModules
   );
   if (minSatisfying) {
     targetSizes.push(minSatisfying.length);
     schemes.push(minSatisfying);
     console.log(`找到最小满足方案，包含 ${minSatisfying.length} 个连接`);
   }
   
   // 2. 生成不同规模的方案（从最小到全覆盖）
   if (optionalCandidates.length > 0) {
     // 中等规模方案
     const mediumSize = Math.ceil(optionalCandidates.length * 0.5);
     if (!targetSizes.includes(mediumSize) && schemes.length < maxSchemes) {
       const mediumScheme = this.generateSatisfyingSchemeOfSize(
         mustConnections, optionalCandidates, mediumSize, constraintAnalysis, exclusions, bindingConstraints, leafModules
       );
       if (mediumScheme && !schemes.some(s => this.schemeEquals(s, mediumScheme))) {
         schemes.push(mediumScheme);
         targetSizes.push(mediumSize);
       }
     }
     
     // 大规模方案
     const largeSize = optionalCandidates.length;
     if (!targetSizes.includes(largeSize) && schemes.length < maxSchemes) {
       const largeScheme = this.generateSatisfyingSchemeOfSize(
         mustConnections, optionalCandidates, largeSize, constraintAnalysis, exclusions, bindingConstraints, leafModules
       );
       if (largeScheme && !schemes.some(s => this.schemeEquals(s, largeScheme))) {
         schemes.push(largeScheme);
       }
     }
     
     // 额外的小规模变体（如果最小方案较大）
     if (minSatisfying && minSatisfying.length > 3 && schemes.length < maxSchemes) {
       for (let addCount = 1; addCount < Math.min(minSatisfying.length, 4); addCount++) {
         if (schemes.length >= maxSchemes) break;
         const variantSize = mustConnections.length + addCount;
         if (!targetSizes.includes(addCount)) {
           const variant = this.generateSatisfyingSchemeOfSize(
             mustConnections, optionalCandidates, addCount, constraintAnalysis, exclusions, bindingConstraints, leafModules
           );
           if (variant && !schemes.some(s => this.schemeEquals(s, variant))) {
             schemes.push(variant);
             targetSizes.push(addCount);
           }
         }
       }
     }
   }
   
   // 3. 如果方案不足，用回溯补齐
   if (schemes.length < maxSchemes) {
     const additionalSchemes = this.backtrackGenerateSchemes(
       mustConnections, optionalCandidates, constraintAnalysis, exclusions, bindingConstraints, leafModules,
       maxSchemes - schemes.length, targetSizes
     );
     schemes.push(...additionalSchemes);
   }
   
   console.log(`约束导向搜索生成了 ${schemes.length} 个方案`);
   return schemes.slice(0, maxSchemes);
 }

 /**
  * 检查两个方案是否相等
  */
 schemeEquals(s1, s2) {
   if (s1.length !== s2.length) return false;
   const keys1 = new Set(s1.map(c => c.key));
   const keys2 = new Set(s2.map(c => c.key));
   if (keys1.size !== keys2.size) return false;
   for (const key of keys1) {
     if (!keys2.has(key)) return false;
   }
   return true;
 }

 /**
  * 找到满足所有约束的最小方案
  */
 findMinimumSatisfyingScheme(mustConnections, optionalCandidates, constraintAnalysis, exclusions, bindingConstraints, leafModules) {
   // 按覆盖度排序可选连接（优先选择能覆盖更多约束的连接）
   const scoredCandidates = optionalCandidates.map(c => {
     let score = 0;
     for (const analysis of constraintAnalysis) {
       const matches = analysis.requiredConnections.some(rc => rc.key === c.key);
       if (matches) score++;
     }
     return { connection: c, score };
   });
   
   // 按分数降序排序
   scoredCandidates.sort((a, b) => b.score - a.score);
   const sortedOptional = scoredCandidates.map(s => s.connection);
   
   // 贪心尝试：从0开始，逐步增加
   for (let size = 0; size <= sortedOptional.length; size++) {
     if (size === 0) {
       // 只检查必须连接
       if (this.checkSchemeConstraints(mustConnections, constraintAnalysis, exclusions, bindingConstraints, leafModules)) {
         return [...mustConnections];
       }
       continue;
     }
     
     // 生成size大小的组合（使用排序后的候选）
     const combos = this.selectNFromArray(sortedOptional, size, 10);
     for (const combo of combos) {
       const scheme = [...mustConnections, ...combo];
       if (this.checkSchemeConstraints(scheme, constraintAnalysis, exclusions, bindingConstraints, leafModules)) {
         return scheme;
       }
     }
   }
   
   // 如果贪心失败，使用原始候选列表的回溯
   return this.backtrackMinimumScheme(mustConnections, optionalCandidates, constraintAnalysis, exclusions, bindingConstraints, leafModules);
 }

 /**
  * 回溯寻找最小满足方案
  */
 backtrackMinimumScheme(mustConnections, optionalCandidates, constraintAnalysis, exclusions, bindingConstraints, leafModules) {
   const result = { found: false, scheme: null };
   
   const backtrack = (index, current, currentOptional) => {
     if (result.found) return;
     
     // 检查当前方案
     const scheme = [...mustConnections, ...current];
     if (this.checkSchemeConstraints(scheme, constraintAnalysis, exclusions, bindingConstraints, leafModules)) {
       result.found = true;
       result.scheme = scheme;
       return;
     }
     
     // 如果已尝试所有连接或方案已太大，停止
     if (index >= currentOptional.length || current.length > 15) return;
     
     // 尝试添加下一个连接
     const nextCandidate = currentOptional[index];
     
     // 包含该连接
     current.push(nextCandidate);
     backtrack(index + 1, current, currentOptional);
     current.pop();
     
     // 不包含该连接（如果已不是最小则跳过优化）
     if (!result.found) {
       backtrack(index + 1, current, currentOptional);
     }
   };
   
   backtrack(0, [], optionalCandidates);
   return result.scheme;
 }

 /**
  * 生成指定大小的满足约束的方案
  */
 generateSatisfyingSchemeOfSize(mustConnections, optionalCandidates, targetSize, constraintAnalysis, exclusions, bindingConstraints, leafModules) {
   const addCount = targetSize - mustConnections.length;
   if (addCount <= 0) {
     return this.checkSchemeConstraints(mustConnections, constraintAnalysis, exclusions, bindingConstraints, leafModules)
       ? [...mustConnections] : null;
   }
   
   if (addCount > optionalCandidates.length) {
     // 包含所有可选连接
     const scheme = [...mustConnections, ...optionalCandidates];
     if (this.checkSchemeConstraints(scheme, constraintAnalysis, exclusions, bindingConstraints, leafModules)) {
       return scheme;
     }
     return null;
   }
   
   // 尝试找到addCount个连接的组合
   const combos = this.selectNFromArray(optionalCandidates, addCount, 20);
   for (const combo of combos) {
     const scheme = [...mustConnections, ...combo];
     if (this.checkSchemeConstraints(scheme, constraintAnalysis, exclusions, bindingConstraints, leafModules)) {
       return scheme;
     }
   }
   
   // 尝试更多组合
   const moreCombos = this.selectNFromArray(optionalCandidates, addCount, 50);
   for (const combo of moreCombos) {
     const scheme = [...mustConnections, ...combo];
     if (this.checkSchemeConstraints(scheme, constraintAnalysis, exclusions, bindingConstraints, leafModules)) {
       return scheme;
     }
   }
   
   return null;
 }

 /**
  * 回溯生成多个满足约束的方案
  */
 backtrackGenerateSchemes(mustConnections, optionalCandidates, constraintAnalysis, exclusions, bindingConstraints, leafModules, maxToAdd, excludeSizes) {
   const schemes = [];
   const usedCombos = new Set(); // 防止重复
   
   const backtrack = (index, current, coveredSizes) => {
     if (schemes.length >= maxToAdd) return;
     if (index >= optionalCandidates.length) return;
     
     const scheme = [...mustConnections, ...current];
     const size = current.length;
     
     // 生成唯一键
     const comboKey = current.map(c => c.key).sort().join(',');
     if (usedCombos.has(comboKey)) return;
     
     if (!coveredSizes.includes(size) && this.checkSchemeConstraints(scheme, constraintAnalysis, exclusions, bindingConstraints, leafModules)) {
       schemes.push(scheme);
       usedCombos.add(comboKey);
       coveredSizes.push(size);
     }
     
     if (schemes.length >= maxToAdd) return;
     
     // 继续搜索（限制深度避免组合爆炸）
     if (current.length < 8) {
       for (let i = index; i < optionalCandidates.length && schemes.length < maxToAdd; i++) {
         current.push(optionalCandidates[i]);
         backtrack(i + 1, current, coveredSizes);
         current.pop();
       }
     }
   };
   
   backtrack(0, [], []);
   return schemes;
 }

 /**
  * 检查方案是否满足所有约束（使用约束分析结果）
  */
 checkSchemeConstraints(scheme, constraintAnalysis, exclusions, bindingConstraints, leafModules) {
   // 先检查互斥约束
   if (this.violatesExclusionConstraints(scheme, exclusions)) {
     return false;
   }
   
   // 使用标准验证函数
   return this.satisfiesBindingConstraints(scheme, bindingConstraints, leafModules);
 }

 /**
  * 生成所有非空子集（用于候选连接较少时）
  */
 generateAllSubsets(arr) {
   const result = [[]]; // 包含空集
   for (const item of arr) {
     const currentLen = result.length;
     for (let i = 0; i < currentLen; i++) {
       result.push([...result[i], item]);
     }
   }
   return result.filter(subset => subset.length > 0); // 过滤掉空集（可选）
 }
  
  /**
   * 检查连接方案是否满足绑定约束（强化版）
   * 新要求：每个约束中的模块类型的每个实例都必须有至少一条连接
   * 例如：每个作动器必须与控制器有连接，每个作动器必须与电源有连接，每个控制器必须与电源有连接
   * @param {Array} scheme - 连接方案
   * @param {Array} bindingConstraints - 绑定约束数组
   * @param {Array} leafModules - 叶子模块数组 [{module, quantity}, ...]
   * @returns {boolean} 是否满足所有绑定约束
   */
  satisfiesBindingConstraints(scheme, bindingConstraints, leafModules = null) {
    // 如果没有绑定约束，直接返回true
    if (!bindingConstraints || bindingConstraints.length === 0) {
      return true;
    }
    
    // 如果方案为空但有绑定约束，返回false
    if (!scheme || scheme.length === 0) {
      console.log('方案为空，无法满足绑定约束');
      return false;
    }
    
    // 如果没有提供模块信息，回退到原始逻辑（至少有一条连接）
    if (!leafModules || leafModules.length === 0) {
      console.log('警告：未提供模块信息，使用宽松的约束验证（至少一条连接）');
      return this.satisfiesBindingConstraintsLegacy(scheme, bindingConstraints);
    }
    
    // 构建模块名称到分类的映射，以及实例列表（考虑数量）
    const instanceList = [];
    const moduleNameToCategories = new Map();
    
    leafModules.forEach(lm => {
      const module = lm.module || lm;
      const quantity = lm.quantity || module.quantity || 1;
      const categories = module.categories || [];
      moduleNameToCategories.set(module.name, categories);
      
      // 添加多个实例（根据数量）
      for (let i = 0; i < quantity; i++) {
        instanceList.push({
          name: module.name,
          categories: categories,
          // 可以添加唯一标识符，但这里仅使用名称分类
        });
      }
    });
    
    // 根据约束检查每个实例
    for (const constraint of bindingConstraints) {
      const constraintSource = constraint.source || constraint.module1;
      const constraintTarget = constraint.target || constraint.module2;
      
      if (!constraintSource || !constraintTarget) {
        console.log(`绑定约束缺少模块信息: ${JSON.stringify(constraint)}`);
        continue;
      }
      
      // 找出所有匹配源约束的实例
      const sourceInstances = instanceList.filter(inst => {
        const nameMatch = inst.name === constraintSource;
        const categoryMatch = inst.categories.includes(constraintSource);
        const nameContains = inst.name.includes(constraintSource);
        return nameMatch || categoryMatch || nameContains;
      });
      
      // 找出所有匹配目标约束的实例
      const targetInstances = instanceList.filter(inst => {
        const nameMatch = inst.name === constraintTarget;
        const categoryMatch = inst.categories.includes(constraintTarget);
        const nameContains = inst.name.includes(constraintTarget);
        return nameMatch || categoryMatch || nameContains;
      });
      
      // 如果一方没有实例，跳过检查
      if (sourceInstances.length === 0 || targetInstances.length === 0) {
        continue;
      }
      
      // 检查每个源实例是否至少有一个连接到任意目标实例
      for (const sourceInst of sourceInstances) {
        const sourceName = sourceInst.name;
        const sourceCategories = sourceInst.categories;
        
        // 查找与源实例匹配的连接
        const hasConnectionForSource = scheme.some(conn => {
          // 源端匹配
          const sourceMatch = conn.source === sourceName ||
                             (sourceCategories.length > 0 && sourceCategories.some(cat => conn.source.includes(cat))) ||
                             (conn.source_categories && sourceCategories.some(cat => conn.source_categories.includes(cat)));
          
          // 目标端匹配
          const targetMatch = targetInstances.some(targetInst =>
            conn.target === targetInst.name ||
            (targetInst.categories.length > 0 && targetInst.categories.some(cat => conn.target.includes(cat))) ||
            (conn.target_categories && targetInst.categories.some(cat => conn.target_categories.includes(cat)))
          );
          
          return sourceMatch && targetMatch;
        });
        
        if (!hasConnectionForSource) {
          // 只在调试模式下打印详细错误
          // console.log(`约束不满足：源实例 ${sourceName} 没有连接到任何目标实例（类型 ${constraintTarget}）`);
          return false;
        }
      }
      
      // 【修复】同时检查每个目标实例是否至少有一个连接到任意源实例
      for (const targetInst of targetInstances) {
        const targetName = targetInst.name;
        const targetCategories = targetInst.categories;
        
        // 查找与目标实例匹配的连接
        const hasConnectionForTarget = scheme.some(conn => {
          // 目标端匹配
          const targetMatch = conn.target === targetName ||
                             (targetCategories.length > 0 && targetCategories.some(cat => conn.target.includes(cat))) ||
                             (conn.target_categories && targetCategories.some(cat => conn.target_categories.includes(cat)));
          
          // 源端匹配
          const sourceMatch = sourceInstances.some(sourceInst =>
            conn.source === sourceInst.name ||
            (sourceInst.categories.length > 0 && sourceInst.categories.some(cat => conn.source.includes(cat))) ||
            (conn.source_categories && sourceInst.categories.some(cat => conn.source_categories.includes(cat)))
          );
          
          return targetMatch && sourceMatch;
        });
        
        if (!hasConnectionForTarget) {
          // 只在调试模式下打印详细错误
          // console.log(`约束不满足：目标实例 ${targetName} 没有连接到任何源实例（类型 ${constraintSource}）`);
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * 旧的宽松约束验证方法（至少一条连接）
   * 用于向后兼容
   */
  satisfiesBindingConstraintsLegacy(scheme, bindingConstraints) {
    // 如果没有绑定约束，直接返回true
    if (!bindingConstraints || bindingConstraints.length === 0) {
      return true;
    }
    
    // 如果方案为空但有绑定约束，返回false
    if (!scheme || scheme.length === 0) {
      console.log('方案为空，无法满足绑定约束');
      return false;
    }
    
    for (const constraint of bindingConstraints) {
      const constraintSource = constraint.source || constraint.module1;
      const constraintTarget = constraint.target || constraint.module2;
      
      if (!constraintSource || !constraintTarget) {
        console.log(`绑定约束缺少模块信息: ${JSON.stringify(constraint)}`);
        continue;
      }
      
      // 检查方案中是否存在这两个模块类型之间的任意连接
      const hasRequiredConnection = scheme.some(conn => {
        const sourceCategories = conn.source_categories || [];
        const targetCategories = conn.target_categories || [];
        
        // 方式1: 精确名称匹配
        const exactMatch = (conn.source === constraintSource && conn.target === constraintTarget) ||
                          (conn.source === constraintTarget && conn.target === constraintSource);
        
        // 方式2: 分类匹配
        const categoryMatch1 = sourceCategories.includes(constraintSource) &&
                               targetCategories.includes(constraintTarget);
        const categoryMatch2 = sourceCategories.includes(constraintTarget) &&
                               targetCategories.includes(constraintSource);
        
        // 方式3: 模块名包含分类名
        const nameContainMatch1 = conn.source.includes(constraintSource) &&
                                  conn.target.includes(constraintTarget);
        const nameContainMatch2 = conn.source.includes(constraintTarget) &&
                                  conn.target.includes(constraintSource);
        
        const matched = exactMatch || categoryMatch1 || categoryMatch2 ||
                       nameContainMatch1 || nameContainMatch2;
        
        if (matched) {
          console.log(`绑定约束匹配成功: ${constraintSource}-${constraintTarget} 通过连接 ${conn.source} -> ${conn.target}`);
        }
        
        return matched;
      });
      
      if (!hasRequiredConnection) {
        console.log(`绑定约束未满足: ${constraintSource} - ${constraintTarget}`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 检查基于模块分类的连接是否满足约束
   * @param {Array} scheme - 连接方案
   * @param {string} category1 - 分类1或模块名1
   * @param {string} category2 - 分类2或模块名2
   * @returns {boolean} 是否存在满足要求的连接
   */
  checkCategoryBasedConnection(scheme, category1, category2) {
    // 由于当前连接方案中没有模块分类信息，简化处理：
    // 假设约束中的名称就是模块名称或类型名称
    // 如果连接的两端模块名包含约束中的分类名，则认为满足
    
    for (const conn of scheme) {
      const sourceMatches = conn.source.includes(category1) || conn.source.includes(category2);
      const targetMatches = conn.target.includes(category1) || conn.target.includes(category2);
      
      // 如果连接的一端包含category1，另一端包含category2，则满足约束
      if ((conn.source.includes(category1) && conn.target.includes(category2)) ||
          (conn.source.includes(category2) && conn.target.includes(category1))) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 从数组中选择N个元素的多个组合
   * @param {Array} arr - 源数组
   * @param {number} n - 选择数量
   * @param {number} maxCombos - 最大组合数量
   * @returns {Array} 组合数组
   */
  selectNFromArray(arr, n, maxCombos = 5) {
    if (n === 0) return [[]];
    if (n > arr.length) return [];
    if (n === arr.length) return [[...arr]];
    
    const combos = [];
    const generate = (start, current) => {
      if (combos.length >= maxCombos) return;
      if (current.length === n) {
        combos.push([...current]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        generate(i + 1, current);
        current.pop();
        if (combos.length >= maxCombos) break;
      }
    };
    
    generate(0, []);
    return combos;
  }
  
  /**
   * 生成所有子集（幂集）用于小规模候选连接集
   * 【修复】包含空子集，确保空连接方案被生成
   * @param {Array} arr - 候选连接数组
   * @returns {Array} 所有子集的数组（包含空数组）
   */
  generateAllSubsets(arr) {
    if (!arr) return [[]];
    const total = arr.length;
    const subsets = [];
    // 遍历所有掩码（包含全0，即空子集）
    for (let mask = 0; mask < (1 << total); mask++) {
      const subset = [];
      for (let i = 0; i < total; i++) {
        if (mask & (1 << i)) {
          subset.push(arr[i]);
        }
      }
      subsets.push(subset);
    }
    return subsets;
  }

  /**
   * 生成带数量限制的子集
   * 优先生成不同大小的子集，确保多样性
   * @param {Array} arr - 候选连接数组
   * @param {number} maxSubsets - 最大子集数量
   * @returns {Array} 子集数组
   */
  generateAllSubsetsLimited(arr, maxSubsets = 500) {
    if (!arr || arr.length === 0) return [];
    if (arr.length === 1) return [arr];
    
    const subsets = [];
    const n = arr.length;
    
    // 策略：按大小分组生成，优先覆盖不同大小
    // 先从空集开始，逐步增加大小
    for (let size = 0; size <= n && subsets.length < maxSubsets; size++) {
      if (size === 0) {
        subsets.push([]);
        continue;
      }
      
      // 生成size大小的所有组合
      const combos = this.selectNFromArray(arr, size, maxSubsets - subsets.length);
      subsets.push(...combos);
    }
    
    return subsets;
  }
 
  /**
   * 生成所有非空子集（幂集）用于小规模候选连接集
   * @param {Array} arr - 候选连接数组
   * @returns {Array} 所有非空子集的数组
   */
  generateAllNonEmptySubsets(arr) {
    if (!arr || arr.length === 0) return [];
    const total = arr.length;
    const subsets = [];
    // 遍历所有掩码（排除全0）
    for (let mask = 1; mask < (1 << total); mask++) {
      const subset = [];
      for (let i = 0; i < total; i++) {
        if (mask & (1 << i)) {
          subset.push(arr[i]);
        }
      }
      subsets.push(subset);
    }
    return subsets;
  }

  /**
   * 检查方案是否违反互斥约束
   * @param {Array} scheme - 连接方案
   * @param {Array} exclusions - 互斥约束数组
   * @returns {boolean} 是否违反
   */
  violatesExclusionConstraints(scheme, exclusions) {
    for (const exclusion of exclusions) {
      const source = exclusion.source || exclusion.module1;
      const target = exclusion.target || exclusion.module2;
      
      const hasConnection = scheme.some(conn =>
        (conn.source === source && conn.target === target) ||
        (conn.source === target && conn.target === source)
      );
      
      if (hasConnection) {
        return true;
      }
    }
    return false;
  }

  /**
   * 为解决方案生成连接方案（保留原有方法供兼容）
   * 【更新】完善连线规则：
   * 1. 只能从输出接口连接到输入接口（单向连接）
   * 2. 一个输出接口可以连接到多个输入接口
   * 3. 多个输出接口可以连接到同一个输入接口
   * 4. 接口类型必须匹配（电气、信号、数据等）
   * @param {Object} solution - 解决方案
   * @returns {Array} 连接数组
   */
  generateConnectionsForSolution(solution) {
    const connections = [];
    
    // 根模块不参与连接，仅叶子模块之间连接
    const leafModules = solution.leafModules;
    
    if (!leafModules || leafModules.length === 0) {
      console.log('没有叶子模块，无法生成连接');
      return connections;
    }
    
    console.log(`开始生成连接方案，共 ${leafModules.length} 个叶子模块`);
    
    // 【步骤1】收集所有模块的输出接口和输入接口
    // 建立接口类型到接口列表的映射，便于快速匹配
    const allOutputInterfaces = new Map(); // 接口类型 -> [{module, interface}]
    const allInputInterfaces = new Map();  // 接口类型 -> [{module, interface}]
    
    leafModules.forEach(leafModuleInfo => {
      const module = leafModuleInfo.module;
      if (!module) return;
      
      const interfaces = module.interfaces || [];
      interfaces.forEach(intf => {
        // 获取接口方向
        const ioType = (intf.io_type || intf.direction || intf.io_type || '').toLowerCase();
        const isOutput = ioType === 'output' || ioType === 'out';
        const isInput = ioType === 'input' || ioType === 'in';
        
        // 获取接口类型
        const intfType = intf.type || '';
        
        if (!intfType) return; // 没有类型的接口跳过
        
        if (isOutput) {
          // 添加到输出接口映射
          if (!allOutputInterfaces.has(intfType)) {
            allOutputInterfaces.set(intfType, []);
          }
          allOutputInterfaces.get(intfType).push({
            module: module,
            interface: intf
          });
        } else if (isInput) {
          // 添加到输入接口映射
          if (!allInputInterfaces.has(intfType)) {
            allInputInterfaces.set(intfType, []);
          }
          allInputInterfaces.get(intfType).push({
            module: module,
            interface: intf
          });
        }
      });
    });
    
    console.log(`收集到 ${allOutputInterfaces.size} 种类型的输出接口, ${allInputInterfaces.size} 种类型的输入接口`);
    
    // 输出接口统计
    console.log('输出接口统计:');
    allOutputInterfaces.forEach((interfaces, type) => {
      console.log(`  ${type}: ${interfaces.length} 个输出接口`);
    });
    
    // 输入接口统计
    console.log('输入接口统计:');
    allInputInterfaces.forEach((interfaces, type) => {
      console.log(`  ${type}: ${interfaces.length} 个输入接口`);
    });
    
    // 【步骤2】按接口类型进行匹配连接
    // 遍历每种接口类型，将该类型的输出接口连接到输入接口
    const connectedPairs = new Set(); // 记录已连接的模块对，避免重复连接
    
    allOutputInterfaces.forEach((outputInterfaces, intfType) => {
      // 获取相同类型的所有输入接口
      const inputInterfaces = allInputInterfaces.get(intfType) || [];
      
      if (inputInterfaces.length === 0) {
        console.log(`接口类型 "${intfType}" 没有匹配的输入接口`);
        return;
      }
      
      console.log(`处理接口类型 "${intfType}": ${outputInterfaces.length} 个输出, ${inputInterfaces.length} 个输入`);
      
      // 【核心规则】为每个输出接口找到可以连接的输入接口
      // 规则：
      // 1. 输出接口和输入接口不能属于同一个模块（避免自连接）
      // 2. 一个输出接口可以连接到多个输入接口
      // 3. 多个输出接口可以连接到同一个输入接口
      // 4. 相同类型的接口才能连接
      
      outputInterfaces.forEach(outputInfo => {
        const sourceModule = outputInfo.module;
        const outputIntf = outputInfo.interface;
        
        inputInterfaces.forEach(inputInfo => {
          const targetModule = inputInfo.module;
          const inputIntf = inputInfo.interface;
          
          // 检查是否为同一模块（不允许自连接）
          if (sourceModule.name === targetModule.name) {
            return; // 跳过自连接
          }
          
          // 检查是否已经存在相同的连接
          const connectionKey = `${sourceModule.name}|${outputIntf.name}|${targetModule.name}|${inputIntf.name}`;
          if (connectedPairs.has(connectionKey)) {
            return; // 已存在相同连接，跳过
          }
          
          // 创建连接：从输出接口连接到输入接口
          const connection = {
            source: sourceModule.name,
            target: targetModule.name,
            sourceIntf: outputIntf.name,
            targetIntf: inputIntf.name,
            type: intfType,
            interface_type: intfType,
            sourceType: outputIntf.type,
            targetType: inputIntf.type
          };
          
          connections.push(connection);
          connectedPairs.add(connectionKey);
          
          console.log(`生成连接: ${sourceModule.name}[${outputIntf.name}] -> ${targetModule.name}[${inputIntf.name}] (${intfType})`);
        });
      });
    });
    
    console.log(`连接生成完成，共 ${connections.length} 条连接`);
    
    // 【步骤3】验证连接完整性
    // 检查每个接口的连接数量限制
    this.validateConnectionLimits(leafModules, connections);
    
    return connections;
  }

  /**
   * 验证连接是否满足接口的连接数量限制
   * @param {Array} leafModules - 叶子模块数组
   * @param {Array} connections - 连接数组
   */
  validateConnectionLimits(leafModules, connections) {
    // 统计每个接口的连接数量
    const connectionCounts = new Map(); // "模块名|接口名" -> 连接数量
    
    connections.forEach(conn => {
      // 统计源接口（输出接口）的连接数
      const sourceKey = `${conn.source}|${conn.sourceIntf}`;
      const sourceCount = connectionCounts.get(sourceKey) || 0;
      connectionCounts.set(sourceKey, sourceCount + 1);
      
      // 统计目标接口（输入接口）的连接数
      const targetKey = `${conn.target}|${conn.targetIntf}`;
      const targetCount = connectionCounts.get(targetKey) || 0;
      connectionCounts.set(targetKey, targetCount + 1);
    });
    
    // 检查是否超出限制
    let hasViolation = false;
    leafModules.forEach(leafModuleInfo => {
      const module = leafModuleInfo.module;
      if (!module) return;
      
      const interfaces = module.interfaces || [];
      interfaces.forEach(intf => {
        const key = `${module.name}|${intf.name}`;
        const count = connectionCounts.get(key) || 0;
        const maxConn = intf.max_connections || 999;
        
        if (count > maxConn) {
          console.warn(`接口连接数量超限: ${module.name}[${intf.name}] 当前=${count}, 最大=${maxConn}`);
          hasViolation = true;
        }
      });
    });
    
    if (!hasViolation) {
      console.log('所有接口连接数量在限制范围内');
    }
  }

  /**
   * 计算解决方案属性
   * 【修复】功耗单独分析：区分总功耗和非电源模块功耗
   * @param {Object} solution - 解决方案
   * @param {Array} connections - 连接数组
   * @returns {Object} 属性对象
   */
  calculateSolutionProperties(solution, connections) {
    let totalCost = 0;
    let totalWeight = 0;
    let totalPower = 0;
    let totalReliability = 1.0;
    let nonPowerConsumption = 0; // 【新增】非电源模块功耗
    
    solution.leafModules.forEach(leafModuleInfo => {
      const module = leafModuleInfo.module;
      const quantity = leafModuleInfo.quantity || 1;
      const props = module.properties || {};
      
      // 【修复】兼容多种属性命名方式：cost_min/cost, weight_min/weight 等
      const cost = props.cost_min !== undefined ? props.cost_min : (props.cost || 0);
      const weight = props.weight_min !== undefined ? props.weight_min : (props.weight || 0);
      const power = props.power_min !== undefined ? props.power_min : (props.power || 0);
      const reliability = props.reliability_min !== undefined ? props.reliability_min : (props.reliability || 1.0);
      
      totalCost += cost * quantity;
      totalWeight += weight * quantity;
      totalPower += power * quantity;
      totalReliability *= Math.pow(reliability, quantity);
      
      // 【新增】计算非电源模块功耗
      const isPowerModule = this.isPowerModule(module);
      if (!isPowerModule) {
        nonPowerConsumption += power * quantity;
      }
    });
    
    return {
      totalCost,
      totalWeight,
      totalPower,
      totalReliability,
      nonPowerConsumption, // 【新增】非电源模块功耗
      totalConnections: connections.length,
      leafModuleCount: solution.leafModules.length
    };
  }

  /**
   * 【新增】评估解决方案基本可行性（不含连接约束验证）
   * 用于预筛选模块组合，减少不必要的连接方案生成
   * @param {Object} solution - 解决方案
   * @param {Object} constraints - 约束条件
   * @returns {boolean} 是否基本可行
   */
  evaluateBasicFeasibility(solution, constraints) {
    const properties = solution.properties;
    const rootModule = solution.rootModule;
    const rootProps = rootModule.properties || {};
    
    // 兼容多种属性命名方式
    const rootCost = rootProps.cost_min !== undefined ? rootProps.cost_min : (rootProps.cost || 0);
    const rootWeight = rootProps.weight_min !== undefined ? rootProps.weight_min : (rootProps.weight || 0);
    const rootPower = rootProps.power_min !== undefined ? rootProps.power_min : (rootProps.power || 0);
    const rootReliability = rootProps.reliability_min !== undefined ? rootProps.reliability_min : (rootProps.reliability || 0);
    
    // 1. 成本对比
    if (rootCost > 0 && properties.totalCost >= rootCost) {
      return false;
    }
    
    // 2. 重量对比
    if (rootWeight > 0 && properties.totalWeight >= rootWeight) {
      return false;
    }
    
    // 3. 功耗对比（非电源模块功耗）
    if (rootPower > 0) {
      const nonPowerPower = properties.nonPowerConsumption || 0;
      if (nonPowerPower > rootPower) {
        return false;
      }
    }
    
    // 4. 可靠度对比
    if (rootReliability > 0 && properties.totalReliability <= rootReliability) {
      return false;
    }
    
    return true;
  }

  /**
   * 评估解决方案可行性
   * 根据用户要求：
   * 1. 方案的成本、重量参数必须低于根模块的成本、重量需求
   * 2. 方案除去电源模块后的功耗必须低于根模块的功耗需求
   * 3. 方案的可靠度必须高于根模块的可靠度需求
   * 若有一项参数不满足要求，方案不可行
   * @param {Object} solution - 解决方案（包含指定数量的叶子模块实例和连接关系）
   * @param {Object} constraints - 约束条件
   * @returns {boolean} 是否可行
   */
  evaluateFeasibility(solution, constraints) {
    const properties = solution.properties;
    const rootModule = solution.rootModule;
    const rootProps = rootModule.properties || {};
    
    // 【修复】兼容多种属性命名方式
    const rootCost = rootProps.cost_min !== undefined ? rootProps.cost_min : (rootProps.cost || 0);
    const rootWeight = rootProps.weight_min !== undefined ? rootProps.weight_min : (rootProps.weight || 0);
    const rootPower = rootProps.power_min !== undefined ? rootProps.power_min : (rootProps.power || 0);
    const rootReliability = rootProps.reliability_min !== undefined ? rootProps.reliability_min : (rootProps.reliability || 0);
    
    // 1. 成本对比：方案总成本必须低于根模块成本需求
    if (rootCost > 0 && properties.totalCost >= rootCost) {
      console.log(`方案成本 ${properties.totalCost} 不低于根模块成本需求 ${rootCost}`);
      return false;
    }
    
    // 2. 重量对比：方案总重量必须低于根模块重量需求
    if (rootWeight > 0 && properties.totalWeight >= rootWeight) {
      console.log(`方案重量 ${properties.totalWeight} 不低于根模块重量需求 ${rootWeight}`);
      return false;
    }
    
    // 3. 功耗对比：方案除去电源模块后的功耗必须低于根模块功耗需求
    // 【修复】使用预先计算好的 nonPowerConsumption 属性
    if (rootPower > 0) {
      const nonPowerPower = properties.nonPowerConsumption || 0;
      
      // 【修复】功耗对比规则：非电源模块功耗总和需低于根模块功耗需求（而非不低于）
      // 用户要求：若低于根模块的功耗需求则方案可行，反之方案不行
      if (nonPowerPower > rootPower) {
        console.log(`方案非电源功耗 ${nonPowerPower} 高于根模块功耗需求 ${rootPower}，方案不可行`);
        return false;
      }
      
      console.log(`功耗验证通过: 非电源功耗 ${nonPowerPower} <= 根模块功耗需求 ${rootPower}`);
    }
    
    // 4. 可靠度对比：方案总可靠度必须高于根模块可靠度需求
    if (rootReliability > 0 && properties.totalReliability <= rootReliability) {
      console.log(`方案可靠度 ${properties.totalReliability} 不高于根模块可靠度需求 ${rootReliability}`);
      return false;
    }
    
    // 所有参数满足要求
    console.log(`方案可行: 成本 ${properties.totalCost}/${rootCost}, 重量 ${properties.totalWeight}/${rootWeight}, 可靠度 ${properties.totalReliability}/${rootReliability}`);
    return true;
  }

  /**
   * 判断模块是否为电源模块
   * @param {Object} module - 模块
   * @returns {boolean} 是否为电源模块
   */
  isPowerModule(module) {
    // 检查模块类型是否包含"电源"
    if (module.module_type && module.module_type.includes('电源')) return true;
    if (module.moduleType && module.moduleType.includes('电源')) return true;
    
    // 检查分类是否包含"电源"或"供电"
    if (module.categories && Array.isArray(module.categories)) {
      return module.categories.some(cat =>
        cat.includes('电源') || cat.includes('供电') || cat.includes('power')
      );
    }
    
    return false;
  }

  /**
   * 生成候选模块的组合（最多 maxCount 个模块）
   * @param {Array} candidates - 候选模块数组
   * @param {number} maxCount - 最大组合大小
   * @returns {Array} 组合数组
   */
  generateCombinations(candidates, maxCount) {
    const combinations = [];
    const n = candidates.length;
    
    // 生成所有非空子集，大小从1到maxCount
    for (let size = 1; size <= maxCount && size <= n; size++) {
      // 使用递归生成组合
      const generate = (start, current) => {
        if (current.length === size) {
          combinations.push([...current]);
          return;
        }
        for (let i = start; i < n; i++) {
          current.push(candidates[i]);
          generate(i + 1, current);
          current.pop();
        }
      };
      generate(0, []);
    }
    
    return combinations;
  }

  /**
   * 计算组合的总属性
   * @param {Array} combination - 模块组合
   * @returns {Object} 总属性对象
   */
  calculateCombinationProperties(combination) {
    let totalCost = 0;
    let totalWeight = 0;
    let totalPower = 0;
    let totalReliability = 1.0;
    
    combination.forEach(module => {
      const props = module.properties || {};
      totalCost += props.cost_min || 0;
      totalWeight += props.weight_min || 0;
      totalPower += props.power_min || 0;
      totalReliability *= props.reliability_min || 1.0;
    });
    
    return {
      totalCost,
      totalWeight,
      totalPower,
      totalReliability
    };
  }

  /**
   * 计算组合的总属性（考虑每个模块的数量）
   * @param {Array} combination - 模块组合
   * @returns {Object} 总属性对象
   */
  calculateCombinationPropertiesWithQuantity(combination) {
    let totalCost = 0;
    let totalWeight = 0;
    let totalPower = 0;
    let totalReliability = 1.0;
    
    combination.forEach(module => {
      const props = module.properties || {};
      const quantity = module.quantity || 1;
      totalCost += (props.cost_min || 0) * quantity;
      totalWeight += (props.weight_min || 0) * quantity;
      totalPower += (props.power_min || 0) * quantity;
      totalReliability *= Math.pow(props.reliability_min || 1.0, quantity);
    });
    
    return {
      totalCost,
      totalWeight,
      totalPower,
      totalReliability
    };
  }

  /**
   * 检查组合是否满足根模块需求
   * @param {Object} totalProps - 组合总属性
   * @param {Object} requirements - 根模块需求
   * @returns {boolean} 是否满足
   */
  checkCombinationAgainstRequirements(totalProps, requirements) {
    // 成本：组合总成本应小于等于根模块成本要求
    if (requirements.cost > 0 && totalProps.totalCost > requirements.cost) {
      return false;
    }
    
    // 重量：组合总重量应小于等于根模块重量要求
    if (requirements.weight > 0 && totalProps.totalWeight > requirements.weight) {
      return false;
    }
    
    // 功耗：组合总功耗应小于等于根模块功耗要求
    if (requirements.power > 0 && totalProps.totalPower > requirements.power) {
      return false;
    }
    
    // 可靠度：组合总可靠度应大于等于根模块可靠度要求
    if (requirements.reliability > 0 && totalProps.totalReliability < requirements.reliability) {
      return false;
    }
    
    return true;
  }

  /**
   * 将解决方案异步写入文件流
   */
  async writeSolution(writeStream, solution) {
    return new Promise((resolve) => {
      writeStream.write(JSON.stringify(solution), (err) => {
        if (err) resolve(err);
        else resolve(null);
      });
    });
  }

  /**
   * 关闭文件写入流
   */
  async closeWriteStream(writeStream) {
    return new Promise((resolve) => {
      writeStream.end(']', (err) => {
        if (err) resolve(err);
        else resolve(null);
      });
    });
  }
}

module.exports = ArchitectureGenerator;