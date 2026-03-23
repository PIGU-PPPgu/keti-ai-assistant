/**
 * 认证模块
 * 
 * 用户注册、登录、JWT 验证
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import { createUser, findUserByUsername, findUserByEmail, findUserById } from './database.mjs';

// 加载环境变量
config();

// JWT 密钥（从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d'; // 7 天有效期

// 检查必需的环境变量
if (!JWT_SECRET) {
  console.error('❌ 错误：缺少环境变量 JWT_SECRET');
  console.error('请创建 .env 文件并配置 JWT 密钥');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.warn('⚠️  警告：JWT_SECRET 长度应至少 32 个字符');
}

/**
 * 用户注册
 */
export async function register(username, email, password) {
  // 验证输入
  if (!username || !email || !password) {
    return { success: false, error: '请填写完整信息' };
  }
  
  if (username.length < 3 || username.length > 20) {
    return { success: false, error: '用户名需要 3-20 个字符' };
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: '邮箱格式不正确' };
  }
  
  if (password.length < 6) {
    return { success: false, error: '密码至少 6 个字符' };
  }
  
  // 检查用户名/邮箱是否已存在
  if (findUserByUsername(username)) {
    return { success: false, error: '用户名已存在' };
  }
  
  if (findUserByEmail(email)) {
    return { success: false, error: '邮箱已被注册' };
  }
  
  // 加密密码
  const passwordHash = await bcrypt.hash(password, 10);
  
  // 创建用户
  const result = createUser(username, email, passwordHash);
  
  if (!result.success) {
    return result;
  }
  
  // 生成 token
  const token = generateToken(result.userId);
  
  return {
    success: true,
    token,
    user: {
      id: result.userId,
      username,
      email
    }
  };
}

/**
 * 用户登录
 */
export async function login(username, password) {
  // 验证输入
  if (!username || !password) {
    return { success: false, error: '请填写完整信息' };
  }
  
  // 查找用户（支持用户名或邮箱登录）
  let user = findUserByUsername(username);
  if (!user) {
    user = findUserByEmail(username);
  }
  
  if (!user) {
    // 统一错误信息，防止用户名枚举
    return { success: false, error: '用户名或密码错误' };
  }
  
  // 验证密码
  const isValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isValid) {
    // 统一错误信息，防止用户名枚举
    return { success: false, error: '用户名或密码错误' };
  }
  
  // 生成 token
  const token = generateToken(user.id);
  
  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  };
}

/**
 * 生成 JWT Token
 */
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证 JWT Token
 */
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { success: true, userId: decoded.userId };
  } catch (error) {
    return { success: false, error: 'Token 无效或已过期' };
  }
}

/**
 * 认证中间件
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const token = authHeader.substring(7);
  const result = verifyToken(token);
  
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }
  
  // 将用户信息附加到请求对象
  req.userId = result.userId;
  next();
}

/**
 * 获取当前用户信息
 */
export function getCurrentUser(userId) {
  const user = findUserById(userId);
  
  if (!user) {
    return null;
  }
  
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.created_at
  };
}
