/**
 * BaseAgent v2 - 9阶段流水线抽象基类
 * 每个阶段继承此类，实现 run() 和 score()
 */

// ── 阶段枚举 ──────────────────────────────────────────────
export const PipelineStage = Object.freeze({
  TOPIC_DISCOVERY:       'TOPIC_DISCOVERY',
  LITERATURE_REVIEW:     'LITERATURE_REVIEW',
  RESEARCH_DESIGN:       'RESEARCH_DESIGN',
  THEORETICAL_FRAMEWORK: 'THEORETICAL_FRAMEWORK',
  METHOD_PLANNING:       'METHOD_PLANNING',
  CONTENT_GENERATION:    'CONTENT_GENERATION',
  QUALITY_ASSURANCE:     'QUALITY_ASSURANCE',
  FIGURE_TABLE_GEN:      'FIGURE_TABLE_GEN',
  POLISH_REVIEW:         'POLISH_REVIEW',
});

export const STAGE_ORDER = Object.values(PipelineStage);

export const StageStatus = Object.freeze({
  SUCCESS:    'SUCCESS',
  FAILED:     'FAILED',
  PAUSED:     'PAUSED',
  OVERRIDDEN: 'OVERRIDDEN',
  SKIPPED:    'SKIPPED',
});

export const DocType = Object.freeze({
  SHENBAO:  'shenbao',
  KAITI:    'kaiti',
  ZHONGQI:  'zhongqi',
  JIETI:    'jieti',
});

// ── 数据结构 ──────────────────────────────────────────────
/**
 * @typedef {Object} StageContext - 阶段输入
 * @property {string} projectId
 * @property {string} docType
 * @property {string} stage
 * @property {Object} previousOutputs - 所有前序阶段输出 { STAGE_NAME: StageOutput.data }
 * @property {Object} userOverrides - 人工修改内容
 * @property {Object} metadata - 学科、年级、方向等
 * @property {string|null} retryHint - 重试时的失败原因
 * @property {number} retryCount
 */

/**
 * @typedef {Object} StageOutput - 阶段输出
 * @property {string} stage
 * @property {string} status - SUCCESS | FAILED | PAUSED
 * @property {Object} data - 阶段产出数据
 * @property {QualityScore} qualityScore
 * @property {number} retryCount
 * @property {string} timestamp - ISO 8601
 * @property {string} modelUsed
 */

/**
 * @typedef {Object} QualityScore - 质量评分
 * @property {number} value - 0~1 综合分
 * @property {string[]} dimensions - 各维度评分 { name, score, comment }
 * @property {string[]} failureReasons - 失败原因（低于阈值时填写）
 */

// ── 抽象基类 ──────────────────────────────────────────────
export class BaseAgentV2 {
  /** @type {string} */
  stage;

  /** @type {string} 阶段中文名 */
  stageName;

  /** @type {string} 路由模型 */
  model;

  /** @type {number} 最大重试次数 */
  maxRetries = 3;

  /** @type {number} 质量阈值 0~1 */
  qualityThreshold = 0.80;

  constructor({ stage, stageName, model, maxRetries, qualityThreshold }) {
    this.stage = stage;
    this.stageName = stageName;
    this.model = model;
    if (maxRetries !== undefined) this.maxRetries = maxRetries;
    if (qualityThreshold !== undefined) this.qualityThreshold = qualityThreshold;
  }

  /**
   * 执行阶段逻辑（子类必须实现）
   * @param {StageContext} context
   * @returns {Promise<StageOutput>}
   */
  async run(context) {
    throw new Error(`${this.stageName}.run() 未实现`);
  }

  /**
   * 质量评分（子类必须实现）
   * @param {StageOutput} output
   * @param {StageContext} context
   * @returns {Promise<QualityScore>}
   */
  async score(output, context) {
    throw new Error(`${this.stageName}.score() 未实现`);
  }

  /**
   * 构建标准输出
   */
  buildOutput({ data, status = StageStatus.SUCCESS, retryCount = 0, modelUsed = this.model }) {
    return {
      stage: this.stage,
      status,
      data,
      qualityScore: null, // 由 QualityGate 填充
      retryCount,
      timestamp: new Date().toISOString(),
      modelUsed,
    };
  }

  /**
   * 构建质量评分
   */
  buildScore({ value, dimensions = [], failureReasons = [] }) {
    return { value, dimensions, failureReasons };
  }
}
