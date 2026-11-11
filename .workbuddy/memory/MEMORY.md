# 项目长期约定：销售预测达成看板

## 产物 / 构建链
- 单一交付物 `销售预测达成看板.html`（数据内联、零依赖、可离线）。周报+月报同文件，靠筛选栏最左「粒度」芯片 [周][月] 切换（用户要求不拆两个文件）。
- 🔴 **滚动窗口：新数据只追加，绝不整批替换历史**（用户 10-07 原话「是滚动你懂吗…不是覆盖」）。新表 append 到 `SRCS` 末尾；「紧邻延伸/子集」都按追加，只有明说「只要最新」才替换；**歧义要问**。
  ⚠️ 源表是历史唯一来源（`data.json` 是聚合结果不能反解），构建要读、不能让用户清理。
- `build/build_all.py` 一键 5 步：`build_data.py`(周→data.json) → `build_data_month.py`(月→data_month.json) → `build_inventory.py`(→inventory.json，库存三列) → `merge_data.py`(→data_all.json，注入 elimSkus/inv) → `build_html.py`(模板+数据→HTML)。单粒度排查：`build_html.py <data.json> <out.html>`。
- **多源合并**：`SRCS` 顺序纵向拼接，同一「周期」以靠后的源为准（整周期替换）。先算每期归属源 `owner` 再整期取 —— ⚠️ 禁用 `drop_duplicates(subset=[时间列])`（会每期只留一行）。周 `TIME_COL='周首日'`、月 `'年月'`。加源前先比型（列集合+顺序一致）。
- **当前源**：周 = (21)(24)(34)(36)(38)+`C:/Users/Thinkpad/Downloads/日明细数据 (1)`+`E:/ziel浏览器下载/日明细数据 (1)` → 11 周 8/23~11/01（24,566 行）；月 = (20)(25)(28)(32)(35)(39)+`.../日明细数据`+`.../日明细数据 (2)` → 5 月 7~11（11,345 行）。
- ⚠️ 源表末行「合计」会翻倍总量，先剔除 `时间列=='合计'`。
- **换源标准动作**：append `SRCS` → `build_all.py` → `verify_data.py`（须 ALL CHECKS PASSED）→ `test_dashboard.js`（须 RUNTIME OK）→ `cp` 同步 index.html → 备份 →（用户同意后）push。
  verify 自动从 build_data*.py 解析源路径与合并规则；校验 ①(周期,站点)单元对账 ②维度守恒 ③行数+listing 回填覆盖率 ④周期元信息 ⑤站点集合 ⑥[2.5] 每个 BU 唯一归属。
- **数据契约**：`data_all.json={builtAt,modes:[{…,key:'week'},{…,key:'month'}],elimSkus,inv}`（`inv={src,tag,asOf,cat,listing}`，值 = `[库存,7DMS,天数]`，天数可为 `"∞"`）。加粒度 = 新写 `build_data_*.py` + `MODES` 加一行，模板零改动；`MODES[0]` 为默认。
- **模板粒度无关**：`const DB=__DATA__`+`let D`；`loadMode(key)` 整体换 `D/DEOF/REC/NREC/U/UNAME/TWIN`；`switchMode`=loadMode+重渲染+回顶。`unit/unitName/trendWin`(周4/月6) 驱动文案；`state.pidx` 当前期。
  ⚠️ 切粒度必须重置 `pidx/site/drill/hide/hideAux/top`；保留 `colW`、`hideCols`。
- **回归 `build/test_dashboard.js`**（Node 直跑 + 自建 DOM 桩，改模板必跑）。`D` 与 `DB.modes[0]` 同一对象，追加模拟周期后必须还原 `length`；模板串里的 `\n` 写 `\\n`；断言只能用字符串拼接。
  「标签重叠」用例 = 柱值标签守门：调 pure `trendSVG`，解析 `.bar-lbl` 的 x/y，判据 `|Δy|<12 且横向区间相交`（Arial 字宽×10.5px）；13 场景 × 周/月，须 0。
