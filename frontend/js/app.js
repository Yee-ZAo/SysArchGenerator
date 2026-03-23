// 应用主控制器
class AppController {
  constructor() {
    this.currentPage = 'architecture-import';//
    this.modules = [];
    this.constraints = [];
    this.solutions = [];
    this.filteredSolutions = [];
    this.currentSolutionIndex = 0;
    this.currentSolution = null;
    this.selectedSolutions = new Set();

    this.init();
  }
// 初始化应用
  init() {
    this.initNavigation();
    this.initFileUpload();
    this.initEventListeners();
    this.loadDataFromStorage();
    this.updateStatus();

    // 动态设置后端API地址
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;
    if (protocol === 'file:' || hostname === '' || (hostname === 'localhost' && port === '')) {
      // 当通过文件协议访问或本地开发时，使用固定端口
      this.apiBaseUrl = 'http://localhost:3001/api';
      
      // 显示文件协议警告
      this.showNotification('警告：您正在通过文件协议访问此页面。这可能导致API请求失败。请通过 http://localhost:3001 访问。', 'warning');
    } else {
      // 否则使用当前页面的协议和主机
      this.apiBaseUrl = `${protocol}//${hostname}${port ? ':' + port : ''}/api`;
    }
    console.log('API基础URL:', this.apiBaseUrl);
    
    // 测试后端连接
    this.testBackendConnection();
  }

