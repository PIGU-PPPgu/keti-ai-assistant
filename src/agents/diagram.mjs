/**
 * Diagram Agent - 自动生成 Mermaid 流程图
 */
import { BaseAgent } from "./base.mjs";
import { callAIWithModel } from "../services/ai.mjs";

const DIAGRAM_SECTIONS = {
  framework:   { type: "flowchart", desc: "研究框架图" },
  methodology: { type: "gantt",     desc: "研究实施计划甘特图" },
  objectives:  { type: "mindmap",   desc: "研究目标思维导图" },
};

const MERMAID_SYSTEM = `你是 Mermaid 图表专家。根据章节内容生成对应的 Mermaid 代码。要求：只输出 mermaid 代码块，语法正确可直接渲染，中文标签用双引号，节点5-12个。格式：\`\`\`mermaid\n...\n\`\`\``;

export class DiagramAgent extends BaseAgent {
  constructor() { super("DiagramAgent", "为文档章节生成 Mermaid 流程图"); }

  async run({ sectionId, content, params }) {
    const config = DIAGRAM_SECTIONS[sectionId];
    if (!config) return { hasDiagram: false };
    try {
      const prompt = `根据以下${config.desc}的章节内容，生成一个 ${config.type} 类型的 Mermaid 图：\n\n章节内容：\n${content.slice(0, 1000)}\n\n课题信息：学科=${params.subject}，方向=${params.direction}`;
      const response = await callAIWithModel(MERMAID_SYSTEM, prompt, "fast", { maxTokens: 800, temperature: 0.3 });
      const mermaidMatch = response.match(/```mermaid\n([\s\S]+?)\n```/);
      if (!mermaidMatch) return { hasDiagram: false };
      return { hasDiagram: true, mermaid: mermaidMatch[1], type: config.type, sectionId };
    } catch (e) {
      console.warn("DiagramAgent failed:", e.message);
      return { hasDiagram: false };
    }
  }
}
