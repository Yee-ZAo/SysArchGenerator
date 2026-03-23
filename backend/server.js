const express = require('express');
// 增加Node.js堆内存限制至4096MB (4GB)
require('v8').setFlagsFromString('--max-old-space-size=4096');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 导入路由
const modulesRouter = require('./routes/modules');
const constraintsRouter = require('./routes/constraints');
const solutionsRouter = require('./routes/solutions');
const exportRouter = require('./routes/export');

// 导入服务
const ArchFileReader = require('./services/ArchFileReader');
// const ArchitectureGenerator = require('./services/ArchitectureGenerator.js.backup');
const ArchitectureGenerator = require('./services/ArchitectureGenerator');

// 导入日志记录模块
const logger = require('./services/Logger');

// 产品库数据存储（内存）
let productLibraryData = [];

// 用于记录上一次工具运行的时间
let lastToolRunTime = null;

/**
 * 清空临时方案文件 - 仅清理 backend/uploads 目录
 * @param {string} clearReason - 清理原因说明
 * @returns {number} 清理的文件数量
 */
function clearTempSolutionFiles(clearReason = '启动/关闭') {
  // __dirname 在 server.js 中是 backend 目录
  // uploadsDir = backend/uploads（直接子目录）
  const uploadsDir = path.join(__dirname, 'uploads');
  // subUploadsDir = backend/backend/uploads（用于架构生成器输出）
  const subUploadsDir = path.join(__dirname, 'backend/uploads');
  
  let clearedCount = 0;
  let logDetails = [];
  
  // 清理 backend/backend/uploads 目录中的临时方案文件（架构生成器实际使用的路径）
  if (fs.existsSync(subUploadsDir)) {
    const files = fs.readdirSync(subUploadsDir);
    files.forEach(file => {
      // 清理 solutions_*.json 临时文件
      if (file.startsWith('solutions_') && file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(subUploadsDir, file));
          clearedCount++;
          logDetails.push(`backend/uploads/${file}`);
          console.log(`已清理临时文件: backend/uploads/${file}`);
        } catch (err) {
          console.error(`清理临时文件失败 ${file}:`, err.message);
        }
      }
    });
  }
  
  // 同时清理 uploads 目录中的临时方案文件（兼容）
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    files.forEach(file => {
      // 清理 solutions_*.json 临时文件
      if (file.startsWith('solutions_') && file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(uploadsDir, file));
          // 避免重复计数
          if (!logDetails.includes(`uploads/${file}`)) {
            clearedCount++;
            logDetails.push(`uploads/${file}`);
            console.log(`已清理临时文件: uploads/${file}`);
          }
        } catch (err) {
          console.error(`清理临时文件失败 ${file}:`, err.message);
        }
      }
    });
  }
  
  const resultMsg = `临时文件清理完成（${clearReason}），共清理 ${clearedCount} 个文件`;
  console.log(resultMsg);
  
  // 记录到日志文件
  if (clearedCount > 0) {
    logger.log('server.js', `清空临时文件: ${logDetails.join(', ')}`, clearReason);
  }
  
  return clearedCount;
}

/**
 * 在每次工具运行前清空临时方案文件
 * 此函数会在解决方案生成API被调用时执行
 */
function clearTempBeforeToolRun() {
  const currentTime = new Date().toISOString();
  
  // 记录本次工具运行开始
  lastToolRunTime = currentTime;
  logger.logStart('server.js', `开始新的工具运行 - 时间: ${currentTime}`);
  
  // 清空临时方案文件
  const clearedCount = clearTempSolutionFiles('工具运行前');
  
  return clearedCount;
}

// 服务器启动时清理临时文件
console.log('正在清理临时方案文件...');
clearTempSolutionFiles();

// 注册进程退出处理
process.on('SIGINT', () => {
  console.log('\n服务器正在关闭，清理临时文件...');
  clearTempSolutionFiles();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n服务器正在关闭，清理临时文件...');
  clearTempSolutionFiles();
  process.exit(0);
});

