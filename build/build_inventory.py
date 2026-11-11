# -*- coding: utf-8 -*-
"""把「MX&BR冲坑周跟进」表里的 FBA 库存三列抽成 inventory.json，供 Q4 清单使用。

口径（用户 2026-11-11 指定）：
  · 三级分类：sheet「5.三级分类」，国家 = A 列 = MX，key = E 列，值 = BF/BG/BH 列
  · 国家Listing：sheet「6.Listing」，国家 = A 列 = MX，key = G 列，值 = BV/BW/BX 列
    三列依次为：总可销售展示库存 / 7DMS / 可售天数；两张表表头都在第 4 行，数据从第 5 行起。

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

SRC = pathlib.Path(r'E:/ziel浏览器下载/MX&BR冲坑周跟进-W44.xlsx')
COUNTRY = 'MX'
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

    out, stat = {}, {}
    for kind, (sheet, ck, cs, cd, cy) in SHEETS.items():
        ws = wb[sheet]
        agg = {}
        dup = 0
        for r in ws.iter_rows(min_row=HEADER_ROW + 1, max_row=ws.max_row, values_only=True):
            if len(r) < cy:
                continue
            if str(r[0] or '').strip().upper() != COUNTRY:
                continue
            key = str(r[ck - 1] or '').strip()
            if not key:
                continue
            s, d = to_num(r[cs - 1]), to_num(r[cd - 1])
            if key in agg:
                dup += 1
                a = agg[key]
                a[0] += (s or 0)
                a[1] += (d or 0)
            else:
                agg[key] = [s or 0, d or 0]
        # 统一用 库存 ÷ 7DMS 重算可售天数（与源表公式一致；合并项也靠这一步自洽）
        for key, a in agg.items():
            s, d = a[0], a[1]
            if d > 0:
                a.append(round(s / d, 4))
            else:
                a.append('∞' if s > 0 else 0)
        out[kind] = {k: [round(v[0], 4), round(v[1], 4), v[2]] for k, v in agg.items()}
        stat[kind] = (len(agg), dup)

    payload = {
        'builtAt': __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M'),
        'src': SRC.name,
        'tag': tag,
        'asOf': as_of,
        'cat': out['cat'],
        'listing': out['listing'],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for kind, (n, dup) in stat.items():
        print(f'{kind:8s} {n:4d} 项（合并重复 {dup} 行）')
    print('维度更新:', tag, '｜数据日期:', as_of)
    print('written:', OUT, OUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
