# 课题AI 改造方案

> 基于 NanoResearch 流水线架构，将课题AI重构为9阶段独立Agent系统
> 版本：v1.0 | 日期：2026-04-08

---

## 一、新流水线设计

### 9阶段总览

```
TOPIC_DISCOVERY → LITERATURE_REVIEW → RESEARCH_DESIGN → THEORETICAL_FRAMEWORK → METHOD_PLANNING
      ↓                  ↓                  ↓                    ↓                    ↓
  选题发现           文献综述           研究设计             理论框架             方法规划
                                                                                      ↓
                                          POLISH_REVIEW ← FIGURE_TABLE_GEN ← QUALITY_ASSURANCE ← CONTENT_GENERATION
                                            润色审校          图表生成            质量保证            内容生成
```

### 各阶段职责

| 阶段 | 原Agent映射 | 核心任务 | 输出物 |
|------|------------|---------|--------|
| TOPIC_DISCOVERY | QueryAgent + TitleAgent | 收集需求、发散选题、确定方向 | topic_spec.json |
| LITERATURE_REVIEW | LiteratureAgent | 搜索文献、整理综述、提取关键论点 | literature.json |
| RESEARCH_DESIGN | 新增 | 研究问题、假设、框架设计 | research_design.json |
| THEORETICAL_FRAMEWORK | 新增 | 理论基础、概念界定、模型构建 | theory.json |
| METHOD_PLANNING | 新增 | 研究方法、技术路线、工具选择 | method_plan.json |
| CONTENT_GENERATION | GeneratorAgent | 各章节内容生成（带Critic循环） | content_draft.json |
| QUALITY_ASSURANCE | ReviewerAgent + OptimizerAgent | 评分、优化、交叉评审 | qa_report.json |
| FIGURE_TABLE_GEN | DiagramAgent | 图表、表格、流程图生成 | figures/ |
| POLISH_REVIEW | ReviewerAgent（去AI化） | 润色、去AI味、最终审校 | final_doc.json |

---

## 二、Agent 架构重构

### 目录结构

```
agents/
├── base/
│   ├── base_agent.py          # 抽象基类
│   ├── checkpoint.py          # 断点管理
│   ├── quality_gate.py        # 质量门控
│   └── model_router.py        # 模型路由
├── stages/
│   ├── topic_discovery.py
│   ├── literature_review.py
│   ├── research_design.py
│   ├── theoretical_framework.py
│   ├── method_planning.py
│   ├── content_generation.py
│   ├── quality_assurance.py
│   ├── figure_table_gen.py
│   └── polish_review.py
├── orchestrator.py            # 流水线调度
└── pipeline.py                # 入口
```

### BaseAgent 标准接口

```python
class BaseAgent(ABC):
    stage: PipelineStage          # 阶段枚举
    model: str                    # 路由模型
    max_retries: int = 3          # 最大重试次数
    quality_threshold: float      # 质量阈值

    # 标准输入
    async def run(self, context: StageContext) -> StageOutput:
        ...

    # 质量评分（每个Agent自己实现）
    async def score(self, output: StageOutput) -> QualityScore:
        ...

    # 检查点保存
    async def save_checkpoint(self, output: StageOutput):
        ...
```

### StageContext / StageOutput Schema

```python
@dataclass
class StageContext:
    project_id: str
    doc_type: DocType              # 申报书/开题报告/中期检查/结题报告
    stage: PipelineStage
    previous_outputs: dict         # 所有前序阶段输出
    user_overrides: dict           # 人工修改内容
    metadata: dict                 # 学科、年级、方向等

@dataclass
class StageOutput:
    stage: PipelineStage
    status: StageStatus            # SUCCESS / FAILED / PAUSED
    data: dict                     # 阶段产出数据
    quality_score: float
    retry_count: int
    timestamp: datetime
    model_used: str
```

### 断点续跑机制

```python
# checkpoint.py
class CheckpointManager:
    def save(self, project_id: str, stage: PipelineStage, output: StageOutput):
        # 写入 SQLite，同时写 JSON 快照
        ...

    def load(self, project_id: str, from_stage: PipelineStage) -> dict:
        # 加载指定阶段及之前所有输出
        ...

    def can_resume(self, project_id: str, stage: PipelineStage) -> bool:
        # 检查该阶段是否有有效检查点
        ...
```

**恢复逻辑：**
- 启动时检查 `project_id` 最新检查点
- 从上次成功的阶段之后继续
- 支持 `--from-stage METHOD_PLANNING` 强制从指定阶段重跑
- 人工修改后，标记该阶段为 `OVERRIDDEN`，下游阶段自动重跑

---

## 三、质量控制机制

### 每阶段评分标准

