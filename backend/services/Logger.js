/**
 * 日志记录工具模块
 * 用于记录每次工具执行的情况，包括时间戳、执行的文件和关键步骤
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    // 日志文件路径 - 保存在 backend 目录下
    this.logDir = path.join(__dirname);
    this.logFile = path.join(this.logDir, 'execution_log.txt');
  }

  /**
   * 确保日志文件存在
   */
  ensureLogFile() {
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  /**
   * 获取当前时间戳（格式化）
   * @returns {string} 格式化的时间戳
   */
  getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  /**
   * 获取ISO格式的时间戳（用于文件名）
   * @returns {string} ISO格式时间戳
   */
  getISOTimestamp() {
    return new Date().toISOString();
  }

  /**
   * 写入日志条目
   * @param {string} fileName - 执行的文件名
   * @param {string} step - 关键步骤描述
   * @param {string} [details] - 详细描述
   */
  log(fileName, step, details = '') {
    this.ensureLogFile();
    
    const timestamp = this.getTimestamp();
    let logEntry = `[${timestamp}] [${fileName}] 执行步骤: ${step}`;
    
    if (details) {
      logEntry += `\n    详情: ${details}`;
    }
    
    logEntry += '\n' + '-'.repeat(80) + '\n';
    
    try {
      fs.appendFileSync(this.logFile, logEntry);
      console.log(`[日志] ${fileName} - ${step}`);
    } catch (err) {
      console.error('[日志] 写入日志失败:', err.message);
    }
  }

  /**
   * 写入带前缀的日志（用于区分不同类型的操作）
   * @param {string} prefix - 日志前缀（如 START, END, ERROR, INFO）
   * @param {string} fileName - 执行的文件名
   * @param {string} step - 关键步骤描述
   * @param {string} [details] - 详细描述
   */
  logWithPrefix(prefix, fileName, step, details = '') {
    this.ensureLogFile();
    
    const timestamp = this.getTimestamp();
    let logEntry = `[${timestamp}] [${prefix}] [${fileName}] 执行步骤: ${step}`;
    
    if (details) {
      logEntry += `\n    详情: ${details}`;
    }
    
    logEntry += '\n' + '-'.repeat(80) + '\n';
    
    try {
      fs.appendFileSync(this.logFile, logEntry);
      console.log(`[日志] [${prefix}] ${fileName} - ${step}`);
    } catch (err) {
      console.error('[日志] 写入日志失败:', err.message);
    }
  }

  /**
   * 记录工具开始执行
   * @param {string} fileName - 执行的文件名
   * @param {string} [details] - 附加详细信息
   */
  logStart(fileName, details = '') {
    this.logWithPrefix('START', fileName, '开始执行', details);
  }

  /**
   * 记录工具结束执行
   * @param {string} fileName - 执行的文件名
   * @param {string} [details] - 附加详细信息
   */
  logEnd(fileName, details = '') {
    this.logWithPrefix('END', fileName, '执行完成', details);
  }

  /**
   * 记录错误
   * @param {string} fileName - 执行的文件名
   * @param {string} step - 发生错误的步骤
   * @param {string} error - 错误信息
   */
  logError(fileName, step, error) {
    this.logWithPrefix('ERROR', fileName, step, error);
  }

  /**
   * 记录信息
   * @param {string} fileName - 执行的文件名
   * @param {string} message - 信息内容
   */
  logInfo(fileName, message) {
    this.logWithPrefix('INFO', fileName, message);
  }

  /**
   * 清空日志文件
   */
  clearLog() {
    try {
      fs.writeFileSync(this.logFile, '');
      console.log('[日志] 日志文件已清空');
    } catch (err) {
      console.error('[日志] 清空日志失败:', err.message);
    }
  }

  /**
   * 读取最近的日志条目
   * @param {number} lines - 读取的行数
   * @returns {string} 日志内容
   */
  readLastLines(lines = 50) {
    try {
      if (!fs.existsSync(this.logFile)) {
        return '';
      }
      
      const content = fs.readFileSync(this.logFile, 'utf-8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines);
      
      return lastLines.join('\n');
    } catch (err) {
      console.error('[日志] 读取日志失败:', err.message);
      return '';
    }
  }
}

// 导出单例
const logger = new Logger();

module.exports = logger;