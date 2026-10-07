# -*- coding: utf-8 -*-
"""把各粒度的 data*.json 合并成单文件看板用的 data_all.json。

结构：{"builtAt": "...", "modes": [ {…周报数据…, "key":"week", "name":"周"}, {…月报数据…, "key":"month", "name":"月"} ]}
模板只认 DB.modes，每个 mode 的字段与单期数据完全一致 —— 加「季报」只需在下面加一条。

用法：python merge_data.py
"""
import json
import pathlib
import pandas as pd

BUILD = pathlib.Path(__file__).resolve().parent
OUT = BUILD / 'data_all.json'

# (key, 芯片显示名, 数据文件) —— 顺序即芯片顺序，第一条是默认粒度
MODES = [
    ('week',  '周', 'data.json'),
    ('month', '月', 'data_month.json'),
]


def main():
    modes = []
    for key, name, fn in MODES:
        p = BUILD / fn
        if not p.exists():
            print('跳过（缺少）:', fn)
            continue
        d = json.loads(p.read_text(encoding='utf-8'))
        d['key'] = key
        d['name'] = name
        modes.append(d)
        print(f'{key:5s} ← {fn:20s} 周期 {len(d["periods"])} 个｜明细 {len(d["recs"])} 条｜单位 {d["unit"]}')

    payload = {
        'builtAt': pd.Timestamp.now().strftime('%Y-%m-%d %H:%M'),
        'modes': modes,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('written:', OUT, OUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
