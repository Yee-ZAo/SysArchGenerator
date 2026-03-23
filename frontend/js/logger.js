/**
 * 前端日志记录模块
 * 将用户的操作步骤发送到后端进行记录
 */

class FrontendLogger {
  constructor() {
    this.apiBaseUrl = '';
    this.init();
  }

  init() {
    // 确定API基础URL
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;
    if (protocol === 'file:' || hostname === '' || (hostname === 'localhost' && port === '')) {
      this.apiBaseUrl = 'http://localhost:3001/api';
    } else {
      this.apiBaseUrl = `${protocol}//${hostname}${port ? ':' + port : ''}/api`;
    }
  }

  /**
   * 记录用户操作
   * @param {string} action - 操作名称
   * @param {Object} details - 操作详情
   * @param {string} page - 页面名称
   * @param {string} component - 组件名称
   */
  async log(action, details = {}, page = '', component = '') {
    try {
      await fetch(`${this.apiBaseUrl}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          details,
          page,
          component,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.warn('日志记录失败:', error.message);
    }
  }

  // 页面切换
  logPageSwitch(pageName) {
    this.log('页面切换', { targetPage: pageName }, pageName, 'navigation');
  }

  // 文件上传
  logFileUpload(fileName, fileType, fileSize) {
    this.log('文件上传', { fileName, fileType, fileSize: `${(fileSize / 1024).toFixed(2)}KB` }, 'architecture-import', 'file-upload');
  }

  // 模块操作
  logModuleAction(action, moduleCount, moduleNames = []) {
    this.log(`模块${action}`, { count: moduleCount, names: moduleNames }, 'architecture-import', 'module-list');
  }

  // 约束操作
  logConstraintAction(action, constraintCount, constraintDetails = {}) {
    this.log(`约束${action}`, { count: constraintCount, details: constraintDetails }, 'constraints', 'constraint-editor');
  }

  // 解决方案生成
  logGenerationStart(moduleCount, constraintCount) {
    this.log('开始生成方案', { moduleCount, constraintCount }, 'generation', 'solution-generator');
  }

  // 解决方案查看
  logSolutionView(solutionIndex, solutionId) {
    this.log('查看方案', { index: solutionIndex, id: solutionId }, 'solutions', 'solution-viewer');
  }

  // 解决方案导出
  logExport(format, solutionCount) {
    this.log('导出方案', { format, count: solutionCount }, 'solutions', 'export-button');
  }

  // 解决方案选择
  logSolutionSelect(solutionId, isSelected) {
    this.log(isSelected ? '选择方案' : '取消选择方案', { solutionId }, 'solutions', 'solution-checkbox');
  }

  // 方案筛选
  logFilterApply(filterCriteria) {
    this.log('应用筛选', filterCriteria, 'solutions', 'filter-panel');
  }

  // 方案排序
  logSortChange(sortField, sortOrder) {
    this.log('排序变更', { field: sortField, order: sortOrder }, 'solutions', 'sort-dropdown');
  }

  // 按钮点击
  logButtonClick(buttonId, buttonText) {
    this.log('点击按钮', { id: buttonId, text: buttonText }, 'common', 'button');
  }

  // 导航点击
  logNavClick(navItem) {
    this.log('点击导航', { item: navItem }, 'common', 'navigation');
  }
}

// 创建全局日志实例
window.frontendLogger = new FrontendLogger();