- **备份** `备份/YYYY-MM-DD_HHmm/` + 同名 zip（不覆盖历史）。内容 = 交付 HTML + `build/` + `.workbuddy/memory/*.md`。
  ⚠️ 无 `zip` 命令，用 Python `zipfile`，**arcname 相对快照目录**（zip 根即内容，不套时间戳层）+ 反斜杠换正斜杠，否则 verify 全「不一致」。
  校验 `build/verify_backup.py [时间戳]`：zip 完整性 + 解压↔快照 md5 + 清单↔工作区 + 双向全量扫描（`_composed_err.js` 忽略）。两向 OK 才过。
- ⚠️ 默认 `python` 是 WorkBuddy 3.13，可能缺 numpy/pandas → `python -m pip install numpy pandas`。
  ⚠️ pandas 3.x `astype(str)` 不再把 NaN 变 `'nan'`（留 float）→ `sorted(unique())` 报 TypeError。维度列先 `fillna('')` 再 `astype(str)`；无 SKU 空行统一剔除（构建与 verify 同规则，否则差 1 行）。

## 口径（用户给定，勿改）
- 达成率：M版=a/f4，M-1=a/f3，加权=a/f1，M版断货清洗=f5/f4，加权断货清洗=f2/f1。
- 缺口=预测−实际：M版订单=f4−a，M版断货清洗=f4−f5，**加权订单=f1−a**（11-10 新增，排在加权断货清洗前），加权断货清洗=f1−f2。
- 加权 70%-130%：在 **SKU 行粒度**判加权达成率 ∈[0.7,1.3]，命中计入其 f1；**占比分母 = 本项自身预测**。
- **站点顺序固定 墨西哥(MX) → 巴西(BR)**：`build_data.py` 排序键写死 mx 优先；卡片/chips/趋势/明细表全跟 `D.sites`（明细表别再按名排序）。
- 维度：站点/业务组/BU/产品组/负责人/三级分类/国家Listing/SKU（SKU=`最早SKU|预测SKU`，显示拆两列）。
- **维度口径以最新源为准**：`LATEST_ATTR_SRC`（最新周表+月表）按 `最早SKU` 建映射，覆盖所有周期的三级分类/产品组/业务负责人；同 SKU 多值取众数。人员归属会变，沿用旧值会把同一人拆两行。`apply_latest_attrs()` 在 `main()` 开头调用。
- **业务组↔BU = 用户固定表**：`BU_GROUP`（`build_data*.py` 顶部）衣物收纳/宠物用品/户外休闲BU→拉美收纳宠户组；厨卫&寝具/家具/装饰&桌椅BU→拉美家具桌椅组。`apply_bu_group()` 覆盖全部周期；新 BU 只需加一行；未登记原样保留并打提示。历史上 6~9% 串组，现统一。
- **listing 回填**：按 **(国家, 最早SKU) 双键** 查 `E:/不重要文件/国家listing对应表.xlsx`；**只补空值，源表已有值不动**（源值是同族合并编码如 LTB050/BRPCT161，与对应表编码不同也以源表为准）；状态词（淘汰）原样显示；补不上归「（未标注）」（当前周 2 行、月 3 行）。
- 周期数可少至 2：`trendPeriods()` 有 `end-start<1` 兜底（画 2 点、文案「· 近 2 周」）。
- 源表缺维度列的回填只是临时兜底；换回源表口径后必须逐行 diff（实测 (19) 回填致 负责人错 980 行、业务组错 198 行，数值列 0 差）。

