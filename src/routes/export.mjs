/**
 * Word 导出路由
 */

import { Router } from 'express';
import { generateWordDocument } from '../services/document.mjs';
import { getHistoryItem } from '../db/index.mjs';
import { authMiddleware } from '../services/auth.mjs';

const router = Router();

// 从历史记录导出
router.get('/word/:historyId', authMiddleware, async (req, res) => {
  const item = getHistoryItem(parseInt(req.params.historyId), req.userId);
  if (!item) return res.status(404).json({ error: '记录不存在' });

  try {
    const buffer = await generateWordDocument(item.content, { title: item.title });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.title || '课题文档')}.docx"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: '导出失败: ' + e.message });
  }
});

// 直接导出内容（不需要登录）
router.post('/word', async (req, res) => {
  const { content, title } = req.body;
  if (!content) return res.status(400).json({ error: '缺少 content' });

  try {
    const buffer = await generateWordDocument(content, { title });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title || '课题文档')}.docx"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: '导出失败: ' + e.message });
  }
});

export default router;