  // 测试后端连接
  async testBackendConnection() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`);
      if (response.ok) {
        const data = await response.json();
        console.log('后端连接正常:', data);
      } else {
        console.warn('后端连接异常，状态码:', response.status);
      }
    } catch (error) {
      console.error('无法连接到后端:', error.message);
      this.showNotification('无法连接到后端服务，请确保后端服务器正在运行。', 'error');
    }
  }

  // 初始化导航栏事件
  initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const pageId = item.getAttribute('data-page');
        // 记录导航点击
        if (window.frontendLogger) {
          window.frontendLogger.logNavClick(pageId);
        }
        this.switchPage(pageId);

        // 更新导航项状态
        navItems.forEach((nav) => nav.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }
// 初始化文件上传功能
  initFileUpload() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const loadBtn = document.getElementById('load-file-btn');
    const clearBtn = document.getElementById('clear-file-btn');
    const refreshBtn = document.getElementById('refresh-modules');
    const clearModulesBtn = document.getElementById('clear-modules');
    const productLibraryInput = document.getElementById('product-library-input');
    const productLibraryBtn = document.getElementById('product-library-import-btn');
    const refreshProductLibraryBtn = document.getElementById('refresh-product-library');
    const clearProductLibraryBtn = document.getElementById('clear-product-library');

    if (!dropArea || !fileInput || !loadBtn || !clearBtn || !refreshBtn || !clearModulesBtn) {
      console.warn('文件上传相关元素未找到，跳过初始化');
      return;
    }

    // 拖放区域事件
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('dragover');
    });

    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('dragover');
    });

    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('dragover');

      if (e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        this.handleFileSelect(file);
        fileInput.files = e.dataTransfer.files;
      }
    });

    // 文件选择变化
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        const file = e.target.files[0];
        this.handleFileSelect(file);
      }
    });

    // 产品库文件选择变化
    if (productLibraryInput) {
      productLibraryInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
          const file = e.target.files[0];
          this.handleProductLibraryFileSelect(file);
        }
      });
    }

    // 加载文件按钮
    loadBtn.addEventListener('click', () => {
      // 记录文件加载事件
      if (window.frontendLogger && this.selectedFile) {
        window.frontendLogger.logFileUpload(
          this.selectedFile.name,
          this.selectedFile.type,
          this.selectedFile.size
        );
      }
      this.loadFile();
    });

    // 清空文件按钮
    clearBtn.addEventListener('click', () => {
      // 记录清空文件
      if (window.frontendLogger) {
        window.frontendLogger.log('清空已选文件', {}, 'architecture-import', 'file-upload');
      }
      this.clearFile();
    });

    // 刷新模块按钮
    refreshBtn.addEventListener('click', () => {
      // 记录刷新模块
      if (window.frontendLogger) {
        window.frontendLogger.log('刷新模块列表', { count: this.modules.length }, 'architecture-import', 'module-table');
      }
      this.updateModuleTable();
      this.showNotification('模块表格已刷新', 'info');
    });

    // 清除模块按钮
    clearModulesBtn.addEventListener('click', () => {
      // 记录清除模块
      if (window.frontendLogger) {
        window.frontendLogger.logModuleAction('清除', this.modules.length);
      }
      this.clearModules();
    });

    // 刷新产品库按钮
    if (refreshProductLibraryBtn) {
      refreshProductLibraryBtn.addEventListener('click', () => {
        this.updateProductLibraryTable();
        this.showNotification('产品库表格已刷新', 'info');
      });
    }

    // 清空产品库按钮
    if (clearProductLibraryBtn) {
      clearProductLibraryBtn.addEventListener('click', () => {
        this.clearProductLibrary();
      });
    }
  }

  switchPage(pageId) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach((page) => {
      page.classList.remove('active');
    });

    // 显示目标页面
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
      this.currentPage = pageId;

      // 页面特定初始化
      switch (pageId) {
        case 'architecture-import':
          this.updateModuleTable();
          break;
        case 'constraint-input':
          // 使用全局的constraintManager来更新约束表格
          if (window.constraintManager && typeof window.constraintManager.updateConstraintTable === 'function') {
            window.constraintManager.updateConstraintTable();
          }
          if (window.constraintManager && typeof window.constraintManager.populateModuleSelects === 'function') {
            window.constraintManager.populateModuleSelects();
          }
          break;
        case 'generation-design':
          if (window.SolutionManager && typeof window.SolutionManager.updateSolutionTable === 'function') {
            window.SolutionManager.updateSolutionTable();
          }
          if (window.SolutionManager && typeof window.SolutionManager.updateGenerationControls === 'function') {
            window.SolutionManager.updateGenerationControls();
          }
          break;
        case 'result-export':
          if (window.SolutionManager && typeof window.SolutionManager.updateExportControls === 'function') {
            window.SolutionManager.updateExportControls();
          }
          break;
        case 'product-library':
          this.updateProductLibraryTable();
          break;
      }
    }
  }

  handleFileSelect(file) {
    if (!file) return;

    // 更新文件信息显示
    document.getElementById('selected-file').textContent = file.name;
    document.getElementById('file-size').textContent = this.formatFileSize(file.size);
    document.getElementById('file-type').textContent = this.getFileType(file.name);

    // 启用加载按钮
    document.getElementById('load-file-btn').disabled = false;

    // 保存文件引用
    this.selectedFile = file;
  }
// 产品库文件处理
  async handleProductLibraryFileSelect(file) {
    if (!file) return;

    // 显示上传状态
    this.showNotification(`正在上传产品库文件: ${file.name}`, 'info');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${this.apiBaseUrl}/upload/product-library`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        this.showNotification(`产品库文件上传成功，已保存 ${result.count} 条记录`, 'success');
        // 清空文件输入，以便可以再次选择相同文件
        document.getElementById('product-library-input').value = '';
      } else {
        throw new Error(result.message || '产品库文件上传失败');
      }
    } catch (error) {
      console.error('产品库文件上传失败:', error);
      this.showNotification(`产品库文件上传失败: ${error.message}`, 'error');
    }
  }
