// 约束管理模块
/**
 * 创成设计约束输入界面
 *
 * 约束类型:
 * 1. 连接关系约束:
 *    - 绑定约束：若一个分类的模块与另一个分类的模块存在绑定约束，
 *              那么在连接方案的筛选过程中，方案里，只要这两个分类的模块之间有连接关系，即满足约束
 *    - 互斥约束：若一个分类的模块与另一个分类的模块存在互斥约束，
 *              那么在连接方案的筛选过程中，方案里，这两个分类的模块之间一定没有连接关系
 * 2. 参数约束:
 *    - 成本、重量、功耗不高于根模块参数
 *    - 可靠度不低于根模块可靠度
 * 3. 电源模块特殊规则:
 *    - 从产品库匹配时，功耗需高于叶子模块功耗
 *    - 方案总功耗计算时不计入电源模块功耗
 */
class ConstraintManager {
  constructor(app) {
    this.app = app;
    this.nextConstraintId = 1;
    this.selectedConstraintId = null;

    this.init();
  }

  // 初始化约束管理模块
  init() {
    this.initConstraintForm();
    this.initConstraintTable();
    this.initEventListeners();
    this.updateConstraintHelp();
  }

  /**
   * 更新约束帮助信息
   */
  updateConstraintHelp() {
    // 显示约束规则说明
    const helpContainer = document.getElementById('constraint-help');
    if (helpContainer) {
      helpContainer.innerHTML = `
        <div class="constraint-help-content">
          <h6>约束规则说明</h6>
          <ul>
            <li><strong>绑定约束</strong>：两个分类的模块之间必须有连接关系</li>
            <li><strong>互斥约束</strong>：两个分类的模块之间不能有连接关系</li>
            <li><strong>电源模块特殊规则</strong>：功耗不计入方案总功耗</li>
          </ul>
        </div>
      `;
    }
  }

  // 初始化约束表单
  initConstraintForm() {
    const constraintTypeSelect = document.getElementById('constraint-type');
    const targetTypeSelect = document.getElementById('target-type');
    const parameterTypeSelect = document.getElementById('parameter-type');
    const addConstraintBtn = document.getElementById('add-constraint-btn');

    // 约束类型变化
    constraintTypeSelect.addEventListener('change', (e) => {
      const type = e.target.value;

      // 隐藏所有表单
      document.getElementById('connection-constraint-form').classList.add('d-none');
      document.getElementById('parameter-constraint-form').classList.add('d-none');

      // 显示对应的表单
      if (type === 'connection') {
        document.getElementById('connection-constraint-form').classList.remove('d-none');
        this.populateModuleSelects();
      } else if (type === 'parameter') {
        document.getElementById('parameter-constraint-form').classList.remove('d-none');
        this.populateTargetTypeSelect();
      }

      // 启用/禁用添加按钮
      addConstraintBtn.disabled = type === '';
    });

    // 参数类型变化
    parameterTypeSelect.addEventListener('change', () => {
      this.updateParameterUnit();
    });

    // 约束对象变化
    targetTypeSelect.addEventListener('change', () => {
      this.updateParameterUnit();
    });

    // 添加约束按钮
    addConstraintBtn.addEventListener('click', () => {
      this.addConstraint();
    });

    // 重置表单按钮
    document.getElementById('reset-constraint-form').addEventListener('click', () => {
      this.resetConstraintForm();
    });
  }

  initConstraintTable() {
    const table = document.getElementById('constraint-table');

    // 确保表格存在
    if (!table) return;

    // 行点击选择
    table.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row || row.classList.contains('header-row')) return;

      // 移除其他行的选中状态
      table.querySelectorAll('tr').forEach((r) => {
        r.classList.remove('selected');
      });

      // 添加选中状态
      row.classList.add('selected');

      // 更新选中约束ID
      const constraintId = parseInt(row.cells[0].textContent);
      this.selectedConstraintId = constraintId;

