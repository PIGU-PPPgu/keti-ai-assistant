/**
 * 认证路由 + 历史记录路由
 */

import { Router } from 'express';
import { register, login, verifyToken, authMiddleware, getCurrentUser } from './auth.mjs';
import { 
  createHistory, 
  getHistoryList, 
  getHistoryDetail, 
  deleteHistory,
  getHistoryCount 
} from './database.mjs';

const router = Router();

// ========== 认证路由 ==========

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  const result = await register(username, email, password);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json({ error: result.error });
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  const result = await login(username, password);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json({ error: result.error });
  }
});

/**
 * 验证 Token
 * GET /api/auth/verify
 */
router.get('/auth/verify', authMiddleware, (req, res) => {
  const user = getCurrentUser(req.userId);
  
  if (user) {
    res.json({ success: true, user });
  } else {
    res.status(404).json({ error: '用户不存在' });
  }
});

// ========== 历史记录路由（需要认证） ==========

/**
 * 获取历史记录列表
 * GET /api/history?page=1&limit=20
 */
router.get('/history', authMiddleware, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  const list = getHistoryList(req.userId, limit, offset);
  const total = getHistoryCount(req.userId);
  
  res.json({
    success: true,
    data: list,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

/**
 * 获取单条历史记录详情
 * GET /api/history/:id
 */
router.get('/history/:id', authMiddleware, (req, res) => {
  const historyId = parseInt(req.params.id);
  
  if (!historyId) {
    return res.status(400).json({ error: '无效的 ID' });
  }
  
  const record = getHistoryDetail(req.userId, historyId);
  
  if (record) {
    res.json({ success: true, data: record });
  } else {
    res.status(404).json({ error: '记录不存在' });
  }
});

/**
 * 删除历史记录
 * DELETE /api/history/:id
 */
router.delete('/history/:id', authMiddleware, (req, res) => {
  const historyId = parseInt(req.params.id);
  
  if (!historyId) {
    return res.status(400).json({ error: '无效的 ID' });
  }
  
  const result = deleteHistory(req.userId, historyId);
  
  if (result.success) {
    res.json({ success: true, message: '删除成功' });
  } else {
    res.status(404).json({ error: '记录不存在' });
  }
});

/**
 * 创建历史记录（内部接口，供生成接口调用）
 */
export function saveToHistory(userId, subject, level, documentType, content) {
  if (!userId) return null;
  
  const wordCount = content.replace(/[^\u4e00-\u9fa5]/g, '').length;
  return createHistory(userId, subject, level, documentType, content, wordCount);
}

export default router;
