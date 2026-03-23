/**
 * Agent 基类
 */
export class BaseAgent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  /** @param {object} task @returns {Promise<object>} */
  async run(task) {
    throw new Error(`${this.name}.run() not implemented`);
  }
}
