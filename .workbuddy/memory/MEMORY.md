# 项目约定：销售预测达成看板

> 🔴 **动手前必读 `REFERENCE.md`**（构建源清单 / 口径算式 / 测试 / 视觉 / Q4 / 发布 / 环境）。历史见 `YYYY-MM-DD.md`。

## 构建链
- 交付 `销售预测达成看板.html`（数据内联、零依赖离线）；周/月同文件靠「粒度」芯片切。根 `index.html` 与之**逐字节一致**，更新后 `cp` 同步。
- 🔴 **新数据只 append 到 `SRCS`，绝不整批替换历史**；「只要最新」才替换；**歧义要问**。源表是历史唯一来源（`data.json` 不能反解）。
- `build/build_all.py` 5 步：`build_data.py`(周)→`build_data_month.py`(月)→`build_inventory.py`(库存)→`merge_data.py`(→`data_all.json`)→`build_html.py`。⚠️ 只跑库存不跑 merge，`data_all.json` 不更新。
- 多源合并：`SRCS` 纵向拼接，同「周期」靠后源整期替换；⚠️ 禁用 `drop_duplicates([时间列])`。
- 🔴 **读 rec**：**SKU 维度是 `r[19]`(k，`最早SKU|预测SKU`)；`r[13]` 是 `ids`（预测SKU编号列表）不是维度**（完整 FLD 见 REFERENCE）。
- **换源标准动作**：append `SRCS` → `build_all.py` → `verify_data.py`(ALL CHECKS PASSED) → `test_dashboard.js`(RUNTIME OK) → `cp index.html` → 备份 →（同意后）push。
- **数据契约**：`data_all.json={builtAt,modes:[{…,'week'},{…,'month'}],elimSkus,inv}`。加粒度 = 新 `build_data_*.py` + `MODES` 加一行，模板零改动。
- **备份** `备份/YYYY-MM-DD_HHmm/` + 同名 zip；校验 `build/verify_backup.py [时间戳]`。

## 口径（用户给定，勿改）
- 算式细节见 REFERENCE。**站点顺序固定 墨西哥(MX)→巴西(BR)**；卡片/chips/趋势/明细表全跟 `D.sites`。
- 维度：站点/业务组/BU/产品组/负责人/三级分类/国家Listing/SKU。

## 五项信息与负责人归属（🔴 用户 11-17 / 11-24）
- 🔴 **五项信息（BU/三级分类/产品组/业务组/业务负责人）以源表为准**，不取众数、不推断、不跨站点借值。
- `LATEST_ATTR_SRC`（最新周+月表）建 **(最早SKU, 预测站点)** → 五项 映射，`apply_latest_attrs()` 覆盖**全周期**。键必须含**预测站点**（实测 32 SKU 按站点不同负责人：BR=蓝晓琳 / MX=吴珍妮）。站点级查不到退回 SKU 级兜底，**但只对「全站点同值」的 SKU 生效**。
- 🔴 **换 `LATEST_ATTR_SRC` 时历史期负责人跟着变**（用户 11-24「以最新的为准」「历史也变」）。
- 🔴 **停产 SKU（新旧表都查不到）→ 按 `(三级分类, BU, 预测站点)` 归属最新负责人**。⚠️ 键**必须含 BU**（单 `(分类,站点)` 有 6 组跨 BU 冲突）。取该键下最新表 **Σ加权预测最大** 者覆盖全部历史行；查不到的组合保留原值。
- **业务组 ↔ BU**：`apply_bu_group()` **只补空值**。**listing 回填**：按 **(国家, 最早SKU) 双键** 查 `E:/不重要文件/国家listing对应表.xlsx`；只补空值；补不上归「（未标注）」。

## 硬规则（视觉 / 交互）
- **红绿语义全页唯一**：红=达成/超出；绿=未达成/落后。货币 ¥。`fmtGap`：实际超出→`+`、不足→`-`（与算式值反）。
- 🔴 **表头文字是用户原文，一字不许改**，放不下**只加宽列**。交互克制：**无排序下拉、无板块内搜索框、无表底说明**。
- **表头条件筛选**：🔴 **点开在表头下面就地展开一行**，**再点收起并清空复原**，非弹层。🔴 **运算符与数值分开存**：数值没填存 `null`（否则重画运算符被重置）。
- **Q4 条件筛选（11 列）**：6 数值列 + 3 文字列（上级维度/名称/负责人，**关键字 + 清单勾选两种同时提供**）。⚠️ **Q4 表只显示筛选后前 N 名（10/15），「行数不变」不能证明筛选没生效 —— 看名称集合**。
- **文本选择保护 `textSelecting()`**：拖选/Ctrl+A 不触发行下钻；新增下钻入口须同步加守卫。
- **巴西淘汰筛选**：`elimSkus` 匹配 SKU 维度前半段（`split('|')[0]`）；**仅巴西站**显示 全量/正常/淘汰。
- **导出 CSV 遵循自定义列**：读 `table.getAttribute('data-hide')`，⚠️ 不能用 `hideColsSet(tblKey)`。

## 🔴 三级分类按 BU 拆行（Q4 + 主看板）
- 同名跨 BU（本期 5 组：边桌/床头柜/斗柜/玄关桌/简易衣柜）在 **Q4 与主看板维度表都拆两行**。聚合 key = `分类下标\u0001BU下标`，**仅跨 BU 分类** 才输出 `data-bu`+`.butag`。
- **下钻/弹窗必须带 BU**：`matchDrill` 查 `state.drillBu[k]`；行点击按 `(name,bu)` 判等。
- 负责人 = 该组**最近有记录的一期**里 Σf1 最大者，**整组只 1 个，不标 +N**。⚠️ 别把全窗口各期 Σf1 累加（旧负责人会投票回来）。

## Q4 冲销异常板块
- 四张卡；清单 11 列。**集中度分母四卡必须同数**，N 按维度（分类=10、Listing=15），**表格默认行数=句中 N**。
- **库存三列**源 `MX&BR冲坑周跟进-W45.xlsx`（换周次只改 `build_inventory.py` 的 `SRC`）；**全部站点→三列全「—」**。每表可导出 CSV。**不要给维度板块加常驻趋势图**（被否）。
- **Q4 视图** `applyQ4View()`：hash 前缀 `q4`→进、空 hash→出（⚠️ 别改 hash）。

## 发布
- 📦 https://github.com/c89135028-ux/sales-forecast-dashboard ｜🌐 https://c89135028-ux.github.io/sales-forecast-dashboard/ （根目录须有 `.nojekyll`）
- ⚠️ 沙箱 `git push` 常报「被拦截」但**实际已成功** → 先 `git ls-remote` 确认，**不盲目重试**。🔴 沙箱**拒绝删除**工作区 `.edgetmp*`。
