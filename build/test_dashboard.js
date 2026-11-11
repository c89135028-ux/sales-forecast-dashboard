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
const bodyEl = mkEl('body');
bodyEl.className = '';
bodyEl.classList = {
  _s: new Set(),
  add(c){ this._s.add(c); bodyEl.className = [...this._s].join(' '); },
  remove(c){ this._s.delete(c); bodyEl.className = [...this._s].join(' '); },
  toggle(c, f){ const on = (f === undefined) ? !this._s.has(c) : !!f; on ? this.add(c) : this.remove(c); return on; },
  contains(c){ return this._s.has(c); },
};
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
  body: bodyEl,
  title: 'DASH',
  location: { hash: '' },
};
win.location = doc.location;   // applyQ4View 读的是 window.location
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
                'M版订单预测缺口','M版断货清洗缺口','加权订单预测缺口','加权断货清洗缺口','加权版70%-130%的预测量','预测量占比'];
  const got = [...grab('业务组').matchAll(/<th class="[^"]*sortable[^"]*"[^>]*>([^<]*)<i class="sk">/g)].map(m=>m[1]);
  const diff = want.filter((w,i)=>got[i]!==w);
  return '列数='+got.length+'/16 与原文完全一致='+(got.length>=16 && diff.length===0)
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
  state.hideCols = {};
  state.hideCols[ctxKey('业务组')] = new Set(['mRate','m1Rate','mGap']);
  renderAll();
  const h = grab('业务组');
  const idx = (h.match(/<th class="th-[^"]*" data-c="/g)||[]).length;
  const grps = [...h.matchAll(/<th class="grp [^"]*" colspan="(\\d+)">([^<]*)</g)].map(m=>m[2]+'('+m[1]+')').join(' ');
  const dh = /data-hide="[^"]*mGap/.test(h);
  const twoName = (grab('SKU').match(/<th class="stk c-name2"/g)||[]).length===1;
  state.hideCols = {}; renderAll();
  return '可见指标列='+idx+'(应为15) 分组='+grps+' data-hide='+dh+' SKU两列名称='+twoName+' 复位后='+(grab('业务组').match(/<th class="th-[^"]*" data-c="/g)||[]).length;
})();
/* 导出的 CSV 必须与「自定义列」勾选一致：被隐藏的列不得出现在表头 / 数据行里 */
out.导出跟随自定义列 = (()=>{
  const th = (t,c)=>({ hasAttribute:()=>false, getAttribute:k=>k==='data-c'? (c||null):null, textContent:t });
  const td = (t,c)=>({ getAttribute:k=>k==='data-c'? (c||null):null, textContent:t });
  const mkTable = hideStr => ({
    getAttribute: k => k==='data-hide'? (hideStr||null) : null,
    querySelectorAll(sel){
      if(sel==='thead th') return [
        {hasAttribute:()=>true, getAttribute:()=>null, textContent:'达成率'},   // 分组标题行，应跳过
        th('#'), th('业务组'), th('M版达成','mRate'), th('M-1版达成','m1Rate'), th('订单销量','a'),
      ];
      if(sel==='tbody tr') return [{ querySelectorAll: ()=>[
        td('1'), td('拉美收纳宠户组'), td('120.0%','mRate'), td('110.0%','m1Rate'), td('1234','a')] }];
      return [];
    }
  });
  const orig = { qs: document.querySelector, ce: document.createElement, blob: globalThis.Blob,
                 cou: URL.createObjectURL, ru: URL.revokeObjectURL };
  let captured='';
  try{
    globalThis.Blob = class { constructor(parts){ captured = parts.join(''); } };
    document.createElement = ()=>({ click(){} });
    URL.createObjectURL = ()=>'blob:test';
    URL.revokeObjectURL = ()=>{};
    const run = hideStr => {
      captured='';
      const t = mkTable(hideStr);
      document.querySelector = sel => /data-tkey/.test(sel)? t : orig.qs(sel);
      exportTableCSV('业务组');
      return captured.replace(/^\\uFEFF/,'').split('\\n');
    };
    const full = run('');
    const cut  = run('mRate m1Rate');
    const cutCols = cut[0].split(',').length;
    const ok = cut[0].indexOf('M版达成')<0 && cut[0].indexOf('M-1版达成')<0
            && cutCols===3 && cut[1].split(',').length===3;
    return '全量列='+full[0].split(',').length+' 隐藏2列后='+cutCols+' | 表头='+cut[0]
      +' | 数据='+cut[1]+' | 隐藏列已排除='+ok;
  } finally {
    document.querySelector = orig.qs; document.createElement = orig.ce;
    globalThis.Blob = orig.blob; URL.createObjectURL = orig.cou; URL.revokeObjectURL = orig.ru;
  }
})();
out.缺口符号 = (()=>{
  state.hideCols = {}; state.hide = {}; state.drill = {};
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
  state.hideCols = {}; state.hide = {}; state.drill = {}; state.q = {};
  state.pidx = LASTW; state.site = 'ALL'; renderAll();
  const has = k => /class="compline"/.test(grab(k));
  const small = ['业务组','BU','产品组','业务负责人'].filter(k=>!has(k));
  const big = ['三级分类','国家Listing','SKU'].filter(k=>has(k));
  const s = grab('三级分类');
  const topOk = /<tbody>/.test(s) && (s.match(/data-name=/g)||[]).length > 0;
  return '小维度缺条='+(small.join(',')||'无')+' | 高基数仍显示='+(big.join(',')||'无')+' | 三级分类表格正常='+topOk+' | 阈值='+COMP_MAX;
})();
out.三级分类列 = (()=>{
  state.hideCols = {}; state.hide = {}; state.drill = {}; state.q = {};
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
  return '页脚含错误单位='+bad+' | 含「'+UU+'度趋势图」='+(f.indexOf(UU+'度趋势图')>=0);
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
  /* 切粒度后 Q4 判定文案的单位要跟着变（周→月） */
  const q4Txt = tierTxt(1,[0,1,2,3]);
  const q4TxtOk = q4Txt === ('连续4'+U+'不达且无改善');
  switchMode(first);
  const back = snap();
  const ok = mid.mode===other.key && mid.rec===other.recs.length && back.rec===DB.modes[0].recs.length && q4TxtOk;
  return '切换正确='+ok
    + ' ｜ Q4判定文案(切后)=' + q4Txt + (q4TxtOk?'':' ✕')
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
  const cells=(h.match(/<td[^>]*data-rt="[^"]*"/g)||[]).length;
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
    openTrendPop('产品组','厨房收纳产品组','bandShare');
    const h4=store['id:tpop']||'';
    const leg4=/70%-130%预测量/.test(h4) && /销售预测（加权）/.test(h4) && /预测量占比/.test(h4);
    const c4=chipOf(h4);
    const bars4=(chart().match(/<rect /g)||[]).length;
    openTrendPop('产品组','厨房收纳产品组','bandShare4');
    const h5=store['id:tpop']||'';
    const leg5=/最新版70%-130%预测量/.test(h5) && /销售预测（最新版）/.test(h5) && /最新版预测量占比/.test(h5);
    const c5=chipOf(h5);
    closeTrendPop();
    return '打开='+shown+' 柱='+bars+' 折线='+line+' 标题正确='+title+' 图例正确='+leg
      +' | 无下拉='+noSel+' 口径标签='+[c1,c2,c3,c4,c5].join(' / ')
      +' | 换口径图例正确='+leg2+' / '+leg3+' / '+leg4+' / '+leg5
      +' | 占比口径柱数='+bars4
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
out.文本选择保护 = (()=>{
  try{
    const had = window.getSelection;
    window.getSelection = ()=>({ isCollapsed:false, toString:()=>'  宠物用品BU  ' });
    const selOn = textSelecting();                       // 选区非空 → 拦
    window.getSelection = ()=>({ isCollapsed:true, toString:()=>'' });
    _selBusy = false;
    const plain = textSelecting();                       // 普通点击 → 放行
    _selBusy = true;                                     // 拖选后（mouseup 置位）
    const dragged = textSelecting();                     // 拖选 → 拦
    _selBusy = false;
    if(had===undefined) delete window.getSelection; else window.getSelection = had;
    const ok = selOn && !plain && dragged && typeof textSelecting==='function';
    return '选区非空拦截='+selOn+' 普通点击放行='+(!plain)+' 拖选拦截='+dragged
      + ' | 点击入口加保护='+GUARDN+' 处' + (ok && GUARDN===4 ? ' OK' : ' ✕');
  }catch(e){ return 'ERR:'+e.message; }
})();

/* 新列：加权订单预测缺口（= 销售预测(加权) − 订单销量），必须紧贴「加权断货清洗缺口」之前 */
out.加权订单预测缺口 = (()=>{
  try{
    state.hideCols = {}; state.hide = {}; state.drill = {}; state.pidx = LASTW; state.site='ALL'; renderAll();
    const h = grab('业务组');
    const ths = [...h.matchAll(/<th class="th-[^"]*" data-c="([^"]+)"/g)].map(m=>m[1]);
    const iW = ths.indexOf('wGap'), iO = ths.indexOf('wOosGap');
    const adj = iW>=0 && iO===iW+1;
    const v1 = MET.wGap({f1:100, a:120});   // 实际超出 → 显示 +
    const v2 = MET.wGap({f1:120, a:100});   // 实际不足 → 显示 -
    const f1 = fmtGap(v1), f2 = fmtGap(v2);
    const ok = adj && iW>=0 && v1===-20 && v2===20 && f1==='+20.0' && f2==='-20.0';
    return '表头位置=…' + ths.slice(Math.max(0,iW-1), iW+3).join(' > ')
      + ' | 紧邻加权断货清洗缺口=' + adj
      + ' | 100−120=' + v1 + '→' + f1 + ' ; 120−100=' + v2 + '→' + f2
      + (ok ? ' OK' : ' ✕');
  }catch(e){ return 'ERR:'+e.message; }
})();

/* Q4 冲销异常：4 张清单（占比/达成 × 三级分类/Listing）的判定与「跟随筛选」都要对 */
out.Q4冲销异常 = (()=>{
  try{
    const un = t => String(t).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
    const cfgOf = k => k==='share' ? {a:0.35,b:0.30,v:x=> x.f1>0? x.f1q/x.f1 : null}
                                    : {a:0.90,b:0.90,v:x=> x.f1>0? x.a/x.f1 : null};
    function ref(kind, dimKey){
      const cfg=cfgOf(kind), field=dimKey==='三级分类'?'c':'l';
      const per=[]; const end=Math.min(state.pidx, D.periods.length-1);
      for(let i=Math.max(0,end-3); i<=end; i++) per.push(i);
      const map=new Map();
      for(let i=0;i<NREC;i++){
        const r=REC[i];
        if(state.site!=='ALL' && r.s!==state.site) continue;
        if(state.bizGroup!=='ALL' && r.g!==state.bizGroup) continue;
        const j=per.indexOf(r.w); if(j<0) continue;
        let m=map.get(r[field]); if(!m){ m=per.map(()=>({f1:0,f1q:0,a:0})); map.set(r[field],m); }
        m[j].f1+=r.f1; m[j].f1q+=r.f1q; m[j].a+=r.a;
      }
      const out=[];
      map.forEach((arr, idx)=>{
        const vals=arr.map(cfg.v), got=vals.filter(v=>v!=null);
        if(got.length<2) return;
        const all = got.length===vals.length && got.every(v=>v<cfg.a);
        const half= got.filter(v=>v<cfg.b).length*2 >= per.length;
        const fall = got.every((v,i)=> i===0 || v<=got[i-1]);   // 持续下降：每期都不高于上一期
        const tier= all ? (fall?1:2) : (half?3:0);
        if(!tier) return;
        const cur=arr[per.indexOf(state.pidx)];
        const curF1=cur?cur.f1:0, curA=cur?cur.a:0;
        /* 每期都低、但中途回暖 —— 用来验证「持续下降」不是只比首尾（这类必须是 ② 而不是 ①） */
        const midRise = all && !fall;
        out.push({name:D.dims[dimKey][idx], tier, f1:curF1, gap:curF1-curA, midRise:midRise});
      });
      /* 异常里优先展示缺口大的 */
      out.sort((x,y)=> y.gap-x.gap || y.f1-x.f1 || String(x.name).localeCompare(String(y.name),'zh'));
      return out;
    }
    const cards = () => [...(store['id:q4Grid']||'').split('<div class="q4card"').slice(1)];
    function parse(card){
      const out=[];
      const parts=card.split('<td class="q4nm');
      for(let i=1;i<parts.length;i++){
        const seg=parts[i];
        const name=un(seg.slice(seg.indexOf('>')+1, seg.indexOf('</td>')));
        const rest=seg.slice(seg.indexOf('</td>')+5);
        const v0=rest.slice(rest.indexOf('<td>')+4);
        const f1=+(v0.slice(0, v0.indexOf('</td>')).split(',').join(''))||0;
        /* 紧随其后是「订单销量」列 */
        const after1=v0.slice(v0.indexOf('</td>')+5);
        const aRaw=after1.slice(after1.indexOf('<td>')+4, after1.indexOf('</td>'));
        const vol=+(aRaw.split(',').join(''))||0;
        const gpos=rest.indexOf('class="gapv');
        const gseg=gpos>=0 ? rest.slice(gpos) : '';
        const gtxt=gseg ? gseg.slice(gseg.indexOf('>')+1, gseg.indexOf('</span>')) : '';
        const gapShown=gtxt ? (parseFloat(gtxt.replace(/,/g,''))||0) : NaN;
        const sq=rest.slice(rest.indexOf('class="q4seq">')+14);
        const seqHtml=sq.slice(0, sq.indexOf('</td>'));
        const tg=rest.slice(rest.indexOf('q4tag t')+7);
        out.push({name:name, f1:f1, vol:vol, gapShown:gapShown, seqN:seqHtml.split('<span').length-1, tier:+(tg.slice(0,1)||0)});
      }
      return out;
    }
    const dims=[['share','三级分类'],['share','国家Listing'],['rate','三级分类'],['rate','国家Listing']];

    state.site='ALL'; state.bizGroup='ALL'; state.q4more={}; state.pidx=LASTW; renderAll();
    const cs=cards();
    if(cs.length!==4) return '✕ 卡片数='+cs.length;
    const det=[]; let allOk=true;
    dims.forEach((pair,i)=>{
      const k=pair[0], d=pair[1];
      const got=parse(cs[i]), exp=ref(k,d);
      const NTOP=q4TopN(d);
      const expTop=exp.slice(0,NTOP);
      /* 顺序要被严格比对：期望榜已按「加权预测缺口 desc → 加权预测 desc → 名称」排好 */
      const same = got.length===expTop.length
        && got.every((r,j)=> r.name===expTop[j].name && r.tier===expTop[j].tier);
      /* 缺口列显示值 = −(加权预测 − 订单销量)，故「缺口降序」= 显示值升序 */
      let sorted=true; for(let j=1;j<got.length;j++) if(!(got[j-1].gapShown <= got[j].gapShown)) sorted=false;
      const gapOk = got.length===expTop.length
        && got.every((r,j)=> Math.abs(r.gapShown - (-expTop[j].gap)) < 0.15);
      const seqLen = got.every(r=> r.seqN===4);
      /* 新增列：上级维度（BU / 三级分类）单元格数要对得上；订单销量 = 加权预测 + 缺口显示值 */
      const auxN = (cs[i].match(/class="q4aux"/g)||[]).length;
      /* 上级维度不能全是「—」（DIDX 是字段名字符串，容易踩 auxField>=0 恒假的坑） */
      const auxEmpty = (cs[i].match(/class="q4aux"[^>]*>—</g)||[]).length;
      const auxOk = auxN === got.length && auxEmpty === 0;
      const volOk = got.length===expTop.length
        && got.every(r=> Math.abs(r.vol - (r.f1 + r.gapShown)) < 0.15);
      const seqHead = k==='share' ? '近4周占比' : '近4周达成';
      const headOk = cs[i].indexOf('订单销量')>=0 && cs[i].indexOf(seqHead)>=0 && cs[i].indexOf('加权缺口')>=0
        && cs[i].indexOf('负责人')>=0;
      /* 负责人列：每行一个，且不能整列都是「—」 */
      const ownN = (cs[i].match(/class="q4own"/g)||[]).length;
      const ownEmpty = (cs[i].match(/class="q4own"[^>]*>—</g)||[]).length;
      const ownOk = ownN === got.length && ownEmpty === 0;
      /* 「首尾下降但中途回升」的项不能被判成 ①（持续下降） */
      const midRiseN = exp.filter(e=> e.midRise).length;
      const noFalseOne = got.every(r=>{
        const e=expTop.find(x=> x.name===r.name);
        return !e || !e.midRise || r.tier===2;
      });
      if(!(same&&sorted&&gapOk&&seqLen&&noFalseOne&&auxOk&&volOk&&headOk&&ownOk)) allOk=false;
      det.push(d+'/'+k+' '+got.length+'项'+(same?'':' ✕判定/顺序')+(sorted?'':' ✕缺口排序')+(gapOk?'':' ✕缺口值')+(seqLen?'':' ✕序列长度')+(noFalseOne?'':' ✕中途回升误判①')
        +(auxOk?'':' ✕上级维度列')+(volOk?'':' ✕订单销量列')+(headOk?'':' ✕表头')+(ownOk?'':' ✕负责人列('+ownN+'/'+got.length+',空'+ownEmpty+')')
        +(midRiseN?('(中途回升'+midRiseN+'项)'):''));
    });
    const exp0=ref('share','三级分类');
    state.q4more={'share:三级分类':true}; renderQ4();
    const expanded=parse(cards()[0]).length;
    const moreBtn=(store['id:q4Grid']||'').indexOf('收起')>=0;
    state.q4more={}; renderQ4();
    const collapsed=parse(cards()[0]).length;
    const siteBak=state.site; state.site=0; renderAll();
    const ref2=ref('rate','国家Listing');
    const follow=parse(cards()[3]).length===Math.min(ref2.length,q4TopN('国家Listing'));
    state.site=siteBak; renderAll();
    /* 三档判定文案：① 连续N周不达且无改善 ② 连续N周不达 ③ 一半及以上不达 */
    const w4=[0,1,2,3];
    const t1=tierTxt(1,w4), t2=tierTxt(2,w4), t3=tierTxt(3,w4);
    const txtOk = t1==='连续4周不达且无改善' && t2==='连续4周不达' && t3==='一半及以上不达';
    /* 一个板块一行：q4grid 单列 */
    const oneCol = /\.q4grid\{display:grid;grid-template-columns:1fr/.test(HTMLTXT);
    /* 筛选栏入口：数字 = 当前筛选下去重后的异常项数（同一个项可能在占比/达成两张清单都命中） */
    const jn = store['id:q4JumpN']||'';
    const jseg = jn.split('<b>');
    const jm1 = jseg[1] ? parseInt(jseg[1].split('</b>')[0],10) : NaN;
    const jm2 = jseg[2] ? parseInt(jseg[2].split('</b>')[0],10) : NaN;
    const expCat = new Set([...ref('share','三级分类'), ...ref('rate','三级分类')].map(e=>e.name)).size;
    const expLst = new Set([...ref('share','国家Listing'), ...ref('rate','国家Listing')].map(e=>e.name)).size;
    const jumpOk = jm1===expCat && jm2===expLst && expCat>0;
    /* 名称可点 → 弹出「表格式」预测达成（行 = 近 N 期；列 = 用户指定的 9 个指标） */
    const cellOk = (store['id:q4Grid']||'').indexOf('data-q4name=')>=0;
    let popOk = false;
    try{
      openTrendPop('三级分类','衣撑','wRate','table');
      const tp = store['id:tpop']||'';
      const need = ['M版达成','加权达成','销售预测（最新版）','销售预测（加权）','订单销量',
                    'M版订单预测缺口','加权订单预测缺口','加权版70%-130%的预测量','预测量占比'];
      const hasTh = need.every(s=> tp.indexOf(s)>=0);
      const nTh = (tp.match(/<th[ >]/g)||[]).length;
      const hasTbl = tp.indexOf('class="tp-tbl"')>=0 && tp.indexOf('tp-tblwrap')>=0;
      const nRow = (tp.match(/<td class="tp-p"/g)||[]).length;
      const nPer = trendPeriods().length;
      const curRow = (tp.match(/<tr class="cur"/g)||[]).length;
      /* 同口径核对：弹窗当前期 加权达成 / 预测量占比 / 两个缺口 = 直接按该三级分类聚合算出来的值 */
      const curT = sumRecs(recsFor({pIdx:state.pidx})
        .filter(r=> D.dims['三级分类'][r[DIDX['三级分类']]]==='衣撑'));
      const refM = MET.wRate(curT), refB = bandShare(curT);
      const cellTxt = refM==null ? '—' : (refM*100).toFixed(1)+'%';
      /* 缺口列：每行 2 个，符号与主表一致（实际不足为负、超出为正） */
      const nGap = (tp.match(/class="gapv /g)||[]).length;
      const gapTxt = fmtGap(MET.wGap(curT));
      const gapOk = nGap===nPer*2 && (nPer<1 || tp.indexOf(gapTxt)>=0);
      /* 占比列：纯百分比数字（行少、占比小，不画进度条），取值须与 bandShare 一致 */
      const bandTxt = fmtPct(refB);
      const bandOk = refB==null
        ? tp.indexOf('rchip none')>=0
        : (tp.indexOf('class="tp-b"')>=0 && tp.indexOf('>'+bandTxt+'<')>=0);
      popOk = hasTh && nTh===10 && hasTbl && nRow===nPer && nPer>=2 && curRow===1 && bandOk && gapOk
        && tp.indexOf(cellTxt)>=0 && tp.indexOf('三级分类')>=0 && tp.indexOf('衣撑')>=0;
      if(popOk!==true) popOk = '表头'+hasTh+' 列数'+nTh+'/'+10+' 表格'+hasTbl+' 行'+nRow+'/'+nPer
        +' 当前行'+curRow+' 口径'+cellTxt+' 占比'+bandTxt+'('+bandOk+') 缺口'+nGap+'/'+(nPer*2)+'('+gapTxt+')';
      if(typeof closeTrendPop==='function') closeTrendPop();
    }catch(e){ popOk = 'ERR:'+e.message; }
    /* 每张表上方「一句话」：分母 = 当前筛选的整体加权缺口（四张卡必须同一个数） */
    const grid = store['id:q4Grid']||'';
    const sumN = (grid.match(/class="q4sum"/g)||[]).length;
    const expN = (grid.match(/data-q4exp="/g)||[]).length;
    let scopeG = 0;
    for(let i=0;i<NREC;i++){
      const r = REC[i];
      if(state.site!=='ALL' && r.s!==state.site) continue;
      if(state.bizGroup!=='ALL' && r.g!==state.bizGroup) continue;
      if(r.w!==state.pidx) continue;
      scopeG += r.f1 - r.a;
    }
    const rr = ref('share','三级分类');
    const t10G = rr.slice(0,q4TopN('三级分类')).reduce((s,e)=> s+e.gap, 0);
    const p10Txt = scopeG>0 ? (t10G/scopeG*100).toFixed(1)+'%' : null;
    let cumG=0, k40=0;
    for(let i=0;i<rr.length;i++){ cumG+=rr[i].gap; if(cumG>=scopeG*0.4){ k40=i+1; break; } }
    /* 国家Listing 维度按 TOP15 算占比 */
    const rrl = ref('share','国家Listing');
    const t15G = rrl.slice(0,q4TopN('国家Listing')).reduce((s,e)=> s+e.gap, 0);
    const p15Txt = scopeG>0 ? (t15G/scopeG*100).toFixed(1)+'%' : null;
    const sameTotal = (grid.split(fmtN(scopeG,1)).length-1) >= 4;   // 四张卡显示同一个总缺口
    const sumOk = sumN===4 && expN===4 && p10Txt!=null && p15Txt!=null && sameTotal
      && grid.indexOf('本表 TOP'+q4TopN('三级分类'))>=0 && grid.indexOf('本表 TOP'+q4TopN('国家Listing'))>=0
      && grid.indexOf(p10Txt)>=0 && grid.indexOf(p15Txt)>=0
      && (k40? grid.indexOf('TOP '+k40)>=0 : grid.indexOf('仍未到')>=0);
    /* CSV 文本：表头 = 上级维度+名称+加权预测+订单销量+加权缺口+每期一列+判定 */
    const csv = String(q4CSV('share:三级分类'));
    const cl = csv.split('\\n');
    const h0 = cl[0].slice(cl[0].indexOf('"'));      // 跳过 BOM，从第一个引号开始
    const ch = h0.split(',').length;
    const csvOk = ch === 6 + q4Window().length + 1 && cl.length === rr.length+1
      && cl[0].indexOf('"加权缺口"')>=0 && cl[0].indexOf('"判定"')>=0 && cl[0].indexOf('"负责人"')>=0;
    /* 视图切换只认 q4 前缀与空 hash：点 Q4 目录（hash 变成 #q4c-N）不能把 Q4 页踢回主看板 */
    const viewOk = (()=>{
      const at = v => { window.location.hash = v; applyQ4View(); return document.body.classList.contains('q4-only'); };
      const a = at('#q4');        // 进入
      const b = at('#q4c-2');     // Q4 目录点第 3 张清单
      const c = at('#nav-sec-3'); // 主看板锚点：维持现状，不误退
      const d = at('');           // 返回主看板
      const e = at('#q4');        // 再次进入
      return { ok: a===true && b===true && c===true && d===false && e===true, txt: [a,b,c,d,e].join('/') };
    })();
    const ok = allOk && txtOk && oneCol && jumpOk && cellOk && popOk===true && viewOk.ok
      && sumOk && csvOk
      && expanded===exp0.length && collapsed===Math.min(exp0.length,q4TopN('三级分类')) && moreBtn && follow;
    return det.join(' | ')
      + ' | 一行一卡=' + oneCol
      + ' | 筛选栏入口=' + (jumpOk? (expCat+'/'+expLst) : ('✕ '+jn))
      + ' | 名称弹表格=' + (popOk===true? 'ok' : ('✕ '+popOk))
      + ' | 视图切换=' + (viewOk.ok? ('ok '+viewOk.txt) : ('✕ '+viewOk.txt))
      + ' | 集中度一句话=' + (sumOk? ('ok 整体缺口'+fmtN(scopeG,1)+' 三级分类TOP10='+p10Txt+' ListingTOP15='+p15Txt+' TOP'+k40+'达40% 卡片'+sumN+' 导出'+expN)
                                : ('✕ 卡片'+sumN+'/4 导出'+expN+' 整体'+fmtN(scopeG,1)+' 期望'+p10Txt+'/TOP'+k40+' 同数'+sameTotal))
      + ' | 导出CSV=' + (csvOk? ('ok 列'+ch+' 行'+(cl.length-1)) : ('✕ 列'+ch+'/期望'+(6+q4Window().length+1)+' 行'+(cl.length-1)+'/'+rr.length))
      + ' | 判定文案 ' + (txtOk? (t1+' / '+t2+' / '+t3) : ('✕ '+t1+' | '+t2+' | '+t3))
      + ' | 展开 ' + collapsed + '→' + expanded + '/' + exp0.length + ' 收起按钮=' + moreBtn
      + ' | 跟随站点筛选=' + follow + (ok?' OK':' ✕');
  }catch(e){ return 'ERR:'+e.message; }
})();

console.log(JSON.stringify(out,null,1));
`;

const GUARD_N = (code.match(/if\(textSelecting\(\)\) return;/g) || []).length;
try {
  new Function('document', 'console', 'store', 'window', 'DASH_NAME', 'GUARDN', 'HTMLTXT', code + '\n' + test)(doc, console, store, win, DASH, GUARD_N, html);
  console.log('RUNTIME OK');
} catch (e) {
  fs.writeFileSync(path.join(__dirname, '_composed_err.js'), code + '\n' + test);
  console.error('RUNTIME ERROR:', e.message, '\n', e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