      // 启用删除按钮
      document.getElementById('delete-constraint').disabled = false;
    });

    // 删除约束按钮
    document.getElementById('delete-constraint').addEventListener('click', () => {
      this.deleteSelectedConstraint();
    });

    // 清空约束按钮
    document.getElementById('clear-constraints').addEventListener('click', () => {
      this.clearConstraints();
    });
  }

  initEventListeners() {
    // 监听模块数据变化
    document.addEventListener('modulesUpdated', () => {
      this.populateModuleSelects();
      this.populateTargetTypeSelect();
    });
  }

  populateModuleSelects() {
    const module1Select = document.getElementById('module1');
    const module2Select = document.getElementById('module2');

    // 清空选项
    module1Select.innerHTML = '<option value="">请选择模块</option>';
    module2Select.innerHTML = '<option value="">请选择模块</option>';

    // 获取叶子节点模块
    const leafModules = this.findLeafModules();

    // 获取唯一的叶子节点模块名称
    const leafModuleNames = [...new Set(leafModules.map((m) => m.name))].sort();

    // 添加选项（只显示叶子节点）
    leafModuleNames.forEach((name) => {
      const option1 = document.createElement('option');
      option1.value = name;
      option1.textContent = name;
      module1Select.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = name;
      option2.textContent = name;
      module2Select.appendChild(option2);
    });
  }

  populateTargetTypeSelect() {
    const targetTypeSelect = document.getElementById('target-type');

    // 保存当前选中的值
    const currentValue = targetTypeSelect.value;

    // 清空模块选项（保留"总体"）
    while (targetTypeSelect.options.length > 1) {
      targetTypeSelect.remove(1);
    }

    // 获取叶子节点模块
    const leafModules = this.findLeafModules();

    // 获取唯一的叶子节点模块名称
    const leafModuleNames = [...new Set(leafModules.map((m) => m.name))].sort();

    // 添加模块选项（只显示叶子节点）
    leafModuleNames.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      targetTypeSelect.appendChild(option);
    });

    // 恢复选中的值
    if (currentValue && Array.from(targetTypeSelect.options).some((opt) => opt.value === currentValue)) {
      targetTypeSelect.value = currentValue;
    }
  }

  // 查找叶子节点（没有子模块的模块）
  findLeafModules() {
    if (!this.app.modules || !Array.isArray(this.app.modules)) return [];
    
    // 构建父-子模块映射关系（基于模块名称）
    const childModulesMap = {};
    this.app.modules.forEach(module => {
      if (module.parent_module) {
        const parentName = module.parent_module;
        if (!childModulesMap[parentName]) {
          childModulesMap[parentName] = [];
        }
        childModulesMap[parentName].push(module.name);
      }
    });
    
    // 判断每个模块是否为叶子节点
    return this.app.modules.filter((module) => {
      // 方法1：检查是否有模块将此模块作为父模块（通过parent_module字段）
      const hasChildrenViaParent = this.app.modules.some(m => m.parent_module === module.name);
      // 方法2：检查childModulesMap中是否有此模块的子模块
      const hasChildrenViaMap = childModulesMap[module.name] && childModulesMap[module.name].length > 0;
      // 方法3：检查模块自身的child_modules数组（如果后端提供了该字段）
      const hasChildrenViaOwn = module.child_modules && module.child_modules.length > 0;
      
      const hasChildren = hasChildrenViaParent || hasChildrenViaMap || hasChildrenViaOwn;
      return !hasChildren; // 叶子节点是没有子节点的模块
    });
  }

  updateParameterUnit() {
    const targetType = document.getElementById('target-type').value;
    const parameterType = document.getElementById('parameter-type').value;
    const unitLabel = document.getElementById('parameter-unit');

    const targetText = targetType === 'overall' ? '模块总数' : '模块实例数';

    let unitText = '单位：';
    switch (parameterType) {
      case 'quantity':
        unitText += `个（${targetText}）`;
        break;
      case 'cost':
        unitText += '元';
        break;
      case 'weight':
        unitText += 'kg';
        break;
      case 'power':
        unitText += 'W';
        break;
      case 'reliability':
        unitText += '百分比（0-1）';
        break;
      default:
        unitText += '个';
    }

    unitLabel.textContent = unitText;
  }

  addConstraint() {
    const constraintType = document.getElementById('constraint-type').value;

    if (constraintType === 'connection') {
      this.addConnectionConstraint();
    } else if (constraintType === 'parameter') {
      this.addParameterConstraint();
    }
  }

  addConnectionConstraint() {
    const relationType = document.getElementById('relation-type').value;
    const module1 = document.getElementById('module1').value;
    const module2 = document.getElementById('module2').value;

    // 验证输入
    if (!module1 || !module2) {
      this.app.showNotification('请选择两个模块', 'warning');
      return;
    }

    if (module1 === module2) {
      this.app.showNotification('不能选择相同的模块', 'warning');
      return;
    }

    // 创建约束对象
    const constraint = {
      id: this.nextConstraintId++,
      type: 'connection',
      relation_type: relationType === 'binding' ? '绑定' : '互斥',
      module1,
      module2,
    };

    // 添加到约束列表
    this.app.constraints.push(constraint);
    this.app.saveDataToStorage();

    // 更新表格
    this.updateConstraintTable();

    // 更新状态
    this.app.updateStatus();

    // 重置表单
    this.resetConstraintForm();

    // 显示成功消息
    const relationText = relationType === 'binding' ? '绑定' : '互斥';
    this.app.showNotification(`已添加${relationText}约束: ${module1} ↔ ${module2}`, 'success');
  }

  addParameterConstraint() {
    const targetType = document.getElementById('target-type').value;
    const parameterType = document.getElementById('parameter-type').value;
    const minValue = parseFloat(document.getElementById('min-value').value);
    const maxValue = parseFloat(document.getElementById('max-value').value);

    // 验证输入
    if (isNaN(minValue) || isNaN(maxValue)) {
      this.app.showNotification('请输入有效的数值', 'warning');
      return;
    }

    if (minValue > maxValue) {
      this.app.showNotification('最小值不能大于最大值', 'warning');
      return;
    }

    if (parameterType === 'reliability' && (minValue < 0 || maxValue > 1)) {
      this.app.showNotification('可靠度范围应为0-1', 'warning');
      return;
    }

    // 参数类型映射
    const parameterTypeMap = {
      quantity: '数量',
      cost: '成本',
      weight: '重量',
      power: '功耗',
      reliability: '可靠度',
    };

    // 创建约束对象
    const constraint = {
      id: this.nextConstraintId++,
      type: 'parameter',
      target_type: targetType === 'overall' ? '总体' : targetType,
      parameter_type: parameterTypeMap[parameterType] || parameterType,
      min_value: minValue,
      max_value: maxValue,
    };

    // 添加到约束列表
    this.app.constraints.push(constraint);
    this.app.saveDataToStorage();

    // 更新表格
    this.updateConstraintTable();

    // 更新状态
    this.app.updateStatus();

    // 重置表单
    this.resetConstraintForm();

    // 显示成功消息
    const targetText = targetType === 'overall' ? '总体' : targetType;
    this.app.showNotification(`已添加参数约束: ${targetText} ${parameterTypeMap[parameterType]} ${minValue}~${maxValue}`, 'success');
  }

  updateConstraintTable() {
    const tbody = document.querySelector('#constraint-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.app.constraints.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5" class="text-center">暂无约束条件</td>';
      tbody.appendChild(row);
      return;
    }

    // 更新下一个ID
    if (this.app.constraints.length > 0) {
      this.nextConstraintId = Math.max(...this.app.constraints.map((c) => c.id)) + 1;
    }

    this.app.constraints.forEach((constraint) => {
      const row = document.createElement('tr');
      row.dataset.constraintId = constraint.id;

      if (constraint.type === 'connection') {
        row.innerHTML = `
                    <td>${constraint.id}</td>
                    <td>连接关系</td>
                    <td>${constraint.module1} ↔ ${constraint.module2}</td>
                    <td>${constraint.relation_type === '绑定' ? '绑定关系：必须同时存在并连接' : '互斥关系：不能同时存在或不能连接'}</td>
                    <td class="action-cell">
                        <button class="btn btn-sm btn-danger delete-constraint-btn" data-id="${constraint.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                `;
      } else {
        // 参数约束
        let content = `${constraint.parameter_type}：${constraint.min_value} ~ ${constraint.max_value}`;

        // 添加单位
        if (constraint.parameter_type === '数量') {
          content += ' 个';
        } else if (constraint.parameter_type === '成本') {
          content += ' 元';
        } else if (constraint.parameter_type === '重量') {
          content += ' kg';
        } else if (constraint.parameter_type === '功耗') {
          content += ' W';
        } else if (constraint.parameter_type === '可靠度') {
          content += ' %';
        }

        row.innerHTML = `
                    <td>${constraint.id}</td>
                    <td>参数</td>
                    <td>${constraint.target_type}</td>
                    <td>${content}</td>
                    <td class="action-cell">
                        <button class="btn btn-sm btn-danger delete-constraint-btn" data-id="${constraint.id}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                `;
      }

      tbody.appendChild(row);
    });

    // 为删除按钮添加事件监听器
    document.querySelectorAll('.delete-constraint-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const constraintId = parseInt(btn.getAttribute('data-id'));
        this.deleteConstraint(constraintId);
      });
    });
  }

  deleteSelectedConstraint() {
    if (this.selectedConstraintId === null) {
      this.app.showNotification('请先选择一个约束', 'warning');
      return;
    }

    this.deleteConstraint(this.selectedConstraintId);
    this.selectedConstraintId = null;
    document.getElementById('delete-constraint').disabled = true;
  }

  deleteConstraint(constraintId) {
    // 从约束列表中删除
    const index = this.app.constraints.findIndex((c) => c.id === constraintId);
    if (index !== -1) {
      this.app.constraints.splice(index, 1);
      this.app.saveDataToStorage();

      // 更新表格
      this.updateConstraintTable();

      // 更新状态
      this.app.updateStatus();

      this.app.showNotification('已删除约束', 'success');
    }
  }

  clearConstraints() {
    this.app.showModal(
      '确认清空',
      '确定要清空所有约束条件吗？',
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
            this.app.constraints = [];
            this.nextConstraintId = 1;  // 【修复】重置约束ID计数器
            this.app.saveDataToStorage();
            this.updateConstraintTable();
            this.app.updateStatus();
            this.app.closeModal();
            this.app.showNotification('已清空所有约束条件', 'success');
          },
        },
      ],
    );
  }

  resetConstraintForm() {
    document.getElementById('constraint-type').value = '';
    document.getElementById('relation-type').value = 'binding';
    document.getElementById('module1').value = '';
    document.getElementById('module2').value = '';
    document.getElementById('target-type').value = 'overall';
    document.getElementById('parameter-type').value = 'quantity';
    document.getElementById('min-value').value = '0';
    document.getElementById('max-value').value = '1000000';

    // 隐藏约束表单
    document.getElementById('connection-constraint-form').classList.add('d-none');
    document.getElementById('parameter-constraint-form').classList.add('d-none');

    // 禁用添加按钮
    document.getElementById('add-constraint-btn').disabled = true;

    // 更新单位标签
    this.updateParameterUnit();
  }
}

// 初始化约束管理器
let constraintManager;

document.addEventListener('DOMContentLoaded', () => {
  if (app) {
    constraintManager = new ConstraintManager(app);
    // 设置为全局变量，供AppController访问
    window.constraintManager = constraintManager;
  }
});
