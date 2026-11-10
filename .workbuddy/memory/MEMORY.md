# 项目长期约定：销售预测达成看板

## 产物与构建
- **一个交付物：`销售预测达成看板.html`**（单文件、数据内联、零外部依赖，双击可离线打开）。
  周报 + 月报在同一份看板里，靠筛选栏最左侧「粒度」芯片 [周] [月] 切换（用户明确要求，不拆两个文件）。
- 🔴 **看板是「滚动窗口」——新数据只追加，绝不整批替换历史**（用户 2026-10-07 纠正：「是滚动你懂吗？把最新数据加上去就行，不是覆盖」）。
  每批新数据把新表 **append 到 `SRCS` 末尾**；「新表周期 = 已有周期的紧邻延伸 / 子集」都按追加处理，只有用户明说「只要最新」才替换。**遇到歧义要问。**
  ⚠️ **源表是历史数据的唯一来源**（`data.json` 是聚合结果、无法反解明细），构建时要读，不能让用户清理。
- 构建链 `build/build_all.py` 一键 4 步：`build_data.py`（周→`data.json`）→ `build_data_month.py`（月→`data_month.json`）→ `merge_data.py`（→`data_all.json`，并注入 `elimSkus`）→ `build_html.py`（模板 + 数据 → 成品 HTML）。
  单独排查：`build_html.py <data.json> <输出.html>` 可出单粒度版。
- **多源滚动合并规则**：`SRCS` 列表按顺序读入纵向拼接，**同一「周期」以靠后的源为准（整周期替换）**。
  实现先算「每个周期的归属源 `owner`」再整周期取该源数据 —— ⚠️ **不能 `drop_duplicates(subset=[时间列])`**，那会把每期只留一行。
  （周报 `TIME_COL='周首日'`、月报 `'年月'`，两版结构一致。）**加新源前先比型（列集合与顺序必须一致）。**
- **当前源**：周报 `SRCS` = (21)+(24)+(34)+(36)+(38)+`C:/Users/Thinkpad/Downloads/日明细数据 (1)`+`E:/ziel浏览器下载/日明细数据 (1)` → **11 周**（8/23 ~ 11/01）；
  月报 `SRCS` = (20)+(25)+(28)+(32)+(35)+(39)+`C:/Users/Thinkpad/Downloads/日明细数据`+`E:/ziel浏览器下载/日明细数据 (2)` → **5 个月**（7~11 月；10 月经多版迭代，11 月为新月）。
- ⚠️ **源表末行「合计」会把总量翻倍**，必须先剔除 `时间列 == '合计'`。
- **换源标准动作**：新表 append 到 `SRCS` → `build_all.py` → `verify_data.py`（周+月，须 `ALL CHECKS PASSED`）→ `test_dashboard.js`（须 `RUNTIME OK`）→ `cp` 同步 `index.html` → `git push` → 备份。
  `verify_data.py` 源表路径与合并规则自动从 build_data*.py 解析；校验 ①(周期,站点) 单元对账 ②维度分组守恒 ③行数+listing 回填覆盖率 ④周期元信息（周：周日/晚6天/周号；月：月初~月末/iso）⑤站点集合。
- **数据契约**：`data_all.json = {builtAt, modes:[{…, key:'week'}, {…, key:'month'}], elimSkus}`，每个 mode 与单期数据字段一致。
  加新粒度只需新写 `build_data_*.py` + `merge_data.py` 的 `MODES` 加一行，**模板零改动**；`MODES` 第一条为默认粒度。
- **模板粒度无关**：`const DB=__DATA__` + `let D`；`loadMode(key)` 整体替换 `D/DEOF/REC/NREC/U/UNAME/TWIN`；`switchMode` = loadMode + 重渲染 + 回顶。
  `unit`/`unitName`/`trendWin`（周 4、月 6）驱动全部文案；时间轴统一 `periods`（`{date,end,label,iso,short}`），`state.pidx` 为当前周期下标。
  ⚠️ **切粒度必须重置** `pidx/site/drill/hide/hideAux/top`（否则越界/下钻空集）；**保留** `colW`、`hideCols`。
- **回归测试 `build/test_dashboard.js`**（Node 直跑，无依赖 DOM 桩，改模板必跑，须 `RUNTIME OK`）。注意 `D` 与 `DB.modes[0]` 是同一对象，往 `D.periods` 追加模拟周期后必须还原 `length`；模板字符串里的 `\n` 要写 `\\n`。
  **「标签重叠」用例 = 柱值标签相撞自动化守门**：调 pure function `trendSVG`，解析 `.bar-lbl` 的 x/y，判据 `|Δy|<12 且横向区间相交`（Arial 近似字宽×10.5px）；覆盖 站点并排(420/517/700)+单站点满宽(1074/1400)+弹窗(700/794)×2 站点共 13 场景，周报与月报各跑一遍（先当前粒度，再 `switchMode` 后切回），须重叠 0。
