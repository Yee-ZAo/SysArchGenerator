const express = require('express');

const router = express.Router();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const ArchitectureSolution = require('../models/ArchitectureSolution');

// 确保导出目录存在
const EXPORT_DIR = path.join(__dirname, '../../exports');
const ensureExportDir = async () => {
  try {
    await fs.access(EXPORT_DIR);
  } catch {
    await fs.mkdir(EXPORT_DIR, { recursive: true });
  }
};

/**
 * @api {post} /api/export/json 导出解决方案为JSON
 * @apiName ExportJSON
 * @apiGroup Export
 * @apiDescription 将架构解决方案导出为JSON文件
 *
 * @apiParam {Object[]} solutions 解决方案数据数组
 * @apiParam {string} [filename] 自定义文件名（可选）
 *
 * @apiSuccess {string} url 下载URL
 * @apiSuccess {string} filename 文件名
 */
router.post('/json', async (req, res) => {
  try {
    const { solutions, filename } = req.body;

    if (!solutions || !Array.isArray(solutions) || solutions.length === 0) {
      return res.status(400).json({ error: '解决方案数据不能为空' });
    }

    await ensureExportDir();

    // 创建文件名
    const exportFilename = filename || `architecture-solutions-${Date.now()}.json`;
    const filePath = path.join(EXPORT_DIR, exportFilename);

    // 准备导出数据
    const exportData = {
      exportDate: new Date().toISOString(),
      solutionCount: solutions.length,
      solutions: solutions.map((solution, index) => {
        // 如果解决方案是ArchitectureSolution实例，使用toJSON方法
        if (solution instanceof ArchitectureSolution) {
          return solution.toJSON();
        }
        // 否则直接使用
        return {
          id: solution.id || `solution-${index}`,
          name: solution.name || `解决方案 ${index + 1}`,
          modules: solution.modules || [],
          connections: solution.connections || [],
          parameters: solution.parameters || {},
          metadata: {
            exportedAt: new Date().toISOString(),
            index,
          },
        };
      }),
    };

    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');

    // 返回下载信息
    const downloadUrl = `/exports/${exportFilename}`;

    res.json({
      success: true,
      message: 'JSON导出成功',
      downloadUrl,
      filename: exportFilename,
      fileSize: Buffer.byteLength(JSON.stringify(exportData), 'utf8'),
      solutionCount: solutions.length,
    });
  } catch (error) {
    console.error('JSON导出时出错:', error);
    res.status(500).json({
      error: 'JSON导出失败',
      details: error.message,
    });
  }
});

/**
 * @api {post} /api/export/excel 导出解决方案为Excel
 * @apiName ExportExcel
 * @apiGroup Export
 * @apiDescription 将架构解决方案导出为Excel文件
 *
 * @apiParam {Object[]} solutions 解决方案数据数组
 * @apiParam {string} [filename] 自定义文件名（可选）
 *
 * @apiSuccess {string} url 下载URL
 * @apiSuccess {string} filename 文件名
 */
