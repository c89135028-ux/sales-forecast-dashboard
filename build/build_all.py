# -*- coding: utf-8 -*-
"""一键重建整块看板：周报数据 → 月报数据 → 合并 → 注入模板。

用法：python build_all.py
改数据源时改 build_data.py 的 SRC / build_data_month.py 的 SRCS 列表即可；只想重建其中一步就单独跑那个脚本。
（月报的 SRCS 是按顺序合并的多源，同一个「年月」以靠后的源为准，可用来「保留历史月 + 替换最新月」。）
加新粒度（如季报）：写一个 build_data_quarter.py 输出 data_quarter.json，在 merge_data.py 的 MODES 里加一行。
"""
import pathlib
import subprocess
import sys

BUILD = pathlib.Path(__file__).resolve().parent
PY = sys.executable

STEPS = [
    ('周报数据  build_data.py',       ['build_data.py']),
    ('月报数据  build_data_month.py', ['build_data_month.py']),
    ('合并      merge_data.py',       ['merge_data.py']),
    ('生成看板  build_html.py',       ['build_html.py']),
]


def main():
    for title, args in STEPS:
        print('=' * 8, title, '=' * 8)
        r = subprocess.run([PY, str(BUILD / args[0]), *args[1:]], cwd=str(BUILD))
        if r.returncode != 0:
            raise SystemExit(f'步骤失败：{title}（退出码 {r.returncode}）')


if __name__ == '__main__':
    main()