- **备份**：`备份/YYYY-MM-DD_HHmm/` + 同名 zip，不覆盖历史快照。内容 = 交付 HTML + `build/` 全量 + `.workbuddy/memory/*.md`。
  ⚠️ 环境里**没有 `zip` 命令**，用 Python `zipfile` 打包，且 **arcname 必须相对「快照目录」**（zip 根就是快照内容，不套 `时间戳/` 一层）+ 反斜杠换正斜杠 —— 否则 `verify_backup.py` 解压比对会全部「不一致」。
  校验 `build/verify_backup.py [时间戳]`（不传参取最新）：zip 完整性 + 解压↔快照 md5 + 显式清单↔工作区 + 快照↔工作区**双向**全量扫描（`_composed_err.js` 在忽略名单）。两方向都 OK 才算过。
- ⚠️ **Python 环境**：默认 `python` 是 WorkBuddy 自带 3.13，**可能缺 numpy/pandas**（`ModuleNotFoundError: numpy`）→ `python -m pip install numpy pandas` 即可恢复。
  ⚠️ **pandas 3.x 起 `astype(str)` 不再把 NaN 转成 `'nan'`（NaN 保留为 float）** → `sorted(unique())` 会因 float/str 混排报 `TypeError`。构建里对维度列改用 `fillna(...)` 后再 `astype(str)`；无 SKU 的空行统一剔除（`build_data*.py` 与 `verify_data.py` 用同一规则，否则行数对账差 1）。

## 口径（用户明确给定，勿擅改）
- 达成率：M版 = 订单销量 ÷ 预测(最新版)；M-1版 ÷ 预测(M-1)；加权 ÷ 预测(加权)；M版断货清洗达成率 = 断货清洗(最新版) ÷ 预测(最新版)；加权断货清洗达成率 = 断货清洗 ÷ 预测(加权)。
- 缺口 = 预测 − 实际：M版订单预测缺口 = 预测(最新版) − 订单销量；M版断货清洗缺口 = 预测(最新版) − 断货清洗(最新版)；加权断货清洗缺口 = 预测(加权) − 断货清洗。
- 加权 70%-130%：在 **SKU 行粒度**判该 SKU 加权达成率 ∈ [0.7,1.3]，命中则计入其预测(加权)；**占比分母是「本项自身」的预测**（随行变化，非整体）。
- **站点顺序固定 墨西哥站(MX) → 巴西站(BR)**：`build_data.py` 排序键写死 mx 优先；卡片/chips/趋势/明细表全部跟随 `D.sites`（明细表**不要**再按名称排序）。加站点改排序键。
- 维度：站点 / 业务组 / BU / 产品组 / 负责人 / 三级分类 / 国家Listing / SKU（SKU = 「最早SKU|预测SKU」，显示拆两列）。
- **维度口径以最新源为准**：`LATEST_ATTR_SRC`（最新周表+月表）按 `最早SKU` 建映射，覆盖**所有周期**的三级分类/产品组/业务负责人；同 SKU 多取值取出现次数最多者。人员归属会随时间变更，历史行沿用旧值会把同一个人拆成两行。`apply_latest_attrs()` 已同时加在周报与月报脚本，`main()` 开头调用。
- **业务组 ↔ BU 一致性（`apply_bu_group`）**：按 `LATEST_ATTR_SRC` 建 `BU → 业务组` 唯一映射，**只纠正「该周期该 BU 偏离行 ≤1%」的脏行**。
  起因：2026-10 源表里 墨西哥站 `JKA011A01`（BU=装饰&桌椅BU、产品组=装饰化妆产品组、订单 1 件、预测空）被写成 `业务组=拉美收纳宠户组`，看板「业务组」板块就凭空多出一个不属于它的 BU；同一脏行在 10-25 周表也存在。
  ⚠️ **不能整体覆盖**：2026-07/08 的源表里 衣物收纳BU/户外休闲BU 有 6~9% 的行归家具桌椅组、家具BU 有 9% 归收纳组；2026-08/09 周表里 `床具产品组(王雅馨)` 约 3% 归收纳组 —— 这些是当时的组织分工，不是脏行，覆盖会改写历史口径。故阈值设 1%，超阈值的原样保留并打印「疑似历史分工差异」。
  检查口径：同一 (周期, BU) 是否出现两个业务组；9/20 起为 100% 干净，7~9 月中仍为历史双归属。
