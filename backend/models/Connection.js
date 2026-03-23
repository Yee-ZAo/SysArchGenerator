/**
 * Connection类 - 表示模块之间的连接关系
 */
class Connection {
  /**
     * 构造函数
     * @param {string} source_module_id - 源模块ID
     * @param {string} source_interface_name - 源接口名称
     * @param {string} target_module_id - 目标模块ID
     * @param {string} target_interface_name - 目标接口名称
     * @param {string} interface_type - 接口类型
     * @param {number} bandwidth - 带宽（可选）
     * @param {number} latency - 延迟（可选）
     * @param {number} reliability - 可靠性（可选）
     */
  constructor(
    source_module_id,
    source_interface_name,
    target_module_id,
    target_interface_name,
    interface_type,
    bandwidth = 0,
    latency = 0,
    reliability = 1.0,
  ) {
    this.source_module_id = source_module_id;
    this.source_interface_name = source_interface_name;
    this.target_module_id = target_module_id;
    this.target_interface_name = target_interface_name;
    this.interface_type = interface_type;
    this.bandwidth = bandwidth;
    this.latency = latency;
    this.reliability = reliability;
  }

  /**
     * 将连接对象转换为字典格式
     * @returns {Object} 连接的字典表示
     */
  toDict() {
    return {
      source_module_id: this.source_module_id,
      source_interface_name: this.source_interface_name,
      target_module_id: this.target_module_id,
      target_interface_name: this.target_interface_name,
      interface_type: this.interface_type,
      bandwidth: this.bandwidth,
      latency: this.latency,
      reliability: this.reliability,
    };
  }

  /**
     * 从字典创建Connection对象
     * @param {Object} dict - 连接的字典表示
     * @returns {Connection} 新的Connection对象
     */
  static fromDict(dict) {
    return new Connection(
      dict.source_module_id,
      dict.source_interface_name,
      dict.target_module_id,
      dict.target_interface_name,
      dict.interface_type,
      dict.bandwidth || 0,
      dict.latency || 0,
      dict.reliability || 1.0,
    );
  }

  /**
     * 获取连接的描述信息
     * @returns {string} 连接描述
     */
  getDescription() {
    return `${this.source_module_id}.${this.source_interface_name} -> ${this.target_module_id}.${this.target_interface_name} (${this.interface_type})`;
  }

  /**
     * 检查连接是否有效
     * @returns {boolean} 连接是否有效
     */
  isValid() {
    return this.source_module_id
               && this.target_module_id
               && this.interface_type
               && this.source_module_id !== this.target_module_id;
  }

  /**
     * 检查连接是否与另一个连接相同
     * @param {Connection} other - 另一个连接对象
     * @returns {boolean} 是否相同
     */
  equals(other) {
    if (!other || !(other instanceof Connection)) return false;

    return this.source_module_id === other.source_module_id
               && this.source_interface_name === other.source_interface_name
               && this.target_module_id === other.target_module_id
               && this.target_interface_name === other.target_interface_name
               && this.interface_type === other.interface_type;
  }

  /**
     * 克隆连接对象
     * @returns {Connection} 克隆的连接对象
     */
  clone() {
    return new Connection(
      this.source_module_id,
      this.source_interface_name,
      this.target_module_id,
      this.target_interface_name,
      this.interface_type,
      this.bandwidth,
      this.latency,
      this.reliability,
    );
  }
}

module.exports = Connection;
