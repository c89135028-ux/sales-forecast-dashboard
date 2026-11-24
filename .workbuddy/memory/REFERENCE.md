# 技术细节参考：销售预测达成看板

> 按需查阅。硬规则见 `MEMORY.md`。

## 读 data.json 的 rec 结构
FLD = `w0 s1 g2 b3 p4 c5 o6 a7 f1_8 f2_9 f3_10 f4_11 f5_12 ids13 n0_14 rn15 f1q16 f4q17 l18 k19`
- w=周期、s=站点、g=业务组、b=BU、p=产品组、c=三级分类、o=业务负责人、a=订单销量
- f1=加权预测、f2=断货清洗预测、f3=M-1版、f4=最新版、f5=最新版断货清洗
- ids=预测SKU 编号**列表**（**不是维度**）、n0、rn、f1q、f4q、l=国家Listing
- 🔴 **k(`r[19]`)** = SKU 维度，形如 `最早SKU|预测SKU`。用 `r[13]` 会误判「历史行未覆盖」。

## 模板粒度无关设计
- `const DB=__DATA__`；`let D` 指向当前粒度；`loadMode(key)` 换 `D/DEOF/REC/NREC/U/UNAME/TWIN`（TWIN 周4/月6）。
- `switchMode` = loadMode + 重渲染 + 回顶。
- ⚠️ 切粒度重置 `pidx/site/drill/drillBu/hide/hideAux/top/q4more/sort`；保留 `colW/hideCols`。
- 周期数可少至 2：`trendPeriods()` 有 `end-start<1` 兜底（画 2 点、「· 近 2 周」）。

## 回归测试 build/test_dashboard.js
- Node + 自建 DOM 桩；`D` 与 `DB.modes[0]` 必须同对象；追加模拟周期后还原 `length`。
- 断言只用字符串拼接（避免模板串转义地狱）；`rows()` 同时解析 `data-name` 与 `data-bu`。
- 「标签重叠」柱值守门：调 pure `trendSVG`，判据 `|Δy|<12 且横向区间相交`（Arial×10.5px），13 场景×周/月须 0。
- ⚠️ **避让顺序不能反**：①初值 → ②两柱互查错开 14px → ③最后避让折线（上方优先，贴顶翻下方阶梯）。
- ⚠️ 模板串里 `\n` 写 `\\n`、正则写 `\\s`/`\\/`/`\\+`，否则 `Invalid regular expression flags` / `Nothing to repeat`。
- 用例清单（部分）：`负责人唯一`、`Q4清单勾选`、`标签重叠`。

## 视觉细节
- 达成率五档配色：≥110 实心深红白字、100~110 浅红、90~100 浅橙、80~90 浅绿、<80 实心绿白字；图例每板块底部一份。
- `fmtGap(v)`：**实际超出→`+`、不足→`-`**（与算式值反）；颜色按算式（正绿/负红）。
- 表格 `table-layout:fixed` + `<colgroup>`；表头与数值居中，名称左对齐。`COLW` 与模板注释实测占宽须同步。
- 表头排序：15 指标列可点，一下降序再升序，默认订单销量降序；`state.sort[表key]={k,dir}` 每表独立（含 `'_site'`）；取值挂 `COL_DEF.v`；`.sk` 11px；**排除 `.rz`/`.fbtn`**。
  ⚠️ 重画会丢横向滚动 → `bindSorts` 记 `.tscroll` 的 `scrollLeft`+`scrollY` 并还原。