## 视觉 / 交互
- **红绿语义全页唯一**：红=达成/超出；绿=未达成/落后。货币 ¥。
- 达成率五档：≥110% 实心深红白字、100~110% 浅底红、90~100% 浅底橙、80~90% 浅底绿、<80% 实心绿白字；图例每板块底部各一份。
- `fmtGap(v)`：**实际超出→`+`，不足→`-`**（与算式值相反）；颜色按算式（正=绿/负=红）。右下角「绿色＝实际少于预测（-）　红色＝实际超出预测（+）」。环比等变化量保留原符号。
- 表格 `table-layout:fixed`+`<colgroup>`；表头与数值居中（名称左对齐、序号居中）。
- 🔴 **表头文字是用户原文，一个字不许改**（不重排/不加 `<br>`/不缩写），放不下**只加宽列**。
  实测占宽：mRate78/m1Rate89/wRate78/mOosRate129/wOosRate129/f4129/f3120/f1119/a78/f5175/mGap119/mOosGap119/wGap119/wOosGap119/f1q165/bandShare88。
  `COLW=[38,150,132×5,140×4,178,122×4,168,132,172,132]`（表宽 2374px）；改表头必重量并同步。
- **表头排序**：15 指标列可点，一下降序再升序，默认订单销量降序；`state.sort[表key]={k,dir}` 每表独立（含 `'_site'`）；取值挂 `COL_DEF.v`；指示器 `.sk` 固定 11px；**排除 `.rz`/`.fbtn`**；切粒度重置。
- 附属列 `AUX_DEFS`：Listing 表=三级分类（取订单最大分类，多分类 `+N`）；SKU 表=三级分类+国家Listing（`#`/三级分类/国家Listing/最早SKU/预测SKU 五列固定）。每列独立表头筛选（键 `维度@列名`，状态 `state.hideAux`），只影响本表、多列取交集。
- 宽表列宽可拖（表头右 9px 手柄，双击复位），存 `state.colW[维度]`；固定列偏移由 `--lka/--lk1/--lk2` 推导。
- 交互克制：不挂排序下拉、不挂板块内搜索框、不挂表底说明；检索只走表头筛选面板（搜索+勾选+全选/清空/重置/应用）；排序只有点表头。
- **文本选择保护 `textSelecting()`**：拖选/Ctrl+A 不能触发行下钻（用户 11-10 要求）。捕获阶段记 mousedown，mouseup 位移≥5px 或选区非空置 `_selBusy`；4 个入口（维度 tr、站点明细 tr、`td.rt`、`.scard`）开头 `if(textSelecting()) return;`。⚠️ 别给 `thead th.sortable` 加 `user-select:none`；新增入口要同步加，测试核对保护点数量（当前 4）。
- 高基数（>20 项）不画订单占比构成条（`COMP_MAX=20`）：三级分类/Listing/SKU 不画。
- 每张宽表右上「自定义列」（底部 全选/清空/默认/**应用全局**/完成）；「应用全局」写入 `['_site',...DIM_KEYS]` 全部 `ctxKey` 的 `state.hideCols`。
- **趋势图**：默认近 `trendWin` 期，折线指标 5 项可切，**柱状随指标联动**（折线=柱1÷柱2）。两柱都标值（柱1 `#2f5bd7`、柱2 `#8593aa`）；窄面板强制上下错开≥14px；标签顶部夹 `PT-6`。单站点 `.trend-grid.one{1fr}`，SVG 宽=面板宽−26、满宽柱 44px、高 300；缩放>60px 重绘。
- **达成率/占比数字可点 → `#tpop` 弹窗**（同柱+折线）：5 达成率 + 2 占比列渲染 `td.rc.rt`（`clkRate = tblKey && tblKey!=='_site'`，站点明细表不参与）。口径 `RATE_TREND`（柱1分子/柱2分母/折线比值，须自洽），含 bandShare(f1q/f1)、bandShare4(f4q/f4)。弹窗内不提供口径切换，只放只读 `.tp-metric`；关闭 ✕/遮罩/Esc；`renderAll()` 末尾刷新；点数字 `stopPropagation()`。
- **Q4 名称弹窗走同一 `#tpop` 但形态是表**（`openTrendPop(dim,name,'wRate','table')`→`renderQ4PopTable()`；用户 11-11 纠正「弹窗出表头像这样的预测达成」）。行=`trendPeriods()`；**固定 10 列**：周期/M版达成/加权达成/销售预测（最新版）/销售预测（加权）/订单销量/M版订单预测缺口/加权订单预测缺口/加权版70%-130%的预测量/预测量占比（不含 M-1 与断货清洗，别再自行加回）。缺口用 `fmtGap`+`gapup/gapdown`。
  ⚠️ 列宽**不写死**：`table-layout:auto`+`width:100%`+无 colgroup；但 `table.tp-tbl thead th` **必须显式 `white-space:normal`**（全局 `thead th` 是 nowrap，否则撑到 max-content 溢出）+`text-wrap:balance`。占比只给数字不画条。
