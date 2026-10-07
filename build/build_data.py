# -*- coding: utf-8 -*-
"""【周报】把多个源表**滚动合并**成看板所需的紧凑 JSON。

口径：看板是**滚动窗口** —— 历史周期要一直留着，新数据往后追加，**不是整批覆盖**。
所以 `SRCS` 是一个列表，按顺序读入并纵向拼接；同一个「周首日」以靠后的源为准（用于修订某周时覆盖）。
本题不需要覆盖（各源周期互不重叠），但保留该规则以便某周被重出时直接覆盖。

当前：
  - `(21)` 历史 4 周：2026-08-23 / 08-30 / 09-06 / 09-13
  - `(24)` 最新 2 周：2026-09-20 / 09-27
  → 合并后 6 周（两份表列集合完全一致，17 列，可直接拼接）。

⚠️ 这些源表是历史数据的**唯一来源**，构建时要读它们，请勿删除。
   下一批新数据到手时，把新表**追加**到 `SRCS` 末尾即可（不要替换旧条目）。

维度口径说明：各源表自带业务组/产品组/业务负责人/国家Listing/最早SKU，不做跨期回填；
listing 只用 (国家, 最早SKU) 查对应表补**源表为空**的行（源表已有值即使与对应表不同也以源表为准）。
"""
import json
import math
import os
import numpy as np
import pandas as pd

# 滚动合并：按顺序读入并拼接，同一个「周首日」以靠后的源为准（新数据往后追加，不替换旧的）
SRCS = [
    r'D:/Thinkpad/下载/日明细数据 (21).xlsx',   # 历史 4 周：08-23 / 08-30 / 09-06 / 09-13
    r'D:/Thinkpad/下载/日明细数据 (24).xlsx',   # 最新 2 周：09-20 / 09-27
]
TIME_COL = '周首日'
# 兜底：仅当源表缺「业务组 / 产品组 / 业务负责人」列时才启用，按 最早SKU 从上一期明细回填
ATTR_SRC = r'D:/Thinkpad/下载/日明细数据 (21).xlsx'
ATTR_COLS = ['业务组', '产品组', '业务负责人']
# listing 对应表：列 = 国家 / 最早SKU / 最新国家Listing，用于回填源表中空白的 listing
LISTING_MAP = r'E:/不重要文件/国家listing对应表.xlsx'
OUT = r'E:/WorkBuddy/2026-09-20-13-53-33/build/data.json'

# 站点 → 对应表里的国家取值（同一 SKU 在巴西 / 墨西哥的 listing 编码不同，必须双键关联）
SITE2NAT = {
    'Amazon.com.br.new': '巴西',
    'Amazon.com.mx.new': '墨西哥',
}
_NAN_WORDS = ['', 'nan', 'None', 'NaN', 'NaT']

SITE_NAME = {
    'Amazon.com.mx.new': '墨西哥站 (MX)',
    'Amazon.com.br.new': '巴西站 (BR)',
}

METRICS = [
    '销售预测(加权)',            # 加权口径预测
    '断货清洗-销售预测',
    '销售预测(M-1)',
    '销售预测(最新版)',
    '断货清洗-销售预测(最新版)',
]


def r2(x):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return 0.0
    return round(float(x), 2)


def read_source(path):
    """读一个源表：剔除末行「合计」，把周首日规范成 'YYYY-MM-DD'。"""
    d = pd.read_excel(path, sheet_name='日明细数据')
    d = d[d[TIME_COL].astype(str) != '合计'].copy()
    d[TIME_COL] = pd.to_datetime(d[TIME_COL]).dt.strftime('%Y-%m-%d')
    return d


def merge_sources(paths):
    """滚动合并多个源；同一个「周首日」只保留**最后一个**提供它的源的全部行。

    ⚠️ 不能写成 `drop_duplicates(subset=[TIME_COL])` —— 那会把每周只留一行。
    这里先按「后源优先」算出每个周期的归属源，再整周取该源的数据。
    """
    frames = [read_source(p) for p in paths]
    owner = {}
    for i, d in enumerate(frames):
        for w in d[TIME_COL].unique():
            owner[w] = i                      # 后出现的源覆盖先出现的
    parts = []
    for i, d in enumerate(frames):
        sel = d[d[TIME_COL].map(owner) == i]
        if len(sel):
            ws = sorted(sel[TIME_COL].unique())
            print(f'源 {os.path.basename(paths[i])} → 贡献 {len(ws)} 周：{", ".join(ws)}（{len(sel)} 行）')
            parts.append(sel)
        else:
            print(f'源 {os.path.basename(paths[i])} → 全部周期都被后面的源覆盖，忽略')
    return pd.concat(parts, ignore_index=True)


