# 项目约定：销售预测达成看板

## 产物 / 构建链
- 交付物 `销售预测达成看板.html`（数据内联、零依赖离线）。周+月同文件，靠「粒度」芯片 [周][月] 切（不拆两个文件）。
- 🔴 **滚动窗口：新数据只追加，绝不整批替换历史**（用户「是滚动你懂吗…不是覆盖」）。新表 append 到 `SRCS` 末尾；只有明说「只要最新」才替换；**歧义要问**。源表是历史唯一来源（`data.json` 是聚合结果不能反解）。
- `build/build_all.py` 一键 5 步：`build_data.py`(周) → `build_data_month.py`(月) → `build_inventory.py`(库存) → `merge_data.py`(→data_all.json) → `build_html.py`。单粒度排查 `build_html.py <data.json> <out.html>`。
- **多源合并**：`SRCS` 纵向拼接，同「周期」以靠后源为准（整期替换）：先算每期归属源 `owner` 再整期取，⚠️ 禁用 `drop_duplicates(subset=[时间列])`。周 `TIME_COL='周首日'`、月 `'年月'`。加源前比型（列集合+顺序）。
- **当前源**：周 = (21)(24)(34)(36)(38)+`C:/Users/Thinkpad/Downloads/日明细数据 (1)`+`E:/ziel浏览器下载/日明细数据 (1)`+`(7)` → 12 周 8/23~11/14（26,865 行）；月 = (20)(25)(28)(32)(35)(39)+`.../日明细数据`+`...(2)`+`...(6)` → 5 月 7~11（11,391 行）。`LATEST_ATTR_SRC` 跟最新周表+月表（现 (6)+(7)），换源时两个 build_data*.py 同步改。⚠️ 源表末行「合计」会翻倍总量，先剔除 `时间列=='合计'`。
- **换源标准动作**：append `SRCS` → `build_all.py` → `verify_data.py`（ALL CHECKS PASSED，含 [2.6] 五项基础信息 vs 最新表逐行核对）→ `test_dashboard.js`（RUNTIME OK）→ `cp` index.html → 备份 →（同意后）push。
- **数据契约**：`data_all.json={builtAt,modes:[{…,key:'week'},{…,key:'month'}],elimSkus,inv}`（`inv={src,tag,asOf,cat,catBu,listing}`，值 `[库存,7DMS,天数]`，天数可 `"∞"`）。加粒度 = 新 `build_data_*.py` + `MODES` 加一行，模板零改动；`MODES[0]` 默认。
- **模板粒度无关**：`const DB=__DATA__`+`let D`；`loadMode(key)` 换 `D/DEOF/REC/NREC/U/UNAME/TWIN`；`switchMode`=loadMode+重渲染+回顶；`unit/unitName/trendWin`(周4/月6) 驱动文案。⚠️ 切粒度重置 `pidx/site/drill/drillBu/hide/hideAux/top/q4more/sort`，保留 `colW/hideCols`。
- **回归 `build/test_dashboard.js`**（Node + 自建 DOM 桩，改模板必跑）：`D` 与 `DB.modes[0]` 同对象，追加模拟周期后还原 `length`；模板串里 `\n` 写 `\\n`；断言只用字符串拼接；`rows()` 同时解析 `data-name`/`data-bu`。
  「标签重叠」= 柱值守门：调 pure `trendSVG`，解析 `.bar-lbl` x/y，判据 `|Δy|<12 且横向区间相交`（Arial×10.5px），13 场景×周/月须 0。
  ⚠️ **避让顺序不能反**：①初值 → ②两柱互查错开 14px → ③最后避让折线（上方优先，贴顶翻下方阶梯）。先避让折线时互查会把标签推回折线旁（实测差 2px 仍压字）。
- **备份** `备份/YYYY-MM-DD_HHmm/` + 同名 zip（内容 = 交付 HTML + `index.html` + `build/` + `.workbuddy/memory/*.md`）。⚠️ 无 `zip` 命令 → Python `zipfile`，**arcname 相对快照目录** + 反斜杠换正斜杠，否则 verify 全「不一致」。校验 `build/verify_backup.py [时间戳]` 双向全量（`_composed_err.js` 忽略），两向 OK 才过。
- ⚠️ `python` 可能缺库 → `pip install numpy pandas openpyxl`。pandas 3.x `astype(str)` 不再把 NaN 变 `'nan'` → 先 `fillna('')` 再 `astype(str)`；无 SKU 空行构建与 verify 同规则剔除。

