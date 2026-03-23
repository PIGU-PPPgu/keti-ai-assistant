# 课题 AI 助手 - 快速开始

## 🚀 快速启动

### 方式 1: 使用启动脚本（推荐）

```bash
cd ~/.openclaw/workspace/products/keti-ai-assistant
./start.sh
```

### 方式 2: 手动启动

```bash
cd ~/.openclaw/workspace/products/keti-ai-assistant

# 首次运行需要安装依赖
npm install

# 启动服务器
node server.mjs
```

### 方式 3: 开发模式（自动重启）

```bash
node --watch server.mjs
```

---

## 📖 使用方法

### 1. 访问前端

打开浏览器，访问：
```
http://localhost:3000
```

### 2. 填写表单

- **课题级别**: 区级/市级/省级
- **学科**: 数学/语文/英语/...
- **年级**: 小学/初中/高中
- **研究周期**: 2年/3年
- **研究方向**: 核心素养/大单元/数字化/...

### 3. 点击生成

点击"生成课题申报书"按钮，等待 3-5 秒。

### 4. 查看结果

生成的申报书会显示在页面下方，你可以：
- **复制**: 复制到剪贴板
- **下载**: 下载为 Markdown 文件
- **重置**: 清空结果，重新生成

---

## 🔌 API 使用

### 健康检查

```bash
curl http://localhost:3000/api/health
```

### 生成课题申报书

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "level": "市级",
    "subject": "数学",
    "grade": "初中",
    "duration": "3年",
    "direction": "核心素养"
  }'
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| level | string | ✅ | 课题级别: 区级/市级/省级 |
| subject | string | ✅ | 学科: 数学/语文/英语/... |
| grade | string | ✅ | 年级: 小学/初中/高中 |
| duration | string | ❌ | 研究周期: 2年/3年（默认2年） |
| direction | string | ✅ | 研究方向: 核心素养/大单元/数字化/... |
| title | string | ❌ | 自定义课题名称（留空自动生成） |
| host | string | ❌ | 主持人姓名 |
| school | string | ❌ | 所在学校 |

---

## 📊 功能特性

### ✅ 已实现

- [x] 前端表单界面
- [x] 后端 API 服务
- [x] 课题申报书生成
- [x] 多级别支持（区/市/省）
- [x] 多学科支持
- [x] 自定义研究方向
- [x] Markdown 格式输出
- [x] 复制/下载功能

### 🚧 待开发

- [ ] 开题报告生成
- [ ] 中期检查生成
- [ ] 结题报告生成
- [ ] Word 格式输出
- [ ] AI 真实调用（目前是模板生成）
- [ ] 用户系统
- [ ] 支付系统
- [ ] 数据库存储

---

## 💡 提示

1. **这是 MVP 版本**: 目前使用模板生成，未来会接入真实 AI API（GLM-5）
2. **生成内容需修改**: AI 生成的是初稿，请根据实际情况完善
3. **字数统计**: 当前版本约 3000-5000 字，市级课题需要 8000-10000 字，需要扩展
4. **文献不足**: 当前只有 8 篇示例文献，实际需要 30+ 篇

---

## 🔧 自定义配置

### 修改端口

编辑 `server.mjs`：
```javascript
const PORT = process.env.PORT || 3000;  // 改成你想要的端口
```

### 修改生成逻辑

编辑 `server.mjs` 中的生成函数，例如：
- `generateTitle()` - 课题名称生成
- `generateBackground()` - 研究背景生成
- `generateResearchGoals()` - 研究目标生成
- ...

---

## 📞 联系方式

- **微信**: [扫码添加]
- **公众号**: PIGOU Workshop

---

生成时间: 2026-03-22
版本: v1.0