def main():
    df = merge_sources(SRCS)
    for c in ('最早SKU', '预测SKU'):
        if c in df.columns:
            df[c] = df[c].astype(str).str.strip()

    # —— 补全源表缺失的维度列：按 最早SKU 从上期明细回填；实在没有的归「（未标注）」 ——
    _miss = [c for c in ATTR_COLS if c not in df.columns]
    if _miss:
        if not os.path.exists(ATTR_SRC):
            raise SystemExit(f'源表缺少 {_miss}，且找不到属性来源表：{ATTR_SRC}')
        attr = pd.read_excel(ATTR_SRC, sheet_name='日明细数据')
        attr = attr[attr['周首日'].astype(str) != '合计'].copy()
        attr['最早SKU'] = attr['最早SKU'].astype(str).str.strip()
        attr = attr.drop_duplicates('最早SKU')
        for c in _miss:
            mp = dict(zip(attr['最早SKU'], attr[c]))
            df[c] = df['最早SKU'].map(mp)
            got = int(df[c].notna().sum())
            df[c] = df[c].fillna('（未标注）').astype(str).str.strip()
            tail = '' if got == len(df) else f'，{len(df)-got} 行归「（未标注）」'
            print(f'维度补全：{c} ← 按 最早SKU 回填 {got}/{len(df)} 行{tail}')

    # 源表可能整列不含 listing（(19) 起），此时整列交给对应表回填
    if '国家Listing' not in df.columns:
        df['国家Listing'] = np.nan
        print('维度补全：源表无「国家Listing」列 → 全部按 (国家, 最早SKU) 查对应表回填')

    # 关键维度缺失的行直接丢弃（仅总计行会出现）
    dims_order = ['业务组', 'BU', '产品组', '三级分类', '业务负责人']
    # 高基数明细维度：允许空值，空值归入「（未标注）」而不是丢弃，保证各维度合计守恒
    dims_extra = ['国家Listing', 'SKU']
    df = df.dropna(subset=['周首日', '预测站点'] + dims_order)
    df['国家Listing'] = df['国家Listing'].astype(str).str.strip()
    _lst = df['国家Listing']
    _bad = _lst.isna() | _lst.isin(_NAN_WORDS)

    # —— 回填空缺 listing：按 (国家, 最早SKU) 双键查对应表；只补空值，源表已有的值一律不动 ——
    n_blank = int(_bad.sum())
    n_fill = 0
    if os.path.exists(LISTING_MAP):
        lm = pd.read_excel(LISTING_MAP, sheet_name=0)
        lm.columns = ['国家', '最早SKU', '最新国家Listing']
        for c in lm.columns:
            lm[c] = lm[c].astype(str).str.strip()
        lm = lm.drop_duplicates(['国家', '最早SKU'])          # 双键唯一，避免一对多放大行数
        lmap = {r['国家'] + '\x1f' + r['最早SKU']: r['最新国家Listing'] for _, r in lm.iterrows()}
        _key = df['预测站点'].map(SITE2NAT).astype(str).str.strip() + '\x1f' + df['最早SKU'].astype(str).str.strip()
        _fill = _key.map(lmap)
        df['国家Listing'] = _lst.mask(_bad, _fill)
        n_fill = int((_bad & _fill.notna()).sum())
        _lst = df['国家Listing']
        _bad = _lst.isna() | _lst.isin(_NAN_WORDS)
        print(f'listing 回填：空值 {n_blank} 行，对应表补齐 {n_fill} 行，仍缺 {int(_bad.sum())} 行')
    else:
        print('listing 回填：未找到对应表，跳过（', LISTING_MAP, '）')

    df['国家Listing'] = _lst.mask(_bad, '（未标注）')
    # SKU 维度 = 「最早SKU|预测SKU」组合串（预测SKU 唯一确定其最早SKU；仅 47 个最早SKU 对应 2 个预测SKU）
    df['SKU'] = (df['最早SKU'].astype(str).str.strip() + '|' + df['预测SKU'].astype(str).str.strip())

    # 周首日已在 read_source 里规范成 'YYYY-MM-DD'
    weeks = sorted(df['周首日'].unique())
    # 站点顺序：墨西哥站在前、巴西站在后（与看板展示顺序一致）
    sites = sorted(df['预测站点'].unique(), key=lambda s: (0 if '.mx' in str(s) else 1, str(s)))

    dims = {}
    for c in dims_order + dims_extra:
        vals = [v for v in sorted(df[c].unique())]
        dims[c] = vals

    # 数值列：空值按 0 处理
    num_cols = METRICS + ['订单销量']
    for c in num_cols:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0.0)

    # 加权版 70%-130% 的预测量：以 SKU（一行=一个预测SKU）为单位，
    # 该 SKU 加权达成率 = 订单销量 / 销售预测(加权)，落在 [70%,130%] 的 SKU 计入其销售预测(加权)
    f1 = df['销售预测(加权)']
    sku_rate = np.where(f1 > 0, df['订单销量'] / f1, np.nan)
    df['f1q'] = np.where((sku_rate >= 0.7) & (sku_rate <= 1.3), f1, 0.0)
    print('70-130% SKU 行数:', int(((sku_rate >= 0.7) & (sku_rate <= 1.3)).sum()), '/', len(df))

    key = ['周首日', '预测站点'] + dims_order + dims_extra

    w_idx = {v: i for i, v in enumerate(weeks)}
    s_idx = {v: i for i, v in enumerate(sites)}
    d_idx = {c: {v: i for i, v in enumerate(dims[c])} for c in dims_order + dims_extra}

    # 为精确去重，给每个 预测SKU 分配全局编号
    skus = sorted(df['预测SKU'].astype(str).unique())
    sku_idx = {s: i for i, s in enumerate(skus)}

    recs = []
    for (w, s, g_, b_, p_, c_, o_, l_, k_), sub in df.groupby(key, dropna=False):
        ids = sorted({sku_idx[str(v)] for v in sub['预测SKU']})
        recs.append([
            w_idx[w], s_idx[s],
            d_idx['业务组'][g_], d_idx['BU'][b_], d_idx['产品组'][p_],
            d_idx['三级分类'][c_], d_idx['业务负责人'][o_],
            r2(sub['订单销量'].sum()),
            r2(sub['销售预测(加权)'].sum()),
            r2(sub['断货清洗-销售预测'].sum()),
            r2(sub['销售预测(M-1)'].sum()),
            r2(sub['销售预测(最新版)'].sum()),
            r2(sub['断货清洗-销售预测(最新版)'].sum()),
            ids,
            int(sub['最早SKU'].nunique()),
            int(len(sub)),
            r2(sub['f1q'].sum()),
            d_idx['国家Listing'][l_],
            d_idx['SKU'][k_],
        ])

    # 周期标签（周：首日 ~ 第 7 天）
    week_meta = []
    for w in weeks:
        d = pd.Timestamp(w)
        end = d + pd.Timedelta(days=6)
        week_meta.append({
            'date': w,
            'end': end.strftime('%Y-%m-%d'),
            'label': f"{d.month}.{d.day}~{end.month}.{end.day}",
            'iso': f"W{int(d.isocalendar().week)}",
            'short': f"{d.month}/{d.day}",
        })

    payload = {
        'source': ' + '.join(os.path.basename(p) for p in SRCS),
        'filter': f'日期 {weeks[0]} ~ {weeks[-1]}（{len(weeks)} 周）｜ 站点 ' + ' / '.join(sites),
        'builtAt': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M'),
        'unit': '周',            # 周期单位：模板所有「周/月」文案与趋势窗口都跟它走
        'unitName': '周报',
        'trendWin': 4,           # 趋势图默认展示最近几个周期
        'periods': week_meta,
        'sites': [{'code': s, 'name': SITE_NAME.get(s, s)} for s in sites],
        'dims': dims,
        'skuN': len(skus),
        'recs': recs,
    }

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

    print('weeks:', weeks)
    print('sites:', sites)
    print('recs:', len(recs))
    for c in dims_order + dims_extra:
        print(' ', c, len(dims[c]))
    print('total 订单销量:', round(sum(r[7] for r in recs), 1))
    print('json bytes:', len(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')))


if __name__ == '__main__':
    main()