- **Q4 集中度一句话**：分母 = **`q4ScopeGap()`**（当前筛选 粒度/时间/站点/业务组 下本期**全部记录**的 Σ(f1−a)），**四卡必须同数**（用户 11-11 纠正：不能各表算各的异常项之和）。分子 = TOP N 的 curGap 之和，**N 按维度**：三级分类 `Q4_TOP`=10、Listing `Q4_TOP_DIM`=15（`q4TopN`）；**表格默认行数 = 句中的 N**。再给累计到 40% 的 `k40`（未达则「全部计入仍未到 40%」）。
  文案：「本表 TOP10 加权缺口合计 X 件，占本期当前筛选总加权缺口 Y 件（全部项合计，实际少于预测）的 P%；按缺口从大到小累计，到 TOP k 项即占 40%。」
  对账：墨西哥+收纳组 11.1~11.7 → 9,486.6，主看板业务组表同行 `-9,486.6`。
- **Q4 四张清单结构（11 列）**：上级维度(BU/三级分类) | 名称 | **负责人** | 加权预测 | 订单销量 | 加权缺口 | **FBA总可销售展示库存 | 7DMS | 可售天数** | 近N期占比/达成 | 判定。colgroup `8/13/7/7/7/7/11/5.5/6.5/15/13`、`min-width:1140px`、空态 `colspan=11`。
  ⚠️ `table.q4t th` 必须 `white-space:normal`（新表头 10 字，fixed 布局下 nowrap 会撑破）；「近N期占比」列**至少 15%**，否则 4 个百分比粘连成 `10.1%9.7%9.0%6.0%`。1280 视口会横向滚动（可接受），1600 完整。
  负责人 = 该项下 **Σf1 最大的业务负责人**，跨多个时名字 + `<i class="q4auxn">+N</i>`（title 说明）；`td.q4own` 左对齐 12px 省略号。
  判定三档：① `allLow && falling`（逐期不高于上期）② `allLow` ③ `halfLow`；按缺口降序，同值以加权预测、名称决胜。
- **Q4 库存三列（FBA总可销售展示库存 / 7DMS / 可售天数）**：数据源 `E:/ziel浏览器下载/MX&BR冲坑周跟进-W44.xlsx`，
  三级分类取「5.三级分类」E 列（国家 A 列=MX）、值取 BF-BH；国家Listing 取「6.Listing」G 列（国家=MX）、值取 BV-BX；**表头都在第 4 行**。
  `build_inventory.py` → `inventory.json` → `data_all.json.inv`；模板 `INV` / `invScopeMx()` / `invOf()` / `invNum()`。
  🔴 **只有 MX 口径**：全部站点/墨西哥站显示数值，**选巴西站三列全显示「—」**。
  ⚠️ 一个三级分类可能跨 BU 拆成多行（边桌/床头柜/斗柜/多场景置物架/玄关桌/简易衣柜）→ 库存与 7DMS **相加**、天数 = 库存÷7DMS **重算**（天数不能相加）；
  天数会出现字符串 **「∞」**（7DMS=0 但有库存）原样显示；Listing sheet 有 357 行国家为空、284 行 BR，**必须按国家=MX 过滤**。
  命中率：三级分类 103/104、MX listing 608/634（未命中多为合并编码 `KKI009/15` 与状态词）→ 显示「—」，不做模糊匹配。