router.post('/excel', async (req, res) => {
  try {
    const { solutions, filename } = req.body;

    if (!solutions || !Array.isArray(solutions) || solutions.length === 0) {
      return res.status(400).json({ error: '解决方案数据不能为空' });
    }

    await ensureExportDir();

    // 创建文件名
    const exportFilename = filename || `architecture-solutions-${Date.now()}.xlsx`;
    const filePath = path.join(EXPORT_DIR, exportFilename);

    // 创建工作簿
    const workbook = XLSX.utils.book_new();

    // 1. 解决方案概览工作表
    const overviewData = solutions.map((solution, index) => {
      const params = solution.parameters || {};
      return {
        解决方案ID: solution.id || `solution-${index}`,
        解决方案名称: solution.name || `解决方案 ${index + 1}`,
        模块数量: solution.modules ? solution.modules.length : 0,
        连接数量: solution.connections ? solution.connections.length : 0,
        '可靠度(%)': params.reliability || 0,
        '成本(元)': params.cost || 0,
        '重量(kg)': params.weight || 0,
        '功耗(W)': params.powerConsumption || 0,
        导出时间: new Date().toISOString(),
      };
    });

    const overviewSheet = XLSX.utils.json_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, '解决方案概览');

    // 2. 详细模块信息工作表（所有解决方案的模块）
    const allModules = [];
    solutions.forEach((solution, solIndex) => {
      if (solution.modules && Array.isArray(solution.modules)) {
        solution.modules.forEach((module, modIndex) => {
          allModules.push({
            解决方案ID: solution.id || `solution-${solIndex}`,
            解决方案名称: solution.name || `解决方案 ${solIndex + 1}`,
            模块ID: module.id || `module-${modIndex}`,
            模块名称: module.name || '未命名模块',
            模块类型: module.type || '未知',
            可靠度: module.reliability || 0,
            成本: module.cost || 0,
            重量: module.weight || 0,
            功耗: module.powerConsumption || 0,
            接口数量: module.interfaces ? module.interfaces.length : 0,
            属性数量: module.properties ? module.properties.length : 0,
          });
        });
      }
    });

    if (allModules.length > 0) {
      const modulesSheet = XLSX.utils.json_to_sheet(allModules);
      XLSX.utils.book_append_sheet(workbook, modulesSheet, '模块详情');
    }

    // 3. 连接信息工作表
    const allConnections = [];
    solutions.forEach((solution, solIndex) => {
      if (solution.connections && Array.isArray(solution.connections)) {
        solution.connections.forEach((connection, connIndex) => {
          allConnections.push({
            解决方案ID: solution.id || `solution-${solIndex}`,
            解决方案名称: solution.name || `解决方案 ${solIndex + 1}`,
            连接ID: connection.id || `connection-${connIndex}`,
            源模块: connection.sourceModule || '未知',
            源接口: connection.sourceInterface || '未知',
            目标模块: connection.targetModule || '未知',
            目标接口: connection.targetInterface || '未知',
            连接类型: connection.type || '数据',
            '带宽(Mbps)': connection.bandwidth || 0,
            '延迟(ms)': connection.latency || 0,
            可靠度: connection.reliability || 1.0,
          });
        });
      }
    });

    if (allConnections.length > 0) {
      const connectionsSheet = XLSX.utils.json_to_sheet(allConnections);
      XLSX.utils.book_append_sheet(workbook, connectionsSheet, '连接详情');
    }

    // 4. 参数汇总工作表
    const paramSummary = solutions.map((solution, index) => {
      const params = solution.parameters || {};
      const modules = solution.modules || [];
      const connections = solution.connections || [];

      // 计算统计信息
      const moduleStats = {
        minReliability: Math.min(...modules.map((m) => m.reliability || 0)),
        maxReliability: Math.max(...modules.map((m) => m.reliability || 0)),
        avgReliability: modules.reduce((sum, m) => sum + (m.reliability || 0), 0) / (modules.length || 1),
        totalCost: modules.reduce((sum, m) => sum + (m.cost || 0), 0),
        totalWeight: modules.reduce((sum, m) => sum + (m.weight || 0), 0),
        totalPower: modules.reduce((sum, m) => sum + (m.powerConsumption || 0), 0),
      };

      return {
        解决方案ID: solution.id || `solution-${index}`,
        解决方案名称: solution.name || `解决方案 ${index + 1}`,
        '总体可靠度(%)': params.reliability || 0,
        '总体成本(元)': params.cost || 0,
        '总体重量(kg)': params.weight || 0,
        '总体功耗(W)': params.powerConsumption || 0,
        模块数量: modules.length,
        连接数量: connections.length,
        '模块最小可靠度(%)': moduleStats.minReliability,
        '模块最大可靠度(%)': moduleStats.maxReliability,
        '模块平均可靠度(%)': moduleStats.avgReliability,
        '模块总成本(元)': moduleStats.totalCost,
        '模块总重量(kg)': moduleStats.totalWeight,
        '模块总功耗(W)': moduleStats.totalPower,
      };
    });

    const summarySheet = XLSX.utils.json_to_sheet(paramSummary);
    XLSX.utils.book_append_sheet(workbook, summarySheet, '参数汇总');

    // 写入文件
    XLSX.writeFile(workbook, filePath);

    // 返回下载信息
    const downloadUrl = `/exports/${exportFilename}`;

    res.json({
      success: true,
      message: 'Excel导出成功',
      downloadUrl,
      filename: exportFilename,
      fileSize: (await fs.stat(filePath)).size,
      solutionCount: solutions.length,
      sheetCount: workbook.SheetNames.length,
      sheets: workbook.SheetNames,
    });
  } catch (error) {
    console.error('Excel导出时出错:', error);
    res.status(500).json({
      error: 'Excel导出失败',
      details: error.message,
    });
  }
});

