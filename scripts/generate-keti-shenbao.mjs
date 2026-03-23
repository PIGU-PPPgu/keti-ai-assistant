#!/usr/bin/env node

/**
 * 课题申报书生成脚本
 * 
 * 使用方法:
 * node generate-keti-shenbao.mjs --level=市级 --subject=数学 --grade=初中 --direction=核心素养 --duration=3年
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  
  args.forEach(arg => {
    const [key, value] = arg.replace('--', '').split('=');
    params[key] = value;
  });
  
  return params;
}

// 验证参数
function validateParams(params) {
  const required = ['level', 'subject', 'grade', 'direction'];
  const missing = required.filter(key => !params[key]);
  
  if (missing.length > 0) {
    console.error(`❌ 缺少必需参数: ${missing.join(', ')}`);
    console.log('\n使用方法:');
    console.log('node generate-keti-shenbao.mjs --level=市级 --subject=数学 --grade=初中 --direction=核心素养 --duration=3年');
    process.exit(1);
  }
  
  return true;
}

// 生成课题名称
function generateKetiName(params) {
  const { direction, subject, grade } = params;
  
  const templates = [
    `${direction}导向的${grade}${subject}教学实践研究`,
    `基于${direction}的${grade}${subject}教学策略研究`,
    `${direction}视域下的${grade}${subject}教学模式研究`,
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

// 生成主题词
function generateKeywords(params) {
  const { direction, subject, grade } = params;
  
  const keywords = [
    direction,
    subject,
    grade,
    '教学实践',
    '策略研究',
  ];
  
  return keywords.join('、');
}

// 生成研究背景
function generateBackground(params) {
  const { direction, subject, grade } = params;
  
  return `
【研究背景】

1. 政策背景

随着"双减政策"的实施和"核心素养"理念的推广，${grade}${subject}教学面临新的挑战和机遇。
教育部发布的《义务教育课程方案和课程标准（2022年版）》明确提出，要培养学生的核心素养，
促进学生的全面发展。${direction}成为当前${subject}教学改革的重要方向。

2. 现实问题

当前${grade}${subject}教学中存在以下问题：
（1）教学方法单一，学生参与度不高
（2）教学内容与实际应用脱节
（3）评价方式片面，无法全面反映学生能力
（4）个性化教学难以实现

3. 技术机遇

随着人工智能、大数据等技术的发展，为${direction}的实施提供了新的可能性：
（1）AI辅助教学，实现个性化学习
（2）数据分析，精准把握学情
（3）智能评价，全面评估学生能力
`.trim();
}

// 生成研究目标
function generateResearchGoals(params) {
  const { direction, subject, grade } = params;
  
  return `
本研究旨在构建${direction}导向的${grade}${subject}教学体系，具体目标包括：

1. 构建${direction}导向的${grade}${subject}教学模型
   通过文献研究和实践探索，建立科学的教学框架。

2. 开发${grade}${subject}${direction}教学策略
   设计具体可操作的教学方法和路径。

3. 提升${grade}学生的${subject}核心素养
   促进学生知识、能力、素养的全面发展。

4. 形成${direction}教学的典型案例
   为同类学校和教师提供可参考的经验。
`.trim();
}

// 生成研究内容
function generateResearchContent(params) {
  const { direction, subject, grade } = params;
  
  return `
本研究包含以下4个方面的内容：

1. ${direction}导向的${grade}${subject}教学现状调查
   - 调查对象: ${grade}学生和${subject}教师
   - 调查方法: 问卷调查、课堂观察、访谈
   - 调查内容: 教学现状、存在问题、改进需求
   - 预期结果: 形成现状调查报告

2. ${direction}导向的${grade}${subject}教学策略研究
   - 策略设计: 基于调查结果，设计教学策略
   - 方法探索: 尝试多种教学方法
   - 模式构建: 形成可推广的教学模式
   - 机制创新: 建立长效机制

3. ${direction}导向的${grade}${subject}教学实践应用
   - 试点选择: 选择2-3个班级试点
   - 实施路径: 制定详细的实施计划
   - 效果验证: 对比实验，验证效果
   - 优化改进: 根据反馈，持续优化

4. ${direction}导向的${grade}${subject}教学评价体系
   - 指标设计: 设计多维度评价指标
   - 工具开发: 开发评价工具
   - 数据分析: 收集并分析数据
   - 反馈机制: 建立反馈改进机制
`.trim();
}

// 生成研究方法
function generateResearchMethods() {
  return `
本研究采用以下5种研究方法：

1. 文献分析法
   通过查阅国内外关于[研究方向]的相关文献，梳理已有研究成果，
   明确本研究的理论基础和研究空白。

2. 问卷调查法
   设计问卷，收集学生和教师的数据，了解教学现状和问题。

3. 行动研究法
   在教学实践中不断尝试、反思、改进，形成动态调整机制。

4. 案例研究法
   深入分析典型案例，提炼可推广的经验。

5. 数据分析法
   使用统计软件，对收集的数据进行分析，验证研究效果。
`.trim();
}

// 生成创新点
function generateInnovations(params) {
  const { direction, subject, grade } = params;
  
  return `
本研究的创新之处：

1. 理论创新
   提出${direction}导向的${grade}${subject}教学新范式，
   构建"目标-内容-方法-评价"四位一体的教学体系。

2. 技术创新
   引入AI辅助教学和数据分析技术，实现精准教学。

3. 应用创新
   开发可操作的教学工具和资源包，降低实践门槛。

4. 整合创新
   首次将${direction}与${subject}教学深度融合，
   解决传统教学单一化、碎片化的问题。
`.trim();
}

// 生成研究计划
function generateResearchPlan(duration) {
  const years = parseInt(duration) || 3;
  
  return `
本研究计划分${years}年${years + 2}个阶段进行：

| 阶段 | 时间 | 主要任务 | 预期成果 |
|------|------|----------|----------|
| 第一阶段 | 第1-6个月 | 文献梳理、理论构建 | 研究报告 |
| 第二阶段 | 第7-12个月 | 策略设计、工具开发 | 初版方案 |
| 第三阶段 | 第13-18个月 | 试点应用、数据收集 | 验证报告 |
| 第四阶段 | 第19-24个月 | 优化改进、效果验证 | 优化方案 |
${years >= 3 ? '| 第五阶段 | 第25-36个月 | 成果总结、推广应用 | 论文/专著 |' : ''}

关键时间节点：
- 第6个月：完成理论框架
- 第12个月：完成工具开发
- 第18个月：完成试点验证
- 第24个月：完成优化改进
${years >= 3 ? '- 第36个月：完成成果推广' : ''}
`.trim();
}

// 生成参考文献
function generateReferences() {
  return `
参考文献（示例）：

[1] 教育部. 义务教育课程方案和课程标准（2022年版）[S]. 北京: 人民教育出版社, 2022.

[2] 林崇德. 21世纪学生发展核心素养研究[M]. 北京: 北京师范大学出版社, 2016.

[3] 钟启泉. 核心素养的"核心"在哪里[J]. 全球教育展望, 2016(4): 3-8.

[4] 余文森. 核心素养导向的课堂教学[M]. 上海: 上海教育出版社, 2017.

[5] 崔允漷. 学科核心素养呼唤大单元教学设计[J]. 上海教育科研, 2019(4): 1.

（注：实际生成时需要30+篇文献，此处为示例）
`.trim();
}

// 主函数
async function main() {
  console.log('🎓 课题申报书生成器 v1.0\n');
  
  // 解析参数
  const params = parseArgs();
  validateParams(params);
  
  console.log('📋 输入信息:');
  console.log(`  - 课题级别: ${params.level}`);
  console.log(`  - 学科: ${params.subject}`);
  console.log(`  - 年级: ${params.grade}`);
  console.log(`  - 研究方向: ${params.direction}`);
  console.log(`  - 研究周期: ${params.duration || '2年'}`);
  console.log('');
  
  // 生成内容
  console.log('⏳ 正在生成...\n');
  
  const ketiName = generateKetiName(params);
  const keywords = generateKeywords(params);
  const background = generateBackground(params);
  const goals = generateResearchGoals(params);
  const content = generateResearchContent(params);
  const methods = generateResearchMethods();
  const innovations = generateInnovations(params);
  const plan = generateResearchPlan(params.duration);
  const references = generateReferences();
  
  // 组装完整申报书
  const fullDoc = `
# ${params.level}课题申报书

## 一、基本信息

**课题名称**: ${ketiName}

**主题词**: ${keywords}

**学科**: ${params.subject}

**年级**: ${params.grade}

**研究周期**: ${params.duration || '2年'}

---

## 二、研究背景与意义

${background}

---

## 三、研究目标与内容

### 研究目标

${goals}

### 研究内容

${content}

---

## 四、研究方法与计划

### 研究方法

${methods}

### 研究计划

${plan}

---

## 五、创新之处

${innovations}

---

## 六、参考文献

${references}

---

*生成时间: ${new Date().toLocaleString('zh-CN')}*
*生成工具: 课题 AI 助手 v1.0*
`.trim();

  // 保存文件
  const outputDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filename = `${ketiName.replace(/[\/\\?%*:|"<>]/g, '-')}-申报书.md`;
  const outputPath = path.join(outputDir, filename);
  
  fs.writeFileSync(outputPath, fullDoc, 'utf-8');
  
  console.log('✅ 生成完成！\n');
  console.log(`📄 文件保存至: ${outputPath}`);
  console.log(`📊 字数统计: ${fullDoc.length} 字符`);
  console.log('');
  console.log('💡 提示: 这是初稿，请根据实际情况修改完善。');
  console.log('');
}

// 执行
main().catch(console.error);