## 口径（用户给定，勿改）
- 达成率：M版=a/f4、M-1=a/f3、加权=a/f1、M版断货清洗=f5/f4、加权断货清洗=f2/f1。
- 缺口=预测−实际：M版订单=f4−a、M版断货清洗=f4−f5、**加权订单=f1−a**、加权断货清洗=f1−f2。
- 加权 70%-130%：**SKU 行粒度**判加权达成率 ∈[0.7,1.3]，命中计入其 f1；**占比分母=本项自身预测**。
- **站点顺序固定 墨西哥(MX)→巴西(BR)**：`build_data.py` 排序键写死；卡片/chips/趋势/明细表全跟 `D.sites`。
- 维度：站点/业务组/BU/产品组/负责人/三级分类/国家Listing/SKU（SKU=`最早SKU|预测SKU`，显示拆两列）。
- 🔴 **五项基础信息以源表为准**（用户 11-17，原话「表里给你写的 SKU 属于谁就是谁的」「两个站点是分开算负责人的，不要合一起」）：`BU`/`三级分类`/`产品组`/`业务组`/`业务负责人` 全部按表，不取众数、不推断、不跨站点借值。
  `LATEST_ATTR_SRC`（最新周表+月表）建映射覆盖**全周期**，键必须是 **(最早SKU, 预测站点)** —— 实测 32 个 SKU 的负责人按站点不同（BR=蓝晓琳 / MX=吴珍妮），只按 SKU 会把两人合成一个。
  站点级查不到时退回 SKU 级兜底，**但只对「全站点同值」的 SKU 生效**（否则等于又合并两站点，宁保留源表原值）。`apply_latest_attrs()` 在 `main()` 开头。
  **停产 SKU**（最新表里已无此 SKU）由 `unify_attr_history()` 用它**最后一次出现周期的归属**统一全部历史，保证「一个 SKU（同站点）只有一个归属」；周改写 8+27 行、月 4+35 行。
- **业务组 ↔ BU**：用户 11-17 明确「表里写的为准」→ `apply_bu_group()` 降级为**只补空值**，不再按 `BU_GROUP` 覆盖源表已有业务组。`BU_GROUP`（衣物收纳/宠物用品/户外休闲BU→收纳宠户组；厨卫&寝具/家具/装饰&桌椅BU→家具桌椅组）仅当源表该格为空时兜底。
  后果：历史期个别 BU 会同时出现在两个业务组（周 379 行 / 月 195 行，如 8 月「床」归收纳组），这是**照表保留**，不是 bug。
- **listing 回填**：按 **(国家, 最早SKU) 双键** 查 `E:/不重要文件/国家listing对应表.xlsx`；**只补空值**（源表合并编码与对应表不同也以源表为准）；状态词原样；补不上归「（未标注）」。
- 周期数可少至 2：`trendPeriods()` 有 `end-start<1` 兜底（画 2 点、「· 近 2 周」）。
- 源表缺列的回填只是兜底；换回源表口径要逐行 diff（实测 (19) 回填致负责人错 980 行、业务组错 198 行，数值列 0 差）。

