/**
 * Orchestrator v2
 * 支持 SSE 实时进度推送
 */

import { QueryAgent } from './query.mjs';
import { GeneratorAgent } from './generator.mjs';
import { ReviewerAgent } from './reviewer.mjs';
import { upsertSession, loadSession, saveHistory } from '../db/index.mjs';

export const STATES = {
  IDLE:       'idle',
  COLLECTING: 'collecting',
  PLANNING:   'planning',   // Plan Mode：展示生成计划等用户确认
  GENERATING: 'generating',
  REVIEWING:  'reviewing',
  DONE:       'done',
};

const queryAgent     = new QueryAgent();
const generatorAgent = new GeneratorAgent();
const reviewerAgent  = new ReviewerAgent();

const RESET_CMDS = new Set(['重新开始', '重置', 'reset', '/reset', '/new']);

export async function handleMessage(sessionId, userMessage, userId = null) {
  let session = loadSession(sessionId) ?? newSession(sessionId, userId);

  if (RESET_CMDS.has(userMessage.trim().toLowerCase())) {
    session = newSession(sessionId, userId);
    upsertSession(sessionId, session);
    return { type: 'message', content: '✅ 已重置，请告诉我你需要生成什么文档。' };
  }

  switch (session.state) {
    case STATES.IDLE:
    case STATES.COLLECTING: {
      const result = await queryAgent.run({ session, userMessage });
      session = result.session;

      if (result.done) {
        // 进入 Plan Mode：展示生成计划
        session.state = STATES.PLANNING;
        upsertSession(sessionId, session);
        return buildPlanResponse(session);
      }

      session.state = STATES.COLLECTING;
      upsertSession(sessionId, session);
      return result.reply;
    }

    case STATES.PLANNING: {
      // 用户确认计划后开始生成
      const confirmed = isConfirm(userMessage);
      if (confirmed) {
        session.state = STATES.GENERATING;
        upsertSession(sessionId, session);
        return {
          type: 'start_generation',
          content: '✅ 开始生成，请稍候...',
          sessionId,
          params: session.collectedData,
          docType: session.docType,
        };
      }
      // 用户想修改参数
      session.state = STATES.COLLECTING;
      session.docType = null;
      session.collectedData = {};
      session.fieldIndex = 0;
      upsertSession(sessionId, session);
      return { type: 'message', content: '好的，请重新告诉我你的需求。' };
    }

    case STATES.GENERATING:
    case STATES.REVIEWING:
      return { type: 'message', content: '⏳ 正在生成中，请稍候...' };

    case STATES.DONE:
      session = newSession(sessionId, userId);
      upsertSession(sessionId, session);
      return handleMessage(sessionId, userMessage, userId);

    default:
      return { type: 'message', content: '出现了错误，请重新开始。' };
  }
}

/**
 * 执行生成（SSE 流式进度）
 * @param {string} sessionId
 * @param {boolean} withReview
 * @param {function} onEvent - SSE 事件回调 (event, data)
 */
export async function executeGeneration(sessionId, withReview = false, onEvent) {
  const session = loadSession(sessionId);
  if (!session || session.state !== STATES.GENERATING) {
    throw new Error('会话状态异常，请重新开始');
  }

  const emit = (event, data) => onEvent?.(event, data);

  emit('status', { message: '正在启动多 Agent 并行生成...' });

  const generated = await generatorAgent.run({
    docType: session.docType,
    params: session.collectedData,
    onProgress: (sectionId, status, score) => {
      emit('progress', { sectionId, status, score });
    },
  });

  emit('status', { message: '生成完成，正在整理...' });

  let finalContent = generated.content;

  if (withReview) {
    session.state = STATES.REVIEWING;
    upsertSession(sessionId, session);
    emit('status', { message: '正在进行去 AI 化润色...' });
    const reviewed = await reviewerAgent.run({ content: finalContent });
    finalContent = reviewed.content;
  }

  let historyId = null;
  if (session.userId) {
    historyId = saveHistory(
      session.userId, sessionId, session.docType,
      generated.title, finalContent, session.collectedData
    );
  }

  session.state = STATES.DONE;
  upsertSession(sessionId, session);

  emit('done', {
    content: finalContent,
    title: generated.title,
    wordCount: finalContent.length,
    sections: generated.sections,
    avgScore: generated.avgScore,
    historyId,
  });
}

// ---- helpers ----

function newSession(id, userId) {
  return { id, userId: userId ?? null, state: STATES.IDLE, docType: null, collectedData: {}, fieldIndex: 0 };
}

function isConfirm(msg) {
  const m = msg.trim().toLowerCase();
  return ['确认', '开始', '好的', '是', 'yes', 'ok', '确定', '生成', '开始生成'].some(w => m.includes(w));
}

function buildPlanResponse(session) {
  const { docType, collectedData: p } = session;
  const typeNames = { shenbao: '课题申报书', kaiti: '开题报告', zhongqi: '中期检查报告', jieti: '结题报告' };

  return {
    type: 'plan',
    docType,
    docTypeName: typeNames[docType],
    params: p,
    content: `📋 **生成计划确认**

**文档类型：** ${typeNames[docType]}
${p.level ? `**课题级别：** ${p.level}` : ''}
${p.subject ? `**学科：** ${p.subject}` : ''}
${p.grade ? `**学段：** ${p.grade}` : ''}
${p.direction ? `**研究方向：** ${p.direction}` : ''}
${p.title ? `**课题名称：** ${p.title}` : '**课题名称：** 自动生成'}

**生成方式：** 多 Agent 并行生成，每章独立优化
**预计时间：** 1-3 分钟

确认开始生成？（回复"确认"或"开始"）`,
  };
}
