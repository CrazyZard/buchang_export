"""洗护图标清单维护说明。

所有图标均为 Illustrator 导出的 SVG，放在 src/assets/care-symbols/。
注册表以 index.ts 的 CARE_SYMBOL_DEFINITIONS 为准；更新图标后请同步 manifest.json。

本脚本不再从 PDF 提取 PNG（已废弃），仅用于校验 manifest 与注册表是否一致。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'src/assets/care-symbols/manifest.json'
ASSETS = ROOT / 'src/assets/care-symbols'

EXPECTED = [
    ('handWash', 'hand-wash'),
    ('doNotBleach', 'do-not-bleach'),
    ('lineDryShade', 'line-dry-shade'),
    ('dripFlatDrying', 'drip-flat-drying'),
    ('ironLowTemp', 'iron-low-temp'),
    ('doNotIron', 'do-not-iron'),
    ('doNotDryClean', 'do-not-dry-clean'),
]


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    errors: list[str] = []

    if len(manifest) != len(EXPECTED):
        errors.append(f'manifest 条目数应为 {len(EXPECTED)}，当前 {len(manifest)}')

    for index, (key, name) in enumerate(EXPECTED):
        if index >= len(manifest):
            break
        entry = manifest[index]
        if entry.get('key') != key:
            errors.append(f'第 {index + 1} 项 key 应为 {key!r}，当前 {entry.get("key")!r}')
        if entry.get('name') != name:
            errors.append(f'第 {index + 1} 项 name 应为 {name!r}，当前 {entry.get("name")!r}')
        svg_path = ASSETS / f'{name}.svg'
        if not svg_path.is_file():
            errors.append(f'缺少 SVG 文件: {svg_path.name}')

    if errors:
        print('care-symbols 校验失败:', file=sys.stderr)
        for message in errors:
            print(f'  - {message}', file=sys.stderr)
        sys.exit(1)

    print(f'care-symbols OK: {len(manifest)} 个 SVG 图标')


if __name__ == '__main__':
    main()