## 视觉 / 交互
- **红绿语义全页唯一**：红=达成/超出；绿=未达成/落后。货币 ¥。达成率五档：≥110 实心深红白字、100~110 浅红、90~100 浅橙、80~90 浅绿、<80 实心绿白字；图例每板块底部一份。
- `fmtGap(v)`：**实际超出→`+`、不足→`-`**（与算式值反）；颜色按算式（正绿/负红）。环比等变化量保留原符号。
- 表格 `table-layout:fixed`+`<colgroup>`；表头与数值居中（名称左对齐、序号居中）。
- 🔴 **表头文字是用户原文，一字不许改**（不重排/不加 `<br>`/不缩写），放不下**只加宽列**；`COLW` 与模板注释里的实测占宽必须同步重量。
- **表头排序**：15 指标列可点，一下降序再升序，默认订单销量降序；`state.sort[表key]={k,dir}` 每表独立（含 `'_site'`）；取值挂 `COL_DEF.v`；指示器 `.sk` 11px；**排除 `.rz`/`.fbtn`**；切粒度重置。
- 附属列 `AUX_DEFS`：Listing=三级分类（取订单最大，多分类 `+N`）；SKU=三级分类+国家Listing（五列固定）。每列独立表头筛选（键 `维度@列名`，状态 `state.hideAux`），只影响本表、多列取交集。宽表列宽可拖（表头右 9px 手柄，双击复位），存 `state.colW[维度]`；固定列偏移由 `--lka/--lk1/--lk2` 推导。
- 交互克制：无排序下拉、无板块内搜索框、无表底说明；检索只走表头筛选面板；排序只有点表头。
- **表头条件筛选**（每表右上「筛选」，顺序 `筛选|导出|自定义列`）：🔴 **点开是表头下面就地展开一行**（`thead tr.cfr`：运算符下拉 `>≥<≤=` + 数值输入，逐列），**再点一次收起并清空复原**，不是弹层（弹层版做过被否）。状态 `state.cf[维度|'_site']={列key:{op,v}}` + `state.cfOpen[表key]`，`loadMode` 都清。🔴 **op 与 v 分开存**：v 没填时存 `null`（不能删条件，否则重画把运算符重置回 `>`）；`cfCount` 只数 `v!=null`，`cfMatch` 跳过 `v==null`。比率列（`CF_PCT` 7 项）按百分数输入，placeholder `%`。`cfMatch` 在名称筛选之后过滤，非有限值（"—"/∞）有条件下不显示；输入 320ms 防抖 → 重画后**补回焦点和光标**（否则输一个字就掉焦点）；`清空条件` 在名称列。⚠️ 导出 `exportTableCSV` 必须跳过 `tr.cfr`，否则表头混进 `>`/`%`。⚠️ 全局 `svg{width:100%}` 会拉满按钮内图标 → `.cfbtn svg{9px;flex:0 0 auto}`+`nowrap`。⚠️ Node 桩 `#siteMatrix` 快照不随 renderSite 刷新，站点行数只认真实浏览器。
- **文本选择保护 `textSelecting()`**：拖选/Ctrl+A 不能触发行下钻。捕获阶段记 mousedown，位移≥5px 或选区非空置 `_selBusy`；4 个入口（维度 tr、站点明细 tr、`td.rt`、`.scard`）开头 `if(textSelecting()) return;`。⚠️ 别给 `thead th.sortable` 加 `user-select:none`；新增入口同步加，测试核对保护点数（当前 4）。
- 高基数（>20 项）不画订单占比构成条（`COMP_MAX=20`）：三级分类/Listing/SKU 不画。
- 每张宽表右上「自定义列」（全选/清空/默认/**应用全局**/完成）；「应用全局」写 `['_site',...DIM_KEYS]` 全部 `ctxKey` 的 `state.hideCols`。
- **趋势图**：默认近 `trendWin` 期，折线指标 5 项可切，**柱状随指标联动**（折线=柱1÷柱2）。两柱都标值；窄面板上下错开≥14px；标签顶部夹 `PT-6`。单站点 `.trend-grid.one{1fr}`，SVG 宽=面板宽−26、满宽柱 44px、高 300；缩放>60px 重绘。
- **达成率/占比可点 → `#tpop`**（同柱+折线）：5 达成率+2 占比渲染 `td.rc.rt`（`clkRate = tblKey && tblKey!=='_site'`）。口径 `RATE_TREND`（柱1分子/柱2分母/折线比值，须自洽）。弹窗不放口径切换，只放只读 `.tp-metric`；关闭 ✕/遮罩/Esc；点数字 `stopPropagation()`。
- 左侧目录：8 维度+站点，scroll spy；尺寸别改小（列 206px、项 14px、padding `10px 12px`、选中条 4px `left:-12px`）；<1180px 隐藏。
- 站点 KPI 固定 7 列一行（勿 auto-fit）；≤1000px 才退回。选单站点隐藏「各站点表现」标题+卡片；站点明细表保留且不打「已下钻」。缺口 TOP3 洞察 4 列（900→2、560→1）。
- **巴西淘汰筛选**：`elimSkus` → `loadMode` 按 `D.dims['SKU'][i].split('|')[0]` → `ELIM_SET` → `recsFor` 按 `state.elim`。**仅巴西站**显示 全量/正常/淘汰（标签 `SKU状态`）；离开巴西置 `'ALL'`（不加 renderAll 免死循环）。
- **导出 CSV 遵循自定义列**：`exportTableCSV` 读 `table.getAttribute('data-hide')`，⚠️ 不能用 `hideColsSet(tblKey)`。

