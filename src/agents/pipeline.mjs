/**
 * Pipeline Agent - 一键全流程生成
 * 按顺序生成：申报书 → 开题 → 中期（模板）→ 结题（模板）
 */
import { executeGeneration, STATES } from "./orchestrator.mjs";
import { upsertSession } from "../db/index.mjs";

const DOC_SEQUENCE = [
  { docType: "shenbao", name: "课题申报书", extraFields: {} },
  { docType: "kaiti",   name: "开题报告",   extraFields: {} },
  { docType: "zhongqi", name: "中期检查报告", extraFields: { progress: "【待填写：研究进展描述，请说明已完成的主要工作】" } },
  { docType: "jieti",   name: "结题报告",   extraFields: { achievements: "【待填写：主要研究成果，请列举论文、案例集、资源包等】" } },
];

export async function executePipeline(baseParams, userId, onEvent) {
  const results = [];
  for (let i = 0; i < DOC_SEQUENCE.length; i++) {
    const step = DOC_SEQUENCE[i];
    const sessionId = `pipeline_${step.docType}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const params = { ...baseParams, ...step.extraFields };
    onEvent("pipeline_step", { docType: step.docType, name: step.name, status: "starting", step: i + 1, total: DOC_SEQUENCE.length });
    upsertSession(sessionId, { id: sessionId, userId: userId ?? null, state: STATES.GENERATING, docType: step.docType, collectedData: params, fieldIndex: 0 });
    let docResult = null;
    await executeGeneration(sessionId, false, (event, data) => {
      if (event === "done") {
        docResult = data;
        onEvent("pipeline_step", { docType: step.docType, name: step.name, status: "done", step: i + 1, total: DOC_SEQUENCE.length, wordCount: data.wordCount, avgScore: data.avgScore });
      } else {
        onEvent(`${step.docType}_${event}`, data);
      }
    });
    results.push({ docType: step.docType, name: step.name, ...(docResult ?? {}) });
  }
  onEvent("pipeline_done", { results: results.map(r => ({ docType: r.docType, name: r.name, wordCount: r.wordCount, avgScore: r.avgScore, placeholders: r.placeholders })), totalDocs: results.length });
  return results;
}
