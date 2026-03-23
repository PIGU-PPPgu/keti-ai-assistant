/**
 * 认证服务
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { cfg } from '../config.mjs';
import { createUser, findUserByUsername, findUserByEmail, findUserById } from '../db/index.mjs';

export async function register(username, email, password) {
  if (!username || !email || !password)
    return { success: false, error: '请填写完整信息' };
  if (username.length < 3 || username.length > 20)
    return { success: false, error: '用户名需要 3-20 个字符' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { success: false, error: '邮箱格式不正确' };
  if (password.length < 6)
    return { success: false, error: '密码至少 6 个字符' };
  if (findUserByUsername(username))
    return { success: false, error: '用户名已存在' };
  if (findUserByEmail(email))
    return { success: false, error: '邮箱已被注册' };

  const passwordHash = await bcrypt.hash(password, 10);
  const result = createUser(username, email, passwordHash);
  if (!result.success) return result;

  return {
    success: true,
    token: signToken(result.userId),
    user: { id: result.userId, username, email },
  };
}

export async function login(username, password) {
  if (!username || !password)
    return { success: false, error: '请填写完整信息' };

  const user = findUserByUsername(username) ?? findUserByEmail(username);
  if (!user) return { success: false, error: '用户名或密码错误' };

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return { success: false, error: '用户名或密码错误' };

  return {
    success: true,
    token: signToken(user.id),
    user: { id: user.id, username: user.username, email: user.email },
  };
}

function signToken(userId) {
  return jwt.sign({ userId }, cfg.jwt.secret, { expiresIn: cfg.jwt.expiresIn });
}

export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, cfg.jwt.secret);
    return { success: true, userId: decoded.userId };
  } catch {
    return { success: false, error: 'Token 无效或已过期' };
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: '未登录' });

  const result = verifyToken(header.slice(7));
  if (!result.success)
    return res.status(401).json({ error: result.error });

  req.userId = result.userId;
  next();
}
