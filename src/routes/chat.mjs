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


// 选题顾问对话（真正的对话，不是表单填写）
router.post('/discuss', async (req, res) => {
  const { messages = [] } = req.body;
  if (!messages.length) return res.status(400).json({ error: '缺少 messages' });

  const { callAI } = await import('../services/ai.mjs');

  const systemPrompt = `你是一位经验丰富的教育科研顾问，专门帮助中小学教师确定课题研究方向。

你的工作方式：
1. 主动了解教师的学科、学段、教学痛点和研究兴趣
2. 给出2-3个具体可行的课题方向建议，分析每个方向的创新性和可行性
3. 帮助教师聚焦到一个最适合的方向
4. 当教师确认选题后，提取参数

重要规则：
- 对话要自然，像真正的顾问，不要像表单
- 每次回复不超过200字，简洁有力
- 给建议时要具体，不要泛泛而谈
- 当用户明确表示确认某个方向时，在回复末尾加上参数标记

参数标记格式（仅在用户确认后添加）：
<CONFIRMED>
{"docType":"shenbao","level":"市级","subject":"数学","grade":"初中","direction":"大单元教学","title":""}
</CONFIRMED>`;

  // 构建消息历史
  const history = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
  const lastMsg = messages[messages.length - 1].content;

  // 调用 AI（带历史）
  const endpoint = (await import('../config.mjs')).cfg.aiEndpoints[(await import('../config.mjs')).cfg.ai.provider];
  const apiKey = (await import('../config.mjs')).cfg.ai.apiKey;
  const model = (await import('../config.mjs')).cfg.ai.model;

  const apiRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: lastMsg },
      ],
      max_tokens: 600,
      temperature: 0.7,
      thinking: { type: 'disabled' },
    }),
  });

  if (!apiRes.ok) {
    const err = await apiRes.text();
    return res.status(500).json({ error: `AI 错误: ${err}` });
  }

  const data = await apiRes.json();
  // GLM-5 thinking mode: content may be empty, use reasoning_content as fallback
  const msg = data.choices[0].message;
  const reply = msg.content || msg.reasoning_content || '';

  // 检查是否包含确认参数
  const confirmedMatch = reply.match(/<CONFIRMED>([\s\S]*?)<\/CONFIRMED>/);
  let params = null;
  let cleanReply = reply;

  if (confirmedMatch) {
    try {
      params = JSON.parse(confirmedMatch[1].trim());
      cleanReply = reply.replace(/<CONFIRMED>[\s\S]*?<\/CONFIRMED>/, '').trim();
    } catch(e) {}
  }

  res.json({ reply: cleanReply, params, confirmed: !!params });
});

export default router;
