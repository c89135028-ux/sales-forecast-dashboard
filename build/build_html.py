# -*- coding: utf-8 -*-
"""把 data.json 注入模板，输出最终看板 HTML。

用法：
  python build_html.py                                  # 默认：data_all.json（周+月多粒度）→ 销售预测达成看板.html
  python build_html.py data_month.json 月报.html         # 单粒度版（一般用不到，便于排查）
"""
import pathlib
import sys

BASE = pathlib.Path(r'E:/WorkBuddy/2026-09-20-13-53-33')
BUILD = BASE / 'build'

data_name = sys.argv[1] if len(sys.argv) > 1 else 'data_all.json'
out_name = sys.argv[2] if len(sys.argv) > 2 else '销售预测达成看板.html'

tpl = (BUILD / 'dashboard_template.html').read_text(encoding='utf-8')
data = (BUILD / data_name).read_text(encoding='utf-8')

out = tpl.replace('__DATA__', data)
target = BASE / out_name
target.write_text(out, encoding='utf-8')
print('written:', target)
print('bytes:', target.stat().st_size)
print('placeholder left:', '__DATA__' in out)
