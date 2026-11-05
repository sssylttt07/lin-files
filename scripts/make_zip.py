# -*- coding: utf-8 -*-
"""make_zip.py — 用 UTF-8 文件名打 zip（中文/emoji 文件名跨平台不乱码）

背景：Windows 自带 `tar -a -c` 按 ANSI 码页（GBK）写 zip 文件名且不设 UTF-8 标志位，
在 macOS / Linux 上解压全是乱码。python zipfile 统一写 UTF-8（flag 0x800），全平台正常。

用法：python make_zip.py <源目录> <输出.zip>
产物结构：zip 顶层保留源目录名（与 tar 行为一致）。
"""
import os
import sys
import zipfile


def main():
    if len(sys.argv) != 3:
        print("用法：python make_zip.py <源目录> <输出.zip>", file=sys.stderr)
        return 2
    src = os.path.abspath(sys.argv[1])
    out = os.path.abspath(sys.argv[2])
    if not os.path.isdir(src):
        print(f"源目录不存在：{src}", file=sys.stderr)
        return 2
    top = os.path.basename(src.rstrip("\\/"))
    if os.path.exists(out):
        os.remove(out)
    n = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for root, dirs, files in os.walk(src):
            # 先写目录条目（保住空目录），再写文件
            for d in sorted(dirs):
                p = os.path.join(root, d)
                z.write(p, os.path.relpath(p, os.path.dirname(src)).replace(os.sep, "/") + "/")
                n += 1
            for f in sorted(files):
                p = os.path.join(root, f)
                z.write(p, os.path.relpath(p, os.path.dirname(src)).replace(os.sep, "/"))
                n += 1
    print(f"OK {top} -> {out}（{n} 个条目，UTF-8 文件名）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