/**
 * @api {post} /api/export/report 生成解决方案报告
 * @apiName ExportReport
 * @apiGroup Export
 * @apiDescription 生成详细的解决方案报告（HTML格式）
 *
 * @apiParam {Object[]} solutions 解决方案数据数组
 * @apiParam {string} [title] 报告标题（可选）
 *
 * @apiSuccess {string} url 下载URL
 * @apiSuccess {string} filename 文件名
 */
router.post('/report', async (req, res) => {
  try {
    const { solutions, title } = req.body;

    if (!solutions || !Array.isArray(solutions) || solutions.length === 0) {
      return res.status(400).json({ error: '解决方案数据不能为空' });
    }

    await ensureExportDir();

    // 创建文件名
    const exportFilename = `architecture-report-${Date.now()}.html`;
    const filePath = path.join(EXPORT_DIR, exportFilename);

    // 生成HTML报告
    const reportTitle = title || '系统架构解决方案报告';
    const exportDate = new Date().toLocaleString('zh-CN');

    let htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportTitle}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1, h2, h3 { color: #333; }
        .header { border-bottom: 2px solid #4CAF50; padding-bottom: 20px; margin-bottom: 30px; }
        .solution { border: 1px solid #ddd; padding: 20px; margin-bottom: 30px; border-radius: 5px; }
        .solution-header { background-color: #f5f5f5; padding: 15px; margin: -20px -20px 20px -20px; border-radius: 5px 5px 0 0; }
        .parameters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .param-card { background-color: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #4CAF50; }
        .param-value { font-size: 24px; font-weight: bold; color: #4CAF50; }
        .param-label { font-size: 14px; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .summary { background-color: #e8f5e9; padding: 20px; border-radius: 5px; margin: 30px 0; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${reportTitle}</h1>
        <p>生成时间: ${exportDate}</p>
        <p>解决方案数量: ${solutions.length}</p>
    </div>
    
    <div class="summary">
        <h2>报告摘要</h2>
        <p>本报告包含 ${solutions.length} 个系统架构解决方案的详细分析。每个解决方案都经过参数计算和验证，确保满足系统要求。</p>
    </div>`;

    // 添加每个解决方案的详细信息
    solutions.forEach((solution, index) => {
      const params = solution.parameters || {};
      const modules = solution.modules || [];
      const connections = solution.connections || [];

      htmlContent += `
    <div class="solution">
        <div class="solution-header">
            <h2>解决方案 ${index + 1}: ${solution.name || '未命名解决方案'}</h2>
            <p>ID: ${solution.id || `solution-${index}`} | 模块数量: ${modules.length} | 连接数量: ${connections.length}</p>
        </div>
        
        <div class="parameters">
            <div class="param-card">
                <div class="param-value">${params.reliability ? params.reliability.toFixed(2) : '0.00'}%</div>
                <div class="param-label">总体可靠度</div>
            </div>
            <div class="param-card">
                <div class="param-value">¥${params.cost ? params.cost.toLocaleString('zh-CN') : '0'}</div>
                <div class="param-label">总体成本</div>
            </div>
            <div class="param-card">
                <div class="param-value">${params.weight ? params.weight.toFixed(2) : '0.00'} kg</div>
                <div class="param-label">总体重量</div>
            </div>
            <div class="param-card">
                <div class="param-value">${params.powerConsumption ? params.powerConsumption.toFixed(2) : '0.00'} W</div>
                <div class="param-label">总体功耗</div>
            </div>
        </div>
        
        <h3>模块列表</h3>`;

      if (modules.length > 0) {
        htmlContent += `
        <table>
            <thead>
                <tr>
                    <th>模块名称</th>
                    <th>类型</th>
                    <th>可靠度(%)</th>
                    <th>成本(元)</th>
                    <th>重量(kg)</th>
                    <th>功耗(W)</th>
                </tr>
            </thead>
            <tbody>`;

        modules.forEach((module) => {
          htmlContent += `
                <tr>
                    <td>${module.name || '未命名模块'}</td>
                    <td>${module.type || '未知'}</td>
                    <td>${module.reliability ? module.reliability.toFixed(2) : '0.00'}</td>
                    <td>${module.cost ? module.cost.toLocaleString('zh-CN') : '0'}</td>
                    <td>${module.weight ? module.weight.toFixed(2) : '0.00'}</td>
                    <td>${module.powerConsumption ? module.powerConsumption.toFixed(2) : '0.00'}</td>
                </tr>`;
        });

        htmlContent += `
            </tbody>
        </table>`;
      } else {
        htmlContent += '<p>无模块数据</p>';
      }

      htmlContent += `
        <h3>连接列表</h3>`;

      if (connections.length > 0) {
        htmlContent += `
        <table>
            <thead>
                <tr>
                    <th>源模块</th>
                    <th>目标模块</th>
                    <th>连接类型</th>
                    <th>带宽(Mbps)</th>
                    <th>延迟(ms)</th>
                </tr>
            </thead>
            <tbody>`;

        connections.forEach((connection) => {
          htmlContent += `
                <tr>
                    <td>${connection.sourceModule || '未知'} → ${connection.sourceInterface || ''}</td>
                    <td>${connection.targetModule || '未知'} → ${connection.targetInterface || ''}</td>
                    <td>${connection.type || '数据'}</td>
                    <td>${connection.bandwidth || '0'}</td>
                    <td>${connection.latency || '0'}</td>
                </tr>`;
        });

        htmlContent += `
            </tbody>
        </table>`;
      } else {
        htmlContent += '<p>无连接数据</p>';
      }

      // 添加解决方案结束标签
      htmlContent += `
    </div>`;
    });

    // 完成HTML文档
    htmlContent += `
    
    <div class="footer">
        <p>报告生成系统: 系统架构解决方案分析工具</p>
        <p>版本: 1.0.0 | 生成时间: ${exportDate}</p>
        <p>© 2026 系统架构分析平台 - 所有解决方案数据均为系统生成</p>
    </div>
</body>
</html>`;

    // 写入文件
    await fs.writeFile(filePath, htmlContent, 'utf8');

    // 返回下载信息
    const downloadUrl = `/exports/${exportFilename}`;

    res.json({
      success: true,
      message: 'HTML报告生成成功',
      downloadUrl,
      filename: exportFilename,
      fileSize: Buffer.byteLength(htmlContent, 'utf8'),
      solutionCount: solutions.length,
    });
  } catch (error) {
    console.error('HTML报告生成时出错:', error);
    res.status(500).json({
      error: 'HTML报告生成失败',
      details: error.message,
    });
  }
});

// 静态文件服务 - 提供导出文件的下载
router.use('/downloads', express.static(EXPORT_DIR));

module.exports = router;
