# -*- coding: utf-8 -*-
"""【月报】把源表聚合成月度看板所需的紧凑 JSON。

与周版 build_data.py 的关系：
  - recs 的行结构（FLD 顺序）与口径完全一致，模板无需区分周/月；
  - 时间轴由「周首日」换成「年月」，payload 里输出 periods（月份）+ unit='月'。

**多源合并**：`SRCS` 是一个列表，按顺序读入，**同一个「年月」以靠后的源为准**。
本轮的用法是保留历史月、只替换最新月：
  - `(20)` 提供 2026-07、2026-08（它在 9 月只统计到 9/19，是部分月，会被覆盖）；
  - `(25)` 提供完整的 2026-09（过滤条件 2026.9.1-9.30），覆盖 (20) 的 9 月。
两个源的列集合完全一致（17 列），因此可以直接纵向拼接。
合并后 months = 2026-07 / 08 / 09 三个月，月报趋势仍是 3 个点。

用法：python build_data_month.py
"""
import json
import math
import os
import numpy as np
import pandas as pd

# 多源合并：按顺序读入，同一个「年月」以靠后的源为准（后面覆盖前面）
SRCS = [
    r'D:/Thinkpad/下载/日明细数据 (20).xlsx',   # 2026-07 / 08（其 9 月只到 9/19，会被下面的源覆盖）
    r'D:/Thinkpad/下载/日明细数据 (25).xlsx',   # 完整 2026-09（9.1-9.30）
    r'D:/Thinkpad/下载/日明细数据 (28).xlsx',   # 2026-10（被后面的 (32) 覆盖）
    r'D:/Thinkpad/下载/日明细数据 (32).xlsx',   # 完整 2026-10（M-1 列与最新版完全相同，被 (35) 整月替换）
    r'D:/Thinkpad/下载/日明细数据 (35).xlsx',   # 完整 2026-10（M-1 列已修复，708 行真差异；被 (39) 整月覆盖）
    r'D:/Thinkpad/下载/日明细数据 (39).xlsx',   # 完整 2026-10（802 行 M-1≠最新版真差异；被下一源整月覆盖）
    r'C:/Users/Thinkpad/Downloads/日明细数据.xlsx',   # 完整 2026-10（订单 112,853，较 (39) 更完整；被 (39) 之后的源覆盖）
    r'E:/ziel浏览器下载/日明细数据 (2).xlsx',   # 2026-11（新月，17列齐全；同时是维度口径最新基准）
]
# 维度口径以「最新源」为准：三级分类 / 产品组 / 业务负责人
# 人员与归属会随时间调整；历史周期也按最新归属统计，避免同一个人被拆成两行
LATEST_ATTR_SRC = [
    r'E:/ziel浏览器下载/日明细数据 (2).xlsx',   # 2026-11 月表（最新）
    r'E:/ziel浏览器下载/日明细数据 (1).xlsx',   # 2026-11-01 周表（最新）
]
LATEST_ATTR_COLS = ['三级分类', '产品组', '业务负责人']
# listing 对应表：列 = 国家 / 最早SKU / 最新国家Listing，用于回填源表中空白的 listing
LISTING_MAP = r'E:/不重要文件/国家listing对应表.xlsx'
OUT = r'E:/WorkBuddy/2026-09-20-13-53-33/build/data_month.json'

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

TIME_COL = '年月'                # 月报的时间列（周报为「周首日」）


def r2(x):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return 0.0
    return round(float(x), 2)


def read_source(path):
    """读一个源表：剔除末行「合计」，把时间列规范成 'YYYY-MM'。"""
    d = pd.read_excel(path, sheet_name=0)
    d = d[d[TIME_COL].astype(str) != '合计'].copy()
    d[TIME_COL] = pd.to_datetime(d[TIME_COL]).dt.strftime('%Y-%m')
    return d


def merge_sources(paths):
    """按顺序合并多个源；同一个「年月」只保留**最后一个**提供它的源的全部行。

    注意不能写成 `drop_duplicates(subset=[年月])` —— 那会把每个月只留一行。
    这里先按「后源优先」算出每个月份的归属源，再整月取该源的数据。
    """
    frames = [read_source(p) for p in paths]
    owner = {}
    for i, d in enumerate(frames):
        for m in d[TIME_COL].unique():
            owner[m] = i                      # 后出现的源覆盖先出现的
    parts = []
    for i, d in enumerate(frames):
        sel = d[d[TIME_COL].map(owner) == i]
        if len(sel):
            ms = sorted(sel[TIME_COL].unique())
            print(f'源 {os.path.basename(paths[i])} → 贡献 {len(ms)} 个月：{", ".join(ms)}（{len(sel)} 行）')
            parts.append(sel)
        else:
            print(f'源 {os.path.basename(paths[i])} → 全部月份都被后面的源覆盖，忽略')
    return pd.concat(parts, ignore_index=True)