- 附属列 `AUX_DEFS`：Listing=三级分类（取订单最大，多分类 `+N`）；SKU=三级分类+国家Listing（五列固定）。每列独立表头筛选（键 `维度@列名`，`state.hideAux`），只影响本表、多列取交集。列宽可拖（表头右 9px 手柄，双击复位），存 `state.colW[维度]`。
- 表头条件筛选补充：状态 `state.cf[维度|'_site']={列key:{op,v}}` + `state.cfOpen[表key]`，`loadMode` 清。比率列 `CF_PCT`（7 项）按百分数输入。⚠️ 全局 `svg{width:100%}` 会拉满图标 → `.cfbtn svg{9px}`。
- Q4 文字筛选补充：`Q4_CF_TXT={aux,name,own}`；`q4CfMatch`=数值∩关键字∩清单；`cfQ4Rows` 给清单候选值；弹层带搜索+全选/清空/重置/应用。⚠️ `cfCellHTML` 已自带 `<th>`，别再包一层。
  调试：临时加 `window.__dbgQ4(key)` 打印 `pickKeys/pickSizes/active/allN/kept`，**测完删掉还原**。
- 趋势图：默认近 `trendWin` 期，折线 5 指标可切，**柱状随指标联动**（折线=柱1÷柱2）。两柱都标值；窄面板上下错开≥14px；标签顶部夹 `PT-6`。单站点 `.trend-grid.one{1fr}`，SVG 宽=面板宽−26、满宽柱 44px、高 300；缩放>60px 重绘。
- 达成率/占比可点 → `#tpop`（同柱+折线）：5 达成率+2 占比渲染 `td.rc.rt`（`clkRate = tblKey && tblKey!=='_site'`）。`RATE_TREND` 须自洽。弹窗只放只读 `.tp-metric`；关 ✕/遮罩/Esc；点数字 `stopPropagation()`。
- 左侧目录：8 维度+站点，scroll spy；尺寸别改小（列 206px、项 14px、padding `10px 12px`、选中条 4px `left:-12px`）；<1180px 隐藏。
- 站点 KPI 固定 7 列一行（勿 auto-fit）；≤1000px 才退回。选单站点隐藏「各站点表现」标题+卡片；站点明细表保留且不打「已下钻」。缺口 TOP3 洞察 4 列（900→2、560→1）。
- ⚠️ Node 桩 `#siteMatrix` 不随 renderSite 刷新，站点行数只认真浏览器。

## Q4 冲销异常板块（细节）
- **清单 11 列**顺序：上级维度 | 名称 | 负责人 | 加权预测 | 订单销量 | 加权缺口 | FBA库存 | 7DMS | 可售天数 | 近N期占比/达成 | 判定。`min-width:1140px`、空态 `colspan=11`。
- 判定三档：① `allLow && falling`（逐期不高于上期）② `allLow` ③ `halfLow`；按缺口降序，同值以加权预测、名称、BU 决胜。
- 库存三列：⚠️ `cat`/`catBu`（按名 / 按 `分类\u0001BU`）**各自再分 MX/BR**。Q4 拆行取 `catBu`（否则两行同数、加总翻倍）；`cat` 里跨 BU 的库存与 7DMS **相加**、天数重算。源表必须**按国家列过滤**再取值。说明文案末尾「当前口径：…」由 `invScopeLabel()` 实时给。
- Q4 名称弹窗 = 同一 `#tpop` 但形态是表（`renderQ4PopTable`）；行=`trendPeriods()`；**固定 10 列**（周期/M版达成/加权达成/销售预测最新版/加权/订单销量/M版订单预测缺口/加权订单预测缺口/加权版70%-130%预测量/预测量占比）；`table-layout:auto`+无 colgroup；`table.tp-tbl thead th` **必须显式 `white-space:normal`**+`text-wrap:balance`。
- Q4 视图 `applyQ4View()`：hash 前缀 `q4`→进、空 hash→出、其它→维持现状。目录点击偏移读 `--nav-gap`，兜底 `window.scrollTo`（⚠️ 别改 hash，否则一次点击被踢回主看板）。

