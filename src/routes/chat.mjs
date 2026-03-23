/**
 * 对话路由 v2 - 支持 SSE 流式进度
 */

import { Router } from 'express';
import { handleMessage, executeGeneration } from '../agents/orchestrator.mjs';

const router = Router();

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
