/**
 * 认证路由
 */

import { Router } from 'express';
import { register, login, authMiddleware } from '../services/auth.mjs';
import { findUserById, getHistory, getHistoryItem } from '../db/index.mjs';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const result = await register(username, email, password);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await login(username, password);
  res.status(result.success ? 200 : 401).json(result);
});

router.get('/me', authMiddleware, (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ success: true, user });
});

router.get('/history', authMiddleware, (req, res) => {
  const items = getHistory(req.userId);
  res.json({ success: true, items });
});

router.get('/history/:id', authMiddleware, (req, res) => {
  const item = getHistoryItem(parseInt(req.params.id), req.userId);
  if (!item) return res.status(404).json({ error: '记录不存在' });
  res.json({ success: true, item });
});

export default router;
