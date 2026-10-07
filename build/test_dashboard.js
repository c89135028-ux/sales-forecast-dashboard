// 无依赖 DOM 桩：跑一遍看板脚本，捕获运行时报错并导出各板块关键单元格。
// 周版与月版共用（模板已泛化周期单位），用环境变量 DASH 指定待测 HTML：
//   node test_dashboard.js                       → 销售预测达成看板.html（周报）
//   DASH=销售预测达成看板-月度.html node test_dashboard.js
const fs = require('fs');
const path = require('path');

const DASH = process.env.DASH || '销售预测达成看板.html';
const html = fs.readFileSync(path.join(__dirname, '..', DASH), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

const store = {};
const mkEl = (key) => ({
  key, _html: '', _text: '', dataset: {}, hidden: false,
  style: {}, offsetWidth: 254, offsetHeight: 320,
  set innerHTML(v) { this._html = v; store[key] = v; },
  get innerHTML() { return this._html; },
  set textContent(v) { this._text = v; store['txt:' + key] = v; },
  get textContent() { return this._text; },
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener: () => {}, removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 100, right: 160, top: 200, bottom: 220, width: 60, height: 20 }),
  closest: () => null, click: () => {},
  onclick: null, onchange: null, oninput: null,
});

const win = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {}, scrollTo: () => {}, scrollY: 0 };
const rootEl = { style: { setProperty: () => {} } };
const registry = {};
const doc = {
  getElementById(id) { return registry['id:' + id] || (registry['id:' + id] = mkEl('id:' + id)); },
  querySelector(sel) {
    const m = /data-dim="([^"]+)"/.exec(sel);
    const key = 'section:' + (m ? m[1] : sel);
    if (!registry[key]) { const e = mkEl(key); if (m) e.dataset.dim = m[1]; registry[key] = e; }
    return registry[key];
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
  documentElement: rootEl,
  location: { hash: '' },
};
const test = `
/* 最后一个周期索引：在（会向 D.periods 追加模拟周期的）趋势用例之前先取好 */
const LASTW = D.periods.length-1;
/* 通用周期单位（周报='周' / 月报='月'） */
const UU = D.unit || '周';

function grab(key){ return store['section:'+key] || ''; }
function rows(sectionHtml){
  const out=[];
  for(const m of sectionHtml.matchAll(/<tr class="[^"]*" data-name="([^"]*)"[\\s\\S]*?<\\/tr>/g)){
    const tds=[...m[0].matchAll(/<td[^>]*>([\\s\\S]*?)<\\/td>/g)].map(x=>x[1].replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim());
    out.push({name:m[1], tds:tds});
  }
  return out;
}
const out={};
out._看板 = DASH_NAME + ' | 单位=' + UU + ' | ' + (D.unitName||'') + ' | 周期数=' + D.periods.length
  + ' | 区间=' + D.periods[0].label + ' ~ ' + D.periods[D.periods.length-1].label
  + ' | 趋势窗=' + TWIN;
out._粒度 = 'modes=' + (DB.modes||[]).map(m=>m.key+'('+m.name+',周期'+m.periods.length+',明细'+m.recs.length+')').join(' ')
  + ' | 默认=' + state.mode
  + ' | 芯片=' + ((store['id:modeChips']||'').match(/data-mode="[^"]*"/g)||[]).join(',')
  + ' | 选中=' + ((store['id:modeChips']||'').match(/class="chip on"/g)||[]).length;
out._周期下拉 = (()=>{ const s=store['txt:id:periodLab']; const o=store['id:periodSel']||'';
  return '标签='+s+' 选项数='+(o.match(/<option/g)||[]).length+' 首项='+((o.match(/<option[^>]*>([^<]*)</)||[])[1]||''); })();
out._logo = store['txt:id:logoTag'];
out._趋势标题 = store['txt:id:trendHeadLbl'] + ' | ' + store['txt:id:trendWin'];

const DRILL_BIZ = D.dims['业务组'][0];
const biz = rows(grab('业务组'));
out.业务组_列数 = biz[0] ? biz[0].tds.length : 0;
out.业务组 = biz.map(r=>[r.name, r.tds[1], r.tds[2], r.tds[3], r.tds[4], r.tds[5], r.tds[8], r.tds[9], r.tds[11], r.tds[14], r.tds[15], r.tds[16]].join(' | '));
out.表头 = [...grab('业务组').matchAll(/<th[^>]*>([^<]*)<\\/th>/g)].map(m=>m[1]).join(' / ');
/* 表头文字必须是用户给定的原文（不许为了排版改写），且一个字都不能少 */
out.表头列 = (()=>{
  const want = ['M版达成','M-1版达成','加权达成','M版断货清洗达成率','加权断货清洗达成率',
                '销售预测（最新版）','销售预测（M-1）','销售预测（加权）','订单销量','断货清洗-销售预测（最新版）',
                'M版订单预测缺口','M版断货清洗缺口','加权断货清洗缺口','加权版70%-130%的预测量','预测量占比'];
  const got = [...grab('业务组').matchAll(/<th class="[^"]*sortable[^"]*"[^>]*>([^<]*)<i class="sk">/g)].map(m=>m[1]);
  const diff = want.filter((w,i)=>got[i]!==w);
  return '列数='+got.length+'/15 与原文完全一致='+(got.length===15 && diff.length===0)
    + (diff.length? ' 不一致:'+diff.join('|')+' 实际:'+got.join('|') : '');
})();
out.列宽够放 = (()=>{
  // 用「文字长度 × 表头字号」粗估（无布局引擎时的近似）：必须 ≤ 列宽 − 内边距 − 排序箭头
  const h=grab('业务组');
  const cols=(h.match(/<col[^>]*style="width:(\\d+)px"/g)||[]).map(x=>+x.match(/(\\d+)px/)[1]);
  const CD=COL_DEF, headN=2;
  const need=CD.map(c=>({k:c.k, t:c.t.length, w:cols[headN+CD.indexOf(c)]}));
  const tight=need.filter(o=>o.w<62);   // 15 个指标列都不该窄于 62px
  return '列数='+cols.length+' 最窄指标列='+Math.min(...need.map(o=>o.w))+' 过窄列='+(tight.map(o=>o.k).join(',')||'无');
})();
out.KPI = (store['id:siteKpis']||'').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();
out.站点卡片 = (store['id:siteCards']||'').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim().slice(0,320);
out.MX子表 = (()=>{ state.site=D.sites.findIndex(s=>s.name.indexOf('墨西哥')>=0); renderAll(); const r=rows(grab('业务组')); return r.map(x=>[x.name,x.tds[12],x.tds[16]].join(' | ')); })();
out.BR子表 = (()=>{ state.site=D.sites.findIndex(s=>s.name.indexOf('巴西')>=0); state.pidx=0; renderAll(); const r=rows(grab('业务组')); return r.map(x=>[x.name,x.tds[2],x.tds[12],x.tds[14]].join(' | ')); })();
out.下钻 = (()=>{ state.site='ALL'; state.pidx = LASTW; state.drill['业务组']=DRILL_BIZ; renderAll();
  const r=rows(grab('BU')); const s=rows(grab('三级分类')); const c=rows(grab('业务负责人'));
  return '下钻='+DRILL_BIZ+' BU='+r.length+' 三级分类='+s.length+' 负责人='+c.length+' | 三级分类第一='+ (s[0]?[s[0].name,s[0].tds[1],s[0].tds[16]].join(','):'-'); })();
out.矩阵 = (store['id:siteMatrix']||'').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim().slice(0,200);
out.trendWin = (store['txt:id:trendWin']||'') + ' | 指标数=' + (store['id:trendMetric']||'').match(/<option/g)?.length;
out.trendWin_full = (()=>{
  // 追加足够的模拟周期，让窗口被 TWIN 截断，从而验证窗口大小
  const n0 = D.periods.length;
  for(let i=0;i<TWIN+2;i++) D.periods.push({date:'2026-10-01', end:'2026-10-31', label:'模拟'+(i+1), short:'M'+(i+1)});
  state.pidx = D.periods.length-1; state.site='ALL'; renderAll();
  const g = store['id:trendGrid'] || '';
  const win = trendPeriods();
  const res = '窗口长度=' + win.length + '（期望 ' + TWIN + '）=' + (win.length===TWIN) + ' | 文本=' + store['txt:id:trendWin']
    + ' | x轴点数=' + (g.match(/class="axis-lbl"[^>]*fill="#5b6b8a"/g)||[]).length;
  D.periods.length = n0;      // 还原，别污染后续用例（D 与 DB.modes[0] 是同一个对象）
  return res;
})();
out.trendFirstPeriod = (()=>{ state.pidx = 0; renderAll(); return 'idx='+JSON.stringify(trendPeriods())+' ' + store['txt:id:trendWin']; })();
out.洞察 = (store['id:siteInsights']||'').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim().slice(0,300);

// ---- 表头筛选 ----
out.筛选按钮 = (()=>{
  const dims=['业务组','BU','产品组','业务负责人','三级分类'];
  const miss=dims.filter(d=>!/data-fopen="/.test(grab(d)));
  const site=!/data-fopen=/.test(store['id:siteMatrix']||'');
  return '缺按钮='+(miss.length?miss.join(','):'无')+' | 站点表无按钮='+site;
})();
out.筛选生效 = (()=>{
  state.pidx = LASTW; state.site='ALL'; state.drill={}; renderAll();
  const n0 = rows(grab('产品组')).length;
  const name = rows(grab('产品组'))[0].name;
  state.hide['产品组'] = new Set([name]);
  renderAll();
  const h = grab('产品组');
  const n1 = rows(h).length;
  const active = /class="fbtn on"/.test(h);
  const cnt = (h.match(/<span class="cnt">([^<]*)<\\/span>/)||[])[1];
  return '原'+n0+' 筛后'+n1+' 首个被筛='+name+' active='+active+' 计数='+cnt;
})();
out.筛选空态 = (()=>{
  state.hide['产品组'] = new Set(groupByDim(recsFor({}), '产品组').map(o=>o.name));
  renderAll();
  const h = grab('产品组');
  const note = /已全部筛除/.test(h);
  const cnt = (h.match(/<span class="cnt">([^<]*)<\\/span>/)||[])[1];
  delete state.hide['产品组']; renderAll();
  return '空态提示='+note+' 计数='+cnt+' 恢复行数='+rows(grab('产品组')).length;
})();
out.筛选面板 = (()=>{
  try{
    openFilter('产品组', {getBoundingClientRect:()=>({left:100,right:160,top:200,bottom:220})}, groupByDim(recsFor({}), '产品组'));
    const h = store['id:fpop'] || '';
    const opened = document.getElementById('fpop').hidden === false;
    closeFilter();
    const bad=/undefined/.test(h);
    const first=(h.match(/data-fv="([^"]*)"/)||[])[1];
    return '渲染='+(/筛选 产品组/.test(h)?'ok':'fail')+' 项='+(h.match(/class="fitem"/g)||[]).length+' 勾选框='+(h.match(/data-fv=/g)||[]).length+' 首项名='+first+' 含undefined='+bad+' 已打开='+opened+' 关闭后hidden='+document.getElementById('fpop').hidden;
  }catch(e){ return 'ERR:'+e.message; }
})();
out.列表板块 = (()=>{
  state.pidx = LASTW; state.site='ALL'; state.hide={}; state.q={}; renderAll();
  const h = grab('国家Listing');
  const r = rows(h);
  return '序号='+(h.match(/<span class="bnum">([^<]*)</)||[])[1]
    +' 计数='+(h.match(/<span class="cnt">([^<]*)</)||[])[1]
    +' 可见行='+r.length
    +' 搜索框='+/data-q="国家Listing"/.test(h)
    +' 筛选按钮='+/data-fopen="国家Listing"/.test(h)
    +' 展开按钮='+/data-more="国家Listing"/.test(h)
    +' 首行='+(r[0]?[r[0].name, '分类='+r[0].tds[1], '订单='+r[0].tds[11], '占比='+r[0].tds[17]].join(', '):'-');
})();
out.无搜索框 = (()=>{
  const dims=['业务组','BU','产品组','业务负责人','三级分类','国家Listing','SKU'];
  const bad=dims.filter(d=>/data-q=/.test(grab(d)));
  const site=/data-q=/.test(store['id:siteMatrix']||'');
  return bad.length? ('仍存在: '+bad.join(',')) : ('各板块已无搜索框 | 站点表='+(site?'有':'无'));
})();
out.列表守恒 = (()=>{
  state.hide={}; state.q={}; state.pidx = LASTW; state.site='ALL'; renderAll();
  const cur=sumRecs(recsFor({}));
  const g=groupByDim(recsFor({}),'国家Listing');
  const s=g.reduce((x,o)=>x+o.a,0);
  return 'listing合计='+s.toFixed(1)+' 总计='+cur.a.toFixed(1)+' 项数='+g.length;
})();
out.SKU板块 = (()=>{
  state.hide={}; state.q={}; state.pidx = LASTW; state.site='ALL'; renderAll();
  const h = grab('SKU');
  const r = rows(h);
  const lead = [...h.matchAll(/<th class="stk c-name2"[^>]*>([^<]*)<\\/th>/g)].map(m=>m[1]).join('');
  return '序号='+(h.match(/<span class="bnum">([^<]*)</)||[])[1]
    +' 计数='+(h.match(/<span class="cnt">([^<]*)</)||[])[1]
    +' 可见行='+r.length
    +' 第二列表头='+lead
    +' 两列名='+(r[0]? r[0].tds.slice(1,3).join(' | ') : '-')
    +' 搜索框='+/data-q="SKU"/.test(h)
    +' 筛选按钮='+/data-fopen="SKU"/.test(h);
})();
out.SKU守恒 = (()=>{
  const cur=sumRecs(recsFor({}));
  const g=groupByDim(recsFor({}),'SKU');
  const s=g.reduce((x,o)=>x+o.a,0);
  return 'SKU合计='+s.toFixed(1)+' 总计='+cur.a.toFixed(1)+' 项数='+g.length;
})();
out.SKU面包屑 = (()=>{
  const first=groupByDim(recsFor({}),'SKU')[0].name;
  state.drill['SKU']=first; renderAll();
  const bar=store['id:drillBar']||'';
  delete state.drill['SKU']; renderAll();
  return '原始='+first+' → 面包屑='+bar.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
})();
out.自定义列 = (()=>{
  state.hideCols = new Set(['mRate','m1Rate','mGap']);
  renderAll();
  const h = grab('业务组');
  const idx = (h.match(/<th class="th-[^"]*" data-c="/g)||[]).length;
  const grps = [...h.matchAll(/<th class="grp [^"]*" colspan="(\\d+)">([^<]*)</g)].map(m=>m[2]+'('+m[1]+')').join(' ');
  const dh = /data-hide="[^"]*mGap/.test(h);
  const twoName = (grab('SKU').match(/<th class="stk c-name2"/g)||[]).length===1;
  state.hideCols = new Set(); renderAll();
  return '可见指标列='+idx+' 分组='+grps+' data-hide='+dh+' SKU两列名称='+twoName+' 复位后='+(grab('业务组').match(/<th class="th-[^"]*" data-c="/g)||[]).length;
})();
out.缺口符号 = (()=>{
  state.hideCols = new Set(); state.hide = {}; state.drill = {};
  state.pidx = LASTW; state.site = 'ALL'; renderAll();
  const h = grab('业务组');
  const vals = h.split('class="gapv').slice(1).map(function(x){
    const a = x.indexOf('>')+1, b = x.indexOf('<', a);
    return x.slice(a,b);
  });
  const bad = vals.filter(function(x){ return x.charAt(0)!=='+' && x.charAt(0)!=='-' && x!=='0.0'; });
  return '缺口值='+vals.slice(0,6).join(',')+' 共'+vals.length+'个 全部带符号='+(vals.length>0 && bad.length===0)
    +' fmtGap(不足/超出/持平)='+[fmtGap(12.3),fmtGap(-4.5),fmtGap(0)].join(' / ');
})();
out.构成条显隐 = (()=>{
  state.hideCols = new Set(); state.hide = {}; state.drill = {}; state.q = {};
  state.pidx = LASTW; state.site = 'ALL'; renderAll();
  const has = k => /class="compline"/.test(grab(k));
  const small = ['业务组','BU','产品组','业务负责人'].filter(k=>!has(k));
  const big = ['三级分类','国家Listing','SKU'].filter(k=>has(k));
  const s = grab('三级分类');
  const topOk = /<tbody>/.test(s) && (s.match(/data-name=/g)||[]).length > 0;
  return '小维度缺条='+(small.join(',')||'无')+' | 高基数仍显示='+(big.join(',')||'无')+' | 三级分类表格正常='+topOk+' | 阈值='+COMP_MAX;
})();
out.三级分类列 = (()=>{
  state.hideCols = new Set(); state.hide = {}; state.drill = {}; state.q = {};
  state.pidx = LASTW; state.site = 'ALL'; renderAll();
  const lst = grab('国家Listing');
  const th3 = lst.indexOf('<th class="stk c-name3" rowspan="2">三级分类<') >= 0;
  const n3 = lst.split('class="name stk c-name3"').length - 1;
  const names = lst.split('class="name stk c-name3" title="').slice(1).map(x=>x.slice(0, x.indexOf('：')));
  const others = ['业务组','BU','产品组','业务负责人','三级分类'].filter(k=>grab(k).indexOf('c-name3')>=0);
  const cols = lst.split('<col ').length - 1;
  return '表头列='+th3+' 单元数='+n3+' 取值示例='+names.slice(0,4).join(',')+' 列数='+cols+' 其他板块误加='+(others.join(',')||'无');
})();
out.附属列筛选 = (()=>{
  state.hide={}; state.hideAux={}; state.hideCols=new Set(); state.drill={}; state.colW={}; state.q={};
  state.pidx = LASTW; state.site='ALL'; renderAll();
  let h = grab('国家Listing');
  const btnAux = h.indexOf('data-fopen="国家Listing@三级分类"') >= 0;
  const before = h.split('class="name stk c-name3"').length-1;
  const pick = groupByDim(recsFor({}),'三级分类').slice(0,2).map(o=>o.name);
  state.hideAux['国家Listing@三级分类'] = new Set(pick);
  renderDim(blockOf('国家Listing'));
  h = grab('国家Listing');
  const after = h.split('class="name stk c-name3"').length-1;
  const names = h.split('class="name stk c-name3" title="').slice(1).map(x=>x.slice(0, x.indexOf('：')));
  const clean = pick.every(p=>names.indexOf(p)<0);
  const other = /c-name3/.test(grab('业务组'));
  state.hideAux={}; renderAll();
  return 'aux按钮='+btnAux+' 行数'+before+'→'+after+' 已剔除='+clean+' 筛选值='+pick.join('/')+' 其他板块未受影响='+(!other);
})();
out.列宽自适应 = (()=>{
  state.colW['业务组'] = COLW.slice(); state.colW['业务组'][0] = 100;
  renderDim(blockOf('业务组'));
  const h = grab('业务组');
  const c0 = (h.split('<col ')[1]||'').slice(0,40);
  const lk1 = h.indexOf('--lk1:100px') >= 0;
  const tw = h.indexOf('data-tkey="业务组"') >= 0;
  state.colW={}; renderAll();
  const back = grab('业务组').indexOf('--lk1:38px') >= 0;
  return '首列='+c0.replace(/style=/,'')+' 名称列偏移跟随='+lk1+' 表标识='+tw+' 双击/重置后回默认='+back;
})();
out.站点顺序 = (()=>{
  state.hide={}; state.hideAux={}; state.hideCols=new Set(); state.drill={}; state.colW={};
  state.pidx = LASTW; state.site='ALL'; renderAll();
  const chips = (store['id:siteChips']||'').split('data-site=').slice(1).map(x=>x.slice(x.indexOf('>')+1, x.indexOf('<')));
  const names = D.sites.map(s=>s.name);
  const cards = (store['id:siteCards']||'').split('class="scard').slice(1).map(x=>{ const i=x.indexOf('data-site="'); return i<0? '?' : x.slice(i+11, x.indexOf('"', i+11)); });
  const rowsN = [...(store['id:siteMatrix']||'').matchAll(/data-name="([^"]+)"/g)].map(m=>m[1]);
  return 'D.sites='+names.join(' > ')+' | chips='+chips.join(' > ')+' | 卡片顺序='+cards.join(',')+' | 明细行='+rowsN.join(' > ');
})();
out.列按钮 = (()=>{
  const dims=['业务组','BU','产品组','业务负责人','三级分类','国家Listing','SKU'];
  const miss=dims.filter(d=>!/data-colopen/.test(grab(d)));
  return '缺按钮='+(miss.length?miss.join(','):'无')+' | 站点块='+(/data-colopen/.test(store['id:siteTools']||'')?'有':'无');
})();
out.页脚单位 = (()=>{
  const f = store['id:footNotes']||'';
  const bad = UU==='月' ? /周/.test(f.replace(/周报/g,'')) : false;
  return '页脚含错误单位='+bad+' | 含「'+UU+'度趋势图」='+f.indexOf(UU+'度趋势图')>=0;
})();
/* 放在最后：会切换粒度并重置筛选状态，避免影响上面的用例 */
out.粒度切换 = (()=>{
  const first = (DB.modes||[])[0].key;
  const other = (DB.modes||[]).find(m=>m.key!==first);
  if(!other) return '数据里只有 1 个粒度';
  const snap = () => ({
    mode: state.mode, unit: D.unit, logo: store['txt:id:logoTag'], lab: store['txt:id:periodLab'],
    per: D.periods.length, rec: REC.length, 趋势窗: store['txt:id:trendWin'],
    芯片选中: ((store['id:modeChips']||'').match(/class="chip on"/g)||[]).length,
    行数: rows(grab('业务组')).length,
    KPI: (store['id:siteKpis']||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,34),
  });
  const before = snap();
  switchMode(other.key);
  const mid = snap();
  switchMode(first);
  const back = snap();
  const ok = mid.mode===other.key && mid.rec===other.recs.length && back.rec===DB.modes[0].recs.length;
  return '切换正确='+ok
    + ' ｜ 初始 ' + JSON.stringify(before)
    + ' ｜ → ' + other.key + ' ' + JSON.stringify(mid)
    + ' ｜ → 切回 ' + first + ' ' + JSON.stringify(back);
})();
out.表头排序 = (()=>{
  state.hideCols=new Set(); state.hide={}; state.hideAux={}; state.drill={}; state.top={};
  state.sort={}; DIM_KEYS.forEach(k=>{ state.sort[k]={k:'a',dir:-1}; });
  state.pidx = LASTW; state.site='ALL'; renderAll();
  const h0 = grab('业务组');
  const ths = [...h0.matchAll(/<th class="([^"]*)" data-c="([^"]*)" data-sort="([^"]*)"/g)].map(m=>({cls:m[1], k:m[3]}));
  const active0 = ths.filter(t=>/sorted/.test(t.cls)).map(t=>t.k);
  const nDown = (h0.match(/<i class="sk">▼<\\/i>/g)||[]).length;
  const nNeutral = (h0.match(/<i class="sk">⇅<\\/i>/g)||[]).length;
  const defOrder = rows(grab('产品组')).map(r=>r.name);
  state.sort['产品组']={k:'a', dir:-1}; renderDim(blockOf('产品组'));
  const aOrder = rows(grab('产品组')).map(r=>r.name);
  const sameAsA = JSON.stringify(defOrder)===JSON.stringify(aOrder);
  state.sort['产品组']={k:'mRate', dir:-1}; renderDim(blockOf('产品组'));
  const downOrder = rows(grab('产品组')).map(r=>r.name);
  const hD = grab('产品组');
  const sortedKey = (hD.match(/<th class="[^"]*sorted[^"]*" data-c="([^"]*)"/)||[])[1];
  const arrowD = (hD.match(/data-sort="mRate"[\\s\\S]{0,400}?<i class="sk">([^<]*)<\\/i>/)||[])[1];
  state.sort['产品组']={k:'mRate', dir:1}; renderDim(blockOf('产品组'));
  const upOrder = rows(grab('产品组')).map(r=>r.name);
  const arrowU = ((grab('产品组')).match(/data-sort="mRate"[\\s\\S]{0,400}?<i class="sk">([^<]*)<\\/i>/)||[])[1];
  const reversed = JSON.stringify(downOrder)===JSON.stringify([...upOrder].reverse());
  state.sort={}; DIM_KEYS.forEach(k=>{ state.sort[k]={k:'a',dir:-1}; }); state.sort['_site']={k:'a',dir:-1}; renderAll();
  return '可排序列='+ths.length+' 默认高亮='+active0.join(',')+' 默认▼='+nDown+' 未排序⇅='+nNeutral
    +' | 默认序即订单销量降序?'+sameAsA
    +' | 切M版达成降序首项='+downOrder[0]+'(默认首项 '+defOrder[0]+') 高亮列='+sortedKey
    +' 箭头 ↓→↑='+arrowD+'→'+arrowU+' 升序=降序倒置?'+reversed;
})();
out.达成率可点 = (()=>{
  state.hide={}; state.hideAux={}; state.hideCols=new Set(); state.drill={}; state.top={};
  state.sort={}; DIM_KEYS.forEach(k=>{ state.sort[k]={k:'a',dir:-1}; });
  state.pidx = LASTW; state.site='ALL'; renderAll();
  const dims=['业务组','BU','产品组','业务负责人','三级分类','国家Listing','SKU'];
  const h=grab('产品组');
  const rowsN=(h.match(/<tr class="[^"]*" data-name=/g)||[]).length;
  const cells=(h.match(/<td class="rc rt" data-c="[^"]*" data-rt="[^"]*">/g)||[]).length;
  const metrics=[...new Set([...h.matchAll(/data-rt="([^"]*)"/g)].map(m=>m[1]))];
  const siteN=((store['id:siteMatrix']||'').match(/data-rt=/g)||[]).length;
  const noTrendUI=!/class="dt-sel"/.test(h) && !/data-dt=/.test(h);
  const missing=dims.filter(k=>!/data-rt="/.test(grab(k)));
  return '产品组 '+rowsN+'行/'+cells+'个可点(每行'+(rowsN? cells/rowsN : 0)+') 口径='+metrics.join(',')
    +' | 站点明细表可点='+siteN+'（应为0） | 板块趋势图已移除='+noTrendUI
    +' | 缺可点的板块='+(missing.join(',')||'无');
})();
out.趋势弹窗 = (()=>{
  try{
    const chipOf = t => { const i=t.indexOf('class="tp-metric">'); return i<0? null : t.slice(i+18, t.indexOf('<', i+18)); };
    openTrendPop('产品组','厨房收纳产品组','mRate');
    const h=store['id:tpop']||'';
    const chart=()=>store['id:tpChart']||'';   // SVG 注入在 #tpChart 里（DOM 桩分开记 key）
    const shown=document.getElementById('tpop').hidden===false;
    const bars=(chart().match(/<rect /g)||[]).length;
    const line=(chart().match(/<polyline/g)||[]).length;
    const noSel=!/<select/.test(h) && !/<option/.test(h);
    const title=/厨房收纳产品组/.test(h) && h.indexOf('class="tp-dim">产品组')>=0;
    const leg=/订单销量/.test(h) && /销售预测（最新版）/.test(h) && /M版达成/.test(h);
    const c1=chipOf(h);
    openTrendPop('产品组','厨房收纳产品组','wOosRate');
    const h2=store['id:tpop']||'';
    const leg2=/断货清洗-预测/.test(h2) && /销售预测（加权）/.test(h2) && /加权断货清洗达成率/.test(h2);
    const c2=chipOf(h2);
    openTrendPop('产品组','厨房收纳产品组','m1Rate');
    const h3=store['id:tpop']||'';
    const leg3=/销售预测（M-1）/.test(h3) && /M-1版达成/.test(h3);
    const c3=chipOf(h3);
    closeTrendPop();
    return '打开='+shown+' 柱='+bars+' 折线='+line+' 标题正确='+title+' 图例正确='+leg
      +' | 无下拉='+noSel+' 口径标签='+[c1,c2,c3].join(' / ')
      +' | 换口径图例正确='+leg2+' / '+leg3
      +' | 关闭后hidden='+document.getElementById('tpop').hidden+' 内容已清空='+(store['id:tpop']==='');
  }catch(e){ return 'ERR:'+e.message; }
})();
/* 趋势图柱值标签几何自查：直接调 pure function trendSVG，解析 .bar-lbl 坐标判「同行相撞」。
   判据（与人工自查一致）：|Δy| < 12（约一个行高）且横向区间相交 → 视为重叠。
   枚举站点并排 / 单站点满宽 / 弹窗三类视图的各种面板宽度，全部须 0 重叠。
   周报与月报都跑一遍（周期数不同 → 槽位宽度不同，重叠风险不同）。
   字宽用 Arial 近似比例 × 10.5px 估算。 */
out.标签重叠 = (()=>{
  try{
    const CW={'0':.556,'1':.556,'2':.556,'3':.556,'4':.556,'5':.556,'6':.556,'7':.556,'8':.556,'9':.556,
              '.':.278,'%':.889,'K':.667,'M':.833,'+':.584,'-':.333,' ':.278};
    const FS=10.5;
    const tw=st=>{ let w=0; for(const ch of st) w += (CW[ch]||.6); return w*FS; };
    const labels=svg=>[...svg.matchAll(/<text class="bar-lbl" x="([-\\d.]+)" y="([-\\d.]+)"[^>]*>([^<]*)<\\/text>/g)]
      .map(m=>({x:+m[1], y:+m[2], t:m[3], w:tw(m[3])}));
    const clashes=svg=>{ const L=labels(svg), bad=[];
      for(let i=0;i<L.length;i++) for(let j=i+1;j<L.length;j++){
        const a=L[i], b=L[j];
        if(Math.abs(a.y-b.y)<12 && (Math.abs(a.x-b.x)-(a.w+b.w)/2) < 0)
          bad.push(a.t+'@'+a.x.toFixed(0)+' ✕ '+b.t+'@'+b.x.toFixed(0)+' 差'+Math.abs(a.y-b.y).toFixed(0)+'px');
      }
      return {n:L.length, bad};
    };
    const runOne=(tag)=>{
      const ps=trendPeriods();
      const scenes=[];
      [0,1].forEach(s=>[420,517,700].forEach(w=>scenes.push(['并排 '+D.sites[s].name+' W'+w, ()=>trendSVG(r=>r.s===s, ps, w)])));
      [0,1].forEach(s=>[1074,1400].forEach(w=>scenes.push(['单站 '+D.sites[s].name+' W'+w, ()=>trendSVG(r=>r.s===s, ps, w)])));
      [700,794].forEach(w=>scenes.push(['弹窗 W'+w, ()=>trendSVG(r=>D.dims['产品组'][r.p]==='厨房收纳产品组', ps, w, RATE_TREND.mRate)]));
      scenes.push(['弹窗加权 W794', ()=>trendSVG(r=>D.dims['产品组'][r.p]==='厨房收纳产品组', ps, 794, RATE_TREND.wOosRate)]);
      let tot=0; const det=[]; let minLbl=999;
      scenes.forEach(([nm,fn])=>{ const c=clashes(fn()); tot+=c.bad.length;
        if(c.bad.length) det.push(nm+':'+c.bad.join(' / '));
        if(c.n && c.n<minLbl) minLbl=c.n; });
      return {tag, per:ps.length, scenes:scenes.length, tot, det, minLbl};
    };
    const orig=state.mode;
    const res=[runOne(orig)];
    const other=(DB.modes||[]).map(m=>m.key).find(k=>k!==orig);
    if(other){ switchMode(other); res.push(runOne(other)); switchMode(orig); }
    const tot=res.reduce((a,r)=>a+r.tot,0);
    const bad=res.filter(r=>r.det.length).map(r=>r.tag+':'+r.det.join(' | '));
    return res.map(r=>r.tag+'(周期'+r.per+' 场景'+r.scenes+' 每图标签≥'+r.minLbl+' 重叠'+r.tot+')').join(' + ')
      + ' 合计重叠='+tot + (tot===0? ' OK' : ' ✕✕ '+bad.join(' ;; '));
  }catch(e){ return 'ERR:'+e.message; }
})();
console.log(JSON.stringify(out,null,1));
`;

try {
  new Function('document', 'console', 'store', 'window', 'DASH_NAME', code + '\n' + test)(doc, console, store, win, DASH);
  console.log('RUNTIME OK');
} catch (e) {
  fs.writeFileSync(path.join(__dirname, '_composed_err.js'), code + '\n' + test);
  console.error('RUNTIME ERROR:', e.message, '\n', e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
