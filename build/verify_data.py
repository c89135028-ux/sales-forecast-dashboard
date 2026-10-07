# -*- coding: utf-8 -*-
"""换数据源后的独立硬校验（不依赖构建逻辑，纯粹「源表 ↔ data*.json」对账）。

用法：
    python verify_data.py            # 周报 + 月报 都校验（默认）
    python verify_data.py --week     # 只校验周报
    python verify_data.py --month    # 只校验月报

源表路径与合并方式都从构建脚本里解析，避免两处维护：
    周报 → `build_data.py` 的 `SRCS`（多源滚动：历史周保留 + 新周追加）
    月报 → `build_data_month.py` 的 `SRCS`（多源列表，同一个「年月」以靠后的源为准）

校验项（任一失败即以非 0 退出）：
    1) recs 按 (周期,站点) 汇总 == 源表按 (时间列,预测站点) 汇总（逐指标，容差 = 舍入噪声）
    2) 每个维度各分组求和 == 总量（守恒，说明没有丢行 / 重复计数）
    3) recs 行数 == 源表有效行数（剔除末行「合计」后）；listing 回填覆盖率
    4) 周期元信息自洽（周：末日晚 6 天 / iso 周号 / 周首日为周日；月：月初~月末 / iso=YYYY-MM）
    5) 站点集合一致

recs 结构（周/月一致）：
    [0]周期 [1]站点 [2]业务组 [3]BU [4]产品组 [5]三级分类 [6]业务负责人
    [7]订单销量 [8]加权 [9]断货清洗加权 [10]M-1 [11]最新版 [12]断货清洗最新版
    [13]预测SKU编号 [14]最早SKU数 [15]行数 [16]f1q [17]国家Listing [18]SKU
"""
import datetime as dt
import json
import os
import re
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
NAN_WORDS = {'', 'nan', 'None', 'NaN', 'NaT'}

MET = {
    '订单销量': (7, '订单销量'),
    '销售预测(加权)': (8, '销售预测(加权)'),
    '断货清洗-销售预测': (9, '断货清洗-销售预测'),
    '销售预测(M-1)': (10, '销售预测(M-1)'),
    '销售预测(最新版)': (11, '销售预测(最新版)'),
    '断货清洗-销售预测(最新版)': (12, '断货清洗-销售预测(最新版)'),
}
DIMS = {'业务组': 2, 'BU': 3, '产品组': 4, '三级分类': 5, '业务负责人': 6, '国家Listing': 17, 'SKU': 18}

MODES = {
    'week': dict(label='周报', build='build_data.py', json='data.json',
                 time_col='周首日', unit='周', multi=True),
    'month': dict(label='月报', build='build_data_month.py', json='data_month.json',
                  time_col='年月', unit='月', multi=True),
}


def parse_sources(build_file, multi):
    """从构建脚本解析源表路径（build_data.py 的 SRC / build_data_month.py 的 SRCS）。"""
    txt = open(os.path.join(HERE, build_file), encoding='utf-8').read()
    if multi:
        m = re.search(r'^SRCS\s*=\s*\[(.*?)\]', txt, re.M | re.S)
        if not m:
            raise SystemExit(f'无法从 {build_file} 解析 SRCS')
        return re.findall(r"r?['\"](.+?)['\"]", m.group(1))
    m = re.search(r"^SRC\s*=\s*r?['\"](.+?)['\"]", txt, re.M)
    if not m:
        raise SystemExit(f'无法从 {build_file} 解析 SRC')
    return [m.group(1)]


def read_source(path, tcol):
    d = pd.read_excel(path, sheet_name='日明细数据')
    raw_n = len(d)
    d = d[d[tcol].astype(str) != '合计'].copy()
    d[tcol] = pd.to_datetime(d[tcol]).dt.strftime('%Y-%m' if tcol == '年月' else '%Y-%m-%d')
    return d, raw_n


def merge_sources(paths, tcol):
    """与 build_data_month.py 同规则但不共用代码：同一个「年月」以靠后的源为准，整月替换。"""
    frames = [read_source(p, tcol)[0] for p in paths]
    owner = {}
    for i, d in enumerate(frames):
        for m in d[tcol].unique():
            owner[m] = i
    parts, origin = [], {}
    for i, d in enumerate(frames):
        sel = d[d[tcol].map(owner) == i]
        if len(sel):
            parts.append(sel)
            for m in sel[tcol].unique():
                origin[m] = os.path.basename(paths[i])
    return pd.concat(parts, ignore_index=True), origin