## 三级分类按 BU 拆行（细节）
- 本期跨 BU 5 组：边桌 / 床头柜 / 斗柜 / 玄关桌 / 简易衣柜。Q4 与主看板维度表都拆两行，各自算缺口/负责人/库存；其它维度不拆。
- 主看板 `groupByDim` 行对象带 `bu`；`rowHTML` 输出 `data-bu` + 名称后 `.butag`，**只有跨 BU 分类才带**（`CROSS_CATS` 由 loadMode 预计算）；`renderInsights` 同理。
- `wideTable` 用 `state.drillBu[tblKey]` 判「已下钻」；面包屑显示「分类 · BU」。`loadMode`/`resetDrill`/切粒度都清 `drillBu`。筛选面板名称去重（勾掉=隐藏该分类所有 BU 行）。
- 负责人：`m.ownByP`（周期下标 → Map(负责人→Σf1)），取**最近一期**最大者，整组只 1 个、不标 +N。`ownMore` 已删除。

## 五项信息覆盖 / 停产 SKU 归属（实现）

`main()` 顺序：`merge_sources` → 剔无 SKU 空行 → `apply_latest_attrs` → `apply_bu_group`
→ `unify_attr_history` → **`reassign_orphan_owner`** → listing 回填 → 构 recs。

`apply_latest_attrs`：读 `LATEST_ATTR_SRC`（最新周表 + 月表）建 **`(最早SKU, 预测站点)` → 五项** 映射。
- 同键多值取出现次数最多者；站点级查不到退回 SKU 级兜底，但**只对「全站点同值」的 SKU 生效**。

`unify_attr_history`：同一 `(最早SKU, 预测站点)` 跨期取值不一致时，按**最后出现周期**统一（`drop_duplicates(keep='last')`）。

`reassign_orphan_owner`（用户 11-24 新增）：停产 SKU 的负责人改按 **`(三级分类, BU, 预测站点)`** 归属。
```python
ORPHAN_OWN_KEY = ['三级分类', 'BU', '预测站点']
known = set(zip(attr['最早SKU'], attr['预测站点']))          # 最新表里还在的 SKU，不动
g = attr.groupby([*ORPHAN_OWN_KEY, '业务负责人'])['_w'].sum()  # _w = 销售预测(加权)
top = g.sort_values([*ORPHAN_OWN_KEY,'w','业务负责人'],
                    ascending=[True,True,True,False,True]).drop_duplicates(ORPHAN_OWN_KEY)
mp = dict(zip(zip(top['三级分类'],top['BU'],top['预测站点']), top['业务负责人']))
is_orphan = [(sku,site) not in known]
mask = is_orphan & newv.notna()   # 查不到的保留原值
```
- ⚠️ 键**必须含 BU**：`(三级分类, 站点)` 有 6 组跨 BU 冲突（边桌/床头柜/斗柜/玄关桌/简易衣柜）；
  含 BU 后 164 组、多负责人组数 0。
- 实测（11-24 周报）：停产 612 行/118 SKU → 归属 608 行、改写 100 行、保留原值 4 行。
  保留的 2 组：`化妆品收纳箱包/装饰&桌椅BU/MX`、`枕头/衣物收纳BU/MX`。

## 环境 / 构建注意事项
- `python` 可能缺库 → `pip install numpy pandas openpyxl`。
- pandas 3.x `astype(str)` 不再把 NaN 变 `'nan'` → 先 `fillna('')` 再 `astype(str)`；无 SKU 空行构建与 verify 同规则剔除。
- ⚠️ 源表末行「合计」会翻倍总量，merge 前先剔除。
- 无 `zip` 命令 → Python `zipfile`，**arcname 相对快照目录** + 反斜杠换正斜杠，否则 verify 全「不一致」。

## 无头 Edge 探针
- `--screenshot` 要绝对 Windows 路径、`--user-data-dir` 每次唯一、配 `--virtual-time-budget`。
- `file://` fetch 被 CORS 挡 → iframe 探针读 `contentDocument`（配 `--allow-file-access-from-files`）。
- `--dump-dom` 多行输出 → 用 Python 正则提 `<pre id="out">`。
- 内联 `const DB` 不在 window 上 → 从 `<script>` 文本用**括号配平**取再 `JSON.parse`。
- 跨域 iframe（github.io）读不了 → 只能直接截图 URL。
