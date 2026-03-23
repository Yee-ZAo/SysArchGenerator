// 解决方案管理模块
/**
 * 创成设计界面
 *
 * 创成设计流程:
 * 1. 模块信息列表生成：识别根模块与叶子模块
 * 2. 从产品库筛选候选模块（按参数约束）
 * 3. 约束输入：用户根据模块的category输入连接关系约束与参数约束
 * 4. 创成设计：基于CSP算法生成所有满足约束条件的方案
 * 5. 实时进度显示：生成过程中实时显示进度
 *
 * 性能要求:
 * - 不设置任何数量上限
 * - 合理运用内存
 * - 保证算法健壮性
 */
class SolutionManager {
  constructor(app) {
    this.app = app;
    this.currentPage = 1;
    this.pageSize = 10;
    this.isGenerating = false;
    this.generationWorker = null;
    this.currentPhase = '';
    this.phaseTotal = 0;
    this.solutionCount = 0;

    this.init();
  }

  init() {
    this.initSolutionTable();
    this.initEventListeners();
    this.initGenerationControls();
    this.initExportControls();
    this.updateGenerationStatus();
  }

  /**
   * 更新生成状态信息
   */
  updateGenerationStatus() {
    const statusContainer = document.getElementById('generation-status');
    if (statusContainer) {
      const rootModulesCount = this.countRootModules();
      const leafModulesCount = this.countLeafModules();
      
      statusContainer.innerHTML = `
        <div class="generation-status-content">
          <div class="status-item">
            <span class="status-label">根模块:</span>
            <span class="status-value">${rootModulesCount} 个</span>
            <span class="status-hint">（参数作为约束标准）</span>
          </div>
          <div class="status-item">
            <span class="status-label">叶子模块:</span>
            <span class="status-value">${leafModulesCount} 个</span>
            <span class="status-hint">（作为匹配条件）</span>
          </div>
        </div>
      `;
    }
  }

  /**
   * 统计根模块数量（没有父模块的模块）
   */
  countRootModules() {
    if (!this.app.modules || !Array.isArray(this.app.modules)) return 0;
    return this.app.modules.filter(m => {
      const hasParent = (m.parent_module || m.parentModule) &&
                        (m.parent_module || m.parentModule).trim() !== '';
      return !hasParent;
    }).length;
  }

  /**
   * 统计叶子模块数量（没有子模块的模块）
   */
  countLeafModules() {
    if (!this.app.modules || !Array.isArray(this.app.modules)) return 0;
    
    const parentNames = new Set();
    this.app.modules.forEach(m => {
      const parentName = m.parent_module || m.parentModule;
      if (parentName && parentName.trim() !== '') {
        parentNames.add(parentName);
      }
    });
    
    return this.app.modules.filter(m => {
      const hasChildrenViaArray = m.child_modules && m.child_modules.length > 0;
      const hasChildrenViaParent = this.app.modules.some(other =>
        (other.parent_module || other.parentModule) === m.name
      );
      return !hasChildrenViaArray && !hasChildrenViaParent;
    }).length;
  }

  // 初始化解决方案表格
  initSolutionTable() {
    const table = document.getElementById('solution-table');

    // 行点击选择
    table.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row || !row.dataset.solutionId) return;