- **listing 回填**：按 **(国家, 最早SKU) 双键**（同 SKU 在巴西/墨西哥编码不同）查 `E:/不重要文件/国家listing对应表.xlsx`；**只补空值，源表已有值一律不动**（源值是同族合并编码，如 `LTB050`、`BRPCT161`，与对应表单 SKU 编码不同也以源表为准）；对应表给「淘汰」等状态词原样显示；补不上才归「（未标注）」。当前周 2 行、月 3 行未标注。
- **周期数可少至 2**：`trendPeriods()` 的 `end-start<1` 分支自动兜底画 2 点、文案变「· 近 2 周」，不需改模板。
- 源表缺维度列时的回填只是临时兜底，换回源表口径后必须逐行 diff（实测 (19) 回填导致 业务负责人错 980 行、业务组错 198 行 —— 数值列 0 差异，即偏差出在维度）。

## 视觉与交互约定
- **红绿语义全页唯一**：红 = 达成/超出预测；绿 = 未达成/落后（缺口为正用绿）。
- 达成率色阶五档：≥110% 实心深红+白字、100~110% 浅底红、90~100% 浅底橙、80~90% 浅底绿、<80% 实心绿+白字；图例在**每个板块底部各一份**。
- `fmtGap(v)`：**实际超出预测 → `+`，实际不足 → `-`**（符号与算式值相反）；颜色仍按算式（正=绿、负=红）。右下角说明「绿色＝实际少于预测（-）　红色＝实际超出预测（+）」。环比等变化量保留原 `+`/`-`。
- 表格 `table-layout:fixed` + `<colgroup>` 固定列宽；表头与数值居中（名称列左对齐、序号居中）。
- 🔴 **表头文字是用户给定原文，一个字都不许改**（不重排、不加 `<br>`、不缩写）。放不下**只能加宽列**。
  实测占宽：mRate 78 / m1Rate 89 / wRate 78 / mOosRate 129 / wOosRate 129 / f4 129 / f3 120 / f1 119 / a 78 / f5 175 / mGap 119 / mOosGap 119 / wOosGap 119 / f1q 165 / bandShare 88。
  `COLW = [38,150,132×5,140×4,178,122×3,168,132]`（表宽 2252px）；改表头文字后必须重量并同步 COLW。
- **表头点击排序**：15 个指标列可点，一下降序、再点升序，默认订单销量降序；`state.sort[表key]={k,dir}` 每表独立记忆（含站点表 `'_site'`）；取值挂 `COL_DEF` 的 `v:o=>…`；指示器 `<i class="sk">` 固定 11px 宽；**点击须排除 `.rz`（列宽手柄）与 `.fbtn`（筛选按钮）**；切粒度重置。
- 附属列由 `AUX_DEFS` 声明：国家Listing 表 = 三级分类（取该 listing 订单销量最大的分类，多分类标 `+N`）；SKU 表 = 三级分类 + 国家Listing（`#`/三级分类/国家Listing/最早SKU/预测SKU 五列固定）。每列带自己的表头筛选（键 `维度@列名`，状态 `state.hideAux`），只影响本表，多列取交集。
- 所有宽表列宽可拖（表头右边界 9px 手柄，双击复位），存 `state.colW[维度]`；固定列偏移由 `--lka/--lk1/--lk2` 推导。
- 交互克制：**不挂排序下拉框、不挂板块内搜索框、不挂表底说明小字**；检索统一走表头筛选面板（搜索+勾选+全选/清空/重置/应用）；排序入口只有点表头。
- 高基数维度（项数 > 20）**不画订单销量占比构成条**（`COMP_MAX=20`）：三级分类/国家Listing/SKU 一律不画。
- 每张宽表右上方「自定义列」按钮（面板底部：全选/清空/默认/**应用全局**/完成）。「应用全局」把当前勾选写入 `['_site',...DIM_KEYS]` 全部 `ctxKey` 的 `state.hideCols`（用户要求，按钮文字两个字一行）。
- **趋势图**：默认近 `trendWin` 个周期，折线指标可切换（5 项），**柱状随指标联动**（折线 = 柱1÷柱2）。两根柱都标数值（柱1 `#2f5bd7`、柱2 `#8593aa`）；窄面板下强制上下错开 ≥14px；标签顶部夹取 `PT-6`（不是 `PT+9`，否则高值标签顶格重合）。
- **达成率 / 预测量占比数字可点 → 弹窗看该项自身趋势**（`#tpop`，与站点图同一套柱+折线）：5 个达成率列 + 2 个占比列渲染 `<td class="rc rt" data-rt="口径键">`（`rowHTML` 的 `clkRate`，`clkRate = tblKey && tblKey!=='_site'` —— 站点明细表不参与）。
  口径在 `RATE_TREND`（柱1=分子、柱2=分母、折线=比值，必须自洽），含 `bandShare`(f1q/f1)、`bandShare4`(f4q/f4)。
  **弹窗内不提供口径切换**（点哪个显示哪个），头部只放只读 `.tp-metric` 标签；关闭三通道 ✕/遮罩/Esc；`renderAll()` 末尾刷新弹窗；点数字要 `stopPropagation()` 避免触发整行下钻。
  **不要再给维度板块加常驻趋势图**（做过一版多折线，被否掉）。
