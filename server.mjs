/**
 * 课题 AI 助手 - 服务入口
 * 只做启动、中间件、路由挂载
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { cfg } from './src/config.mjs';
import authRouter from './src/routes/auth.mjs';
import chatRouter from './src/routes/chat.mjs';
import exportRouter from './src/routes/export.mjs';
import { authMiddleware } from './src/services/auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ---- 中间件 ----
app.use(cors({
  origin: cfg.nodeEnv === 'development' ? true : cfg.allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(express.static(join(__dirname, 'frontend')));

// ---- Rate Limiting ----
app.use('/api/auth', rateLimit({ ...cfg.rateLimit.api, standardHeaders: true, legacyHeaders: false }));
app.use('/api/chat/generate', rateLimit({ ...cfg.rateLimit.generate, standardHeaders: true, legacyHeaders: false }));

// ---- 路由 ----
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);          // 对话（可选登录）
app.use('/api/export', exportRouter);      // 导出

// 可选：对话接口支持登录态（不强制）
app.use('/api/chat', (req, res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    authMiddleware(req, res, next);
  } else {
    next();
  }
});

// ---- 前端路由 fallback ----
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'frontend', 'index.html'));
});

// ---- 统一错误处理 ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(cfg.port, () => {
  console.log(`✅ 课题 AI 助手运行在 http://localhost:${cfg.port}`);
  console.log(`   AI Provider: ${cfg.ai.provider} / ${cfg.ai.model}`);
  console.log(`   环境: ${cfg.nodeEnv}`);
});
