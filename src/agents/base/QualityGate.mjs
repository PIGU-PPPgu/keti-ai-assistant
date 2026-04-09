/**
 * QualityGate - 质量门控
 * 自动评分 → 低于阈值重试 → 失败暂停等人工
 */

import { StageStatus } from './BaseAgent.mjs';

export class QualityGate {
  /**
   * @param {BaseAgentV2} agent
   * @param {StageContext} context
   * @param {Function} onEvent - SSE 事件回调
   * @returns {Promise<StageOutput>}
   */
  async checkAndRetry(agent, context, onEvent) {
    let lastOutput = null;
    let lastScore = null;

    for (let attempt = 0; attempt <= agent.maxRetries; attempt++) {
      // 执行
      lastOutput = await agent.run({
        ...context,
        retryCount: attempt,
        retryHint: lastScore?.failureReasons?.join('; ') || null,
      });

      // 评分
      lastScore = await agent.score(lastOutput, context);
      lastOutput.qualityScore = lastScore;

      onEvent?.('stage_score', {
        stage: agent.stage,
        score: lastScore.value,
        threshold: agent.qualityThreshold,
        attempt: attempt + 1,
        passed: lastScore.value >= agent.qualityThreshold,
      });

      // 通过 → 返回
      if (lastScore.value >= agent.qualityThreshold) {
        lastOutput.status = StageStatus.SUCCESS;
        return lastOutput;
      }

      // 未通过 → 记录日志
      onEvent?.('stage_retry', {
        stage: agent.stage,
        attempt: attempt + 1,
        maxRetries: agent.maxRetries,
        score: lastScore.value,
        reasons: lastScore.failureReasons,
      });

      console.warn(
        `[QualityGate] ${agent.stageName} 第 ${attempt + 1} 次未通过 ` +
        `(score=${lastScore.value.toFixed(2)} < threshold=${agent.qualityThreshold})`
      );
    }

    // 全部失败 → 暂停等人工
    lastOutput.status = StageStatus.PAUSED;
    lastOutput.qualityScore = lastScore;

    onEvent?.('stage_paused', {
      stage: agent.stage,
      reason: 'quality_failed',
      score: lastScore.value,
      attempts: agent.maxRetries + 1,
      failureReasons: lastScore.failureReasons,
    });

    return lastOutput;
  }
}
