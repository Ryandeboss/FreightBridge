from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import sys
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[2]
LINK_PATTERN = re.compile(r'!?\[[^\]]*\]\(([^)]+)\)')
EXTERNAL_SCHEMES = ('http://', 'https://', 'mailto:')


@dataclass(frozen=True)
class BrokenLink:
  source: Path
  target: str
  line_number: int

  def render(self) -> str:
    return f'{self.source}:{self.line_number}: broken link: {self.target}'


def iter_markdown_files(root: Path) -> list[Path]:
  files = [root / 'README.md']
  docs_root = root / 'docs'
  if docs_root.exists():
    files.extend(sorted(docs_root.rglob('*.md')))
  return [path for path in files if path.exists()]


def strip_code_fences(text: str) -> list[tuple[int, str]]:
  in_fence = False
  result: list[tuple[int, str]] = []
  for line_number, line in enumerate(text.splitlines(), start=1):
    if line.lstrip().startswith('```'):
      in_fence = not in_fence
      continue
    if not in_fence:
      result.append((line_number, line))
  return result


def normalize_target(raw_target: str) -> str | None:
  target = raw_target.strip()
  if not target or target.startswith('#') or target.startswith(EXTERNAL_SCHEMES):
    return None
  if target.startswith('<') and target.endswith('>'):
    target = target[1:-1].strip()
  target = target.split('#', 1)[0].split('?', 1)[0].strip()
  if not target:
    return None
  if ':' in target.split('/', 1)[0]:
    return None
  return unquote(target)


def find_broken_links(root: Path = ROOT) -> list[BrokenLink]:
  broken: list[BrokenLink] = []
  for source in iter_markdown_files(root):
    for line_number, line in strip_code_fences(source.read_text(encoding='utf-8')):
      for match in LINK_PATTERN.finditer(line):
        normalized = normalize_target(match.group(1))
        if normalized is None:
          continue
        candidate = (source.parent / normalized).resolve()
        try:
          candidate.relative_to(root.resolve())
        except ValueError:
          broken.append(BrokenLink(source.relative_to(root), match.group(1), line_number))
          continue
        if not candidate.exists():
          broken.append(BrokenLink(source.relative_to(root), match.group(1), line_number))
  return broken


def main() -> int:
  broken = find_broken_links(ROOT)
  if broken:
    print('Broken documentation links found:')
    for item in broken:
      print(f'  {item.render()}')
    return 1
  print('Documentation links OK.')
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
