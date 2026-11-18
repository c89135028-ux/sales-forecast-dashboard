# -*- coding: utf-8 -*-
"""把「MX&BR冲坑周跟进」表里的 FBA 库存三列抽成 inventory.json，供 Q4 清单使用。

口径（用户 2026-11-11 指定 MX，2026-11-18 追加 BR）：
  · 三级分类：sheet「5.三级分类」，按 A 列国家（MX / BR）分别聚合，key = E 列，值 = BF/BG/BH 列
  · 国家Listing：sheet「6.Listing」，按 A 列国家分别聚合，key = G 列，值 = BV/BW/BX 列
    三列依次为：总可销售展示库存 / 7DMS / 可售天数；两张表表头都在第 4 行，数据从第 5 行起。
    输出结构：{cat:{MX:{...},BR:{...}}, catBu:{MX:{...},BR:{...}}, listing:{MX:{...},BR:{...}}}

两个处理约定：
  1. 一个三级分类可能因跨 BU 拆成多行（边桌/床头柜/斗柜/多场景置物架/玄关桌/简易衣柜），
     合并时库存与 7DMS 相加，可售天数用「库存 ÷ 7DMS」重算 —— 天数不能相加。
  2. 可售天数在源表里会出现字符串「∞」（7DMS = 0 但仍有库存），原样保留，前端直接显示 ∞。

用法：python build_inventory.py
"""
import json
import pathlib

import openpyxl

BUILD = pathlib.Path(__file__).resolve().parent
OUT = BUILD / 'inventory.json'

SRC = pathlib.Path(r'E:/ziel浏览器下载/MX&BR冲坑周跟进-W45.xlsx')
COUNTRIES = ('MX', 'BR')
HEADER_ROW = 4

# sheet -> (key 列, 库存列, 7DMS 列, 可售天数列) 均按 1 起算
SHEETS = {
    'cat':     ('5.三级分类', 5, 58, 59, 60),   # E / BF / BG / BH
    'listing': ('6.Listing',  7, 74, 75, 76),   # G / BV / BW / BX
}


def to_num(v):
    if v is None or v == '':
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(',', '')
    if s in ('∞', 'Infinity', '#DIV/0!', '#VALUE!', '-'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)

    tag = None
    ws_meta = wb['5.三级分类']
    head = next(ws_meta.iter_rows(min_row=1, max_row=1, values_only=True))
    if head and head[0]:
        tag = str(head[0]).replace('维度更新：', '').strip()
    as_of = head[2].strftime('%Y-%m-%d') if len(head) > 2 and hasattr(head[2], 'strftime') else None

    out = {'cat': {c: {} for c in COUNTRIES}, 'listing': {c: {} for c in COUNTRIES}}
    out_bu = {c: {} for c in COUNTRIES}
    stat = {}

    for kind, (sheet, ck, cs, cd, cy) in SHEETS.items():
        ws = wb[sheet]
        for country in COUNTRIES:
            agg, agg_bu = {}, {}
            dup = 0
            for r in ws.iter_rows(min_row=HEADER_ROW + 1, max_row=ws.max_row, values_only=True):
                if len(r) < cy:
                    continue
                if str(r[0] or '').strip().upper() != country:
                    continue
                key = str(r[ck - 1] or '').strip()
                if not key:
                    continue
                s_, d_ = to_num(r[cs - 1]), to_num(r[cd - 1])
                if key in agg:
                    dup += 1
                    a = agg[key]
                    a[0] += (s_ or 0)
                    a[1] += (d_ or 0)
                else:
                    agg[key] = [s_ or 0, d_ or 0]
                # 三级分类额外按 (分类, BU) 存一份：Q4 清单按 BU 拆行时，两行各取自己 BU 的库存
                if kind == 'cat':
                    bu = str(r[2] or '').strip()
                    kb = key + '\u0001' + bu
                    b = agg_bu.get(kb)
                    if b:
                        b[0] += (s_ or 0); b[1] += (d_ or 0)
                    else:
                        agg_bu[kb] = [s_ or 0, d_ or 0]

            # 统一用 库存 ÷ 7DMS 重算可售天数（与源表公式一致；合并项也靠这一步自洽）
            def finish(a):
                s_, d_ = a[0], a[1]
                if d_ > 0:
                    a.append(round(s_ / d_, 4))
                else:
                    a.append('∞' if s_ > 0 else 0)
                return [round(a[0], 4), round(a[1], 4), a[2]]

            out[kind][country] = {k: finish(v) for k, v in agg.items()}
            if kind == 'cat':
                out_bu[country] = {k: finish(v) for k, v in agg_bu.items()}
            stat[f'{kind}/{country}'] = (len(agg), dup)

    payload = {
        'builtAt': __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M'),
        'src': SRC.name,
        'tag': tag,
        'asOf': as_of,
        'cat': out['cat'],
        'catBu': out_bu,
        'listing': out['listing'],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for k, (n, dup) in stat.items():
        print(f'{k:14s} {n:4d} 项（合并重复 {dup} 行）')
    for c in COUNTRIES:
        print(f'catBu/{c}     {len(out_bu[c]):4d} 项（按 分类+BU 拆分）')
    print('维度更新:', tag, '｜数据日期:', as_of)
    print('written:', OUT, OUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
