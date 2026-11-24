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
    r'E:/ziel浏览器下载/日明细数据 (6).xlsx',   # 2026-11（11.1-11.15，整月覆盖上一源）
    r'E:/ziel浏览器下载/日明细数据 (8).xlsx',   # 2026-11（11.1-11.21，整月覆盖上一源）
]
# 维度口径以「最新源」为准：BU / 三级分类 / 产品组 / 业务组 / 业务负责人
# 用户 11-17：这五项基础信息「以我给你的表为准，表里都是最新最准确的」。
# 属性可能**按站点不同**（实测 32 个 SKU 的负责人是巴西=蓝晓琳 / 墨西哥=吴珍妮），
# 映射键必须 (最早SKU, 预测站点)，只按 SKU 会把两个负责人合并。
LATEST_ATTR_SRC = [
    r'E:/ziel浏览器下载/日明细数据 (8).xlsx',   # 2026-11 月表（11.1-11.21，最新）
    r'E:/ziel浏览器下载/日明细数据 (9).xlsx',   # 2026-11-15 周表（最新）
]
LATEST_ATTR_COLS = ['BU', '三级分类', '产品组', '业务组', '业务负责人']
# 业务组 ↔ BU 归属表（用户 2026-11-10 给定）——**仅作兜底**：源表业务组为空时才用
BU_GROUP = {
    '衣物收纳BU': '拉美收纳宠户组',
    '宠物用品BU': '拉美收纳宠户组',
    '户外休闲BU': '拉美收纳宠户组',
    '厨卫&寝具BU': '拉美家具桌椅组',
    '家具BU':     '拉美家具桌椅组',
    '装饰&桌椅BU': '拉美家具桌椅组',
}
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
    """按最新源重建「(最早SKU, 预测站点) → BU/三级分类/产品组/业务组/业务负责人」映射，覆盖**所有周期**。

    用户 11-17：这五项一律以源表为准；一个三级分类若分属两个 BU / 产品组 / 业务组 / 负责人，
    也照表里写的来（不做人为归一、不强行合并）。
    键必须带「预测站点」：实测 32 个 SKU 的负责人按站点不同（巴西=蓝晓琳 / 墨西哥=吴珍妮），
    只按 SKU 取众数会把两个人合成一个。站点级查不到的退回 SKU 级兜底。
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
    if '预测站点' in attr.columns:
        attr['预测站点'] = attr['预测站点'].astype(str).str.strip()
    has_site = '预测站点' in attr.columns and '预测站点' in df.columns
    df_site = df['预测站点'].astype(str).str.strip() if has_site else None

    for c in LATEST_ATTR_COLS:
        if c not in attr.columns or c not in df.columns:
            continue
        sub = attr[['最早SKU', '预测站点', c]].dropna() if has_site else attr[['最早SKU', c]].dropna()
        sub = sub[sub[c].astype(str).str.strip() != '']
        if not len(sub):
            continue
        n_pair = 0
        if has_site:
            cnt = sub.groupby(['最早SKU', '预测站点', c]).size().reset_index(name='n')
            cnt = cnt.sort_values(['最早SKU', '预测站点', 'n'],
                                  ascending=[True, True, False]).drop_duplicates(['最早SKU', '预测站点'])
            pair = dict(zip(zip(cnt['最早SKU'], cnt['预测站点']), cnt[c]))
            newv = pd.Series([pair.get((s, t)) for s, t in zip(df['最早SKU'], df_site)],
                             index=df.index, dtype=object)
            n_pair = int(newv.notna().sum())
        else:
            newv = pd.Series([None] * len(df), index=df.index, dtype=object)
        # 站点级没查到的退回 SKU 级兜底，只对「全站点同值」的 SKU 生效：
        # 若该 SKU 按站点有两个负责人，借另一个站点的人来兜底等于把两站点又合并了。
        miss = newv.isna()
        n_sku = 0
        if miss.any():
            nun = sub.groupby('最早SKU')[c].nunique()
            single = set(nun[nun == 1].index)
            cnt2 = sub.groupby(['最早SKU', c]).size().reset_index(name='n')
            cnt2 = cnt2[cnt2['最早SKU'].isin(single)]
            cnt2 = cnt2.sort_values(['最早SKU', 'n'], ascending=[True, False]).drop_duplicates('最早SKU')
            mp2 = dict(zip(cnt2['最早SKU'], cnt2[c]))
            fill = df.loc[miss, '最早SKU'].map(mp2)
            n_sku = int(fill.notna().sum())
            newv.loc[miss] = fill
        mask = newv.notna()
        old = df[c].astype(str).str.strip()
        changed = int((mask & (old != newv.astype(str).str.strip())).sum())
        df.loc[mask, c] = newv[mask]
        print(f'维度口径（最新源）：{c} 覆盖 {int(mask.sum())} 行'
              f'（(SKU,站点) 命中 {n_pair} / SKU 兜底 {n_sku}），其中与原值不同 {changed} 行')
    return df


def apply_bu_group(df):
    """业务组兜底：**只补空值**，不覆盖源表已有值（用户 11-17：表里写的为准）。"""
    if 'BU' not in df.columns or '业务组' not in df.columns:
        return df
    bu = df['BU'].astype(str).str.strip()
    cur = df['业务组'].astype(str).str.strip()
    blank = cur.isin(['', '（未标注）', 'nan', 'None', 'NaN'])
    if not blank.any():
        print('业务组归类：源表业务组均已填写，按源表原值（不覆盖）')
        return df
    newv = bu.map(BU_GROUP)
    unknown = sorted(set(bu[blank & newv.isna()].unique()))
    if unknown:
        print(f'业务组归类：未登记的 BU {unknown} → 保持源表原值（请补充到 BU_GROUP）')
    mask = blank & newv.notna()
    df.loc[mask, '业务组'] = newv[mask]
    print(f'业务组归类：源表空白 {int(blank.sum())} 行，按归属表兜底 {int(mask.sum())} 行')
    return df


def unify_attr_history(df, time_col):
    """最新表里已没有该 SKU（停产/换型号）时，用它最后一次出现周期的归属统一全部历史。

    用户 11-17：历史与最新不一致就改成最新的。停产 SKU 查不到最新值，
    「最后出现时表里怎么写」就是最新可得信息；统一后一个 SKU（同一站点）只有一个归属。
    """
    key = ['最早SKU', '预测站点']
    if not set(key).issubset(df.columns) or time_col not in df.columns:
        return df
    for c in LATEST_ATTR_COLS:
        if c not in df.columns:
            continue
        s = df[[*key, time_col, c]].copy()
        s[c] = s[c].astype(str).str.strip()
        var = s.groupby(key)[c].transform('nunique')
        n_var = int((var > 1).sum())
        if not n_var:
            print(f'历史归属统一：{c} 无跨期冲突')
            continue
        last = s.sort_values(time_col).drop_duplicates(key, keep='last').set_index(key)[c]
        mi = pd.MultiIndex.from_arrays([df['最早SKU'], df['预测站点']])
        newv = pd.Series(last.reindex(mi).values, index=df.index)
        mask = newv.notna()
        changed = int((mask & (df[c].astype(str).str.strip() != newv)).sum())
        df.loc[mask, c] = newv[mask]
        print(f'历史归属统一：{c} {n_var} 行曾跨期不一致 → 按最后出现周期统一，改写 {changed} 行')
    return df


# 停产 SKU 负责人归属的查找键（用户 11-24：只给「站点 + 三级分类」）
ORPHAN_OWN_KEY = ['三级分类', 'BU', '预测站点']


def reassign_orphan_owner(df):
    """停产 SKU（最新表里已没有）的负责人：按 (三级分类, BU, 预测站点) 归属到最新负责人。

    用户 11-24：「全周期还残留 李灌蒿 / 蓝晓琳 …… 按照站点和三级分类，归属到最新负责人」——
    这批 SKU 新旧表都查不到（早已停产），保留历史值不合理，改为按它所属的
    **三级分类 + 站点** 去最新表里找当前负责人。

    ⚠️ 键必须带 BU：单用 (三级分类, 站点) 有 6 组跨 BU 冲突（本期跨 BU 的
    边桌 / 床头柜 / 斗柜 / 玄关桌 / 简易衣柜），带上 BU 后每组唯一（实测 0 冲突）。

    取值规则：该键下最新表 Σ销售预测(加权) 最大的负责人。最新表里连该
    (分类, BU, 站点) 都没有的组合，保留原值。
    """
    paths = [p for p in LATEST_ATTR_SRC if os.path.exists(p)]
    if not paths:
        print('停产 SKU 负责人归属：未找到最新基准文件，跳过')
        return df
    need = [*ORPHAN_OWN_KEY, '最早SKU', '业务负责人']
    if not set(need).issubset(df.columns):
        return df

    frames = []
    for p in paths:
        d = pd.read_excel(p, sheet_name=0)
        d = d[d.iloc[:, 0].astype(str) != '合计']
        frames.append(d)
    attr = pd.concat(frames, ignore_index=True)
    for c in [*ORPHAN_OWN_KEY, '最早SKU', '业务负责人']:
        attr[c] = attr[c].astype(str).str.strip()
    attr = attr[(attr['三级分类'] != '') & (attr['BU'] != '') & (attr['业务负责人'] != '')]
    if not len(attr):
        return df
    wcol = '销售预测(加权)'
    attr['_w'] = (pd.to_numeric(attr[wcol], errors='coerce').fillna(0.0)
                  if wcol in attr.columns else 0.0)

    known = set(zip(attr['最早SKU'], attr['预测站点']))

    g = attr.groupby([*ORPHAN_OWN_KEY, '业务负责人'])['_w'].sum().reset_index(name='w')
    g = g.sort_values([*ORPHAN_OWN_KEY, 'w', '业务负责人'],
                      ascending=[True, True, True, False, True])
    top = g.drop_duplicates(ORPHAN_OWN_KEY)
    mp = dict(zip(zip(top['三级分类'], top['BU'], top['预测站点']), top['业务负责人']))

    is_orphan = pd.Series([k not in known for k in zip(df['最早SKU'], df['预测站点'])],
                          index=df.index)
    if not is_orphan.any():
        print('停产 SKU 负责人归属：无停产 SKU，跳过')
        return df
    newv = pd.Series([mp.get((str(a).strip(), str(b).strip(), str(c).strip()))
                      for a, b, c in zip(df['三级分类'], df['BU'], df['预测站点'])],
                     index=df.index)
    mask = is_orphan & newv.notna()
    old = df['业务负责人'].astype(str).str.strip()
    changed = int((mask & (old != newv.astype(str).str.strip())).sum())
    df.loc[mask, '业务负责人'] = newv[mask]
    n_miss = int((is_orphan & newv.isna()).sum())
    print(f'停产 SKU 负责人归属：停产 {int(is_orphan.sum())} 行 → 按'
          f'({"/".join(ORPHAN_OWN_KEY)}) 归属 {int(mask.sum())} 行（改写 {changed} 行）；'
          f'最新表也查不到、保留原值 {n_miss} 行')
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
    # —— 业务组 ⊂ BU 的父子关系校正（防源表把某 BU 的行写成别的业务组）——
    df = apply_bu_group(df)
    # —— 停产品 SKU（最新表里已没有）：按最后出现周期的归属统一历史 ——
    df = unify_attr_history(df, TIME_COL)
    # —— 停产 SKU 的负责人：按 (三级分类, BU, 预测站点) 归属到最新负责人（用户 11-24）——
    df = reassign_orphan_owner(df)

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