- 趋势图宽度按面板实宽自适应：单站点时面板占满整行（`.trend-grid.one{grid-template-columns:1fr}`），SVG 宽 = 面板宽−26，满宽柱体 44px、画布高 300；窗口缩放 >60px 自动重绘。
- 左侧目录导航：8 维度 + 站点，scroll spy 高亮，跳转 = 平滑滚动 + 原生锚点兜底。尺寸（用户嫌小后调大，别改小）：列宽 **206px**、项字号 **14px**、序号 12px、标题行 12px、项内边距 `10px 12px`、卡片内边距 `15px 12px 12px`；选中态左指示条 4px、`left:-12px`（= 卡片 padding-left，改内边距须同步）；窄屏 <1180px 隐藏。
- **站点 KPI 行固定 7 列恒定一行**（`repeat(7,minmax(0,1fr))`，不要 auto-fit 否则 6+1 换行）；≤1000px 才退回 auto-fit。
- **选中单站点时隐藏「各站点表现」标题 + 站点卡片**（与上方 KPI 重复）；「全部站点」时显示。站点明细表保留。
- **站点明细表不打「已下钻」标记**（`wideTable` 的 `onName` 固定传 `null`），该标记只给维度板块。
- 缺口 TOP3 洞察区 `.insights` **固定 4 列**（`repeat(4,minmax(0,1fr))`，900px→2 列，560px→1 列）。
- **巴西淘汰筛选**：`data_all.json.elimSkus`（约 397 个最早SKU）→ `loadMode` 里按 `D.dims['SKU'][i].split('|')[0]` 命中 → `let ELIM_SET`（SKU 维度下标集合）→ `recsFor` 按 `state.elim` 过滤。**仅巴西站显示** `全量/正常/淘汰` 三个 chip（标签行 `SKU状态`）；离开巴西站时 `state.elim='ALL'`（不加 renderAll，避免死循环）。
- **导出 CSV 必须遵循自定义列**：`exportTableCSV` 读 `table.getAttribute('data-hide')` 过滤，⚠️ 不能用 `hideColsSet(tblKey)`（前者含 SKU 表默认排除列）。
- 颜色惯例：涨/达成红、跌/未达成绿（国内习惯）；货币 ¥。

## 发布（GitHub 仓库 + Pages）
- 📦 <https://github.com/c89135028-ux/sales-forecast-dashboard>（**public**）
- 🌐 <https://c89135028-ux.github.io/sales-forecast-dashboard/>（Pages，source = `main` / `/`）
- **入口页必须是仓库根目录 `index.html`**，与 `销售预测达成看板.html` **逐字节一致**（md5 相同）；中文名文件保留供本地双击。**每次更新两个文件都要 cp 同步**。
- ⚠️ GitHub 不支持中文仓库名 → 用英文 `sales-forecast-dashboard`，中文标题写进 description。
- ⚠️ Free 计划私有仓库无法启用 Pages（422）→ 先 `PATCH {"private": false}` 转公开。
- 建 Pages（无 `gh` CLI）：`TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')` 后 `curl -X POST .../pages -d '{"source":{"branch":"main","path":"/"}}'` → 201。
- ⚠️ 沙箱里 `git push` / `curl -X POST` 可能被 SIGTERM 中断（exit 1 无输出）→ 重试通常可过；先 `git log` / `git ls-remote` 确认。push 用 `git push "https://USER:$TOKEN@github.com/USER/REPO.git" main`，别用裸 `git push origin main`。
- ⚠️ `git credential fill` **不能放进 `bash -c` 子 shell**（token 变空 → 401），必须直接管道。
- `.gitignore`：`备份/`、`build/_composed_err.js`、`__pycache__/`、`dist/`。线上比本地少约 1.6KB = CRLF→LF，内容无损。

## 复用
- 同类「Excel → 多维度看板」需求可复用技能 `~/.workbuddy/skills/dimension-kpi-dashboard/`（SKILL.md 含全部踩坑约定，assets/ 有模板与脚本）。