// 处理 Windows 平台的关闭事件
if (process.platform === 'win32') {
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.on('SIGINT', () => {
    process.emit('SIGINT');
  });
}

// 产品库路由
const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../frontend')));

// 文件上传配置
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  // 文件名处理
  filename(req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
// 文件过滤和大小限制
const upload = multer({
  storage,
  fileFilter(req, file, cb) {
    const allowedExtensions = ['.json', '.xlsx', '.xls', '.xml'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持JSON、Excel、XML格式的文件'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// API路由
app.use('/api/modules', modulesRouter);
app.use('/api/constraints', constraintsRouter);
app.use('/api/solutions', solutionsRouter);
app.use('/api/export', exportRouter);

// 日志记录API - 接收前端操作日志
app.post('/api/log', (req, res) => {
  try {
    const { action, details, page, component } = req.body;
    if (action) {
      logger.log('frontend', action, `页面: ${page || 'unknown'}, 组件: ${component || 'unknown'}, 详情: ${JSON.stringify(details || {})}`);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取最近的操作日志
app.get('/api/log/recent', (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 50;
    const logContent = logger.readLastLines(lines);
    res.json({ success: true, logs: logContent });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 文件上传API
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传文件',
      });
    }

    // 读取并解析文件
    const filePath = req.file.path;
    const modules = await ArchFileReader.readFile(filePath);

    // 删除临时文件
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: '文件读取成功',
      modules,
      count: modules.length,
    });
  } catch (error) {
    console.error('文件上传失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '文件读取失败',
    });
  }
});

// 产品库文件上传API
app.post('/api/upload/product-library', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      logger.log('server.js', '产品库上传失败', '未选择文件');
      return res.status(400).json({
        success: false,
        message: '请上传文件',
      });
    }

    // 读取并解析文件
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    logger.log('server.js', '开始解析产品库文件', `文件名: ${fileName}`);
    
    const modules = await ArchFileReader.readFile(filePath);

    // 删除临时文件
    fs.unlinkSync(filePath);

    // 保存到内存（覆盖之前的数据）
    productLibraryData = modules.map(m => m.toDict ? m.toDict() : m);
    
    // 同时保存到 app.locals 供路由使用
    app.locals.productLibraryData = productLibraryData;

    // 记录产品库导入成功
    logger.log('server.js', '产品库导入成功', `文件: ${fileName}, 模块数: ${productLibraryData.length}`);

    res.json({
      success: true,
      message: '产品库文件读取成功，数据已保存',
      count: productLibraryData.length,
    });
  } catch (error) {
    console.error('产品库文件上传失败:', error);
    logger.logError('server.js', '产品库导入失败', error.message);
    res.status(500).json({
      success: false,
      message: error.message || '产品库文件读取失败',
    });
  }
});

// 获取产品库数据API
app.get('/api/product-library', (req, res) => {
  // 记录获取产品库
  logger.log('server.js', '获取产品库数据', `当前模块数: ${productLibraryData.length}`);
  res.json({
    success: true,
    count: productLibraryData.length,
    modules: productLibraryData,
  });
});

// 清空产品库数据API
app.delete('/api/product-library', (req, res) => {
  const previousCount = productLibraryData.length;
  productLibraryData = [];
  // 【修复】也要清空 app.locals 中的数据
  app.locals.productLibraryData = [];
  
  // 记录清空产品库
  logger.log('server.js', '清空产品库数据', `清空前模块数: ${previousCount}`);
  console.log('产品库数据已清空');
  
  res.json({
    success: true,
    message: '产品库数据已清空',
  });
});

