# 课题 AI 助手

> AI-powered research proposal generator for Chinese educators

一个帮助教师生成课题申报书、开题报告、中期检查、结题报告的 AI 工具。

## ✨ 功能特点

- 🤖 **AI 生成** - 基于智谱 GLM-5，生成高质量课题文档
- 📝 **多种文档** - 支持申报书、开题、中期、结题四大类型
- 🎨 **包豪斯设计** - 极简主义 UI，黑白配色 + 原色点缀
- 🔐 **用户系统** - JWT 认证，历史记录存储
- 🌐 **联网搜索** - 自动搜索真实文献，确保引用真实性
- 📥 **Word 导出** - 一键导出 Word 文档

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm 或 pnpm

### 安装

```bash
git clone https://github.com/yourusername/keti-ai-assistant.git
cd keti-ai-assistant
npm install
```

### 配置

1. 复制环境变量模板：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入你的 API 密钥：
```env
GLM_API_KEY=your_glm_api_key_here
JWT_SECRET=your_jwt_secret_here_min_32_chars
```

### 运行

```bash
npm start
```

访问 http://localhost:3000

### 部署

使用 PM2 部署：

```bash
npm install -g pm2
pm2 start server.mjs --name keti-ai-assistant
pm2 save
pm2 startup
```

## 📁 项目结构

```
keti-ai-assistant/
├── server.mjs           # Express 服务器
├── auth.mjs             # JWT 认证模块
├── database.mjs         # SQLite 数据库
├── routes-auth.mjs      # 认证路由
├── ai-agent.mjs         # AI Agent 状态机
├── agents.mjs           # 多智能体系统
├── word-generator.mjs   # Word 文档生成
├── frontend/            # 前端文件
│   ├── index.html       # 包豪斯主界面
│   ├── login.html       # 登录/注册
│   └── history.html     # 历史记录
├── data/                # 数据库文件（自动创建）
├── .env                 # 环境变量（不提交）
├── .env.example         # 环境变量模板
└── .gitignore           # Git 忽略文件
```

## 🔒 安全特性

- ✅ JWT 认证
- ✅ bcrypt 密码加密
- ✅ Rate Limiting（15 分钟 100 次）
- ✅ CORS 白名单
- ✅ 环境变量管理
- ✅ SQL 注入防护（Prepared Statements）

## 🛠️ 技术栈

**后端**：
- Express.js
- better-sqlite3（数据库）
- bcrypt（密码加密）
- jsonwebtoken（认证）
- dotenv（环境变量）
- express-rate-limit（限流）

**前端**：
- 原生 HTML/CSS/JavaScript
- 包豪斯设计风格
- Inter 字体

**AI**：
- 智谱 GLM-5 API
- LangChain Agent

## 📊 API 端点

### 认证

- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/verify` - 验证 token

### 历史记录

- `GET /api/history` - 获取历史列表
- `GET /api/history/:id` - 获取单条详情
- `DELETE /api/history/:id` - 删除记录

### 生成

- `POST /api/chat` - 对话式生成
- `POST /api/generate-with-params` - 参数式生成
- `POST /api/export-word` - 导出 Word
- `POST /api/humanize` - 去 AI 化润色

## 📝 使用示例

```javascript
// 登录
const loginRes = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'teacher',
    password: 'password123'
  })
});

const { token } = await loginRes.json();

// 生成课题申报书
const genRes = await fetch('/api/generate-with-params', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    documentType: 'shenbao',
    params: {
      level: '市级',
      subject: '数学',
      grade: '八年级',
      direction: '核心素养'
    }
  })
});

const { content, wordCount } = await genRes.json();
console.log(`生成成功！字数: ${wordCount}`);
```

## 🎨 设计理念

采用包豪斯设计风格：
- **极简主义** - Less is More
- **功能至上** - 形式追随功能
- **几何形状** - 圆形、方形、三角形
- **原色点缀** - 红、蓝、黄橙
- **粗重线条** - 4px 边框

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

- 作者：PIGOU Workshop
- 邮箱：your-email@example.com
- 网站：https://yourwebsite.com

---

**⚠️ 注意**：请勿将 `.env` 文件提交到 Git 仓库！
