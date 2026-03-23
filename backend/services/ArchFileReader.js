const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { ModuleInfo } = require('../models/ModuleInfo');

/**
 * 文件读取器类，支持读取JSON和Excel格式的架构文件
 * 按照test001.json和产品库.xlsx的格式解析，属性参数为单值（非范围）
 */
class ArchFileReader {
  /**
   * 读取文件，根据扩展名调用相应的解析方法
   * @param {string} filePath 文件路径
   * @returns {Promise<Array<ModuleInfo>>} 模块信息数组
   */
  static async readFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.json') {
        return await this.readJson(filePath);
      } else if (ext === '.xlsx' || ext === '.xls') {
        return await this.readExcel(filePath);
      } else if (ext === '.xml') {
        return await this.readXml(filePath);
      } else {
        throw new Error(`不支持的文件格式: ${ext}`);
      }
    } catch (error) {
      console.error('读取文件失败:', error);
      throw new Error(`读取文件失败: ${error.message}`);
    }
  }

  /**
   * 读取JSON文件
   * @param {string} filePath JSON文件路径
   * @returns {Promise<Array<ModuleInfo>>} 模块信息数组
   */
  static async readJson(filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      const modules = this.parseJson(data);
      console.log(`成功解析 ${modules.length} 个模块`);
      // 后处理：建立父子关系，计算层级和叶子状态
      const processedModules = this.postProcessModules(modules);
      return processedModules;
    } catch (error) {
      console.error('读取JSON文件失败:', error);
      throw new Error(`读取JSON文件失败: ${error.message}`);
    }
  }

  /**
   * 解析JSON数据（按照test001.json格式）
   * @param {Object} data JSON数据对象
   * @returns {Array<ModuleInfo>} 模块信息数组
   */
  static parseJson(data) {
    const modules = [];

    // 检查是否是test001.json格式（包含modules数组）
    if (data.modules && Array.isArray(data.modules)) {
      data.modules.forEach((moduleData, index) => {
        try {
          const module = this.parseJsonModule(moduleData, index);
          if (module) {
            modules.push(module);
          }
        } catch (error) {
          console.error(`解析模块 ${index} 失败:`, error);
        }
      });
    } else {
      // 尝试其他可能的格式（向后兼容）
      console.warn('JSON格式不符合test001.json标准，尝试其他解析方式');
      return this.parseOtherJsonFormats(data);
    }

    return modules;
  }

  /**
   * 解析单个JSON模块数据
   * @param {Object} moduleData 模块数据对象
   * @param {number} index 模块索引
   * @returns {ModuleInfo} 模块信息对象
   */
  static parseJsonModule(moduleData, index) {
    // 提取基本信息
    const name = moduleData.moduleName || `模块_${index}`;
    const moduleType = moduleData.moduleType || '';
    const moduleCategory = moduleData.moduleCategory || '';
    const parentModule = moduleData.parentModule || '';
    
    // 解析接口
    const interfaces = [];
    const interfacesData = moduleData.moduleInterface || [];
    
    interfacesData.forEach((ifaceData) => {
      try {
        const { InterfaceInfo, InterfaceType } = require('../models/ModuleInfo');
        const interfaceObj = new InterfaceInfo(
          ifaceData.interfaceName || '未命名接口',
          InterfaceType.fromString(ifaceData.interfaceType || '电气'),
          ifaceData.interfaceDirection || 'input',
          ifaceData.custom_type || '',
          ifaceData.interfaceQuantity || 1
        );
        interfaces.push(interfaceObj);
      } catch (error) {
        console.error('解析接口失败:', error);
      }
    });

    // 解析属性（单值）
    const attributes = moduleData.moduleAttributes || {};
    const cost = parseFloat(attributes.cost) || 0.0;
    const weight = parseFloat(attributes.weight) || 0.0;
    const power = parseFloat(attributes.power) || 0.0;
    const reliability = parseFloat(attributes.reliability) || 0.0;
    const quantity = parseInt(attributes.quantity) || 1;

    // 创建模块属性对象
    const { ModuleProperty } = require('../models/ModuleInfo');
    const properties = new ModuleProperty(cost, weight, power, reliability, 1.0);

    // 创建模块信息对象
    const module = new ModuleInfo(
      name,
      moduleType,
      [moduleCategory], // 分类作为数组
      0, // 层级（JSON中未提供，默认为0）
      parentModule,
      [], // 子模块（稍后可能根据关系设置）
      100, // max_instances
      100, // max_children
      quantity, // 数量（单值）
      properties,
      interfaces,
      '', // id（自动生成）
      '', // original_id
      null, // original_properties
      false // isLeaf
    );

    return module;
  }

  /**
   * 解析其他JSON格式（向后兼容）
   * @param {Object} data JSON数据
   * @returns {Array<ModuleInfo>} 模块信息数组
   */
  static parseOtherJsonFormats(data) {
    const modules = [];

    // 尝试直接解析为模块列表
    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        try {
          if (typeof item === 'object' && item !== null) {
            const module = ModuleInfo.fromDict(item);
            modules.push(module);
          }
        } catch (error) {
          console.error(`解析列表项 ${i} 失败:`, error);
        }
      });
    }

    // 尝试从常见的键中查找模块
    const possibleKeys = ['Modules', 'components', 'elements', 'nodes'];
    possibleKeys.forEach((key) => {
      if (data[key] && Array.isArray(data[key])) {
        data[key].forEach((item) => {
          try {
            if (typeof item === 'object' && item !== null) {
              const module = ModuleInfo.fromDict(item);
              modules.push(module);
            }
          } catch (error) {
            console.error(`解析 ${key} 项失败:`, error);
          }
        });
      }
    });

    return modules;
  }

  /**
   * 读取Excel文件（按照产品库.xlsx格式）
   * @param {string} filePath Excel文件路径
   * @returns {Promise<Array<ModuleInfo>>} 模块信息数组
   */
  static async readExcel(filePath) {
    try {
      // 读取Excel文件
      const workbook = xlsx.readFile(filePath);
      const modules = this.parseExcel(workbook);
      console.log(`从Excel文件读取到 ${modules.length} 个模块`);
      // 后处理：建立父子关系，计算层级和叶子状态
      const processedModules = this.postProcessModules(modules);
      return processedModules;
    } catch (error) {
      console.error('读取Excel文件失败:', error);
      throw new Error(`读取Excel文件失败: ${error.message}`);
    }
  }

  /**
   * 解析Excel工作簿（按照产品库002.xlsx格式）
   * 【更新】支持第4行的"输入"和"输出"标签来区分接口列
   * @param {Object} workbook xlsx工作簿对象
   * @returns {Array<ModuleInfo>} 模块信息数组
   */
  static parseExcel(workbook) {
    const modules = [];
    const sheetNames = workbook.SheetNames;

    // 使用第一个sheet
    const sheetName = sheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 转换为JSON数据（包含标题行）
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (data.length < 2) {
      console.warn('Excel文件数据行数不足');
      return modules;
    }

    // 产品库002.xlsx文件结构：
    // 第1行（索引0）：英文列名 moduleName, moduleType, ..., moduleInterface, moduleInterface
    // 第2行（索引1）：中文标题行 模块名称, 模块类型, ..., 模块接口, 模块接口
    // 第3行（索引2）：中文说明行 模块名称, 模块类型, ..., 输入, 输出  <- 这行标识了接口方向
    // 第4行（索引3）开始：实际数据
    
    const englishHeaders = data[0] || [];
    const chineseHeaders = data[1] || [];
    const directionLabels = data[2] || []; // 第3行是方向标签行
    
    // 构建列索引映射
    const columnMap = {};
    englishHeaders.forEach((header, index) => {
      if (header) {
        columnMap[header] = index;
      }
    });
    
    // 【新增】查找"输入"和"输出"标签的位置来识别接口列
    let inputColumnIndex = -1;
    let outputColumnIndex = -1;
    
    directionLabels.forEach((label, index) => {
      const labelStr = String(label || '').trim();
      if (labelStr === '输入') {
        inputColumnIndex = index;
        console.log(`发现"输入"列，索引: ${index}`);
      } else if (labelStr === '输出') {
        outputColumnIndex = index;
        console.log(`发现"输出"列，索引: ${index}`);
      }
    });
    
    // 构建接口列索引信息
    const interfaceColumnInfo = {
      inputColumnIndex: inputColumnIndex,
      outputColumnIndex: outputColumnIndex,
      hasDirectionLabels: inputColumnIndex >= 0 || outputColumnIndex >= 0
    };

    // 从第4行（索引3）开始解析数据，跳过方向标签行
    const dataStartRow = interfaceColumnInfo.hasDirectionLabels ? 3 : 2;
    
    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      try {
        const module = this.parseExcelRow(row, columnMap, i - dataStartRow, interfaceColumnInfo);
        if (module) {
          modules.push(module);
        }
      } catch (error) {
        console.error(`解析Excel行 ${i} 失败:`, error);
      }
    }

    return modules;
  }

  /**
   * 解析Excel单行数据
   * 【更新】支持产品库002.xlsx格式，包括分开的"输入"和"输出"接口列
   * 接口连接规则：只能从输出接口连接到输入接口
   * 一个接口可以连接到多个接口，多个接口也可以连接到一个接口
   * @param {Array} row 数据行
   * @param {Object} columnMap 列映射
   * @param {number} rowIndex 行索引（从0开始）
   * @param {Object} interfaceColumnInfo 接口列索引信息
   * @returns {ModuleInfo} 模块信息对象
   */
  static parseExcelRow(row, columnMap, rowIndex, interfaceColumnInfo) {
    // 提取字段值
    const getValue = (columnName) => {
      const index = columnMap[columnName];
      return index !== undefined && row[index] !== undefined ? row[index] : '';
    };

    const moduleName = String(getValue('moduleName') || `产品_${rowIndex}`).trim();
    const moduleType = String(getValue('moduleType') || '').trim();
    const moduleCategory = String(getValue('moduleCategory') || '').trim();
    
    // 解析属性（单值）
    const cost = parseFloat(getValue('cost')) || 0.0;
    const weight = parseFloat(getValue('weight')) || 0.0;
    const power = parseFloat(getValue('power')) || 0.0;
    const reliability = parseFloat(getValue('reliability')) || 0.0;
    
    // 【更新】解析接口：使用方向标签行来识别输入和输出列
    const interfaces = [];
    
    // 获取输入和输出接口列的索引
    const inputColIdx = interfaceColumnInfo?.inputColumnIndex ?? -1;
    const outputColIdx = interfaceColumnInfo?.outputColumnIndex ?? -1;
    
    const { InterfaceInfo, InterfaceType } = require('../models/ModuleInfo');
    
    // 解析输入接口（如果找到了输入列）
    if (inputColIdx >= 0) {
      const inputInterfaceStr = String(row[inputColIdx] || '').trim();
      if (inputInterfaceStr && inputInterfaceStr.toLowerCase() !== 'null') {
        const inputTypes = inputInterfaceStr.split(',').map(s => s.trim()).filter(s => s);
        inputTypes.forEach((type) => {
          try {
            // 创建输入接口
            const inputInterface = new InterfaceInfo(
              `${type}_in`,
              InterfaceType.fromString(type),
              'input',
              '',
              999 // 支持多个输出接口连接到同一个输入接口
            );
            interfaces.push(inputInterface);
            console.log(`模块 "${moduleName}" 添加输入接口: ${type}_in`);
          } catch (error) {
            console.error('解析输入接口类型失败:', error);
          }
        });
      }
    }
    
    // 解析输出接口（如果找到了输出列）
    if (outputColIdx >= 0) {
      const outputInterfaceStr = String(row[outputColIdx] || '').trim();
      if (outputInterfaceStr && outputInterfaceStr.toLowerCase() !== 'null') {
        const outputTypes = outputInterfaceStr.split(',').map(s => s.trim()).filter(s => s);
        outputTypes.forEach((type) => {
          try {
            // 创建输出接口
            const outputInterface = new InterfaceInfo(
              `${type}_out`,
              InterfaceType.fromString(type),
              'output',
              '',
              999 // 支持一个输出接口连接到多个输入接口
            );
            interfaces.push(outputInterface);
            console.log(`模块 "${moduleName}" 添加输出接口: ${type}_out`);
          } catch (error) {
            console.error('解析输出接口类型失败:', error);
          }
        });
      }
    }
    
    // 如果没有找到方向标签，回退到旧逻辑（兼容旧格式）
    if (inputColIdx < 0 && outputColIdx < 0) {
      console.log(`模块 "${moduleName}" 使用旧格式接口解析`);
      
      // 获取所有moduleInterface列的索引
      const moduleInterfaceIndices = [];
      Object.entries(columnMap).forEach(([key, index]) => {
        if (key === 'moduleInterface') {
          moduleInterfaceIndices.push(index);
        }
      });
      
      // 如果只有一个moduleInterface列，可能是旧格式，使用兼容逻辑
      if (moduleInterfaceIndices.length === 1) {
        const interfaceStr = String(getValue('moduleInterface') || '').trim();
        if (interfaceStr && interfaceStr.toLowerCase() !== 'null') {
          // 旧格式兼容：为每个接口类型同时创建输入和输出接口
          const interfaceTypes = interfaceStr.split(',').map(s => s.trim()).filter(s => s);
          interfaceTypes.forEach((type) => {
            try {
              const inputInterface = new InterfaceInfo(
                `${type}_in`,
                InterfaceType.fromString(type),
                'input',
                '',
                999 // 一个接口可以连接多个接口
              );
              interfaces.push(inputInterface);
              
              const outputInterface = new InterfaceInfo(
                `${type}_out`,
                InterfaceType.fromString(type),
                'output',
                '',
                999 // 一个接口可以连接多个接口
              );
              interfaces.push(outputInterface);
              
              console.log(`模块 "${moduleName}" 添加接口: ${type}_in (input), ${type}_out (output)`);
            } catch (error) {
              console.error('解析接口类型失败:', error);
            }
          });
        }
      } else if (moduleInterfaceIndices.length >= 2) {
        // 两列moduleInterface的情况，假设第一列是输入，第二列是输出
        const inputIndex = moduleInterfaceIndices[0];
        const outputIndex = moduleInterfaceIndices[1];
        
        const inputInterfaceStr = String(row[inputIndex] || '').trim();
        const outputInterfaceStr = String(row[outputIndex] || '').trim();
        
        // 解析输入接口（第一列）
        if (inputInterfaceStr && inputInterfaceStr.toLowerCase() !== 'null') {
          const inputTypes = inputInterfaceStr.split(',').map(s => s.trim()).filter(s => s);
          inputTypes.forEach((type) => {
            try {
              const inputInterface = new InterfaceInfo(
                `${type}_in`,
                InterfaceType.fromString(type),
                'input',
                '',
                999
              );
              interfaces.push(inputInterface);
              console.log(`模块 "${moduleName}" 添加输入接口: ${type}_in`);
            } catch (error) {
              console.error('解析输入接口类型失败:', error);
            }
          });
        }
        
        // 解析输出接口（第二列）
        if (outputInterfaceStr && outputInterfaceStr.toLowerCase() !== 'null') {
          const outputTypes = outputInterfaceStr.split(',').map(s => s.trim()).filter(s => s);
          outputTypes.forEach((type) => {
            try {
              const outputInterface = new InterfaceInfo(
                `${type}_out`,
                InterfaceType.fromString(type),
                'output',
                '',
                999
              );
              interfaces.push(outputInterface);
              console.log(`模块 "${moduleName}" 添加输出接口: ${type}_out`);
            } catch (error) {
              console.error('解析输出接口类型失败:', error);
            }
          });
        }
        
        console.log(`模块 "${moduleName}" 接口解析完成: 输入[${inputInterfaceStr}], 输出[${outputInterfaceStr}]`);
      }
    }

    // 创建模块属性对象
    const { ModuleProperty } = require('../models/ModuleInfo');
    const properties = new ModuleProperty(cost, weight, power, reliability, 1.0);

    // 创建模块信息对象
    // 注意：产品库中的模块通常是叶子模块，没有层级和父子关系信息
    const module = new ModuleInfo(
      moduleName,
      moduleType,
      [moduleCategory],
      0, // 层级未知
      '', // 父模块未知
      [], // 子模块未知
      100, // max_instances
      100, // max_children
      1, // 数量默认为1
      properties,
      interfaces,
      '', // id
      '', // original_id
      null, // original_properties
      true // 产品库模块通常是叶子模块
    );

    return module;
  }

  /**
   * 读取XML文件（暂未实现）
   * @param {string} filePath XML文件路径
   * @returns {Promise<Array<ModuleInfo>>} 模块信息数组
   */
  static async readXml(filePath) {
    try {
      throw new Error('XML文件解析功能暂未实现');
    } catch (error) {
      console.error('读取XML文件失败:', error);
      throw new Error(`读取XML文件失败: ${error.message}`);
    }
  }

  /**
   * 后处理模块列表：建立父子关系，计算层级和叶子状态
   * @param {Array<ModuleInfo>} modules 模块列表
   * @returns {Array<ModuleInfo>} 处理后的模块列表
   */
  static postProcessModules(modules) {
    if (!modules || modules.length === 0) {
      return modules;
    }

    // 建立名称到模块的映射（使用moduleType或name作为键）
    const moduleMap = new Map();
    modules.forEach(module => {
      // 使用模块名称作为键（假设唯一）
      moduleMap.set(module.name, module);
    });

    // 初始化子模块数组
    modules.forEach(module => {
      module.child_modules = [];
    });

    // 辅助函数：通过名称、类型、分类或部分匹配查找父模块
    const findParent = (parentName) => {
      // 首先尝试通过名称查找
      let parent = moduleMap.get(parentName);
      if (parent) return parent;
      // 如果找不到，尝试通过module_type查找
      for (const m of modules) {
        if (m.module_type === parentName) {
          return m;
        }
      }
      // 尝试通过分类查找（第一个分类）
      for (const m of modules) {
        if (m.categories && m.categories.length > 0) {
          // 完全匹配分类
          if (m.categories[0] === parentName) {
            return m;
          }
          // 部分匹配：分类包含父模块名称
          if (m.categories[0].includes(parentName) || parentName.includes(m.categories[0])) {
            return m;
          }
        }
      }
      // 尝试通过名称包含关系查找
      for (const m of modules) {
        if (m.name.includes(parentName) || parentName.includes(m.name)) {
          return m;
        }
      }
      return null;
    };

    // 建立父子关系
    modules.forEach(module => {
      const parentName = module.parent_module;
      if (parentName && parentName.trim() !== '') {
        const parent = findParent(parentName);
        if (parent) {
          parent.child_modules.push(module.name);
        } else {
          console.warn(`找不到父模块 "${parentName}"，模块 "${module.name}" 的父模块引用无效`);
        }
      }
    });

    // 计算层级：遍历每个节点，递归向上找父节点
    modules.forEach(module => {
      let level = 0;
      let current = module;
      const seen = new Set();
      while (current.parent_module && current.parent_module.trim() !== '') {
        if (seen.has(current.name)) {
          // 检测到循环，跳出
          console.warn(`检测到循环父子关系，模块 "${module.name}"`);
          break;
        }
        seen.add(current.name);
        const parent = findParent(current.parent_module);
        if (!parent) {
          break;
        }
        current = parent;
        level++;
      }
      module.level = level;
    });

    // 计算叶子状态：没有子模块的节点为叶子
    modules.forEach(module => {
      module.isLeaf = module.child_modules.length === 0;
    });

    return modules;
  }
}

module.exports = ArchFileReader;
