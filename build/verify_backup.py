# -*- coding: utf-8 -*-
"""校验备份：压缩包完整性 + 解压后与快照目录逐一比对 md5 + 与工作区产物比对。

用法：python verify_backup.py 2026-09-23_1748
不传参数时取「备份」目录下最新的快照。
"""
import hashlib
import os
import pathlib
import sys
import tempfile
import zipfile

ROOT = pathlib.Path(r'E:/WorkBuddy/2026-09-20-13-53-33')
BK = ROOT / '备份'


def md5(p):
    return hashlib.md5(pathlib.Path(p).read_bytes()).hexdigest()


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else None
    if not stamp:
        snaps = sorted([d.name for d in BK.iterdir() if d.is_dir()], reverse=True)
        if not snaps:
            print('未找到任何快照目录')
            return
        stamp = snaps[0]
    snap = BK / stamp
    zp = BK / f'销售预测达成看板_{stamp}.zip'
    print('快照:', snap)
    print('压缩包:', zp, '（存在:', zp.exists(), '）')

    if zp.exists():
        z = zipfile.ZipFile(zp)
        print('压缩包内容:')
        for i in z.infolist():
            print('   ', i.filename, i.file_size)
        print('zip 完整性:', 'OK' if z.testzip() is None else 'CORRUPT')

        tmp = pathlib.Path(tempfile.mkdtemp())
        z.extractall(tmp)
        bad, n = [], 0
        for root, _, files in os.walk(tmp):
            for f in files:
                fp = pathlib.Path(root) / f
                rel = fp.relative_to(tmp)
                src = snap / rel
                n += 1
                if not src.exists() or md5(fp) != md5(src):
                    bad.append(str(rel))
        print('解压比对:', n, '个文件 →', 'OK' if not bad else f'不一致 {bad}')

    # 快照与工作区正式产物比对
    pairs = [('销售预测达成看板.html', ROOT / '销售预测达成看板.html')] + [
        (f'build/{f}', ROOT / 'build' / f)
        for f in ('dashboard_template.html', 'build_all.py', 'build_data.py', 'build_data_month.py',
                  'merge_data.py', 'build_html.py', 'test_dashboard.js', 'verify_backup.py',
                  'data.json', 'data_month.json', 'data_all.json')
    ]
    ok = True
    for rel, live in pairs:
        if not live.exists():
            continue
        if not (snap / rel).exists():
            print('快照缺该文件(跳过)：', rel)
            continue
        a, b = md5(snap / rel), md5(live)
        if a != b:
            ok = False
            print('DIFF', rel, a[:12], '≠', b[:12])
    print('快照与工作区一致:', ok)
    print('看板 md5:', md5(snap / '销售预测达成看板.html'))

    # 通用兜底：快照里的每个文件（含 .workbuddy/memory 等项目资料）都与工作区同名路径比一遍。
    # 快照里有、工作区没有的（例如已下线的旧产物）只提示、不算失败。
    swept, extra, bad2 = 0, [], []
    for root, _, files in os.walk(snap):
        for f in files:
            fp = pathlib.Path(root) / f
            rel = fp.relative_to(snap)
            live = ROOT / rel
            if not live.exists():
                extra.append(str(rel))
                continue
            swept += 1
            if md5(fp) != md5(live):
                bad2.append(str(rel))
    if swept:
        print(f'全量比对: {swept} 个文件 →', 'OK' if not bad2 else f'不一致 {bad2}')
    if extra:
        print('仅存在于快照(工作区已移除):', ', '.join(extra))

    # 反向检查：工作区该备份的东西有没有漏进快照。
    # （上面的扫描是「以快照为基准」走的，抓不到"工作区有、快照没有"的文件。）
    IGNORE = {'_composed_err.js'}          # 测试失败时写的调试产物，不入档
    miss = []
    for sub, only_ext in (('', ('.html',)), ('build', None), ('.workbuddy/memory', ('.md',))):
        d = ROOT / sub if sub else ROOT
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if not f.is_file() or f.name in IGNORE:
                continue
            if only_ext and f.suffix.lower() not in only_ext:
                continue
            rel = f.relative_to(ROOT)
            if not (snap / rel).exists():
                miss.append(str(rel))
    print('工作区文件均已入档:', 'OK' if not miss else f'⚠ 漏了 {miss}')


if __name__ == '__main__':
    main()