| 阶段 | 评分维度 | 阈值 |
|------|---------|------|
| TOPIC_DISCOVERY | 需求完整度、选题创新性、可行性 | 0.75 |
| LITERATURE_REVIEW | 文献数量、相关性、综述深度 | 0.80 |
| RESEARCH_DESIGN | 逻辑严密性、问题清晰度 | 0.80 |
| THEORETICAL_FRAMEWORK | 理论支撑度、概念准确性 | 0.78 |
| METHOD_PLANNING | 方法适配性、路线可行性 | 0.80 |
| CONTENT_GENERATION | 内容完整度、章节连贯性、字数达标 | 0.82 |
| QUALITY_ASSURANCE | 综合质量、前后一致性 | 0.85 |
| FIGURE_TABLE_GEN | 图表准确性、美观度 | 0.75 |
| POLISH_REVIEW | 去AI化程度、语言流畅度 | 0.88 |

### 自动重跑逻辑

```python
class QualityGate:
    async def check_and_retry(self, agent, context, max_retries=3):
        for attempt in range(max_retries):
            output = await agent.run(context)
            score = await agent.score(output)

            if score.value >= agent.quality_threshold:
                return output

            # 低于阈值：注入失败原因，重跑
            context.retry_hint = score.failure_reasons
            context.retry_count = attempt + 1

        # 3次仍失败：暂停等待人工介入
        await self.pause_for_human(context, output)
```

### 交叉评审

- `QUALITY_ASSURANCE` 阶段调用独立 `CrossReviewAgent`
- 对 `CONTENT_GENERATION` 输出进行盲评（不看生成过程）
- `POLISH_REVIEW` 阶段对照原始 `topic_spec` 检查内容偏离度
- 关键阶段（RESEARCH_DESIGN、CONTENT_GENERATION）输出会被下游阶段隐式验证

---

## 四、多模型路由

### 路由规则

```python
MODEL_ROUTING = {
    PipelineStage.TOPIC_DISCOVERY:       "gpt-5.4",        # 发散创意
    PipelineStage.LITERATURE_REVIEW:     "gpt-4o",         # 快速检索
    PipelineStage.RESEARCH_DESIGN:       "claude-sonnet",  # 严谨结构
    PipelineStage.THEORETICAL_FRAMEWORK: "claude-sonnet",  # 严谨结构
    PipelineStage.METHOD_PLANNING:       "claude-sonnet",  # 严谨结构
    PipelineStage.CONTENT_GENERATION:    "claude-sonnet",  # 长文生成
    PipelineStage.QUALITY_ASSURANCE:     "claude-opus",    # 高质量评审
    PipelineStage.FIGURE_TABLE_GEN:      "gpt-4o",         # 代码生成
    PipelineStage.POLISH_REVIEW:         "claude-opus",    # 最高质量润色
}
```

### sub2api 统一调度

```python
class ModelRouter:
    base_url = "https://sub2api.example.com/v1"

    async def call(self, stage: PipelineStage, messages: list, **kwargs):
        model = MODEL_ROUTING[stage]
        # 统一走 sub2api，屏蔽底层差异
        return await openai_client.chat.completions.create(
            model=model,
            messages=messages,
            base_url=self.base_url,
            **kwargs
        )
```

**降级策略：**
- 主模型失败 → 自动降级到备用模型（配置 `FALLBACK_MODELS`）
- 超时 30s → 重试一次，再超时 → 降级
- 记录每次模型调用的 token 消耗和耗时

---

## 五、数据流设计

### SQLite Schema

```sql
-- 项目表
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    doc_type TEXT,
    metadata JSON,
    current_stage TEXT,
    status TEXT,
    created_at DATETIME,
    updated_at DATETIME
);

-- 阶段检查点
CREATE TABLE stage_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    stage TEXT,
    status TEXT,           -- SUCCESS / FAILED / PAUSED / OVERRIDDEN
    output_data JSON,
    quality_score REAL,
    retry_count INTEGER,
    model_used TEXT,
    created_at DATETIME,
    UNIQUE(project_id, stage)  -- 每个阶段只保留最新
);

-- 人工介入记录
CREATE TABLE human_interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    stage TEXT,
    original_data JSON,
    modified_data JSON,
    reason TEXT,
    created_at DATETIME
);

-- 模型调用日志
CREATE TABLE model_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    stage TEXT,
    model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    latency_ms INTEGER,
    created_at DATETIME
);
```

### 数据流转

```
用户输入
    ↓
TOPIC_DISCOVERY.output → {topic, title_candidates, requirements}
    ↓
LITERATURE_REVIEW.input = {topic} → output = {papers, summary, key_points}
    ↓
RESEARCH_DESIGN.input = {topic, literature} → output = {questions, hypotheses, framework}
    ↓
THEORETICAL_FRAMEWORK.input = {research_design, literature} → output = {theories, concepts, model}
    ↓
METHOD_PLANNING.input = {research_design, theory} → output = {methods, timeline, tools}
    ↓
CONTENT_GENERATION.input = {all_above} → output = {chapters: {intro, body, conclusion...}}
    ↓
QUALITY_ASSURANCE.input = {content, all_above} → output = {scores, issues, suggestions}
    ↓
FIGURE_TABLE_GEN.input = {content, method_plan} → output = {figures, tables}
    ↓
POLISH_REVIEW.input = {content, figures, qa_report} → output = {final_document}
```