def apply_latest_attrs(df):
    """按最新源重建「最早SKU → 三级分类/产品组/业务负责人」映射，并覆盖**所有周期**。

    用户明确要求：这三个维度以最新为准。人员/分类会随时间调整，若历史行保留旧值，
    同一个人会被拆成两行。
    """
    paths = [p for p in LATEST_ATTR_SRC if os.path.exists(p)]
    if not paths:
        print('维度口径（最新源）：未找到基准文件，跳过')
        return df
    frames = []
    for p in paths:
        d = pd.read_excel(p, sheet_name=0)
        if TIME_COL in d.columns:
            d = d[d[TIME_COL].astype(str) != '合计']
        frames.append(d)
    attr = pd.concat(frames, ignore_index=True)
    attr['最早SKU'] = attr['最早SKU'].astype(str).str.strip()
    for c in LATEST_ATTR_COLS:
        if c not in attr.columns or c not in df.columns:
            continue
        sub = attr[['最早SKU', c]].dropna()
        sub = sub[sub[c].astype(str).str.strip() != '']
        if not len(sub):
            continue
        # 同一 SKU 在最新源里若出现多个取值，取出现次数最多的那个
        cnt = sub.groupby(['最早SKU', c]).size().reset_index(name='n')
        cnt = cnt.sort_values(['最早SKU', 'n'], ascending=[True, False]).drop_duplicates('最早SKU')
        mp = dict(zip(cnt['最早SKU'], cnt[c]))
        newv = df['最早SKU'].map(mp)
        mask = newv.notna()
        old = df[c].astype(str).str.strip()
        changed = int((mask & (old != newv.astype(str).str.strip())).sum())
        df.loc[mask, c] = newv[mask]
        print(f'维度口径（最新源）：{c} 覆盖 {int(mask.sum())} 行，其中与原值不同 {changed} 行')
    return df