// 加载文件到后端架构生成器
  async loadFile() {
    if (!this.selectedFile) {
      this.showNotification('请先选择文件', 'warning');
      return;
    }

    const loadBtn = document.getElementById('load-file-btn');
    const spinner = document.getElementById('load-spinner');

    // 显示加载状态
    loadBtn.disabled = true;
    spinner.classList.remove('d-none');

    try {
      // 创建FormData
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      // 发送到后端
      const response = await fetch(`${this.apiBaseUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        this.modules = result.modules;
        this.saveDataToStorage();
        this.updateModuleTable();
        this.updateStatus();

        this.showNotification(`成功加载 ${this.modules.length} 个模块`, 'success');

        // 更新信息显示
        const levelCount = new Set(this.modules.map((m) => m.level)).size;
        const interfaceCount = this.modules.reduce((sum, m) => sum + (m.interfaces ? m.interfaces.length : 0), 0);

        const infoText = `✓ 成功加载 ${this.modules.length} 个模块模板，${levelCount} 个层级，${interfaceCount} 个接口。\n文件: ${this.selectedFile.name}\n点击'约束输入'按钮添加约束条件，然后点击'创成生成'。`;
        const infoLabel = document.querySelector('.info-label');
        if (infoLabel) {
          infoLabel.textContent = infoText;
        }

        // 启用约束按钮
        const constraintButton = document.getElementById('constraint-button');
        const generateBtn = document.getElementById('generate-solutions-btn');
        if (constraintButton) constraintButton.disabled = false;
        if (generateBtn) generateBtn.disabled = false;
      } else {
        throw new Error(result.message || '加载文件失败');
      }
    } catch (error) {
      console.error('加载文件失败:', error);
      this.showNotification(`加载文件失败: ${error.message}`, 'error');
    } finally {
      // 恢复按钮状态
      loadBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  }

  clearFile() {
    document.getElementById('file-input').value = '';
    document.getElementById('selected-file').textContent = '无';
    document.getElementById('file-size').textContent = '-';
    document.getElementById('file-type').textContent = '-';
    document.getElementById('load-file-btn').disabled = true;
    this.selectedFile = null;

    this.showNotification('已清空文件选择', 'info');
  }

  clearModules() {
    if (this.modules.length === 0) {
      this.showNotification('当前没有模块数据可清除', 'info');
      return;
    }

    // 清除模块数据
    this.modules = [];

    // 更新本地存储
    this.saveDataToStorage();

    // 更新表格显示
    this.updateModuleTable();

    // 更新状态
    this.updateStatus();

    // 清除信息显示
    const infoLabel = document.querySelector('.info-label');
    if (infoLabel) {
      infoLabel.textContent = '请上传架构文件以加载模块信息';
    }

    // 禁用相关按钮
    document.getElementById('constraint-button').disabled = true;
    document.getElementById('generate-solutions-btn').disabled = true;

    this.showNotification(`已清除所有模块数据（共 ${this.modules.length} 个模块）`, 'success');
  }

  updateModuleTable() {
    const tbody = document.querySelector('#module-table tbody');
    if (!tbody) return;

    // 确保表头有正确数量的列
    const headerRow = document.querySelector('#module-table thead tr');
    if (headerRow) {
      const thCount = headerRow.querySelectorAll('th').length;
      const expectedHeaders = ['ID', '名称', '类型', '分类', '层级', '上级模块', '数量', '成本', '重量', '功耗', '可靠度', '接口数', '叶子模块'];
      if (thCount !== 13) {
        console.warn(`表头列数异常: 期望13列，实际${thCount}列，正在修复表头`);
        // 重新构建表头
        headerRow.innerHTML = '';
        expectedHeaders.forEach(headerText => {
          const th = document.createElement('th');
          th.textContent = headerText;
          headerRow.appendChild(th);
        });
        this.showNotification('表格列数已自动修复', 'info');
      }
    }

    tbody.innerHTML = '';

    if (this.modules.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="13" class="text-center">暂无模块数据</td>';
      tbody.appendChild(row);
      document.getElementById('module-table-count').textContent = '0';
      return;
    }

    // 构建父-子模块映射关系（基于模块名称）
    const childModulesMap = {};
    this.modules.forEach(module => {
      if (module.parent_module) {
        const parentName = module.parent_module;
        if (!childModulesMap[parentName]) {
          childModulesMap[parentName] = [];
        }
        childModulesMap[parentName].push(module.name);
      }
    });

    this.modules.forEach((module, index) => {
      const row = document.createElement('tr');

      // 数量（单值）
      const quantityValue = module.quantity || 1;

      // 成本（单值）
      const costValue = module.properties.cost || 0;

      // 重量（单值）
      const weightValue = module.properties.weight || 0;

      // 功耗（单值）
      const powerValue = module.properties.power || 0;

      // 可靠度（单值）
      const reliabilityValue = module.properties.reliability || 0;

      // 接口数量
      const interfaceCount = module.interfaces ? module.interfaces.length : 0;

      // 分类
      const categories = module.categories ? module.categories.join(', ') : '';

      // 判断是否为叶子模块
      // 方法1：检查是否有模块将此模块作为父模块（通过parent_module字段）
      const hasChildrenViaParent = this.modules.some(m => m.parent_module === module.name);
      // 方法2：检查childModulesMap中是否有此模块的子模块
      const hasChildrenViaMap = childModulesMap[module.name] && childModulesMap[module.name].length > 0;
      // 方法3：检查模块自身的child_modules数组（如果后端提供了该字段）
      const hasChildrenViaOwn = module.child_modules && module.child_modules.length > 0;
      
      const hasChildren = hasChildrenViaParent || hasChildrenViaMap || hasChildrenViaOwn;
      const isLeafModule = !hasChildren;

      row.innerHTML = `
                <td>${module.id || index + 1}</td>
                <td>${module.name}</td>
                <td>${module.module_type || ''}</td>
                <td>${categories}</td>
                <td>${module.level}</td>
                <td>${module.parent_module || ''}</td>
                <td>${quantityValue}</td>
                <td>${costValue}</td>
                <td>${weightValue}</td>
                <td>${powerValue}</td>
                <td>${reliabilityValue}</td>
                <td>${interfaceCount}</td>
                <td class="leaf-module">${isLeafModule ? '✓' : ''}</td>
            `;

      tbody.appendChild(row);
    });

    document.getElementById('module-table-count').textContent = this.modules.length;
  }

  updateStatus() {
    document.getElementById('module-count').textContent = this.modules.length;
    document.getElementById('constraint-count').textContent = this.constraints.length;
    document.getElementById('solution-count').textContent = this.solutions.length;
  }

  initEventListeners() {
    // 全局事件监听器
    document.addEventListener('click', (e) => {
      // 关闭模态框
      if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal-overlay')) {
        this.closeModal();
      }
    });
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
      json: 'JSON',
      xlsx: 'Excel',
      xls: 'Excel',
      xml: 'XML',
    };

    return types[ext] || '未知格式';
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const iconMap = {
      success: 'fa-check-circle',
      warning: 'fa-exclamation-triangle',
      error: 'fa-times-circle',
      info: 'fa-info-circle',
    };

    notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas ${iconMap[type] || 'fa-info-circle'}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">&times;</button>
        `;

    container.appendChild(notification);

    // 自动移除通知
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 5000);

    // 点击关闭
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    });
  }

  showModal(title, content, buttons = []) {
    const modalContainer = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');

    modalTitle.textContent = title;
    modalBody.innerHTML = content;

    // 清空按钮
    modalFooter.innerHTML = '';

    // 添加按钮
    buttons.forEach((button) => {
      const btn = document.createElement('button');
      btn.className = `btn ${button.class || 'btn-secondary'}`;
      btn.textContent = button.text;

      if (button.id) {
        btn.id = button.id;
      }

      if (button.onClick) {
        btn.addEventListener('click', button.onClick);
      }

      modalFooter.appendChild(btn);
    });

    // 显示模态框
    modalContainer.classList.remove('d-none');
  }

  closeModal() {
    document.getElementById('modal-container').classList.add('d-none');
  }

  saveDataToStorage() {
    // 保存数据到本地存储
    localStorage.setItem('architecture-modules', JSON.stringify(this.modules));
    localStorage.setItem('architecture-constraints', JSON.stringify(this.constraints));
    localStorage.setItem('architecture-solutions', JSON.stringify(this.solutions));
  }

  loadDataFromStorage() {
    // 从本地存储加载数据
    try {
      const modulesData = localStorage.getItem('architecture-modules');
      if (modulesData) {
        this.modules = JSON.parse(modulesData);
      }

      const constraintsData = localStorage.getItem('architecture-constraints');
      if (constraintsData) {
        this.constraints = JSON.parse(constraintsData);
      }

      const solutionsData = localStorage.getItem('architecture-solutions');
      if (solutionsData) {
        this.solutions = JSON.parse(solutionsData);
        this.filteredSolutions = [...this.solutions];
      }
    } catch (error) {
      console.error('加载存储数据失败:', error);
    }
  }

  // 更新产品库表格
  async updateProductLibraryTable() {
    const tbody = document.querySelector('#product-library-table tbody');
    if (!tbody) return;

    try {
      // 从后端获取产品库数据
      const response = await fetch(`${this.apiBaseUrl}/product-library`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const modules = result.modules || [];

      tbody.innerHTML = '';

      if (modules.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="9" class="text-center">暂无产品库数据</td>';
        tbody.appendChild(row);
        document.getElementById('product-library-count').textContent = '0';
        return;
      }

      // 格式化接口信息的辅助函数
      const formatInterfaces = (interfaces) => {
        if (!interfaces || interfaces.length === 0) {
          return '无接口';
        }
        return interfaces.map(intf => {
          const name = intf.name || '未命名';
          const type = intf.type || '未知';
          const ioType = intf.io_type || '未知';
          const maxConn = intf.max_connections || 1;
          return `${name}(${type}, ${ioType}, 最大连接:${maxConn})`;
        }).join('<br>');
      };

      modules.forEach((module, index) => {
        const row = document.createElement('tr');

        // 提取模块信息
        const moduleName = module.name || '';
        const moduleType = module.module_type || '';
        const categories = module.categories ? module.categories.join(', ') : '';
        const cost = module.properties?.cost || 0;
        const weight = module.properties?.weight || 0;
        const power = module.properties?.power || 0;
        const reliability = module.properties?.reliability || 0;
        const interfaceDetails = formatInterfaces(module.interfaces);

        row.innerHTML = `
          <td>${module.id || index + 1}</td>
          <td>${moduleName}</td>
          <td>${moduleType}</td>
          <td>${categories}</td>
          <td>${cost}</td>
          <td>${weight}</td>
          <td>${power}</td>
          <td>${reliability}</td>
          <td class="interface-details">${interfaceDetails}</td>
        `;

        tbody.appendChild(row);
      });

      document.getElementById('product-library-count').textContent = modules.length;
    } catch (error) {
      console.error('获取产品库数据失败:', error);
      this.showNotification(`获取产品库数据失败: ${error.message}`, 'error');
    }
  }

  // 清空产品库数据
  async clearProductLibrary() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/product-library`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        this.showNotification('产品库数据已清空', 'success');
        this.updateProductLibraryTable();
      } else {
        throw new Error(result.message || '清空产品库失败');
      }
    } catch (error) {
      console.error('清空产品库失败:', error);
      this.showNotification(`清空产品库失败: ${error.message}`, 'error');
    }
  }
}

// 初始化应用
let app;

document.addEventListener('DOMContentLoaded', () => {
  app = new AppController();
  window.app = app; // 确保app在全局可用

  // 尝试初始化可视化管理器
  if (window.initVisualizationManager) {
    window.initVisualizationManager();
  }
});