## 🔴 三级分类按 BU 拆行（Q4 + 主看板，2026-11-17）
- 同名跨 BU（边桌/床头柜/斗柜/玄关桌/简易衣柜，本期 5 组）在 **Q4 与主看板维度表都拆两行**，各自算缺口/负责人/库存；其它维度不拆。
- Q4 `q4Rows` / 主看板 `groupByDim` 的聚合 key 都改 `分类下标\u0001BU下标`，行对象带 `bu`；Q4 拆后 `auxName`=自身 BU、`ownMore` 归零。主看板 `rowHTML` 输出 `data-bu` + 名称后 `.butag` 标签，**只有跨 BU 的分类才带**（`CROSS_CATS` 由 loadMode 预计算，用户 11-17：「不要每个都加上BU，只在跨BU的三级分类下标注」）；`renderInsights` 同理。
- **下钻必须带 BU**：`matchDrill` 查 `state.drillBu[k]`；行点击按 `(name,bu)` 判等写入/清除；`wideTable` 用 `state.drillBu[tblKey]` 判「已下钻」；面包屑显示「分类 · BU」；`loadMode`/`resetDrill`/切粒度都清 `drillBu`。
- **弹窗必须带 BU**（`openTrendPop(...,kind,bu)` 过滤），否则点拆分行显示两 BU 合并数。筛选面板名称去重（勾掉=隐藏该分类所有 BU 行）。
- 负责人 = 该项 **Σf1 最大的业务负责人**，跨多个时 +`<i class="q4auxn">+N</i>`。每行只 1 个负责人；「同一分类两个负责人」全是分类跨两 BU 造成，**没有最早SKU 同时挂两人**。

## Q4 冲销异常板块
- **清单 11 列**：上级维度(BU/三级分类) | 名称 | 负责人 | 加权预测 | 订单销量 | 加权缺口 | FBA总可销售展示库存 | 7DMS | 可售天数 | 近N期占比/达成 | 判定。`min-width:1140px`、空态 `colspan=11`。⚠️ `table.q4t th` 必须 `white-space:normal`；「近N期占比」列**至少 15%**（否则百分比粘连）；1280 视口横向滚动可接受。
- 判定三档：① `allLow && falling`（逐期不高于上期）② `allLow` ③ `halfLow`；按缺口降序，同值以加权预测、名称、BU 决胜。
- **集中度一句话**：分母 = `q4ScopeGap()`（当前筛选下本期全部记录 Σ(f1−a)），**四卡必须同数**；分子 = TOP N 的 curGap 之和，N 按维度（三级分类 `Q4_TOP`=10、Listing `Q4_TOP_DIM`=15），**表格默认行数 = 句中 N**；再给累计到 40% 的 `k40`。对账：墨西哥+收纳组 11.1~11.7 → 9,486.6 = 主看板业务组表同行。
- **库存三列**：源 `E:/ziel浏览器下载/MX&BR冲坑周跟进-W44.xlsx`，「5.三级分类」E 列（国家 A=MX）值取 BF-BH；「6.Listing」G 列（国家=MX）值取 BV-BX；**表头在第 4 行**。`build_inventory.py`→`inventory.json`→`data_all.json.inv`；模板 `INV`/`invScopeMx()`/`invOf()`/`invNum()`。
  ⚠️ 输出 `cat`（按名合计）与 `catBu`（按 `分类\u0001BU`）；Q4 拆行取 `catBu`，否则两行同数、加总翻倍。`cat` 里跨 BU 的库存与 7DMS **相加**、天数重算（天数不能相加）。
  🔴 **只有 MX 口径**：全站/墨西哥显示数值，**巴西三列全「—」**。天数可 **「∞」**。Listing sheet 357 行国家空、284 行 BR → **必须按国家=MX 过滤**。命中率 三分类 103/104、MX listing 608/634 →「—」，不做模糊匹配。
