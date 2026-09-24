from pathlib import Path
import tempfile
import unittest

from scripts.ci.validate_docs import find_broken_links


class ValidateDocsTests(unittest.TestCase):
  def run_validator(self, files: dict[str, str]) -> list[str]:
    with tempfile.TemporaryDirectory() as temp_dir:
      root = Path(temp_dir)
      for relative_path, content in files.items():
        path = root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
      return [item.target for item in find_broken_links(root)]

  def test_valid_relative_link(self) -> None:
    broken = self.run_validator({
      'README.md': '[Docs](docs/guide.md)',
      'docs/guide.md': '# Guide',
    })

    self.assertEqual(broken, [])

  def test_nested_relative_link(self) -> None:
    broken = self.run_validator({
      'README.md': '# Root',
      'docs/guide.md': '[Nested](nested/detail.md)',
      'docs/nested/detail.md': '# Detail',
    })

    self.assertEqual(broken, [])

  def test_broken_link_is_reported(self) -> None:
    broken = self.run_validator({'README.md': '[Missing](docs/missing.md)'})

    self.assertEqual(broken, ['docs/missing.md'])

  def test_anchor_external_and_mailto_links_are_ignored(self) -> None:
    broken = self.run_validator({
      'README.md': '[Anchor](#local)\n[Web](https://example.com)\n[Mail](mailto:test@example.com)'
    })

    self.assertEqual(broken, [])

  def test_code_fenced_fake_link_is_ignored(self) -> None:
    broken = self.run_validator({
      'README.md': '```markdown\n[Fake](missing.md)\n```\n[Real](docs/real.md)',
      'docs/real.md': '# Real',
    })

    self.assertEqual(broken, [])


if __name__ == '__main__':
  unittest.main()
