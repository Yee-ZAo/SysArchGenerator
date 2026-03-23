/**
 * 测试SSE流式响应 - 验证前端到后端的完整流程
 * 
 * 运行方式: node backend/test_sse_flow.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 测试配置
const TEST_PORT = 3000;
const TEST_HOST = 'localhost';

// 加载测试数据
function loadTestData() {
  const modulePath = path.join(__dirname, 'uploads/test001.json');
  const productPath = path.join(__dirname, 'uploads/产品库002.xlsx');
  
  let modules = [];
  
  if (fs.existsSync(modulePath)) {
    const data = fs.readFileSync(modulePath, 'utf8');
    modules = JSON.parse(data);
    console.log(`[测试] 加载模块数据: ${modules.length} 个模块`);
  } else {
    console.error(`[测试] 模块文件不存在: ${modulePath}`);
    process.exit(1);
  }
  
  return { modules, constraints: [] };
}

// 发送SSE请求并处理响应
async function testSSEGeneration() {
  const { modules, constraints } = loadTestData();
  
  console.log('\n========================================');
  console.log('[测试] 开始测试 SSE 流式响应');
  console.log('========================================\n');
  
  const postData = JSON.stringify({
    modules: modules,
    constraints: constraints,
    max_solutions: null  // Infinity 在JSON中会变成null
  });
  
  const options = {
    hostname: TEST_HOST,
    port: TEST_PORT,
    path: '/api/solutions/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      console.log(`[测试] 响应状态码: ${res.statusCode}`);
      console.log(`[测试] 响应头: ${JSON.stringify(res.headers)}`);
      
      // 检查是否是SSE响应
      const contentType = res.headers['content-type'];
      if (contentType && contentType.includes('text/event-stream')) {
        console.log('[测试] ✓ 检测到SSE流式响应');
      } else {
        console.log(`[测试] ✗ 响应类型不是SSE: ${contentType}`);
      }
      
      let buffer = '';
      let solutions = [];
      let phaseCount = 0;
      let solutionCount = 0;
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // 解析SSE消息
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'phase') {
                phaseCount++;
                console.log(`[测试] 阶段更新: ${data.message} (total: ${data.total})`);
              } else if (data.type === 'module_combo') {
                console.log(`[测试] 模块组合进度: ${data.current}/${data.total}`);
              } else if (data.type === 'solution') {
                solutionCount = data.count;
                if (solutionCount % 100 === 0) {
                  console.log(`[测试] 已生成方案: ${solutionCount}`);
                }
              } else if (data.type === 'complete') {
                solutions = data.solutions || [];
                console.log(`[测试] ✓ 生成完成: ${solutions.length} 个方案`);
              } else if (data.type === 'error') {
                console.error(`[测试] ✗ 错误: ${data.message}`);
                reject(new Error(data.message));
                return;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });
      
      res.on('end', () => {
        console.log('\n========================================');
        console.log('[测试] SSE流式响应测试结果');
        console.log('========================================');
        console.log(`[测试] 阶段更新次数: ${phaseCount}`);
        console.log(`[测试] 生成方案数量: ${solutionCount}`);
        console.log(`[测试] 返回方案数量: ${solutions.length}`);
        
        if (solutions.length > 0) {
          console.log(`[测试] ✓ 测试通过: 成功生成 ${solutions.length} 个方案`);
          
          // 打印前3个方案的摘要
          console.log('\n[测试] 前3个方案摘要:');
          solutions.slice(0, 3).forEach((sol, idx) => {
            console.log(`  方案${idx + 1}: ID=${sol.id}, 模块数=${sol.modules?.length || 0}, 连接数=${sol.connections?.length || 0}`);
          });
          
          resolve(solutions);
        } else {
          console.log('[测试] ✗ 测试失败: 未生成任何方案');
          reject(new Error('未生成任何方案'));
        }
      });
    });
    
    req.on('error', (e) => {
      console.error(`[测试] 请求错误: ${e.message}`);
      reject(e);
    });
    
    req.write(postData);
    req.end();
  });
}

// 主函数
async function main() {
  try {
    await testSSEGeneration();
    process.exit(0);
  } catch (error) {
    console.error('[测试] 测试失败:', error.message);
    process.exit(1);
  }
}

main();