def main():
    df = merge_sources(SRCS)
    for c in ('最早SKU', '预测SKU'):
        if c in df.columns:
            df[c] = df[c].astype(str).str.strip()

    # ⚠️ pandas 3 起 astype(str) 不再把 NaN 变成 'nan'（NaN 会保留），
    # 源表尾部偶发的空行（无 SKU 无维度、仅 1 件销量）会残留 NaN，
    # 后续 sorted(unique()) 会因 float/str 混排报 TypeError。这类行没有 SKU 身份，直接剔除。
    _n_nosku = int(df['最早SKU'].isna().sum() + df['预测SKU'].isna().sum())
    if _n_nosku:
        print(f'剔除无 SKU 的空行：最早SKU/预测SKU 空值 {_n_nosku} 处')
        df = df[df['最早SKU'].notna() & df['预测SKU'].notna()].copy()

    # —— 统一维度口径（最新源优先）：三级分类 / 产品组 / 业务负责人 ——
    df = apply_latest_attrs(df)

    # 维度列兜底：源表若有缺失，归「（未标注）」而不是丢行，保证各维度合计守恒
    dims_order = ['业务组', 'BU', '产品组', '三级分类', '业务负责人']
    for c in dims_order:
        if c not in df.columns:
            df[c] = '（未标注）'
            print(f'维度补全：源表无「{c}」列 → 全部归「（未标注）」')
        else:
            n = int(df[c].isna().sum())
            if n:
                df[c] = df[c].fillna('（未标注）').astype(str).str.strip()
                print(f'维度补全：{c} 空值 {n} 行 → 归「（未标注）」')

    # 源表可能整列不含 listing，此时整列交给对应表回填
    if '国家Listing' not in df.columns:
        df['国家Listing'] = np.nan
        print('维度补全：源表无「国家Listing」列 → 全部按 (国家, 最早SKU) 查对应表回填')

    # 高基数明细维度：允许空值，空值归入「（未标注）」而不是丢弃
    dims_extra = ['国家Listing', 'SKU']
    df = df.dropna(subset=[TIME_COL, '预测站点'] + dims_order)
    df['国家Listing'] = df['国家Listing'].astype(str).str.strip()
    _lst = df['国家Listing']
    _bad = _lst.isna() | _lst.isin(_NAN_WORDS)

    # —— 回填空缺 listing：按 (国家, 最早SKU) 双键查对应表；只补空值，源表已有的值一律不动 ——
    n_blank = int(_bad.sum())
    n_fill = 0
    if n_blank and os.path.exists(LISTING_MAP):
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
    elif n_blank:
        print('listing 回填：未找到对应表，跳过（', LISTING_MAP, '）')

    df['国家Listing'] = _lst.mask(_bad, '（未标注）')
    # SKU 维度 = 「最早SKU|预测SKU」组合串
    df['SKU'] = (df['最早SKU'].astype(str).str.strip() + '|' + df['预测SKU'].astype(str).str.strip())

    # 时间轴（read_source 已把年月规范成 'YYYY-MM'）
    months = sorted(df[TIME_COL].unique())
    # 站点顺序：墨西哥站在前、巴西站在后（与看板展示顺序一致）
    sites = sorted(df['预测站点'].unique(), key=lambda s: (0 if '.mx' in str(s) else 1, str(s)))

    dims = {}
    for c in dims_order + dims_extra:
        # 归一化：残留 NaN（未补上的 listing 等）先归「（未标注）」再转字符串，
        # 否则 unique() 里 float 与 str 混排会让 sorted() 报 TypeError
        if df[c].isna().any():
            df[c] = df[c].fillna('（未标注）')
        df[c] = df[c].astype(str).str.strip()
        dims[c] = sorted(df[c].unique())

    # 数值列：空值按 0 处理
    num_cols = METRICS + ['订单销量']
    for c in num_cols:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0.0)

    # 加权版 70%-130% 的预测量：以 SKU（一行=该月该站点的一个预测SKU）为单位，
    # 该 SKU 加权达成率 = 订单销量 / 销售预测(加权)，落在 [70%,130%] 的 SKU 计入其销售预测(加权)
    f1 = df['销售预测(加权)']
    sku_rate = np.where(f1 > 0, df['订单销量'] / f1, np.nan)
    df['f1q'] = np.where((sku_rate >= 0.7) & (sku_rate <= 1.3), f1, 0.0)
    print('加权70-130% SKU 行数:', int(((sku_rate >= 0.7) & (sku_rate <= 1.3)).sum()), '/', len(df))

    # 最新版 70%-130% 的预测量：该 SKU M版达成率 = 订单销量 / 销售预测(最新版)，落在 [70%,130%] 的 SKU 计入其预测(最新版)
    f4 = df['销售预测(最新版)']
    m_rate = np.where(f4 > 0, df['订单销量'] / f4, np.nan)
    df['f4q'] = np.where((m_rate >= 0.7) & (m_rate <= 1.3), f4, 0.0)
    print('最新版70-130% SKU 行数:', int(((m_rate >= 0.7) & (m_rate <= 1.3)).sum()), '/', len(df))

    key = [TIME_COL, '预测站点'] + dims_order + dims_extra

    m_idx = {v: i for i, v in enumerate(months)}
    s_idx = {v: i for i, v in enumerate(sites)}
    d_idx = {c: {v: i for i, v in enumerate(dims[c])} for c in dims_order + dims_extra}

    # 为精确去重，给每个 预测SKU 分配全局编号
    skus = sorted(df['预测SKU'].astype(str).unique())
    sku_idx = {s: i for i, s in enumerate(skus)}

    recs = []
    for (m, s, g_, b_, p_, c_, o_, l_, k_), sub in df.groupby(key, dropna=False):
        ids = sorted({sku_idx[str(v)] for v in sub['预测SKU']})
        recs.append([
            m_idx[m], s_idx[s],
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
            r2(sub['f4q'].sum()),
            d_idx['国家Listing'][l_],
            d_idx['SKU'][k_],
        ])

    # 月份标签：date = 该月 1 号，end = 该月月末
    period_meta = []
    for m in months:
        d = pd.Timestamp(m + '-01')
        end = d + pd.offsets.MonthEnd(0)
        period_meta.append({
            'date': d.strftime('%Y-%m-%d'),
            'end': end.strftime('%Y-%m-%d'),
            'label': f"{d.year}年{d.month}月",
            'iso': m,
            'short': f"{d.month}月",
        })

    payload = {
        'source': ' + '.join(os.path.basename(p) for p in SRCS),
        'filter': f'月份 {months[0]} ~ {months[-1]}（{len(months)} 个月）｜ 站点 ' + ' / '.join(sites),
        'builtAt': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M'),
        'unit': '月',
        'unitName': '月报',
        'trendWin': 6,           # 月报趋势默认看最近 6 个月
        'periods': period_meta,
        'sites': [{'code': s, 'name': SITE_NAME.get(s, s)} for s in sites],
        'dims': dims,
        'skuN': len(skus),
        'recs': recs,
    }

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

    print('months:', months)
    print('sites:', sites)
    print('recs:', len(recs))
    for c in dims_order + dims_extra:
        print(' ', c, len(dims[c]))
    print('total 订单销量:', round(sum(r[7] for r in recs), 1))
    print('json bytes:', len(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')))


if __name__ == '__main__':
    main()
