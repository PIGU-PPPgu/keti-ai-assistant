/**
 * Orchestrator v3
 * 完整多 Agent 流水线：
 *   [并行] TitleAgent + LiteratureAgent
 *       ↓
 *   GeneratorAgent（注入文献上下文）
 *       ↓
 *   ReviewerAgent（可选去AI化）
 *
 * 支持 SSE 实时进度推送
 */

import { QueryAgent }      from './query.mjs';
import { TitleAgent }      from './title.mjs';
import { LiteratureAgent } from './literature.mjs';
import { GeneratorAgent }  from './generator.mjs';
import { ReviewerAgent }   from './reviewer.mjs';
import { upsertSession, loadSession, saveHistory } from '../db/index.mjs';

export const STATES = {
  IDLE:       'idle',
  COLLECTING: 'collecting',
  PLANNING:   'planning',
  GENERATING: 'generating',
  REVIEWING:  'reviewing',
  DONE:       'done',
};

const queryAgent     = new QueryAgent();
const titleAgent     = new TitleAgent();
const literatureAgent = new LiteratureAgent();
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
        session.state = STATES.PLANNING;
        upsertSession(sessionId, session);
        return buildPlanResponse(session);
      }

      session.state = STATES.COLLECTING;
      upsertSession(sessionId, session);
      return result.reply;
    }

    case STATES.PLANNING: {
      if (isConfirm(userMessage)) {
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
      // 用户想修改
      session.state = STATES.IDLE;
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
 * 执行完整生成流水线（SSE）
 */
export async function executeGeneration(sessionId, withReview = false, onEvent) {
  const session = loadSession(sessionId);
  if (!session || session.state !== STATES.GENERATING) {
    throw new Error('会话状态异常，请重新开始');
  }

  const emit = (event, data) => onEvent?.(event, data);
  const p = session.collectedData;

  // ── Phase 1: 并行预处理（标题生成 + 文献搜索）──────────────────
  emit('phase', { phase: 1, name: '预处理', message: '正在生成课题名称 & 搜索文献...' });

  const [titleResult, literatureResult] = await Promise.all([
    // 只有没有提供标题时才生成
    !p.title && session.docType === 'shenbao'
      ? titleAgent.run({ level: p.level, subject: p.subject, grade: p.grade, direction: p.direction })
          .then(r => { emit('agent', { name: 'TitleAgent', status: 'done', data: r }); return r; })
      : Promise.resolve(null),

    // 文献搜索（申报书和开题报告才需要）
    ['shenbao', 'kaiti'].includes(session.docType)
      ? literatureAgent.run({ subject: p.subject, direction: p.direction, grade: p.grade, docType: session.docType })
          .then(r => { emit('agent', { name: 'LiteratureAgent', status: 'done', data: { source: r.source, count: r.results.length } }); return r; })
      : Promise.resolve(null),
  ]);

  // 如果生成了标题，用推荐的那个
  const finalParams = { ...p };
  if (titleResult && !finalParams.title) {
    finalParams.title = titleResult.recommended;
    emit('title', { title: finalParams.title, candidates: titleResult.titles });
  }

  // ── Phase 2: 并行章节生成 + Critic 循环 ────────────────────────
  emit('phase', { phase: 2, name: '生成', message: '多 Agent 并行生成各章节...' });

  const generated = await generatorAgent.run({
    docType: session.docType,
    params: finalParams,
    literatureContext: literatureResult?.summary ?? null,
    onProgress: (sectionId, status, score) => {
      emit('progress', { sectionId, status, score });
    },
  });

  // ── Phase 3: 可选润色 ───────────────────────────────────────────
  let finalContent = generated.content;

  if (withReview) {
    session.state = STATES.REVIEWING;
    upsertSession(sessionId, session);
    emit('phase', { phase: 3, name: '润色', message: '正在进行去 AI 化润色...' });
    emit('agent', { name: 'ReviewerAgent', status: 'running' });
    const reviewed = await reviewerAgent.run({ content: finalContent });
    finalContent = reviewed.content;
    emit('agent', { name: 'ReviewerAgent', status: 'done' });
  }

  // ── 保存 & 完成 ─────────────────────────────────────────────────
  let historyId = null;
  if (session.userId) {
    historyId = saveHistory(
      session.userId, sessionId, session.docType,
      generated.title, finalContent, finalParams
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
    literatureSource: literatureResult?.source ?? null,
    historyId,
  });
}

// ── helpers ──────────────────────────────────────────────────────

function newSession(id, userId) {
  return { id, userId: userId ?? null, state: STATES.IDLE, docType: null, collectedData: {}, fieldIndex: 0 };
}

function isConfirm(msg) {
  const m = msg.trim().toLowerCase();
  return ['确认', '开始', '好的', '是', 'yes', 'ok', '确定', '生成', '开始生成'].some(w => m.includes(w));
}

const DOC_TYPE_NAMES = { shenbao: '课题申报书', kaiti: '开题报告', zhongqi: '中期检查报告', jieti: '结题报告' };

function buildPlanResponse(session) {
  const { docType, collectedData: p } = session;
  const rows = [
    p.level     && ['课题级别', p.level],
    p.subject   && ['学科',     p.subject],
    p.grade     && ['学段',     p.grade],
    p.direction && ['研究方向', p.direction],
    ['课题名称', p.title || '自动生成'],
  ].filter(Boolean);

  return {
    type: 'plan',
    docType,
    docTypeName: DOC_TYPE_NAMES[docType],
    params: p,
    content: `📋 生成计划确认\n\n文档类型：${DOC_TYPE_NAMES[docType]}\n${rows.map(([k,v]) => `${k}：${v}`).join('\n')}\n\n生成方式：TitleAgent + LiteratureAgent + 并行章节生成 + Critic 评审\n预计时间：2-4 分钟\n\n确认开始生成？`,
  };
}