// 架构生成API（支持流式响应以实现实时进度反馈）
app.post('/api/generate', async (req, res) => {
  try {
    const { modules, constraints, max_solutions = Infinity } = req.body;

    if (!modules || !Array.isArray(modules) || modules.length === 0) {
      return res.status(400).json({
        success: false,
        message: '模块数据不能为空',
      });
    }

    // 设置SSE（Server-Sent Events）响应头以支持实时进度推送
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用nginx缓冲

    // 进度推送函数
    const sendProgress = (data) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (e) {
        console.error('发送进度失败:', e);
      }
    };

    // 创建架构生成器
    const generator = new ArchitectureGenerator();
    
    // 监听进度事件
    generator.on('progress', (data) => {
      sendProgress(data);
    });

    // 获取产品库数据
    const productLibrary = productLibraryData.length > 0 ? productLibraryData : null;
    console.log(`架构生成: 使用产品库数据 ${productLibrary ? productLibrary.length : 0} 个模块`);

    // 生成方案
    const result = await generator.generateSolutions(modules, constraints, max_solutions, productLibrary);

    // 处理生成结果
    if (!result.success) {
      sendProgress({ type: 'error', message: result.error || '架构方案生成失败' });
      res.write(`data: ${JSON.stringify({ type: 'complete', success: false, message: result.error || '架构方案生成失败', solutions: [], count: 0 })}\n\n`);
      res.end();
      return;
    }

    // 读取生成的解决方案文件
    let solutionsArray = [];
    if (result.filePath) {
      try {
        const data = fs.readFileSync(result.filePath, 'utf8');
        solutionsArray = JSON.parse(data);
      } catch (e) {
        console.error('读取解决方案文件失败:', e);
      }
    }

    // 转换解决方案格式
    const processedSolutions = solutionsArray.map((solution, index) => {
      const leafModules = solution.leafModules || [];
      const modules = leafModules.map(lm => lm.module || lm).filter(m => m);
      
      if (solution.rootModule) {
        modules.unshift(solution.rootModule);
      }
      
      const properties = solution.properties || {};
      
      return {
        id: solution.id || `sol-${index}`,
        modules: modules,
        connections: solution.connections || [],
        total_cost_min: properties.totalCost || 0,
        total_cost_max: properties.totalCost || 0,
        total_weight_min: properties.totalWeight || 0,
        total_weight_max: properties.totalWeight || 0,
        total_power_min: properties.totalPower || 0,
        total_power_max: properties.totalPower || 0,
        total_reliability_min: properties.totalReliability || 0.8,
        total_reliability_max: properties.totalReliability || 0.8
      };
    });

    // 发送完成事件
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      message: '架构方案生成成功',
      solutions: processedSolutions,
      count: processedSolutions.length
    })}\n\n`);
    res.end();
  } catch (error) {
    console.error('架构生成失败:', error);
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message || '架构方案生成失败' })}\n\n`);
    } catch (e) {
      // 连接可能已关闭
    }
    res.end();
  }
});

// 停止生成API
app.post('/api/generate/stop', (req, res) => {
  // 这个API需要配合全局的generator实例使用
  // 在实际应用中可能需要更好的状态管理
  res.json({
    success: true,
    message: '停止请求已接收'
  });
});

// 健康检查API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '服务运行正常',
    timestamp: new Date().toISOString()
  });
});

// 默认路由 - 提供前端页面
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || '服务器内部错误',
  });
});

// 启动服务器
// 尝试启动服务器，如果端口被占用则重试
function startServer(port, trial = 1) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`系统架构创成生成工具后端服务运行在 http://0.0.0.0:${port}`);
    console.log(`前端页面访问 http://localhost:${port}/index.html`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE' && trial < 5) {
      console.log(`端口 ${port} 已被占用，尝试端口 ${port + 1}`);
      startServer(port + 1, trial + 1);
    } else {
      throw err;
    }
  });
}

startServer(PORT);

// 导出产品库数据供其他模块使用
module.exports = {
  app,
  getProductLibraryData: () => productLibraryData,
  clearTempBeforeToolRun  // 导出清空临时文件的函数
};
