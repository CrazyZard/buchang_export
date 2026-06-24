# 洗唛排版系统 — Agent 分工

## 字体规范（铁律，不容更改）

预览与导出（PDF 可编辑文字）必须严格遵守，任何模板/语言都不得违反：

| 内容 | 字体 |
|------|------|
| **所有数字（中文稿、翻译区、阿语行内，含小数点）** | **GO.TTF** |
| **所有 `%`** | **FZ.TTF**（中文字体，**绝不用 GO**） |
| 中文文字、中文标点 | FZ.TTF |
| 英文/俄文（西里尔）字母 | GO.TTF |
| 阿拉伯字母 | ARIAL.TTF |

- 例：`36.6%锦纶` → `36.6`=GO、`%`=FZ、`锦纶`=FZ；`57.7%нитрон` → `57.7`=GO、`%`=FZ、`нитрон`=GO。
- 阿语 `57.7%أكريليك` → `57.7`=GO、`%`=FZ、阿拉伯字母=ARIAL（数字/% 与全局规则一致，只有阿拉伯字母用 ARIAL）。
- 阿语仍走整段 bidi+整形管线，但**逐字形按上表分字体**（预览拆 `label-latin`/`composition-percent`）。
- 实现见 [.cursor/rules/export-pipeline.mdc](.cursor/rules/export-pipeline.mdc)；改动前先读该规则。

---

修改某一模板时，**只改对应模板**，不要影响其他模板的样式与默认数据。

| 模板 | Template ID | 专用规则 |
|------|-------------|----------|
| 巴拉 | `balabala` | [.cursor/rules/template-balabala.mdc](.cursor/rules/template-balabala.mdc) |
| 迷你巴拉 | `mini-balabala` | [.cursor/rules/template-mini-balabala.mdc](.cursor/rules/template-mini-balabala.mdc) |
| bala-羽绒 | `bala-down` | [.cursor/rules/template-bala-down.mdc](.cursor/rules/template-bala-down.mdc) |
| 森马常规 | `senma-regular` | [.cursor/rules/template-senma-regular.mdc](.cursor/rules/template-senma-regular.mdc) |
| 森马羽绒 | `senma-down` | [.cursor/rules/template-senma-down.mdc](.cursor/rules/template-senma-down.mdc) |
| 青蛙王子 | `frog` | [.cursor/rules/template-frog.mdc](.cursor/rules/template-frog.mdc) |
| 青蛙羽绒 | `frog-down` | [.cursor/rules/template-frog-down.mdc](.cursor/rules/template-frog-down.mdc) |

## 专项规则

| 主题 | 规则 |
|------|------|
| PDF 导出管线（可编辑文字/阿语 RTL/俄文字距/% 字体） | [.cursor/rules/export-pipeline.mdc](.cursor/rules/export-pipeline.mdc) |

## 共享代码（改模板时谨慎）

- `src/templates/index.ts` — 各模板配置入口
- `src/utils/labelDefaults.ts` — 各模板默认数据工厂函数
- `src/components/WashLabelSections.tsx` — 按 `useTemplate()` 分支，勿写死某一模板
- `src/App.css` — 优先用 `.wash-label--{templateId}` 限定样式
- 导出（`src/utils/exportText*.ts`、`svgTextToPaths*.ts` 等）— 按块类型独立处理，见上方专项规则

## 新增模板检查清单

1. 在 `TemplateId` 与 `WASH_LABEL_TEMPLATES` 注册
2. 添加 `createXxxLabelData()` 默认数据
3. 新增 `.cursor/rules/template-xxx.mdc`
4. 样式使用 `wash-label--{id}`，避免污染其他模板