- **Q4 每表可单独导出 CSV**：卡片头 `.q4exp`（`data-q4exp="kind:dim"`）→ `exportQ4CSV()` → 纯函数 `q4CSV()`（测试直接断言）。导出**当前筛选完整清单**（不受展开影响）；列 = 上级维度/名称/**负责人**/加权预测/订单销量/加权缺口/**库存三列**/每期一列/判定（共 `9+周期数+1`）；数值用屏幕格式（`fmtN`、`fmtGap`、`invNum`）与画面逐格对上；带 `\uFEFF` BOM。**不要再给维度板块加常驻趋势图**（做过被否）。
- **Q4 视图**：`applyQ4View()` 只认明确信号 —— hash 前缀 `q4`→进、空 hash→出、其它 hash→维持现状（`on=now`）。目录点击偏移读 `--nav-gap`，兜底用 `window.scrollTo`（⚠️ 别改 hash，否则一次点击被踢回主看板）。
- 左侧目录：8 维度+站点，scroll spy；尺寸别改小：列宽 206px、项 14px、序号 12px、标题 12px、项 padding `10px 12px`、卡片 `15px 12px 12px`、选中条 4px `left:-12px`（=卡片 padding-left，需同步）、<1180px 隐藏。
- 站点 KPI 固定 7 列一行（`repeat(7,minmax(0,1fr))`，别 auto-fit 否则 6+1）；≤1000px 才退回 auto-fit。
- 选单站点时隐藏「各站点表现」标题+卡片（与 KPI 重复），「全部站点」显示；站点明细表保留。站点明细表不打「已下钻」（`onName=null`）。
- 缺口 TOP3 洞察 `.insights` 固定 4 列（900px→2、560px→1）。
- **巴西淘汰筛选**：`elimSkus`(~397 最早SKU) → `loadMode` 按 `D.dims['SKU'][i].split('|')[0]` → `ELIM_SET` → `recsFor` 按 `state.elim`。**仅巴西站**显示 全量/正常/淘汰（标签 `SKU状态`）；离开巴西 `state.elim='ALL'`（不加 renderAll 避免死循环）。
- **导出 CSV 遵循自定义列**：`exportTableCSV` 读 `table.getAttribute('data-hide')`，⚠️ 不能用 `hideColsSet(tblKey)`。
- 颜色惯例：涨/达成红、跌/未达成绿。

## 发布（GitHub + Pages）
- 📦 https://github.com/c89135028-ux/sales-forecast-dashboard （public）
- 🌐 https://c89135028-ux.github.io/sales-forecast-dashboard/ （Pages，main /）
- 入口必须是根 `index.html`，与 `销售预测达成看板.html` **逐字节一致**；每次更新都要 cp 同步。
- 中文仓库名不支持 → 用英文名，标题写 description。Free 私有仓库不能开 Pages（422）→ 先转 public。
- 建 Pages（无 gh CLI）：`TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')` 后 `curl -X POST .../pages -d '{"source":{"branch":"main","path":"/"}}'`。
- ⚠️ 沙箱 `git push`/`curl -X POST` 可能被 SIGTERM（exit 1 无输出）→ 重试；先 `git log`/`git ls-remote` 确认。push 用 `git push "https://USER:$TOKEN@github.com/USER/REPO.git" main`。
- ⚠️ `git credential fill` 不能进 `bash -c` 子 shell（token 空→401），必须直接管道。
- `.gitignore`：`备份/`、`build/_composed_err.js`、`__pycache__/`、`dist/`。线上少约 1.6KB = CRLF→LF。
- ⚠️ 根目录必须有 `.nojekyll`（空文件）：Jekyll 曾连续 `Page build failed`，加上即 built。排查 `.../pages/builds?per_page=2` 看 status。
- ⚠️ push 后线上 2~5 分钟才更新；用 `?t=$(date +%s)` 绕缓存，比「本地去 CRLF == 线上」才算成功。

## 复用
- 同类「Excel→多维度看板」可复用 `~/.workbuddy/skills/dimension-kpi-dashboard/`（SKILL.md 含全部踩坑）。