      // 【修复】方案ID可能是字符串或数字，不使用parseInt
      const solutionId = row.dataset.solutionId;
      this.selectSolution(solutionId);
    });

    // 方案筛选
    document.getElementById('filter-solutions').addEventListener('click', () => {
      this.filterSolutions();
    });

    document.getElementById('solution-filter').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.filterSolutions();
      }
    });

    // 分页
    this.initPagination();
  }

  initEventListeners() {
    // 上一个方案按钮
    document.getElementById('prev-solution').addEventListener('click', () => {
      this.showPrevSolution();
    });

    // 下一个方案按钮
    document.getElementById('next-solution').addEventListener('click', () => {
      this.showNextSolution();
    });

    // 清空方案按钮
    document.getElementById('clear-solutions-btn').addEventListener('click', () => {
      this.clearSolutions();
    });
  }

  // 初始化生成控制按钮
  initGenerationControls() {
    const generateBtn = document.getElementById('generate-solutions-btn');
    const stopBtn = document.getElementById('stop-generation-btn');
    const clearBtn = document.getElementById('clear-solutions-btn');
    const refreshBtn = document.getElementById('refresh-controls-btn');

    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        // 记录开始生成方案
        if (window.frontendLogger) {
          window.frontendLogger.logGenerationStart(
            this.app.modules ? this.app.modules.length : 0,
            this.app.constraints ? this.app.constraints.length : 0
          );
        }
        this.generateSolutions();
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        // 记录停止生成
        if (window.frontendLogger) {
          window.frontendLogger.log('停止生成方案', {}, 'generation', 'stop-button');
        }
        this.stopGeneration();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        // 记录刷新
        if (window.frontendLogger) {
          window.frontendLogger.log('刷新生成状态', {}, 'generation', 'refresh-button');
        }
        this.updateGenerationControls();
        this.app.showNotification('已刷新模块和约束状态信息', 'info');
      });
    }

    // 更新控制信息
    this.updateGenerationControls();
  }

  // 更新生成控制状态
  initExportControls() {
    // 导出格式选择
    document.querySelectorAll('.format-option').forEach((option) => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.format-option').forEach((opt) => {
          opt.classList.remove('active');
        });
        option.classList.add('active');

        // 更新文件扩展名
        const format = option.getAttribute('data-format');
        const extension = format === 'json' ? '.json' : format === 'excel' ? '.xlsx' : format === 'html' ? '.html' : '.txt';
        document.getElementById('file-extension').textContent = extension;
      });
    });

    // 导出范围选择
    document.querySelectorAll('.range-option').forEach((option) => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.range-option').forEach((opt) => {
          opt.classList.remove('active');
        });
        option.classList.add('active');
        this.updateExportSummary();
      });
    });

    // 导出按钮
    document.getElementById('export-btn').addEventListener('click', () => {
      // 记录导出操作
      if (window.frontendLogger) {
        const selectedCount = this.app.selectedSolutions ? this.app.selectedSolutions.size : 0;
        const format = document.querySelector('.format-option.active')?.textContent || 'unknown';
        window.frontendLogger.logExport(format, selectedCount);
      }
      this.exportSolutions();
    });

    // 预览按钮
    document.getElementById('preview-export-btn').addEventListener('click', () => {
      // 记录预览操作
      if (window.frontendLogger) {
        window.frontendLogger.log('预览导出数据', {}, 'solutions', 'preview-button');
      }
      this.previewExportData();
    });

    // 关闭预览按钮
    document.getElementById('close-preview-btn').addEventListener('click', () => {
      document.getElementById('export-preview-card').classList.add('d-none');
    });
  }

  initPagination() {
    const paginationContainer = document.getElementById('solution-pagination');

    // 创建分页控件
    this.renderPagination();
  }

  // 更新方案表格显示
  updateSolutionTable() {
    const tbody = document.querySelector('#solution-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

      if (this.app.filteredSolutions.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="text-center">暂无方案数据</td>';
        tbody.appendChild(row);
        document.getElementById('solution-table-count').textContent = '0';
        return;
      }

    // 计算分页
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, this.app.filteredSolutions.length);
    const pageSolutions = this.app.filteredSolutions.slice(startIndex, endIndex);

    pageSolutions.forEach((solution) => {
      const row = document.createElement('tr');
      row.dataset.solutionId = solution.id;

      // 如果当前方案被选中，添加选中样式
      if (this.app.currentSolution && solution.id === this.app.currentSolution.id) {
        row.classList.add('selected');
      }

      // 如果方案在选中集合中，添加标记
      if (this.app.selectedSolutions.has(solution.id)) {
        row.classList.add('selected-solution');
      }

        row.innerHTML = `
            <td>${solution.id}</td>
            <td>${solution.modules ? solution.modules.length : 0}</td>
            <td>${solution.connections ? solution.connections.length : 0}</td>
            <td>${solution.total_cost !== undefined ? solution.total_cost.toFixed(2) : (solution.total_cost_min ? solution.total_cost_min.toFixed(2) : 0)}</td>
            <td>${solution.total_weight !== undefined ? solution.total_weight.toFixed(2) : (solution.total_weight_min ? solution.total_weight_min.toFixed(2) : 0)}</td>
            <td>${solution.total_power !== undefined ? solution.total_power.toFixed(2) : (solution.total_power_min ? solution.total_power_min.toFixed(2) : 0)}</td>
            <td>${solution.total_reliability !== undefined ? solution.total_reliability.toFixed(4) : (solution.total_reliability_min ? solution.total_reliability_min.toFixed(4) : 0)}</td>
            <td class="action-cell">
                <button class="btn btn-sm btn-primary view-solution-btn" data-id="${solution.id}" title="查看详情">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-info topology-btn" data-id="${solution.id}" title="查看拓扑图">
                    <i class="fas fa-project-diagram"></i>
                </button>
                <button class="btn btn-sm btn-secondary select-solution-btn" data-id="${solution.id}" title="选中方案">
                    <i class="fas fa-check"></i>
                </button>
            </td>
        `;

      tbody.appendChild(row);
    });

    document.getElementById('solution-table-count').textContent = this.app.filteredSolutions.length;

    // 事件委托处理（修复动态按钮事件绑定问题）
    document.getElementById('solution-table').addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.view-solution-btn');
      const topologyBtn = e.target.closest('.topology-btn');
      const selectBtn = e.target.closest('.select-solution-btn');

      if (viewBtn) {
        e.stopPropagation();
        // 【修复】方案ID可能是字符串或数字，不使用parseInt
        const solutionId = viewBtn.getAttribute('data-id');
        this.selectSolution(solutionId);
        return;
      }

      if (topologyBtn) {
        e.stopPropagation();
        // 【修复】方案ID可能是字符串或数字，不使用parseInt
        const solutionId = topologyBtn.getAttribute('data-id');
        this.showSolutionTopology(solutionId);
        return;
      }

      if (selectBtn) {
        e.stopPropagation();
        // 【修复】方案ID可能是字符串或数字，不使用parseInt
        const solutionId = selectBtn.getAttribute('data-id');
        this.toggleSolutionSelection(solutionId);
      }
    });

    // 更新分页
    this.renderPagination();
  }

  renderPagination() {
    const paginationContainer = document.getElementById('solution-pagination');
    if (!paginationContainer) return;

    const totalPages = Math.ceil(this.app.filteredSolutions.length / this.pageSize);

    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    let html = '';

    // 上一页按钮
    html += `<button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">
                    <i class="fas fa-chevron-left"></i>
                 </button>`;

    // 页码按钮
    const maxVisiblePages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    // 下一页按钮
    html += `<button class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} data-page="${this.currentPage + 1}">
                    <i class="fas fa-chevron-right"></i>
                 </button>`;

    paginationContainer.innerHTML = html;

    // 为分页按钮添加事件监听器
    paginationContainer.querySelectorAll('.pagination-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.getAttribute('data-page'));
        if (page && page !== this.currentPage) {
          this.currentPage = page;
          this.updateSolutionTable();
        }
      });
    });
  }

  selectSolution(solutionId) {
    // 【修复】使用宽松比较（==）以支持字符串和数字类型的ID
    const solution = this.app.filteredSolutions.find((s) => s.id == solutionId);
    if (!solution) return;

    this.app.currentSolution = solution;
    this.app.currentSolutionIndex = this.app.filteredSolutions.findIndex((s) => s.id == solutionId);

    // 更新表格选中状态
    document.querySelectorAll('#solution-table tbody tr').forEach((row) => {
      row.classList.remove('selected');
      // 【修复】使用宽松比较支持字符串和数字类型的ID
      if (row.dataset.solutionId == solutionId) {
        row.classList.add('selected');
      }
    });

    // 更新导航按钮状态
    this.updateNavigationButtons();

    // 显示方案详情
    this.showSolutionDetail(solution);

    // 更新拓扑图
    if (window.visualizationManager) {
      window.visualizationManager.displaySolution(solution);
    }
  }

  // 显示方案详情
  showSolutionDetail(solution) {
    const detailContainer = document.getElementById('solution-detail');

    if (!solution) {
      detailContainer.innerHTML = `
                <div class="no-solution-selected">
                    <i class="fas fa-info-circle fa-3x"></i>
                    <h4>未选择方案</h4>
                    <p>请从左侧方案列表中选择一个方案查看详情</p>
                </div>
            `;
      return;
    }

    // 空值处理函数
    const safeValue = (val, defaultValue = 0) => (val !== undefined && val !== null ? val : defaultValue);

    // 统计模块类型
    const moduleStats = {};
    if (solution.modules) {
      solution.modules.forEach((module) => {
        if (!moduleStats[module.name]) {
          moduleStats[module.name] = 0;
        }
        moduleStats[module.name]++;
      });
    }

    let moduleStatsHtml = '';
    Object.keys(moduleStats).forEach((moduleName) => {
      moduleStatsHtml += `<li>${moduleName}: ${moduleStats[moduleName]}个</li>`;
    });

    detailContainer.innerHTML = `
            <div class="solution-detail-content">
                <h4>方案 #${solution.id}</h4>
                <div class="solution-stats">
                    <div class="stat-item">
                        <span class="stat-label">模块数量:</span>
                        <span class="stat-value">${solution.modules ? solution.modules.length : 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">连接数量:</span>
                        <span class="stat-value">${solution.connections ? solution.connections.length : 0}</span>
                    </div>
                    
                    <div class="stat-item">
                        <span class="stat-label">总成本:</span>
                        <span class="stat-value">${safeValue(solution.total_cost_min).toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">总重量:</span>
                        <span class="stat-value">${safeValue(solution.total_weight_min).toFixed(2)}</span>
                    </div>
                <div class="stat-item">
                    <span class="stat-label">总功耗:</span>
                    <span class="stat-value">${solution.total_power_min ? solution.total_power_min.toFixed(2) : 0}</span>
                </div>
                    <div class="stat-item">
                        <span class="stat-label">系统可靠度:</span>
                        <span class="stat-value">${safeValue(solution.total_reliability_min).toFixed(4)}</span>
                    </div>
                </div>
                
                <h5 class="mt-3">模块统计</h5>
                <ul class="module-list">
                    ${moduleStatsHtml}
                </ul>
                
                ${solution.connections && solution.connections.length > 0 ? `
                <h5 class="mt-3">连接列表</h5>
                <div class="connections-list">
                    ${solution.connections.slice(0, 5).map((conn) => `
                        <div class="connection-item">
                            ${conn.source_module_id} (${conn.source_interface_name}) → ${conn.target_module_id} (${conn.target_interface_name}) [${conn.interface_type}]
                        </div>
                    `).join('')}
                    ${solution.connections.length > 5 ? `<div class="text-muted">... 还有 ${solution.connections.length - 5} 个连接</div>` : ''}
                </div>
                ` : ''}
            </div>
        `;
  }

  updateNavigationButtons() {
    const hasSolutions = this.app.filteredSolutions.length > 0;
    const prevBtn = document.getElementById('prev-solution');
    const nextBtn = document.getElementById('next-solution');
    const navText = document.getElementById('solution-nav-text');

    if (hasSolutions) {
      prevBtn.disabled = this.app.currentSolutionIndex <= 0;
      nextBtn.disabled = this.app.currentSolutionIndex >= this.app.filteredSolutions.length - 1;
      navText.textContent = `${this.app.currentSolutionIndex + 1}/${this.app.filteredSolutions.length}`;
    } else {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      navText.textContent = '0/0';
    }
  }

  showPrevSolution() {
    if (this.app.currentSolutionIndex > 0) {
      this.app.currentSolutionIndex--;
      const solution = this.app.filteredSolutions[this.app.currentSolutionIndex];
      this.selectSolution(solution.id);
    }
  }

  showNextSolution() {
    if (this.app.currentSolutionIndex < this.app.filteredSolutions.length - 1) {
      this.app.currentSolutionIndex++;
      const solution = this.app.filteredSolutions[this.app.currentSolutionIndex];
      this.selectSolution(solution.id);
    }
  }

  filterSolutions() {
    const filterText = document.getElementById('solution-filter').value.toLowerCase();

    if (!filterText) {
      this.app.filteredSolutions = [...this.app.solutions];
    } else {
      this.app.filteredSolutions = this.app.solutions.filter((solution) =>
      // 根据ID、模块数、成本等过滤
        solution.id.toString().includes(filterText)
                       || (solution.modules && solution.modules.length.toString().includes(filterText))
                       || (solution.total_cost_min && solution.total_cost_min.toString().includes(filterText))
                       || (solution.total_cost_max && solution.total_cost_max.toString().includes(filterText)));
    }

    this.currentPage = 1;
    this.updateSolutionTable();
  }

  toggleSolutionSelection(solutionId) {
    if (this.app.selectedSolutions.has(solutionId)) {
      this.app.selectedSolutions.delete(solutionId);
    } else {
      this.app.selectedSolutions.add(solutionId);
    }

    // 更新表格显示
    const row = document.querySelector(`tr[data-solution-id="${solutionId}"]`);
    if (row) {
      if (this.app.selectedSolutions.has(solutionId)) {
        row.classList.add('selected-solution');
      } else {
        row.classList.remove('selected-solution');
      }
    }

    // 更新导出统计
    this.updateExportControls();
  }

  // 显示方案的架构拓扑图
  showSolutionTopology(solutionId) {
    // 【修复】使用宽松比较（==）以支持字符串和数字类型的ID
    const solution = this.app.filteredSolutions.find((s) => s.id == solutionId);
    if (!solution) {
      this.app.showNotification('未找到该方案', 'warning');
      return;
    }

    // 先选中该方案
    this.selectSolution(solutionId);

    // 滚动到拓扑图区域
    const topologyContainer = document.getElementById('topology-container');
    if (topologyContainer) {
      topologyContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 确保可视化管理器已初始化并显示方案
    if (window.visualizationManager) {
      window.visualizationManager.displaySolution(solution);
      this.app.showNotification(`正在显示方案 #${solutionId} 的拓扑图`, 'info');
    } else {
      this.app.showNotification('可视化管理器未初始化，请刷新页面重试', 'error');
    }
  }

  async generateSolutions() {
    if (this.app.modules.length === 0) {
      this.app.showNotification('请先加载系统架构文件', 'warning');
      return;
    }

    if (this.isGenerating) {
      this.app.showNotification('方案生成正在进行中', 'warning');
      return;
    }

    // 显示进度条
    const progressContainer = document.getElementById('generation-progress');
    const generateBtn = document.getElementById('generate-solutions-btn');
    const stopBtn = document.getElementById('stop-generation-btn');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const generatedCountEl = document.getElementById('generated-count');

    progressContainer.classList.remove('d-none');
    generateBtn.classList.add('d-none');
    stopBtn.classList.remove('d-none');
    
    // 初始化进度显示
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    if (generatedCountEl) generatedCountEl.textContent = '0';

    this.isGenerating = true;
    this.currentPhase = '初始化';
    this.phaseTotal = 0;
    this.solutionCount = 0;

    try {
      // 准备生成数据 - 无数量上限
      const generationData = {
        modules: this.app.modules,
        constraints: this.app.constraints,
        max_solutions: Infinity, // 无数量上限
      };

      // 使用流式请求获取实时进度
      const apiUrl = `${this.app.apiBaseUrl}/generate`;
      console.log('正在请求API（流式响应）:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(generationData),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let solutions = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // 解析SSE消息
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留未完成的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              // 根据消息类型更新UI
              if (data.type === 'phase') {
                // 阶段更新
                this.currentPhase = data.message;
                this.phaseTotal = data.total || 0;
                console.log(`[阶段] ${data.message}`);
                this.updateProgressInfo(data.message, 0, data.total);
              } else if (data.type === 'module_combo') {
                // 模块组合进度
                const percent = this.phaseTotal > 0 ? Math.round((data.current / data.total) * 100) : 0;
                this.updateProgressInfo(`模块组合: ${data.current}/${data.total}`, percent, data.total);
              } else if (data.type === 'solution') {
                // 方案生成进度
                this.solutionCount = data.count;
                if (generatedCountEl) generatedCountEl.textContent = data.count;
              } else if (data.type === 'warning') {
                // 警告消息
                this.app.showNotification(data.message, 'warning');
              } else if (data.type === 'error') {
                // 错误消息
                throw new Error(data.message);
              } else if (data.type === 'complete') {
                // 完成消息
                solutions = data.solutions || [];
              }
            } catch (parseError) {
              console.warn('解析进度消息失败:', parseError, line);
            }
          }
        }
      }

      // 检查是否成功
      if (solutions.length === 0) {
        throw new Error('未生成有效方案');
      }
        
      // 格式化方案数据
      const processedSolutions = solutions.map(sol => ({
        id: sol.id || this.app.getNextSolutionId(),
        modules: sol.modules || [],
        connections: sol.connections || [],
        total_cost_min: sol.total_cost_min !== undefined ? sol.total_cost_min : 0,
        total_cost_max: sol.total_cost_max !== undefined ? sol.total_cost_max : 0,
        total_weight_min: sol.total_weight_min !== undefined ? sol.total_weight_min : 0,
        total_weight_max: sol.total_weight_max !== undefined ? sol.total_weight_max : 0,
        total_power_min: sol.total_power_min !== undefined ? sol.total_power_min : 0,
        total_power_max: sol.total_power_max !== undefined ? sol.total_power_max : 0,
        total_reliability_min: sol.total_reliability_min !== undefined ? sol.total_reliability_min : 0,
        total_reliability_max: sol.total_reliability_max !== undefined ? sol.total_reliability_max : 0
      }));

      this.app.solutions = processedSolutions;
      this.app.filteredSolutions = [...processedSolutions];
        
      this.app.saveDataToStorage();
      this.app.updateStatus();
      this.updateSolutionTable();
      this.updateGenerationControls();

      // 默认选择第一个方案并显示拓扑图
      if (solutions.length > 0) {
        const firstSolutionId = this.app.filteredSolutions[0].id;
        this.selectSolution(firstSolutionId);
        this.app.showNotification(`成功生成 ${solutions.length} 个方案`, 'success');
      } else {
        this.app.showNotification('未生成有效方案', 'warning');
      }
    } catch (error) {
      console.error('生成方案失败:', error);
      
      // 提供更具体的错误分类反馈
      const errorMessage = error.message.includes('后端返回的数据格式无效')
        ? '后端返回的数据格式无效，请联系开发者'
        : `生成方案失败: ${error.message}`;
        
      this.app.showNotification(errorMessage, 'error');
    } finally {
      // 恢复按钮状态
      progressContainer.classList.add('d-none');
      generateBtn.classList.remove('d-none');
      stopBtn.classList.add('d-none');
      this.isGenerating = false;
    }
  }

  /**
   * 更新进度信息显示
   */
  updateProgressInfo(message, percent, total) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    if (progressFill) {
      progressFill.style.width = `${Math.min(100, percent)}%`;
    }
    if (progressText) {
      progressText.textContent = `${Math.min(100, percent)}%`;
    }
    
    // 更新进度详情（可选）
    const progressDetail = document.getElementById('progress-detail');
    if (progressDetail) {
      progressDetail.textContent = message;
    }
  }

  stopGeneration() {
    if (this.generationWorker) {
      this.generationWorker.terminate();
      this.generationWorker = null;
    }

    this.isGenerating = false;

    const progressContainer = document.getElementById('generation-progress');
    const generateBtn = document.getElementById('generate-solutions-btn');
    const stopBtn = document.getElementById('stop-generation-btn');

    progressContainer.classList.add('d-none');
    generateBtn.classList.remove('d-none');
    stopBtn.classList.add('d-none');

    this.app.showNotification('已停止方案生成', 'info');
  }

  clearSolutions() {
    this.app.showModal(
      '确认清空',
      '确定要清空所有生成的方案吗？',
      [
        {
          text: '取消',
          class: 'btn-secondary',
          onClick: () => this.app.closeModal(),
        },
        {
          text: '确定清空',
          class: 'btn-danger',
          onClick: () => {
            this.app.solutions = [];
            this.app.filteredSolutions = [];
            this.app.selectedSolutions.clear();
            this.app.currentSolution = null;
            this.app.currentSolutionIndex = 0;
            this.app.saveDataToStorage();
            this.app.updateStatus();
            this.updateSolutionTable();
            this.showSolutionDetail(null);
            this.updateNavigationButtons();
            this.updateExportControls();
            this.app.closeModal();
            this.app.showNotification('已清空所有方案', 'success');
          },
        },
      ],
    );
  }

  updateGenerationControls() {
    const loadedModuleCount = document.getElementById('loaded-module-count');
    const loadedConstraintCount = document.getElementById('loaded-constraint-count');

    if (loadedModuleCount) {
      loadedModuleCount.textContent = this.app.modules.length;
    }

    if (loadedConstraintCount) {
      loadedConstraintCount.textContent = this.app.constraints.length;
    }

    // 更新生成按钮状态
    const generateBtn = document.getElementById('generate-solutions-btn');
    if (generateBtn) {
      generateBtn.disabled = this.app.modules.length === 0;
    }

    // 更新其他控制按钮状态
    const hasSolutions = this.app.solutions.length > 0;

    const autoLayoutBtn = document.getElementById('auto-layout-btn');
    const forceLayoutBtn = document.getElementById('force-layout-btn');
    const exportGraphBtn = document.getElementById('export-graph-btn');
    const showAllButton = document.getElementById('show-all-button');
    const exportAllButton = document.getElementById('export-all-button');
    const exportAllDisplayButton = document.getElementById('export-all-display-button');

    if (autoLayoutBtn) {
      autoLayoutBtn.disabled = !hasSolutions || !this.app.currentSolution;
    }

    if (forceLayoutBtn) {
      forceLayoutBtn.disabled = !hasSolutions || !this.app.currentSolution;
    }

    if (exportGraphBtn) {
      exportGraphBtn.disabled = !hasSolutions || !this.app.currentSolution;
    }

    if (showAllButton) {
      showAllButton.disabled = !hasSolutions;
    }

    if (exportAllButton) {
      exportAllButton.disabled = !hasSolutions;
    }

    if (exportAllDisplayButton) {
      exportAllDisplayButton.disabled = !hasSolutions;
    }
  }

  updateExportControls() {
    document.getElementById('all-solutions-count').textContent = this.app.solutions.length;
    document.getElementById('selected-solutions-count').textContent = this.app.selectedSolutions.size;

    // 更新导出按钮状态
    const exportBtn = document.getElementById('export-btn');
    exportBtn.disabled = this.app.solutions.length === 0;

    // 更新导出摘要
    this.updateExportSummary();
  }

  updateExportSummary() {
    const rangeOption = document.querySelector('.range-option.active');
    const range = rangeOption ? rangeOption.getAttribute('data-range') : 'all';

    let summary = '';

    if (this.app.solutions.length === 0) {
      summary = '<p>无方案可导出</p>';
    } else {
      let solutionCount; let moduleCount; let
        connectionCount;

      if (range === 'all') {
        solutionCount = this.app.solutions.length;
        moduleCount = this.app.solutions.reduce((sum, sol) => sum + (sol.modules ? sol.modules.length : 0), 0);
        connectionCount = this.app.solutions.reduce((sum, sol) => sum + (sol.connections ? sol.connections.length : 0), 0);
      } else if (range === 'selected') {
        const selectedSolutions = this.app.solutions.filter((sol) => this.app.selectedSolutions.has(sol.id));
        solutionCount = selectedSolutions.length;
        moduleCount = selectedSolutions.reduce((sum, sol) => sum + (sol.modules ? sol.modules.length : 0), 0);
        connectionCount = selectedSolutions.reduce((sum, sol) => sum + (sol.connections ? sol.connections.length : 0), 0);
      } else { // current
        if (this.app.currentSolution) {
          solutionCount = 1;
          moduleCount = this.app.currentSolution.modules ? this.app.currentSolution.modules.length : 0;
          connectionCount = this.app.currentSolution.connections ? this.app.currentSolution.connections.length : 0;
        } else {
          solutionCount = 0;
          moduleCount = 0;
          connectionCount = 0;
        }
      }

      const formatOption = document.querySelector('.format-option.active');
      const format = formatOption ? formatOption.getAttribute('data-format') : 'json';

      summary = `
                <p><strong>导出范围:</strong> ${range === 'all' ? '所有方案' : range === 'selected' ? '选中方案' : '当前方案'}</p>
                <p><strong>导出格式:</strong> ${format.toUpperCase()}</p>
                <p><strong>方案数量:</strong> ${solutionCount}</p>
                <p><strong>模块总数:</strong> ${moduleCount}</p>
                <p><strong>连接总数:</strong> ${connectionCount}</p>
                ${range === 'selected' && this.app.selectedSolutions.size === 0 ? '<p class="text-warning">未选中任何方案，将导出所有方案</p>' : ''}
            `;
    }

    document.getElementById('export-summary').innerHTML = summary;
  }

  async exportSolutions() {
    if (this.app.solutions.length === 0) {
      this.app.showNotification('没有可导出的方案', 'warning');
      return;
    }

    try {
      // 确定导出范围
      const rangeOption = document.querySelector('.range-option.active');
      const range = rangeOption ? rangeOption.getAttribute('data-range') : 'all';

      let solutionsToExport = [];

      if (range === 'all') {
        solutionsToExport = this.app.solutions;
      } else if (range === 'selected') {
        solutionsToExport = this.app.solutions.filter((sol) => this.app.selectedSolutions.has(sol.id));
        if (solutionsToExport.length === 0) {
          this.app.showNotification('未选中任何方案，将导出所有方案', 'warning');
          solutionsToExport = this.app.solutions;
        }
      } else { // current
        if (this.app.currentSolution) {
          solutionsToExport = [this.app.currentSolution];
        } else {
          this.app.showNotification('当前没有选中的方案', 'warning');
          return;
        }
      }

      // 确定导出格式
      const formatOption = document.querySelector('.format-option.active');
      const format = formatOption ? formatOption.getAttribute('data-format') : 'json';

      // 准备导出数据
      const exportData = {
        solutions: solutionsToExport,
        constraints: this.app.constraints,
        export_time: new Date().toISOString(),
        solution_count: solutionsToExport.length,
      };

      // 生成文件名
      const baseName = document.getElementById('export-filename').value || '架构方案_导出';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
        .replace('T', '_');
      const extension = format === 'json' ? '.json' : format === 'excel' ? '.xlsx' : format === 'html' ? '.html' : '.txt';
      const fileName = `${baseName}_${timestamp}${extension}`;

      // 根据格式导出
      if (format === 'json') {
        this.exportAsJson(exportData, fileName);
      } else if (format === 'excel') {
        await this.exportAsExcel(exportData, fileName);
      } else if (format === 'html') {
        this.exportAsHtml(exportData, fileName);
      } else {
        this.exportAsText(exportData, fileName);
      }
    } catch (error) {
      console.error('导出失败:', error);
      this.app.showNotification(`导出失败: ${error.message}`, 'error');
    }
  }

  exportAsJson(data, fileName) {
    // 格式化JSON导出数据，使其更加美观和结构化
    const formattedData = {
      _metadata: {
        title: '系统架构方案导出报告',
        version: '3.0',
        exportTime: new Date().toLocaleString('zh-CN'),
        generator: '系统架构创成生成工具',
        solutionCount: data.solution_count,
        totalModules: data.solutions.reduce((sum, s) => sum + (s.modules ? s.modules.length : 0), 0),
        totalConnections: data.solutions.reduce((sum, s) => sum + (s.connections ? s.connections.length : 0), 0),
        constraintCount: data.constraints ? data.constraints.length : 0
      },
      constraints: data.constraints || [],
      solutions: data.solutions.map((solution, index) => ({
        id: solution.id,
        name: solution.name || `解决方案 ${index + 1}`,
        summary: {
          moduleCount: solution.modules ? solution.modules.length : 0,
          connectionCount: solution.connections ? solution.connections.length : 0,
          totalCost: solution.total_cost_min || 0,
          totalWeight: solution.total_weight_min || 0,
          totalPower: solution.total_power_min || 0,
          reliability: solution.total_reliability_min || 0
        },
        modules: (solution.modules || []).map((module, mIndex) => ({
          id: module.id || `module-${mIndex}`,
          name: module.name || '未命名模块',
          // 【修复】模块类型优先使用categories数组，其次module_type/type
          type: (module.categories && module.categories.length > 0) ? module.categories.join(', ') : (module.module_type || module.type || '未知'),
          categories: module.categories || [],
          properties: {
            // 【修复】正确读取props对象内的属性值
            cost: module.properties?.cost || module.cost || module.cost_min || 0,
            weight: module.properties?.weight || module.weight || module.weight_min || 0,
            power: module.properties?.power || module.powerConsumption || module.power_min || 0,
            reliability: module.properties?.reliability || module.reliability || 0
          },
          interfaces: module.interfaces || []
        })),
        connections: (solution.connections || []).map((conn, cIndex) => ({
          id: conn.id || `connection-${cIndex}`,
          source: {
            // 【修复】支持Connection.toDict()输出格式和生成器格式
            module: conn.sourceModule || conn.source_module || conn.source_module_id || conn.source || '',
            interface: conn.sourceInterface || conn.source_interface || conn.source_interface_name || conn.sourceIntf || ''
          },
          target: {
            module: conn.targetModule || conn.target_module || conn.target_module_id || conn.target || '',
            interface: conn.targetInterface || conn.target_interface || conn.target_interface_name || conn.targetIntf || ''
          },
          type: conn.interface_type || conn.type || '数据'
        }))
      }))
    };

    const jsonStr = JSON.stringify(formattedData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.app.showNotification(`已导出JSON文件: ${fileName}`, 'success');
  }

  async exportAsExcel(data, fileName) {
    try {
      // 使用SheetJS库
      const wb = XLSX.utils.book_new();

      // 1. 创建报告概览工作表
      const reportInfo = [
        { 项目: '报告名称', 内容: '系统架构方案导出报告' },
        { 项目: '生成时间', 内容: new Date().toLocaleString('zh-CN') },
        { 项目: '方案总数', 内容: data.solution_count },
        { 项目: '模块总数', 内容: data.solutions.reduce((sum, s) => sum + (s.modules ? s.modules.length : 0), 0) },
        { 项目: '连接总数', 内容: data.solutions.reduce((sum, s) => sum + (s.connections ? s.connections.length : 0), 0) },
        { 项目: '约束条件数', 内容: data.constraints ? data.constraints.length : 0 },
        { 项目: '生成工具', 内容: '系统架构创成生成工具 v3.0' },
      ];
      const reportWs = XLSX.utils.json_to_sheet(reportInfo);
      XLSX.utils.book_append_sheet(wb, reportWs, '报告概览');

      // 2. 创建方案概览工作表
      const overviewData = data.solutions.map((solution, index) => ({
        序号: index + 1,
        方案编号: solution.id,
        方案名称: solution.name || `解决方案 ${index + 1}`,
        模块数量: solution.modules ? solution.modules.length : 0,
        连接数量: solution.connections ? solution.connections.length : 0,
        '总成本(元)': solution.total_cost_min || 0,
        '总重量(kg)': solution.total_weight_min || 0,
        '总功耗(W)': solution.total_power_min || 0,
        '系统可靠度(%)': solution.total_reliability_min ? (solution.total_reliability_min * 100).toFixed(2) : 0,
      }));
      const overviewWs = XLSX.utils.json_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(wb, overviewWs, '方案概览');

      // 3. 创建详细模块信息工作表
      const allModules = [];
      data.solutions.forEach((solution, solIndex) => {
        if (solution.modules && Array.isArray(solution.modules)) {
          solution.modules.forEach((module, modIndex) => {
            // 【修复】正确读取properties对象内的属性值
            const props = module.properties || {};
            allModules.push({
              方案序号: solIndex + 1,
              方案编号: solution.id,
              模块序号: modIndex + 1,
              模块名称: module.name || '未命名模块',
              // 【修复】模块类型优先使用categories数组
              模块类型: (module.categories && module.categories.length > 0) ? module.categories.join(', ') : (module.module_type || module.type || '未知'),
              '成本(元)': props.cost || module.cost || module.cost_min || 0,
              '重量(kg)': props.weight || module.weight || module.weight_min || 0,
              '功耗(W)': props.power || module.powerConsumption || module.power_min || 0,
              '可靠度(%)': (props.reliability || module.reliability) ? ((props.reliability || module.reliability) * 100).toFixed(2) : '-',
              接口数量: module.interfaces ? module.interfaces.length : 0,
            });
          });
        }
      });
      if (allModules.length > 0) {
        const modulesWs = XLSX.utils.json_to_sheet(allModules);
        XLSX.utils.book_append_sheet(wb, modulesWs, '模块详情');
      }

      // 4. 创建连接信息工作表
      const allConnections = [];
      data.solutions.forEach((solution, solIndex) => {
        if (solution.connections && Array.isArray(solution.connections)) {
          solution.connections.forEach((connection, connIndex) => {
            allConnections.push({
              方案序号: solIndex + 1,
              方案编号: solution.id,
              连接序号: connIndex + 1,
              // 【修复】支持Connection.toDict()输出格式和生成器格式
              源模块: connection.sourceModule || connection.source_module || connection.source_module_id || connection.source || '-',
              源接口: connection.sourceInterface || connection.source_interface || connection.source_interface_name || connection.sourceIntf || '-',
              目标模块: connection.targetModule || connection.target_module || connection.target_module_id || connection.target || '-',
              目标接口: connection.targetInterface || connection.target_interface || connection.target_interface_name || connection.targetIntf || '-',
              接口类型: connection.interface_type || connection.type || '数据',
            });
          });
        }
      });
      if (allConnections.length > 0) {
        const connectionsWs = XLSX.utils.json_to_sheet(allConnections);
        XLSX.utils.book_append_sheet(wb, connectionsWs, '连接详情');
      }

      // 5. 创建统计信息工作表
      const statsData = [];

      // 模块类型统计
      const moduleTypeStats = {};
      data.solutions.forEach((solution) => {
        if (solution.modules) {
          solution.modules.forEach((module) => {
            const type = module.type || module.module_type || '未知';
            if (!moduleTypeStats[type]) {
              moduleTypeStats[type] = 0;
            }
            moduleTypeStats[type]++;
          });
        }
      });

      const totalModules = Object.values(moduleTypeStats).reduce((sum, count) => sum + count, 0);
      Object.keys(moduleTypeStats).sort().forEach((moduleType) => {
        statsData.push({
          统计类型: '模块类型分布',
          名称: moduleType,
          数量: moduleTypeStats[moduleType],
          '占比(%)': totalModules > 0 ? (moduleTypeStats[moduleType] / totalModules * 100).toFixed(2) : 0,
        });
      });

      // 接口类型统计
      const interfaceTypeStats = {};
      data.solutions.forEach((solution) => {
        if (solution.connections) {
          solution.connections.forEach((connection) => {
            const type = connection.interface_type || connection.type || '数据';
            if (!interfaceTypeStats[type]) {
              interfaceTypeStats[type] = 0;
            }
            interfaceTypeStats[type]++;
          });
        }
      });

      const totalConnections = Object.values(interfaceTypeStats).reduce((sum, count) => sum + count, 0);
      Object.keys(interfaceTypeStats).sort().forEach((interfaceType) => {
        statsData.push({
          统计类型: '接口类型分布',
          名称: interfaceType,
          数量: interfaceTypeStats[interfaceType],
          '占比(%)': totalConnections > 0 ? (interfaceTypeStats[interfaceType] / totalConnections * 100).toFixed(2) : 0,
        });
      });

      // 参数统计
      if (data.solutions.length > 0) {
        const costs = data.solutions.map((s) => s.total_cost_min || 0).filter((v) => v > 0);
        const weights = data.solutions.map((s) => s.total_weight_min || 0).filter((v) => v > 0);
        const powers = data.solutions.map((s) => s.total_power_min || 0).filter((v) => v > 0);
        const reliabilities = data.solutions.map((s) => s.total_reliability_min || 0).filter((v) => v > 0);

        if (costs.length > 0) {
          statsData.push({ 统计类型: '成本统计', 名称: '最小值', 数量: Math.min(...costs).toFixed(2), '占比(%)': '-' });
          statsData.push({ 统计类型: '成本统计', 名称: '最大值', 数量: Math.max(...costs).toFixed(2), '占比(%)': '-' });
          statsData.push({ 统计类型: '成本统计', 名称: '平均值', 数量: (costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(2), '占比(%)': '-' });
        }
        if (weights.length > 0) {
          statsData.push({ 统计类型: '重量统计', 名称: '最小值', 数量: Math.min(...weights).toFixed(2), '占比(%)': '-' });
          statsData.push({ 统计类型: '重量统计', 名称: '最大值', 数量: Math.max(...weights).toFixed(2), '占比(%)': '-' });
          statsData.push({ 统计类型: '重量统计', 名称: '平均值', 数量: (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2), '占比(%)': '-' });
        }
        if (powers.length > 0) {
          statsData.push({ 统计类型: '功耗统计', 名称: '最小值', 数量: Math.min(...powers).toFixed(2), '占比(%)': '-' });
          statsData.push({ 统计类型: '功耗统计', 名称: '最大值', 数量: Math.max(...powers).toFixed(2), '占比(%)': '-' });
          statsData.push({ 统计类型: '功耗统计', 名称: '平均值', 数量: (powers.reduce((a, b) => a + b, 0) / powers.length).toFixed(2), '占比(%)': '-' });
        }
        if (reliabilities.length > 0) {
          statsData.push({ 统计类型: '可靠度统计', 名称: '最小值', 数量: (Math.min(...reliabilities) * 100).toFixed(2) + '%', '占比(%)': '-' });
          statsData.push({ 统计类型: '可靠度统计', 名称: '最大值', 数量: (Math.max(...reliabilities) * 100).toFixed(2) + '%', '占比(%)': '-' });
          statsData.push({ 统计类型: '可靠度统计', 名称: '平均值', 数量: (reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length * 100).toFixed(2) + '%', '占比(%)': '-' });
        }
      }

      const statsWs = XLSX.utils.json_to_sheet(statsData);
      XLSX.utils.book_append_sheet(wb, statsWs, '统计信息');

      // 写入文件
      XLSX.writeFile(wb, fileName);

      this.app.showNotification(`已导出Excel文件: ${fileName}`, 'success');
    } catch (error) {
      console.error('导出Excel失败:', error);
      throw new Error('导出Excel文件失败');
    }
  }

  exportAsText(data, fileName) {
    let text = '';
    
    // 报告标题
    text += '╔' + '═'.repeat(78) + '╗\n';
    text += '║' + '系统架构方案汇总报告'.padStart(50).padEnd(78) + '║\n';
    text += '╚' + '═'.repeat(78) + '╝\n\n';

    // 报告信息
    text += '┌─ 报告信息 ' + '─'.repeat(67) + '┐\n';
    text += `│  生成时间: ${new Date(data.export_time).toLocaleString('zh-CN')}\n`;
    text += `│  方案总数: ${data.solution_count} 个\n`;
    text += `│  模块总数: ${data.solutions.reduce((sum, s) => sum + (s.modules ? s.modules.length : 0), 0)} 个\n`;
    text += `│  连接总数: ${data.solutions.reduce((sum, s) => sum + (s.connections ? s.connections.length : 0), 0)} 个\n`;
    text += `│  约束条件: ${data.constraints ? data.constraints.length : 0} 个\n`;
    text += '└' + '─'.repeat(78) + '┘\n\n';

    // 方案概览
    text += '┌─ 一、方案概览 ' + '─'.repeat(62) + '┐\n';
    data.solutions.forEach((solution, index) => {
      const modules = solution.modules || [];
      const connections = solution.connections || [];
      text += '│\n';
      text += `│  【方案 ${index + 1}】 ID: ${solution.id}\n`;
      text += `│  ├─ 模块数量: ${modules.length} 个\n`;
      text += `│  ├─ 连接数量: ${connections.length} 个\n`;
      text += `│  ├─ 总成本: ¥${(solution.total_cost_min || 0).toLocaleString('zh-CN')}\n`;
      text += `│  ├─ 总重量: ${(solution.total_weight_min || 0).toFixed(2)} kg\n`;
      text += `│  ├─ 总功耗: ${(solution.total_power_min || 0).toFixed(2)} W\n`;
      text += `│  └─ 系统可靠度: ${((solution.total_reliability_min || 0) * 100).toFixed(2)}%\n`;
    });
    text += '│\n';
    text += '└' + '─'.repeat(78) + '┘\n\n';

    // 模块统计
    text += '┌─ 二、模块统计 ' + '─'.repeat(62) + '┐\n';
    const moduleTypeStats = {};
    data.solutions.forEach((solution) => {
      if (solution.modules) {
        solution.modules.forEach((module) => {
          const type = module.type || module.module_type || '未知';
          if (!moduleTypeStats[type]) {
            moduleTypeStats[type] = { count: 0, name: module.name || '未命名' };
          }
          moduleTypeStats[type].count++;
        });
      }
    });

    text += '│\n';
    text += '│  模块类型分布:\n';
    Object.keys(moduleTypeStats).sort().forEach((type, idx) => {
      text += `│    ${idx + 1}. ${type}: ${moduleTypeStats[type].count} 个\n`;
    });
    text += '│\n';
    text += '└' + '─'.repeat(78) + '┘\n\n';

    // 连接统计
    text += '┌─ 三、连接统计 ' + '─'.repeat(62) + '┐\n';
    const interfaceStats = {};
    data.solutions.forEach((solution) => {
      if (solution.connections) {
        solution.connections.forEach((connection) => {
          const type = connection.interface_type || connection.type || '数据';
          if (!interfaceStats[type]) {
            interfaceStats[type] = 0;
          }
          interfaceStats[type]++;
        });
      }
    });

    text += '│\n';
    text += '│  接口类型分布:\n';
    Object.keys(interfaceStats).sort().forEach((type, idx) => {
      text += `│    ${idx + 1}. ${type}接口: ${interfaceStats[type]} 个连接\n`;
    });
    text += '│\n';
    text += '└' + '─'.repeat(78) + '┘\n\n';

    // 参数统计
    if (data.solutions.length > 0) {
      text += '┌─ 四、参数统计 ' + '─'.repeat(62) + '┐\n';
      text += '│\n';

      const costs = data.solutions.map((s) => s.total_cost_min || 0).filter((v) => v > 0);
      const weights = data.solutions.map((s) => s.total_weight_min || 0).filter((v) => v > 0);
      const powers = data.solutions.map((s) => s.total_power_min || 0).filter((v) => v > 0);
      const reliabilities = data.solutions.map((s) => s.total_reliability_min || 0).filter((v) => v > 0);

      if (costs.length > 0) {
        text += '│  【成本统计】\n';
        text += `│    最小值: ¥${Math.min(...costs).toLocaleString('zh-CN')}\n`;
        text += `│    最大值: ¥${Math.max(...costs).toLocaleString('zh-CN')}\n`;
        text += `│    平均值: ¥${(costs.reduce((a, b) => a + b, 0) / costs.length).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}\n`;
        text += '│\n';
      }

      if (weights.length > 0) {
        text += '│  【重量统计】\n';
        text += `│    最小值: ${Math.min(...weights).toFixed(2)} kg\n`;
        text += `│    最大值: ${Math.max(...weights).toFixed(2)} kg\n`;
        text += `│    平均值: ${(weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2)} kg\n`;
        text += '│\n';
      }

      if (powers.length > 0) {
        text += '│  【功耗统计】\n';
        text += `│    最小值: ${Math.min(...powers).toFixed(2)} W\n`;
        text += `│    最大值: ${Math.max(...powers).toFixed(2)} W\n`;
        text += `│    平均值: ${(powers.reduce((a, b) => a + b, 0) / powers.length).toFixed(2)} W\n`;
        text += '│\n';
      }

      if (reliabilities.length > 0) {
        text += '│  【可靠度统计】\n';
        text += `│    最小值: ${(Math.min(...reliabilities) * 100).toFixed(2)}%\n`;
        text += `│    最大值: ${(Math.max(...reliabilities) * 100).toFixed(2)}%\n`;
        text += `│    平均值: ${(reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length * 100).toFixed(2)}%\n`;
        text += '│\n';
      }

      text += '└' + '─'.repeat(78) + '┘\n\n';
    }

    // 详细方案信息
    text += '┌─ 五、方案详情 ' + '─'.repeat(62) + '┐\n';
    data.solutions.forEach((solution, index) => {
      const modules = solution.modules || [];
      const connections = solution.connections || [];
      
      text += '│\n';
      text += `│  ╔══ 方案 ${index + 1}: ${solution.name || `解决方案 #${solution.id}`} ══╗\n`;
      text += '│  ║\n';
      
      // 模块列表
      if (modules.length > 0) {
        text += '│  ║  【模块列表】\n';
        modules.forEach((module, mIdx) => {
          text += `│  ║    ${mIdx + 1}. ${module.name || '未命名'} (${module.type || module.module_type || '未知'})\n`;
        });
      }
      
      text += '│  ║\n';
      
      // 连接列表
      if (connections.length > 0) {
        text += '│  ║  【连接列表】\n';
        connections.forEach((conn, cIdx) => {
          const src = conn.sourceModule || conn.source_module || '-';
          const tgt = conn.targetModule || conn.target_module || '-';
          const type = conn.interface_type || conn.type || '数据';
          text += `│  ║    ${cIdx + 1}. ${src} → ${tgt} [${type}]\n`;
        });
      }
      
      text += '│  ╚══════════════════════════════════════════════════════════╝\n';
    });
    text += '│\n';
    text += '└' + '─'.repeat(78) + '┘\n\n';

    // 报告结尾
    text += '╔' + '═'.repeat(78) + '╗\n';
    text += '║' + '报告生成完毕'.padStart(45).padEnd(78) + '║\n';
    text += '║' + '系统架构创成生成工具 v3.0'.padStart(52).padEnd(78) + '║\n';
    text += '╚' + '═'.repeat(78) + '╝\n';

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.app.showNotification(`已导出文本报告: ${fileName}`, 'success');
  }

  exportAsHtml(data, fileName) {
    const exportDate = new Date().toLocaleString('zh-CN');
    
    let htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>系统架构方案报告</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Microsoft YaHei', 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 0;
            line-height: 1.8;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 40px;
            text-align: center;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        .header h1 {
            margin: 0 0 15px 0;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .header .subtitle {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            text-align: center;
            transition: transform 0.3s ease;
        }
        .summary-card:hover {
            transform: translateY(-5px);
        }
        .summary-card .icon {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .summary-card .value {
            font-size: 2em;
            font-weight: bold;
            color: #2a5298;
        }
        .summary-card .label {
            color: #666;
            font-size: 0.95em;
        }
        .solution {
            background: white;
            border-radius: 15px;
            margin-bottom: 25px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .solution-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px 30px;
        }
        .solution-header h2 {
            margin: 0 0 10px 0;
            font-size: 1.5em;
        }
        .solution-header .meta {
            opacity: 0.9;
            font-size: 0.95em;
        }
        .solution-body {
            padding: 30px;
        }
        .parameters {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .param-card {
            background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }
        .param-value {
            font-size: 1.8em;
            font-weight: bold;
            color: #2a5298;
        }
        .param-label {
            font-size: 0.9em;
            color: #666;
            margin-top: 5px;
        }
        .section-title {
            font-size: 1.3em;
            color: #1e3c72;
            margin: 25px 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 0.95em;
        }
        th, td {
            border: 1px solid #e0e0e0;
            padding: 12px 15px;
            text-align: left;
        }
        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: 600;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tr:hover {
            background-color: #e8f4f8;
        }
        .tag {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.85em;
            font-weight: 500;
        }
        .tag-success { background: #d4edda; color: #155724; }
        .tag-info { background: #cce5ff; color: #004085; }
        .tag-warning { background: #fff3cd; color: #856404; }
        .footer {
            text-align: center;
            padding: 30px;
            color: white;
            font-size: 0.9em;
            margin-top: 30px;
        }
        .footer a { color: #fff; }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #666;
            font-style: italic;
        }
        @media print {
            body { background: white; }
            .solution { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 系统架构方案报告</h1>
            <div class="subtitle">
                生成时间: ${exportDate} | 方案总数: ${data.solution_count}
            </div>
        </div>
        
        <div class="summary-cards">
            <div class="summary-card">
                <div class="icon">📋</div>
                <div class="value">${data.solution_count}</div>
                <div class="label">方案数量</div>
            </div>
            <div class="summary-card">
                <div class="icon">📦</div>
                <div class="value">${data.solutions.reduce((sum, s) => sum + (s.modules ? s.modules.length : 0), 0)}</div>
                <div class="label">模块总数</div>
            </div>
            <div class="summary-card">
                <div class="icon">🔗</div>
                <div class="value">${data.solutions.reduce((sum, s) => sum + (s.connections ? s.connections.length : 0), 0)}</div>
                <div class="label">连接总数</div>
            </div>
            <div class="summary-card">
                <div class="icon">⚙️</div>
                <div class="value">${data.constraints ? data.constraints.length : 0}</div>
                <div class="label">约束条件</div>
            </div>
        </div>`;

    // 添加每个解决方案的详细信息
    data.solutions.forEach((solution, index) => {
      const modules = solution.modules || [];
      const connections = solution.connections || [];
      
      // 计算参数
      const totalCost = solution.total_cost_min || 0;
      const totalWeight = solution.total_weight_min || 0;
      const totalPower = solution.total_power_min || 0;
      const totalReliability = solution.total_reliability_min || 0;

      htmlContent += `
        <div class="solution">
            <div class="solution-header">
                <h2>方案 ${index + 1}: ${solution.name || `解决方案 #${solution.id}`}</h2>
                <div class="meta">
                    ID: ${solution.id} | 模块数: ${modules.length} | 连接数: ${connections.length}
                </div>
            </div>
            
            <div class="solution-body">
                <div class="parameters">
                    <div class="param-card">
                        <div class="param-value">${(totalReliability * 100).toFixed(2)}%</div>
                        <div class="param-label">📊 系统可靠度</div>
                    </div>
                    <div class="param-card">
                        <div class="param-value">¥${totalCost.toLocaleString('zh-CN')}</div>
                        <div class="param-label">💰 总成本</div>
                    </div>
                    <div class="param-card">
                        <div class="param-value">${totalWeight.toFixed(2)} kg</div>
                        <div class="param-label">⚖️ 总重量</div>
                    </div>
                    <div class="param-card">
                        <div class="param-value">${totalPower.toFixed(2)} W</div>
                        <div class="param-label">⚡ 总功耗</div>
                    </div>
                </div>
                
                <h3 class="section-title">📦 模块列表 (${modules.length}个)</h3>`;

      if (modules.length > 0) {
        htmlContent += `
                <table>
                    <thead>
                        <tr>
                            <th>序号</th>
                            <th>模块名称</th>
                            <th>类型</th>
                            <th>可靠度</th>
                            <th>成本(元)</th>
                            <th>重量(kg)</th>
                            <th>功耗(W)</th>
                        </tr>
                    </thead>
                    <tbody>`;

        modules.forEach((module, mIndex) => {
          htmlContent += `
                        <tr>
                            <td>${mIndex + 1}</td>
                            <td><strong>${module.name || '未命名模块'}</strong></td>
                            <td><span class="tag tag-info">${module.type || module.module_type || '未知'}</span></td>
                            <td>${module.reliability ? (module.reliability * 100).toFixed(2) + '%' : '-'}</td>
                            <td>${module.cost || module.cost_min || 0}</td>
                            <td>${module.weight || module.weight_min || 0}</td>
                            <td>${module.powerConsumption || module.power_min || 0}</td>
                        </tr>`;
        });

        htmlContent += `
                    </tbody>
                </table>`;
      } else {
        htmlContent += `
                <div class="no-data">暂无模块数据</div>`;
      }

      htmlContent += `
                <h3 class="section-title">🔗 连接列表 (${connections.length}个)</h3>`;

      if (connections.length > 0) {
        htmlContent += `
                <table>
                    <thead>
                        <tr>
                            <th>序号</th>
                            <th>源模块 (分类)</th>
                            <th>源接口</th>
                            <th>目标模块 (分类)</th>
                            <th>目标接口</th>
                            <th>接口类型</th>
                        </tr>
                    </thead>
                    <tbody>`;

        connections.forEach((connection, cIndex) => {
          htmlContent += `
                        <tr>
                            <td>${cIndex + 1}</td>
                            <td>${connection.sourceModule || connection.source_module || '-'}</td>
                            <td>${connection.sourceInterface || connection.source_interface || '-'}</td>
                            <td>${connection.targetModule || connection.target_module || '-'}</td>
                            <td>${connection.targetInterface || connection.target_interface || '-'}</td>
                            <td><span class="tag tag-success">${connection.interface_type || connection.type || '数据'}</span></td>
                        </tr>`;
        });

        htmlContent += `
                    </tbody>
                </table>`;
      } else {
        htmlContent += `
                <div class="no-data">暂无连接数据</div>`;
      }

      htmlContent += `
            </div>
        </div>`;
    });

    // 完成HTML文档
    htmlContent += `
        
        <div class="footer">
            <p>🛠️ 系统架构解决方案分析工具 v3.0</p>
            <p>报告生成时间: ${exportDate}</p>
            <p>© 2026 系统架构分析平台 - 所有解决方案数据均为系统自动生成</p>
        </div>
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.app.showNotification(`已导出HTML报告: ${fileName}`, 'success');
  }

  previewExportData() {
    if (this.app.solutions.length === 0) {
      this.app.showNotification('没有可预览的数据', 'warning');
      return;
    }

    // 确定导出范围
    const rangeOption = document.querySelector('.range-option.active');
    const range = rangeOption ? rangeOption.getAttribute('data-range') : 'all';

    let solutionsToPreview = [];

    if (range === 'all') {
      solutionsToPreview = this.app.solutions.slice(0, 3); // 只预览前3个
    } else if (range === 'selected') {
      solutionsToPreview = this.app.solutions.filter((sol) => this.app.selectedSolutions.has(sol.id));
      if (solutionsToPreview.length === 0) {
        solutionsToPreview = this.app.solutions.slice(0, 3);
      }
    } else { // current
      if (this.app.currentSolution) {
        solutionsToPreview = [this.app.currentSolution];
      } else {
        this.app.showNotification('当前没有选中的方案', 'warning');
        return;
      }
    }

    // 确定导出格式
    const formatOption = document.querySelector('.format-option.active');
    const format = formatOption ? formatOption.getAttribute('data-format') : 'json';

    // 准备预览数据
    const previewData = {
      solutions: solutionsToPreview,
      constraints: this.app.constraints,
      export_time: new Date().toISOString(),
      solution_count: solutionsToPreview.length,
      total_solution_count: this.app.solutions.length,
    };

    let previewContent = '';

    if (format === 'json') {
      previewContent = `<pre>${JSON.stringify(previewData, null, 2)}</pre>`;
    } else if (format === 'excel') {
      previewContent = `
                <p><strong>Excel文件预览</strong></p>
                <p>将包含以下工作表:</p>
                <ul>
                    <li>方案概览 (${solutionsToPreview.length} 行)</li>
                    <li>统计信息</li>
                </ul>
                <p>示例数据:</p>
                <pre>方案编号,模块数量,连接数量,总成本最小值,总成本最大值
${solutionsToPreview.map((s) => `${s.id},${s.modules ? s.modules.length : 0},${s.connections ? s.connections.length : 0},${s.total_cost_min || 0},${s.total_cost_max || 0}`).join('\n')}</pre>
            `;
    } else if (format === 'html') {
      previewContent = `
                <p><strong>HTML报告预览</strong></p>
                <p>将生成美观的HTML格式报告，包含:</p>
                <ul>
                    <li>方案概览卡片（方案数、模块数、连接数、约束条件）</li>
                    <li>每个方案的详细参数展示（可靠度、成本、重量、功耗）</li>
                    <li>模块列表表格</li>
                    <li>连接列表表格</li>
                </ul>
                <p>示例方案数据:</p>
                <pre>${solutionsToPreview.map((s) => `方案 #${s.id}: ${s.modules ? s.modules.length : 0}个模块, ${s.connections ? s.connections.length : 0}个连接`).join('\n')}</pre>
            `;
    } else {
      // 文本格式预览
      let text = `${'='.repeat(80)}\n`;
      text += '系统架构方案汇总报告 (预览)\n';
      text += `${'='.repeat(80)}\n\n`;
      text += `生成时间: ${new Date().toLocaleString()}\n`;
      text += `方案总数: ${previewData.solution_count} (共 ${previewData.total_solution_count} 个方案)\n\n`;

      solutionsToPreview.forEach((solution, index) => {
        text += `${index + 1}. 方案 #${solution.id}:\n`;
        text += `   模块数量: ${solution.modules ? solution.modules.length : 0}\n`;
        text += `   连接数量: ${solution.connections ? solution.connections.length : 0}\n\n`;
      });

      previewContent = `<pre>${text}</pre>`;
    }

    document.getElementById('export-preview-content').innerHTML = previewContent;
    document.getElementById('export-preview-card').classList.remove('d-none');
  }
}

// 初始化解决方案管理器
let solutionManager;

document.addEventListener('DOMContentLoaded', () => {
  if (app) {
    solutionManager = new SolutionManager(app);
    // 设置为全局变量，供AppController访问
    window.SolutionManager = solutionManager;
  }
});