def check_mode(key):
    cfg = MODES[key]
    dj = os.path.join(HERE, cfg['json'])
    paths = parse_sources(cfg['build'], cfg['multi'])
    tcol, unit = cfg['time_col'], cfg['unit']
    print('=' * 82)
    print(f"【{cfg['label']}】{cfg['json']}")
    for p in paths:
        print(f'  源表 {os.path.basename(p)}')
    if not os.path.exists(dj):
        print(f'  ⚠ 找不到 {dj}，跳过')
        return []
    d = json.load(open(dj, encoding='utf-8'))
    recs, PER, SIT = d['recs'], d['periods'], d['sites']

    if len(paths) == 1:
        df, raw_n = read_source(paths[0], tcol)
        origin = {m: os.path.basename(paths[0]) for m in df[tcol].unique()}
    else:
        df, origin = merge_sources(paths, tcol)
        raw_n = sum(read_source(p, tcol)[1] for p in paths)
    print(f"  源表行 {raw_n} → 合并后 {len(df)}｜ json 明细 {len(recs)}｜ 周期 {len(PER)} {unit}")
    print(f"  月份/周期来源：" + '；'.join(f'{m}←{s}' for m, s in sorted(origin.items())))
    print()

    fails = []

    # ---- 1) (周期,站点) 单元级对账 ----
    print('[1] 按 (周期,站点) 汇总对账')
    for label, (ci, col) in MET.items():
        s = df.groupby([tcol, '预测站点'])[col].apply(
            lambda x: pd.to_numeric(x, errors='coerce').fillna(0).sum())
        rj = {}
        for r in recs:
            k = (PER[r[0]]['iso'] if unit == '月' else PER[r[0]]['date'], SIT[r[1]]['code'])
            rj[k] = rj.get(k, 0) + r[ci]
        keys = set(s.index) | set(rj)
        mx = max(abs(s.get(k, 0) - rj.get(k, 0)) for k in keys) if keys else 0.0
        ok = mx <= 1.0                       # 每行 round(2) 的累积舍入
        if not ok:
            fails.append(f'{label} 单元差 {mx:.2f}')
        print(f'  {label:<24} 源表 {s.sum():>14,.2f}  json {sum(rj.values()):>14,.2f}  最大单元差 {mx:>8.2f}  {"OK" if ok else "FAIL"}')

    # ---- 2) 维度守恒 ----
    print()
    print('[2] 维度分组守恒（各分组订单销量之和 == 总量）')
    tot = sum(r[7] for r in recs)
    print(f'  总量 = {tot:,.2f}')
    for dim, ci in DIMS.items():
        g = {}
        for r in recs:
            g[r[ci]] = g.get(r[ci], 0) + r[7]
        v = sum(g.values())
        ok = abs(v - tot) < 1e-6
        if not ok:
            fails.append(f'{dim} 不守恒 {v} != {tot}')
        print(f'  {dim:<12} 组数 {len(g):>5}  求和 {v:>14,.2f}  {"OK" if ok else "FAIL"}')

    # ---- 3) 行数 / listing 回填 ----
    print()
    print('[3] 行数与 listing 回填')
    if len(recs) != len(df):
        fails.append(f'明细行数不一致 {len(recs)} != {len(df)}')
    lst = df['国家Listing']
    blank = int((lst.isna() | lst.astype(str).str.strip().isin(NAN_WORDS)).sum())
    unmarked = sum(1 for r in recs if d['dims']['国家Listing'][r[17]] == '（未标注）')
    print(f'  明细行数 {"OK" if len(recs) == len(df) else "FAIL"}（json {len(recs)} = 源表 {len(df)}）')
    print(f'  源表 listing 空 {blank} 行 → json「（未标注）」{unmarked} 行（应 ≤ 空行数）')
    if unmarked > blank:
        fails.append(f'「（未标注）」{unmarked} 行 > 源表空行 {blank} 行')
    f1q = sum(r[16] for r in recs)
    f1 = sum(r[8] for r in recs)
    print(f'  加权70-130%预测量 {f1q:,.2f} / 加权预测 {f1:,.2f} = {f1q / f1 * 100 if f1 else 0:.2f}%')

    # ---- 4) 周期元信息 ----
    print()
    print('[4] 周期元信息')
    for p in PER:
        if unit == '月':
            dd, ee = dt.date.fromisoformat(p['date']), dt.date.fromisoformat(p['end'])
            c1 = p['iso'] == dd.strftime('%Y-%m')
            c2 = dd.day == 1 and ee == (dt.date(dd.year + (dd.month == 12), dd.month % 12 + 1, 1) - dt.timedelta(days=1))
            if not (c1 and c2):
                fails.append(f"周期 {p['date']} 元信息异常")
            print(f"  {p['date']} ~ {p['end']}  label={p['label']:<10} short={p['short']:<5}"
                  f" iso={p['iso']:<8} 月初对={dd.day == 1} 月末对={c2} iso对={c1}")
        else:
            dd, ee = dt.date.fromisoformat(p['date']), dt.date.fromisoformat(p['end'])
            c1 = p['iso'] == f"W{dd.isocalendar()[1]}"
            c2 = (ee - dd).days == 6
            c3 = dd.weekday() == 6
            if not (c1 and c2 and c3):
                fails.append(f"周期 {p['date']} 元信息异常")
            print(f"  {p['date']}({'一二三四五六日'[dd.weekday()]}) ~ {p['end']}  label={p['label']:<12}"
                  f" short={p['short']:<6} iso={p['iso']:<4} 末日晚6天={c2} 周号对={c1} 周日={c3}")

    # ---- 5) 站点集合 ----
    print()
    print('[5] 站点集合')
    ss, ds_ = set(df['预测站点'].unique()), {s['code'] for s in SIT}
    ok = ss == ds_
    if not ok:
        fails.append(f'站点不一致 源表{ss} json{ds_}')
    print(f'  源表 {sorted(ss)}  json {sorted(ds_)}  {"OK" if ok else "FAIL"}')

    print()
    if fails:
        print(f"【{cfg['label']}】校验失败：")
        for f in fails:
            print('  -', f)
    return fails


def main():
    args = [a for a in sys.argv[1:]]
    keys = ['week', 'month']
    if '--week' in args:
        keys = ['week']
    elif '--month' in args:
        keys = ['month']
    all_fails = []
    for k in keys:
        all_fails += check_mode(k)
    print()
    if all_fails:
        print('ALL CHECKS FAILED：', '；'.join(all_fails))
        raise SystemExit(1)
    print('ALL CHECKS PASSED')


if __name__ == '__main__':
    main()
