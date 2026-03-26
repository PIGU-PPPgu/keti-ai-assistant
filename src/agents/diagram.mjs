/**
 * Diagram Agent v2 - 每章节智能判断是否需要图表，按需生成
 *
 * 支持图表类型：
 * - flowchart  → 研究框架、流程、逻辑关系
 * - mindmap    → 目标体系、概念关系、成果分类
 * - gantt      → 时间计划、实施阶段
 * - quadrant   → 研究现状分析（重要性/成熟度）
 * - block      → 架构层次图
 */
import { BaseAgent } from './base.mjs';
import { callAIWithModel } from '../services/ai.mjs';

// 每个章节的图表倾向配置（type 可以是数组，AI 自行选择最合适的）
const SECTION_DIAGRAM_HINTS = {
  // 申报书
  title:       { likely: false },
  background:  { likely: true,  types: ['flowchart', 'block'],   desc: '政策-现状-需求逻辑关系图' },
  literature:  { likely: true,  types: ['quadrant', 'mindmap'],  desc: '国内外研究现状分布图或研究脉络图' },
  objectives:  { likely: true,  types: ['mindmap', 'flowchart'], desc: '研究目标与子课题关系图' },
  framework:   { likely: true,  types: ['flowchart', 'block'],   desc: '研究框架层次图（理论层/设计层/实践层）' },
  innovation:  { likely: true,  types: ['mindmap'],              desc: '创新点关系图' },
  methodology: { likely: true,  types: ['gantt', 'flowchart'],   desc: '研究方法体系图或实施计划甘特图' },
  results:     { likely: true,  types: ['mindmap', 'block'],     desc: '预期成果分类图' },
  budget:      { likely: false },
  references:  { likely: false },
  // 开题报告
  plan:        { likely: true,  types: ['flowchart'],            desc: '研究方案流程图' },
  timeline:    { likely: true,  types: ['gantt'],                desc: '研究时间甘特图' },
  // 中期/结题
  progress:    { likely: true,  types: ['gantt', 'flowchart'],   desc: '研究进展时间线' },
  achievements:{ likely: true,  types: ['mindmap'],              desc: '阶段成果分类图' },
  summary:     { likely: true,  types: ['flowchart'],            desc: '研究工作总结流程图' },
  value:       { likely: true,  types: ['mindmap'],              desc: '应用价值关系图' },
};

const DIAGRAM_SYSTEM = `你是 Mermaid 图表专家，专门为教育科研文档生成专业图表。

规则：
1. 只输出 mermaid 代码块，格式：\`\`\`mermaid\\n...\\n\`\`\`
2. 中文标签用双引号包裹
3. 节点数量 6-14 个，不要太简单也不要太复杂
4. 语法必须正确，可直接渲染
5. 图表要真实反映章节内容，不要泛泛而谈

支持的类型：
- flowchart TD/LR：流程图、逻辑关系图
- mindmap：思维导图（根节点 + 分支）
- gantt：甘特图（时间计划）
- quadrantChart：四象限图（分析矩阵）
- block-beta：块状架构图`;

export class DiagramAgent extends BaseAgent {
  constructor() {
    super('DiagramAgent', '智能判断并生成章节配图');
  }

  /**
   * 判断章节是否需要图表，并生成
   * @param {string} sectionId - 章节 ID
   * @param {string} content   - 章节内容
   * @param {object} params    - 课题参数
   * @returns {{ hasDiagram, mermaid, type, caption }}
   */
  async run({ sectionId, content, params }) {
    const hint = SECTION_DIAGRAM_HINTS[sectionId];

    // 不适合配图的章节直接跳过
    if (!hint || !hint.likely) return { hasDiagram: false };

    try {
      const typeList = hint.types.join(' / ');
      const prompt = `请为以下教育科研文档章节生成一个 Mermaid 图表。

章节ID：${sectionId}
图表建议：${hint.desc}
推荐类型：${typeList}（选最合适的一种）
课题信息：学科=${params.subject || ''}，方向=${params.direction || ''}，级别=${params.level || ''}

章节内容摘要（前800字）：
${content.slice(0, 800)}

要求：生成一个能直观展示该章节核心逻辑/结构的图表，内容要与章节实质相关。`;

      const response = await callAIWithModel(
        DIAGRAM_SYSTEM,
        prompt,
        'fast',
        { maxTokens: 1000, temperature: 0.4 }
      );

      const mermaidMatch = response.match(/```mermaid\n([\s\S]+?)\n```/);
      if (!mermaidMatch) return { hasDiagram: false };

      // 提取图表类型
      const mermaidCode = mermaidMatch[1].trim();
      const typeMatch = mermaidCode.match(/^(flowchart|mindmap|gantt|quadrantChart|block-beta|graph)/i);
      const detectedType = typeMatch ? typeMatch[1].toLowerCase() : 'flowchart';

      return {
        hasDiagram: true,
        mermaid: mermaidCode,
        type: detectedType,
        caption: hint.desc,
        sectionId,
      };
    } catch (e) {
      console.warn(`DiagramAgent [${sectionId}] failed:`, e.message);
      return { hasDiagram: false };
    }
  }
}
