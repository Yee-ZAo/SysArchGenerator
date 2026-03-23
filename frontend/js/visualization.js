// 拓扑图可视化模块
class VisualizationManager {
  constructor(app) {
    this.app = app;
    this.canvas = document.getElementById('topology-canvas');
    this.ctx = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.nodes = [];
    this.edges = [];
    this.selectedNode = null;
    this.hoveredNode = null;
    this.initialized = false;

    // 检查canvas是否存在
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.init();
      this.initialized = true;
    } else {
      console.warn('Topology canvas not found, visualization will be disabled');
    }
  }

  init() {
    this.initCanvas();
    this.initEventListeners();
    this.initLayoutControls();
  }

  initCanvas() {
    // 设置Canvas尺寸
    this.resizeCanvas();

    // 监听窗口大小变化
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });
  }

  initEventListeners() {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

    // 触摸事件（移动设备支持）
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
  }

  initLayoutControls() {
    // 自动布局按钮
    document.getElementById('auto-layout-btn').addEventListener('click', () => {
      this.autoLayout();
    });

    // 力导向布局按钮
    document.getElementById('force-layout-btn').addEventListener('click', () => {
      this.forceDirectedLayout();
    });

    // 适应视图按钮
    document.getElementById('fit-view-btn').addEventListener('click', () => {
      this.fitView();
    });

    // 导出图片按钮
    document.getElementById('export-graph-btn').addEventListener('click', () => {
      this.exportImage();
    });
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.render();
  }

  displaySolution(solution) {
    // 检查是否已初始化
    if (!this.initialized || !this.canvas) {
      console.warn('VisualizationManager not initialized, cannot display solution');
      return;
    }

    if (!solution) {
      this.nodes = [];
      this.edges = [];
      this.canvas.classList.add('d-none');
      const placeholder = document.querySelector('#topology-container .graph-placeholder');
      if (placeholder) {
        placeholder.classList.remove('d-none');
      }
      return;
    }

    // 显示Canvas
    this.canvas.classList.remove('d-none');
    const placeholder = document.querySelector('#topology-container .graph-placeholder');
    if (placeholder) {
      placeholder.classList.add('d-none');
    }

    // 创建节点 - 只显示叶子模块
    this.nodes = [];
    if (solution.modules) {
      // 找出叶子模块
      const leafModules = this.findLeafModules(solution);

      leafModules.forEach((module) => {
        // 显示所有叶子模块（包括无接口的）
        // 【修复】优先显示模块分类，如果没有分类则显示类型
        const displayName = (module.categories && module.categories.length > 0)
          ? module.categories[0]  // 显示第一个分类
          : (module.module_type || '模块');
        
        const node = {
          id: module.id,
          name: module.name,
          type: module.module_type,
          displayName: displayName,  // 新增：用于显示的分类名称
          categories: module.categories || [],
          level: module.level,
          interfaces: module.interfaces || [],
          x: Math.random() * 800 - 400,
          y: Math.random() * 600 - 300,
          radius: 50 + (module.interfaces ? module.interfaces.length * 3 : 0),
          color: this.getModuleColor(module.name),
          originalColor: this.getModuleColor(module.name),
        };

        this.nodes.push(node);
      });
    }

    // 创建边（连接）- 显示叶子模块实例之间的连接关系
    this.edges = [];
    if (solution.connections) {
      solution.connections.forEach((connection, index) => {
        // 【修复】后端生成的连接可能使用模块名称(source/target)或ID(source_module_id/target_module_id)
        // 需要同时支持两种匹配方式
        const sourceId = connection.source_module_id || connection.sourceId || connection.source;
        const targetId = connection.target_module_id || connection.targetId || connection.target;
        
        // 【修复】通过ID或名称查找节点
        const sourceNode = this.nodes.find((n) =>
          n.id === sourceId ||
          n.name === sourceId ||
          n.id === String(sourceId) ||
          String(n.id) === String(sourceId)
        );
        const targetNode = this.nodes.find((n) =>
          n.id === targetId ||
          n.name === targetId ||
          n.id === String(targetId) ||
          String(n.id) === String(targetId)
        );

        console.log(`displaySolution - 匹配结果: sourceNode=${sourceNode ? sourceNode.name : 'null'}, targetNode=${targetNode ? targetNode.name : 'null'}`);

        if (sourceNode && targetNode) {
          const edge = {
            source: sourceNode,
            target: targetNode,
            sourceInterface: connection.source_interface_name || connection.sourceIntf || '',
            targetInterface: connection.target_interface_name || connection.targetIntf || '',
            type: connection.interface_type || connection.type || '数据',
            color: this.getInterfaceColor(connection.interface_type || connection.type || '数据'),
          };

          this.edges.push(edge);
          console.log(`displaySolution - 成功添加边: ${sourceNode.name} -> ${targetNode.name}`);
        } else {
          console.warn(`displaySolution - 无法匹配连接的节点: source="${sourceId}", target="${targetId}"`);
        }
      });
    }

    console.log('displaySolution - 最终边数:', this.edges.length);
    console.log('displaySolution - 最终节点数:', this.nodes.length);

    // 应用自动布局
    this.autoLayout();
    this.render();
    
    // 启用适应视图模式
    this.fitView();
  }

  findLeafModules(solution) {
    const leafModules = [];
    const parentChildMap = new Map();

    // 构建父子关系映射
    solution.modules.forEach((module) => {
      if (module.parent_module) {
        // 支持parent_module是ID或名称
        const parentId = module.parent_module;
        if (!parentChildMap.has(parentId)) {
          parentChildMap.set(parentId, []);
        }
        parentChildMap.get(parentId).push(module.id);
      }
    });

    // 叶子模块判断：
    // 1. 明确标记为isLeaf的模块
    // 2. 没有子模块（child_modules为空或不存在）
    // 3. 在父子关系映射中没有作为父节点出现
    solution.modules.forEach((module) => {
      // 方式1: 检查isLeaf标记
      if (module.isLeaf === true) {
        leafModules.push(module);
        return;
      }

      // 方式2: 检查child_modules
      const hasNoChildren = !module.child_modules || module.child_modules.length === 0;
      
      // 方式3: 检查是否在父子映射中作为父节点
      const isNotParentInMap = !parentChildMap.has(module.id) || parentChildMap.get(module.id).length === 0;

      if (hasNoChildren && isNotParentInMap) {
        leafModules.push(module);
      }
    });

    // 如果没有找到任何叶子模块，可能是数据结构问题，尝试使用所有模块
    if (leafModules.length === 0 && solution.modules.length > 0) {
      return solution.modules;
    }
    return leafModules;
  }

  getModuleColor(moduleName) {
    // 根据模块名称生成颜色
    const colors = [
      '#4682B4', // 钢蓝色
      '#3CB371', // 中海绿色
      '#FFA500', // 橙色
      '#BA55D3', // 中紫色
      '#DC143C', // 深红色
      '#1E90FF', // 道奇蓝
      '#32CD32', // 酸橙色
      '#FF69B4', // 热粉色
      '#40E0D0', // 绿松石色
      '#FFD700', // 金色
    ];

    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < moduleName.length; i++) {
      hash = moduleName.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  getInterfaceColor(interfaceType) {
    const colors = {
      电气: '#FF8C00', // 深橙色
      机械: '#808080', // 灰色
      数据: '#1E90FF', // 道奇蓝
      热力: '#FF4500', // 橙红色
      流体: '#4169E1', // 皇室蓝
      信号: '#32CD32', // 酸橙色
      自定义: '#9370DB', // 中紫色
    };

    return colors[interfaceType] || '#808080';
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 应用变换
    this.ctx.save();
    this.ctx.translate(this.canvas.width / 2 + this.offsetX, this.canvas.height / 2 + this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // 绘制网格背景
    this.drawGrid();

    // 绘制节点
    this.nodes.forEach((node) => {
      this.drawNode(node);
    });

    // 绘制节点标签
    this.nodes.forEach((node) => {
      this.drawNodeLabel(node);
    });

    // 绘制边（在节点上方显示）
    this.edges.forEach((edge) => {
      this.drawEdge(edge);
    });

    this.ctx.restore();
  }

  drawGrid() {
    const gridSize = 50;
    const gridColor = '#F0F0F0';
    const bounds = this.getViewBounds();

    this.ctx.strokeStyle = gridColor;
    this.ctx.lineWidth = 1;

    // 水平线
    const startY = Math.floor(bounds.top / gridSize) * gridSize;
    const endY = Math.ceil(bounds.bottom / gridSize) * gridSize;

    for (let y = startY; y <= endY; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(bounds.left, y);
      this.ctx.lineTo(bounds.right, y);
      this.ctx.stroke();
    }

    // 垂直线
    const startX = Math.floor(bounds.left / gridSize) * gridSize;
    const endX = Math.ceil(bounds.right / gridSize) * gridSize;

    for (let x = startX; x <= endX; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, bounds.top);
      this.ctx.lineTo(x, bounds.bottom);
      this.ctx.stroke();
    }
  }

  drawNode(node) {
    // 绘制节点主体
    this.ctx.fillStyle = node === this.selectedNode ? this.lightenColor(node.color, 40)
      : node === this.hoveredNode ? this.lightenColor(node.color, 20)
        : node.color;

    this.ctx.strokeStyle = node === this.selectedNode ? '#FFD700'
      : node === this.hoveredNode ? '#FFFFFF'
        : '#333333';
    this.ctx.lineWidth = node === this.selectedNode ? 3 : 2;

    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // 绘制接口点
    if (node.interfaces && node.interfaces.length > 0) {
      const angleStep = (Math.PI * 2) / node.interfaces.length;

      node.interfaces.forEach((interfaceInfo, index) => {
        const angle = index * angleStep;
        const interfaceRadius = 8;
        const interfaceX = node.x + (node.radius - 10) * Math.cos(angle);
        const interfaceY = node.y + (node.radius - 10) * Math.sin(angle);

        // 接口点颜色
        this.ctx.fillStyle = interfaceInfo.io_type === 'input' ? '#00C853' : '#FF3D00';
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;

        this.ctx.beginPath();
        this.ctx.arc(interfaceX, interfaceY, interfaceRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      });
    }

    // 绘制节点分类标签（优先显示分类名，否则显示类型）
    const displayText = node.displayName || node.type || '';
    if (displayText) {
      this.ctx.fillStyle = '#333333';
      this.ctx.font = '12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(displayText, node.x, node.y + node.radius + 15);
    }
  }

  drawNodeLabel(node) {
    // 绘制节点名称
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(node.name, node.x, node.y);

    // 绘制节点ID
    this.ctx.fillStyle = '#F0F0F0';
    this.ctx.font = '10px Arial';
    this.ctx.fillText(`ID: ${node.id}`, node.x, node.y + 15);

    // 绘制节点层级
    this.ctx.fillText(`层级: ${node.level}`, node.x, node.y + 30);

    // 绘制模块类型
    if (node.type) {
      this.ctx.fillStyle = '#8A2BE2';
      this.ctx.font = '10px Arial';
      this.ctx.fillText(`类型: ${node.type}`, node.x, node.y + 45);
    }

    // 绘制模块分类（如果有的话）
    if (node.categories && node.categories.length > 0) {
      this.ctx.fillStyle = '#FF6347';
      this.ctx.font = '10px Arial';
      const categoriesText = `分类: ${node.categories.join(', ')}`;
      this.ctx.fillText(categoriesText, node.x, node.y + 60);
    }
  }

  drawEdge(edge) {
    // 计算边的起点和终点（从接口点位置）
    const sourceAngle = this.getInterfaceAngle(edge.source, edge.sourceInterface);
    const targetAngle = this.getInterfaceAngle(edge.target, edge.targetInterface);

    const startX = edge.source.x + (edge.source.radius - 10) * Math.cos(sourceAngle);
    const startY = edge.source.y + (edge.source.radius - 10) * Math.sin(sourceAngle);
    const endX = edge.target.x + (edge.target.radius - 10) * Math.cos(targetAngle);
    const endY = edge.target.y + (edge.target.radius - 10) * Math.sin(targetAngle);

    // 绘制连线
    this.ctx.strokeStyle = edge.color;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    // 绘制箭头
    this.drawArrow(startX, startY, endX, endY, edge.color);

    // 绘制连接类型标签
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    this.ctx.fillStyle = '#333333';
    this.ctx.font = '10px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(edge.type, midX, midY - 15);
  }

  getInterfaceAngle(node, interfaceName) {
    if (!node.interfaces) return 0;

    // 查找接口索引
    const interfaceIndex = node.interfaces.findIndex((i) => i.name === interfaceName);
    if (interfaceIndex === -1) return 0;

    // 计算角度
    const angleStep = (Math.PI * 2) / node.interfaces.length;
    return interfaceIndex * angleStep;
  }

  drawArrow(fromX, fromY, toX, toY, color) {
    const headLength = 15;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    // 计算箭头位置（稍微提前一点）
    const arrowDistance = 20;
    const arrowX = toX - Math.cos(angle) * arrowDistance;
    const arrowY = toY - Math.sin(angle) * arrowDistance;

    // 绘制箭头
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(arrowX, arrowY);
    this.ctx.lineTo(
      arrowX - headLength * Math.cos(angle - Math.PI / 6),
      arrowY - headLength * Math.sin(angle - Math.PI / 6),
    );
    this.ctx.lineTo(
      arrowX - headLength * Math.cos(angle + Math.PI / 6),
      arrowY - headLength * Math.sin(angle + Math.PI / 6),
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;

    return `#${(
      0x1000000
            + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000
            + (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100
            + (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1)}`;
  }

  getViewBounds() {
    const halfWidth = this.canvas.width / (2 * this.scale);
    const halfHeight = this.canvas.height / (2 * this.scale);

    return {
      left: -halfWidth - this.offsetX / this.scale,
      right: halfWidth - this.offsetX / this.scale,
      top: -halfHeight - this.offsetY / this.scale,
      bottom: halfHeight - this.offsetY / this.scale,
    };
  }

  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.canvas.width / 2 - this.offsetX) / this.scale;
    const y = (e.clientY - rect.top - this.canvas.height / 2 - this.offsetY) / this.scale;

    // 检查是否点击了节点
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);

      if (distance <= node.radius) {
        this.selectedNode = node;
        this.isDragging = true;
        this.dragStartX = x - node.x;
        this.dragStartY = y - node.y;
        this.render();
        return;
      }
    }

    // 否则开始平移
    this.isDragging = true;
    this.dragStartX = e.clientX - this.offsetX;
    this.dragStartY = e.clientY - this.offsetY;
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.canvas.width / 2 - this.offsetX) / this.scale;
    const y = (e.clientY - rect.top - this.canvas.height / 2 - this.offsetY) / this.scale;

    // 更新悬停状态
    let newHoveredNode = null;
    for (const node of this.nodes) {
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (distance <= node.radius) {
        newHoveredNode = node;
        break;
      }
    }

    if (newHoveredNode !== this.hoveredNode) {
      this.hoveredNode = newHoveredNode;
      this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'default';
      this.render();
    }

    if (!this.isDragging) return;

    if (this.selectedNode) {
      // 拖动节点
      this.selectedNode.x = x - this.dragStartX;
      this.selectedNode.y = y - this.dragStartY;
    } else {
      // 平移视图
      this.offsetX = e.clientX - this.dragStartX;
      this.offsetY = e.clientY - this.dragStartY;
    }

    this.render();
  }

  handleMouseUp() {
    this.isDragging = false;
    this.selectedNode = null;
  }

  handleWheel(e) {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 计算鼠标在画布坐标中的位置
    const worldX = (mouseX - this.canvas.width / 2 - this.offsetX) / this.scale;
    const worldY = (mouseY - this.canvas.height / 2 - this.offsetY) / this.scale;

    // 调整缩放比例
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = this.scale * delta;

    // 限制缩放范围
    if (newScale >= 0.1 && newScale <= 5) {
      // 调整偏移量以保持鼠标位置不变
      this.offsetX = mouseX - this.canvas.width / 2 - worldX * newScale;
      this.offsetY = mouseY - this.canvas.height / 2 - worldY * newScale;

      this.scale = newScale;
      this.render();
    }
  }

  handleTouchStart(e) {
    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleMouseDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
    }
  }

  handleTouchMove(e) {
    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleMouseMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
    }
  }

  // 处理触摸结束事件
  handleTouchEnd(e) {
    e.preventDefault();
    this.handleMouseUp();
  }

  // 自动布局节点
  autoLayout() {
    if (this.nodes.length === 0) return;

    // 多边形布局算法
    const n = this.nodes.length;
    const centerX = 0;
    const centerY = 0;

    if (n <= 2) {
      // 1-2个节点，水平排列
      const radius = 200;
      this.nodes.forEach((node, i) => {
        const angle = n === 2 ? Math.PI * i : 0;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
      });
    } else if (n <= 6) {
      // 3-6个节点，排列成多边形
      const radius = 250 + n * 20;
      this.nodes.forEach((node, i) => {
        const angle = 2 * Math.PI * i / n - Math.PI / 2; // 从上方开始
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
      });
    } else {
      // 7个以上节点，使用双层环形布局
      const innerRadius = 250;
      const outerRadius = 400;

      // 按连接数排序
      const sortedNodes = this.nodes.slice().sort((a, b) => {
        const aConnections = this.edges.filter((e) => e.source === a || e.target === a).length;
        const bConnections = this.edges.filter((e) => e.source === b || e.target === b).length;
        return bConnections - aConnections;
      });

      // 内圈数量（约占总数的1/3）
      const innerCount = Math.max(3, Math.floor(n / 3));

      sortedNodes.forEach((node, i) => {
        if (i < innerCount) {
          // 内圈
          const angle = 2 * Math.PI * i / innerCount - Math.PI / 2;
          node.x = centerX + innerRadius * Math.cos(angle);
          node.y = centerY + innerRadius * Math.sin(angle);
        } else {
          // 外圈
          const outerIndex = i - innerCount;
          const outerTotal = n - innerCount;
          const angle = 2 * Math.PI * outerIndex / outerTotal - Math.PI / 2;
          node.x = centerX + outerRadius * Math.cos(angle);
          node.y = centerY + outerRadius * Math.sin(angle);
        }
      });
    }

    // 应用力导向布局优化
    this.applyForceDirectedLayout(20);

    // 避免重叠
    this.avoidOverlaps();

    this.render();
  }

  applyForceDirectedLayout(iterations = 50) {
    if (this.nodes.length <= 1) return;

    // 力导向布局参数
    const kRepulsion = 800.0;
    const kAttraction = 0.08;
    const damping = 0.9;

    // 为每个节点存储速度
    const velocities = {};
    this.nodes.forEach((node) => {
      velocities[node.id] = { x: 0, y: 0 };
    });

    for (let iteration = 0; iteration < iterations; iteration++) {
      const forces = {};
      this.nodes.forEach((node) => {
        forces[node.id] = { x: 0, y: 0 };
      });

      // 计算斥力
      for (let i = 0; i < this.nodes.length; i++) {
        const node1 = this.nodes[i];

        for (let j = i + 1; j < this.nodes.length; j++) {
          const node2 = this.nodes[j];

          const dx = node2.x - node1.x;
          const dy = node2.y - node1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 0.001) continue;

          // 计算最小安全距离
          const minSafeDistance = node1.radius + node2.radius + 80;

          if (distance < minSafeDistance) {
            // 如果太近，增加斥力
            const repulsionForce = kRepulsion * 5 / (distance + 1);
            const unitX = dx / distance;
            const unitY = dy / distance;

            forces[node1.id].x -= unitX * repulsionForce;
            forces[node1.id].y -= unitY * repulsionForce;
            forces[node2.id].x += unitX * repulsionForce;
            forces[node2.id].y += unitY * repulsionForce;
          } else {
            // 正常斥力
            const repulsionForce = kRepulsion / (distance + 100);
            const unitX = dx / distance;
            const unitY = dy / distance;

            forces[node1.id].x -= unitX * repulsionForce;
            forces[node1.id].y -= unitY * repulsionForce;
            forces[node2.id].x += unitX * repulsionForce;
            forces[node2.id].y += unitY * repulsionForce;
          }
        }
      }

      // 计算引力
      this.edges.forEach((edge) => {
        const { source } = edge;
        const { target } = edge;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 0.001) return;

        // 目标距离
        const targetDistance = 300;
        const attractionForce = kAttraction * (distance - targetDistance);
        const unitX = dx / distance;
        const unitY = dy / distance;

        forces[source.id].x += unitX * attractionForce;
        forces[source.id].y += unitY * attractionForce;
        forces[target.id].x -= unitX * attractionForce;
        forces[target.id].y -= unitY * attractionForce;
      });

      // 更新速度和位置
      this.nodes.forEach((node) => {
        const vx = velocities[node.id].x;
        const vy = velocities[node.id].y;

        velocities[node.id].x = (vx + forces[node.id].x) * damping;
        velocities[node.id].y = (vy + forces[node.id].y) * damping;

        // 限制最大速度
        const speed = Math.sqrt(velocities[node.id].x ** 2 + velocities[node.id].y ** 2);
        const maxSpeed = 30.0;
        if (speed > maxSpeed) {
          velocities[node.id].x *= maxSpeed / speed;
          velocities[node.id].y *= maxSpeed / speed;
        }

        node.x += velocities[node.id].x;
        node.y += velocities[node.id].y;
      });
    }
  }

  forceDirectedLayout() {
    this.applyForceDirectedLayout(100);
    this.avoidOverlaps();
    this.fitView();
    this.render();
  }

  avoidOverlaps() {
    if (this.nodes.length <= 1) return;

    const maxIterations = 20;

    for (let iter = 0; iter < maxIterations; iter++) {
      let moved = false;

      for (let i = 0; i < this.nodes.length; i++) {
        const node1 = this.nodes[i];

        for (let j = i + 1; j < this.nodes.length; j++) {
          const node2 = this.nodes[j];

          const dx = node2.x - node1.x;
          const dy = node2.y - node1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // 最小安全距离
          const minDistance = node1.radius + node2.radius + 50;

          if (distance < minDistance && distance > 0) {
            // 计算排斥力
            const overlap = minDistance - distance;
            const unitX = dx / distance;
            const unitY = dy / distance;

            // 移动两个节点
            const moveDistance = overlap / 2;
            node1.x -= unitX * moveDistance;
            node1.y -= unitY * moveDistance;
            node2.x += unitX * moveDistance;
            node2.y += unitY * moveDistance;

            moved = true;
          }
        }
      }

      if (!moved) break;
    }
  }

  fitView() {
    if (this.nodes.length === 0) {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    // 计算节点的边界框
    let minX = Infinity; let
      maxX = -Infinity;
    let minY = Infinity; let
      maxY = -Infinity;

    this.nodes.forEach((node) => {
      minX = Math.min(minX, node.x - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    });

    // 添加边距
    const margin = 50;
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // 计算合适的缩放比例
    const scaleX = this.canvas.width / width;
    const scaleY = this.canvas.height / height;
    this.scale = Math.min(scaleX, scaleY) * 0.9; // 90% 填充

    // 限制缩放范围
    this.scale = Math.max(0.1, Math.min(5, this.scale));

    // 计算偏移量
    this.offsetX = -centerX * this.scale;
    this.offsetY = -centerY * this.scale;

    this.render();
  }

  exportImage() {
    if (this.nodes.length === 0) {
      this.app.showNotification('没有可导出的拓扑图', 'warning');
      return;
    }

    // 创建临时Canvas用于导出
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // 计算边界框
    let minX = Infinity; let
      maxX = -Infinity;
    let minY = Infinity; let
      maxY = -Infinity;

    this.nodes.forEach((node) => {
      minX = Math.min(minX, node.x - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    });

    // 添加边距
    const margin = 50;
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    const width = maxX - minX;
    const height = maxY - minY;

    // 设置临时Canvas尺寸
    tempCanvas.width = width;
    tempCanvas.height = height;

    // 应用变换
    tempCtx.translate(-minX, -minY);

    // 绘制背景
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(minX, minY, width, height);

    // 绘制边
    this.edges.forEach((edge) => {
      this.drawEdgeOnContext(tempCtx, edge);
    });

    // 绘制节点
    this.nodes.forEach((node) => {
      this.drawNodeOnContext(tempCtx, node);
    });

    // 绘制节点标签
    this.nodes.forEach((node) => {
      this.drawNodeLabelOnContext(tempCtx, node);
    });

    // 生成文件名
    const solutionId = this.app.currentSolution ? this.app.currentSolution.id : 'unknown';
    const fileName = `架构拓扑图_方案${solutionId}_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
      .replace('T', '_')}.png`;

    // 导出为图片
    const link = document.createElement('a');
    link.download = fileName;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();

    this.app.showNotification(`拓扑图已导出: ${fileName}`, 'success');
  }

  drawNodeOnContext(ctx, node) {
    // 在指定上下文中绘制节点
    ctx.fillStyle = node.color;
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 绘制接口点
    if (node.interfaces && node.interfaces.length > 0) {
      const angleStep = (Math.PI * 2) / node.interfaces.length;

      node.interfaces.forEach((interfaceInfo, index) => {
        const angle = index * angleStep;
        const interfaceRadius = 8;
        const interfaceX = node.x + (node.radius - 10) * Math.cos(angle);
        const interfaceY = node.y + (node.radius - 10) * Math.sin(angle);

        ctx.fillStyle = interfaceInfo.io_type === 'input' ? '#00C853' : '#FF3D00';
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(interfaceX, interfaceY, interfaceRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  drawNodeLabelOnContext(ctx, node) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.name, node.x, node.y);

    ctx.fillStyle = '#F0F0F0';
    ctx.font = '10px Arial';
    ctx.fillText(`ID: ${node.id}`, node.x, node.y + 15);
    ctx.fillText(`层级: ${node.level}`, node.x, node.y + 30);

    if (node.type) {
      ctx.fillStyle = '#333333';
      ctx.font = '12px Arial';
      ctx.fillText(node.type, node.x, node.y + node.radius + 15);
    }
  }

  drawEdgeOnContext(ctx, edge) {
    // 计算边的起点和终点
    const sourceAngle = this.getInterfaceAngle(edge.source, edge.sourceInterface);
    const targetAngle = this.getInterfaceAngle(edge.target, edge.targetInterface);

    const startX = edge.source.x + (edge.source.radius - 10) * Math.cos(sourceAngle);
    const startY = edge.source.y + (edge.source.radius - 10) * Math.sin(sourceAngle);
    const endX = edge.target.x + (edge.target.radius - 10) * Math.cos(targetAngle);
    const endY = edge.target.y + (edge.target.radius - 10) * Math.sin(targetAngle);

    // 绘制连线
    ctx.strokeStyle = edge.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 绘制箭头
    this.drawArrowOnContext(ctx, startX, startY, endX, endY, edge.color);

    // 绘制连接类型标签
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    ctx.fillStyle = '#333333';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(edge.type, midX, midY - 15);
  }

  drawArrowOnContext(ctx, fromX, fromY, toX, toY, color) {
    const headLength = 15;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    const arrowDistance = 20;
    const arrowX = toX - Math.cos(angle) * arrowDistance;
    const arrowY = toY - Math.sin(angle) * arrowDistance;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - headLength * Math.cos(angle - Math.PI / 6),
      arrowY - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      arrowX - headLength * Math.cos(angle + Math.PI / 6),
      arrowY - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  }
}

// 初始化可视化管理器
let visualizationManager;

// 初始化函数
function initVisualizationManager() {
  if (window.app && !window.visualizationManager) {
    try {
      visualizationManager = new VisualizationManager(window.app);
      window.visualizationManager = visualizationManager;
      console.log('VisualizationManager initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize VisualizationManager:', error);
      return false;
    }
  }
  return false;
}

// 尝试立即初始化（延迟执行以确保app先初始化）
document.addEventListener('DOMContentLoaded', () => {
  // 使用多次重试确保初始化成功
  let attempts = 0;
  const maxAttempts = 10;
  
  const tryInit = () => {
    attempts++;
    if (initVisualizationManager()) {
      return; // 初始化成功
    }
    if (attempts < maxAttempts) {
      setTimeout(tryInit, 50 * attempts); // 递增延迟
    } else {
      console.warn('VisualizationManager initialization failed after', maxAttempts, 'attempts');
    }
  };
  
  // 延迟首次尝试，确保app.js先执行
  setTimeout(tryInit, 100);
});

// 也可以从外部调用初始化（例如从app.js）
window.initVisualizationManager = initVisualizationManager;