- **表头条件筛选（Q4 也有）**：卡片头 `.q4exp` 同款「筛选」→ `thead tr.cfr`，6 个数值列（加权预测/订单销量/加权缺口/FBA库存/7DMS/可售天数），key=`kind:维度`，`cfRenderTable` 见 `:` 转 `renderQ4()`；项数显示「命中 / 全量」；导出与列表跟随筛选，**顶部入口数字仍按全量**；可售天数 `∞` 按 Infinity 比较（用 `Number.isNaN` 判空，别用 isFinite）。⚠️ `cfCellHTML` 已自带 `<th>`，别再包一层（会多出 0 宽单元格、整行错位）。
- **每表可导出 CSV**：卡片头 `.q4exp` → `exportQ4CSV()` → 纯函数 `q4CSV()`（测试断言）。导出当前筛选**完整清单**；列 = 上级维度/名称/负责人/加权预测/订单销量/加权缺口/库存三列/每期一列/判定（`9+周期数+1`）；用屏幕格式（`fmtN`/`fmtGap`/`invNum`）；带 `\uFEFF` BOM。**不要再给维度板块加常驻趋势图**（做过被否）。
- **Q4 名称弹窗**走同一 `#tpop` 但形态是表（`renderQ4PopTable`）。行=`trendPeriods()`；**固定 10 列**：周期/M版达成/加权达成/销售预测（最新版）/（加权）/订单销量/M版订单预测缺口/加权订单预测缺口/加权版70%-130%的预测量/预测量占比（不含 M-1 与断货清洗）。⚠️ 列宽不写死（`table-layout:auto`+无 colgroup），但 `table.tp-tbl thead th` **必须显式 `white-space:normal`**+`text-wrap:balance`。占比只给数字不画条。
- **Q4 视图** `applyQ4View()`：hash 前缀 `q4`→进、空 hash→出、其它→维持现状。目录点击偏移读 `--nav-gap`，兜底 `window.scrollTo`（⚠️ 别改 hash，否则一次点击被踢回主看板）。

## 发布（GitHub + Pages）
- 📦 https://github.com/c89135028-ux/sales-forecast-dashboard （public）｜🌐 https://c89135028-ux.github.io/sales-forecast-dashboard/ （main /）
- 入口是根 `index.html`，与 `销售预测达成看板.html` **逐字节一致**，每次更新 cp 同步。中文仓库名不支持→英文名。Free 私有仓库不能开 Pages（422）→先 public。
- 建 Pages（无 gh CLI）：`TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')` 后 `curl -X POST .../pages -d '{"source":{"branch":"main","path":"/"}}'`。⚠️ 该管道不能进 `bash -c` 子 shell。
- ⚠️ 沙箱 `git push`/`curl` 可能被 SIGTERM（exit 1 无输出）→ 先 `git log`/`git ls-remote` 确认，**不盲目重试**。
- 根目录必须有 `.nojekyll`（空），否则 `Page build failed`。push 后 2~5 分钟生效，用 `?t=$(date +%s)` 绕缓存，比「本地去 CRLF == 线上」才算成功。
- `.gitignore`：`备份/`、`build/_composed_err.js`、`__pycache__/`、`dist/`、`.edgetmp*/`、`_*.png`、`_q4*.png`、`_shot*.png`、`_probe.html`。
- 无头 Edge 截图：`--screenshot` 要绝对 Windows 路径、`--user-data-dir` 每次唯一、配 `--virtual-time-budget`；滚动不可靠 → 把目标 section `insertBefore` 到父容器首位再截。
- 🔴 沙箱**拒绝删除**工作区里的 `.edgetmp*` 缓存目录（用户已明确拒绝过一次），只能靠 `.gitignore` 忽略，别再尝试删。

## 复用
- 同类「Excel→多维度看板」可复用 `~/.workbuddy/skills/dimension-kpi-dashboard/`（SKILL.md 含全部踩坑）。
