/**
 * 对话路由 v2 - 支持 SSE 流式进度
 */

import { Router } from 'express';
import { handleMessage, executeGeneration } from '../agents/orchestrator.mjs';

const router = Router();

// 解析意图（不走状态机，直接返回识别结果）
router.post('/parse', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: '缺少 message' });

  // 复用 QueryAgent 的意图识别
  const { QueryAgent } = await import('../agents/query.mjs');
  const qa = new QueryAgent();
  const fakeSession = { docType: null, collectedData: {}, fieldIndex: 0 };
  const result = await qa.run({ session: fakeSession, userMessage: message });

  res.json({
    success: true,
    docType: result.session.docType,
    params: result.session.collectedData,
  });
});

// 直接用参数生成（跳过对话，表单提交）
router.post('/generate/direct', async (req, res) => {
  const { docType, params, withReview = false } = req.body;
  if (!docType || !params) return res.status(400).json({ error: '缺少 docType 或 params' });

  // 创建一个临时 session
  const sessionId = 'direct_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const { upsertSession } = await import('../db/index.mjs');
  upsertSession(sessionId, {
    id: sessionId, userId: req.userId ?? null,
    state: 'generating', docType, collectedData: params, fieldIndex: 0,
  });

  // SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const { executeGeneration } = await import('../agents/orchestrator.mjs');
    await executeGeneration(sessionId, withReview, send);
  } catch (e) {
    send('error', { message: e.message });
  } finally {
    res.end();
  }
});

// 发送消息
router.post('/message', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message)
    return res.status(400).json({ error: '缺少 sessionId 或 message' });

  try {
    const reply = await handleMessage(sessionId, message, req.userId ?? null);
    res.json({ success: true, reply });
  } catch (e) {
    console.error('handleMessage error:', e);
    res.status(500).json({ error: e.message });
  }
});

// SSE 流式生成
router.get('/generate/stream', async (req, res) => {
  const { sessionId, withReview } = req.query;
  if (!sessionId)
    return res.status(400).json({ error: '缺少 sessionId' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await executeGeneration(
      sessionId,
      withReview === 'true',
      send
    );
  } catch (e) {
    send('error', { message: e.message });
  } finally {
    res.end();
  }
});

export default router;