### 人工介入点

任意阶段完成后可暂停：

```python
# 前端发送暂停信号
POST /api/projects/{id}/pause?after_stage=RESEARCH_DESIGN

# 人工修改后继续
POST /api/projects/{id}/resume
Body: {
    "stage": "RESEARCH_DESIGN",
    "overrides": { "questions": [...] },  # 修改内容
    "rerun_from": "THEORETICAL_FRAMEWORK"  # 从哪个阶段重跑
}
```

---

## 六、前端改造要点

### Mission Control 升级

```
┌─────────────────────────────────────────────────────────────┐
│  课题AI - Mission Control                    [暂停] [导出]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ① 选题发现    ✅  02:13  [展开]                            │
│  ② 文献综述    ✅  05:47  [展开]                            │
│  ③ 研究设计    🔄  进行中... ████████░░  80%  [暂停]        │
│  ④ 理论框架    ⏳  等待中                                   │
│  ⑤ 方法规划    ⏳  等待中                                   │
│  ⑥ 内容生成    ⏳  等待中                                   │
│  ⑦ 质量保证    ⏳  等待中                                   │
│  ⑧ 图表生成    ⏳  等待中                                   │
│  ⑨ 润色审校    ⏳  等待中                                   │
│                                                             │
│  总进度: ████████████░░░░░░░░  35%   预计剩余: ~18分钟      │
└─────────────────────────────────────────────────────────────┘
```

### 阶段展开详情

点击 `[展开]` 显示：
- 使用模型、耗时、token消耗
- 质量评分（带维度雷达图）
- 本阶段输出摘要
- `[重跑此阶段]` `[人工编辑]` 按钮

### SSE 事件扩展

```typescript
// 新增事件类型
type SSEEvent =
  | { type: 'stage_start'; stage: string; model: string }
  | { type: 'stage_progress'; stage: string; progress: number; log: string }
  | { type: 'stage_complete'; stage: string; score: number; duration_ms: number }
  | { type: 'stage_retry'; stage: string; attempt: number; reason: string }
  | { type: 'stage_paused'; stage: string; reason: 'quality_failed' | 'human_requested' }
  | { type: 'pipeline_complete'; total_duration_ms: number }
```

### 操作按钮逻辑

| 操作 | 触发条件 | 行为 |
|------|---------|------|
| 暂停 | 任意运行中 | 当前阶段完成后暂停 |
| 继续 | 已暂停 | 从下一阶段继续 |
| 重跑单阶段 | 阶段已完成 | 清除该阶段检查点，重新执行，下游自动重跑 |
| 人工编辑 | 阶段已完成 | 打开编辑器，保存后标记 OVERRIDDEN，触发下游重跑 |
| 跳过阶段 | 非必须阶段 | 标记 SKIPPED，使用空输出继续 |

---

## 七、迁移路径

### Phase 1：基础设施（1周）
- [ ] 实现 `BaseAgent` + `CheckpointManager` + `ModelRouter`
- [ ] 建立 SQLite schema
- [ ] SSE 事件扩展

### Phase 2：Agent 拆分（2周）
- [ ] 将现有 Agent 逻辑迁移到新 stage 结构
- [ ] 新增 `ResearchDesignAgent`、`TheoreticalFrameworkAgent`、`MethodPlanningAgent`
- [ ] 实现各阶段 `score()` 方法

### Phase 3：质量控制（1周）
- [ ] `QualityGate` 自动重跑
- [ ] `CrossReviewAgent` 交叉评审
- [ ] 人工介入 API

### Phase 4：前端升级（1周）
- [ ] Mission Control 9阶段进度
- [ ] 阶段展开详情
- [ ] 暂停/继续/重跑交互

### Phase 5：测试上线（1周）
- [ ] 端到端测试（4种文档类型）
- [ ] 性能基准（目标：全流程 < 30分钟）
- [ ] 灰度发布

---

## 附：关键设计决策

**为什么拆成9个独立Agent而不是保持现有结构？**
独立Agent意味着每个阶段可以单独测试、单独优化、单独替换模型，不会牵一发动全身。现有结构中 GeneratorAgent 承担太多，一旦出问题整个流程卡死。

**为什么用 SQLite 而不是内存/Redis？**
课题生成耗时长（20-40分钟），用户可能中途关闭浏览器。SQLite 保证进程重启后可以无缝恢复，且无需额外基础设施。

**断点续跑的粒度是阶段级还是更细？**
阶段级。章节级粒度过细，管理复杂度高，收益有限。如果某阶段内部需要更细粒度，由该 Agent 自己管理内部状态。
