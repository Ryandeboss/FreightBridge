#!/usr/bin/env python3
from pathlib import Path
import importlib.util
import subprocess
import sys

TARGET = Path("scripts/acceptance/milestone25.py")
COMMIT_MESSAGE = "Fix Milestone 25 replay selector"

OLD_START = """      if page.get_by_test_id('completed-mission-review').count() > 0:
        page.get_by_test_id('replay-mission').click()
"""
NEW_START = """      if page.get_by_test_id('completed-mission-review').count() > 0:
        page.get_by_test_id('completed-mission-review').get_by_test_id('replay-mission').click()
"""

OLD_COMPLETE = "      expect(page.get_by_test_id('replay-mission')).to_be_visible(timeout=15000)\n"

NEW_COMPLETE = """      expect(
        page.get_by_test_id('mission-debrief').get_by_test_id('replay-mission')
      ).to_be_visible(timeout=15000)
"""


def run(cmd, *, check=True, capture=False):
    print("$ " + " ".join(str(x) for x in cmd))
    kwargs = {"check": check}
    if capture:
        kwargs.update({
            "text": True,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
        })
    return subprocess.run(cmd, **kwargs)


def fail(message):
    print(f"\nERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main():
    root = Path.cwd()

    if not (root / ".git").exists():
        fail("Run this script from the root of the FreightBridge Git repository.")

    target = root / TARGET
    if not target.exists():
        fail(f"Could not find {TARGET}")

    staged = run(
        ["git", "diff", "--cached", "--name-only"],
        capture=True,
    ).stdout.splitlines()

    unrelated = [
        x for x in staged
        if x.strip() and x.replace("\\", "/") != TARGET.as_posix()
    ]
    if unrelated:
        fail(
            "There are unrelated staged files:\n  "
            + "\n  ".join(unrelated)
            + "\nUnstage or commit them first, then rerun this script."
        )

    text = target.read_text(encoding="utf-8")
    changed = False

    if NEW_START in text:
        print("[SKIP] Completed-mission replay click is already scoped.")
    elif OLD_START in text:
        text = text.replace(OLD_START, NEW_START, 1)
        changed = True
        print("[OK] Scoped completed-mission replay click.")
    else:
        print("[WARN] Could not find the old completed-mission replay click block.")

    if NEW_COMPLETE in text:
        print("[SKIP] Post-completion replay visibility check is already scoped.")
    elif OLD_COMPLETE in text:
        text = text.replace(OLD_COMPLETE, NEW_COMPLETE, 1)
        changed = True
        print("[OK] Scoped post-completion replay visibility check to mission-debrief.")
    else:
        fail("Could not find the old replay-mission visibility assertion.")

    if changed:
        target.write_text(text, encoding="utf-8")

    verify = target.read_text(encoding="utf-8")
    if NEW_COMPLETE not in verify:
        fail("Verification failed: scoped replay visibility assertion is missing.")

    print("\n--- Diff ---")
    run(["git", "--no-pager", "diff", "--", str(TARGET)])

    print("\n--- Git whitespace check ---")
    run(["git", "diff", "--check"])

    if importlib.util.find_spec("pytest") is not None:
        print("\n--- Milestone 25 acceptance unit tests ---")
        run([
            sys.executable,
            "-m",
            "pytest",
            "scripts/acceptance/tests/test_milestone25.py",
            "-q",
        ])
    else:
        print(
            "\n[WARN] pytest is not installed in this Python environment; "
            "local unit tests were skipped. GitHub CI will run them."
        )

    run(["git", "add", str(TARGET)])

    staged_diff = run(
        ["git", "diff", "--cached", "--quiet", "--", str(TARGET)],
        check=False,
    )
    if staged_diff.returncode == 0:
        print("\nNo new Git changes to commit.")
        return 0

    print("\n--- Commit and push ---")
    run(["git", "commit", "-m", COMMIT_MESSAGE])
    run(["git", "push", "origin", "main"])

    sha = run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip()

    print("\nSUCCESS")
    print("Pushed commit:", sha)
    print("\nNext:")
    print("1. Wait for normal CI to pass.")
    print("2. Rerun Deployed Acceptance with milestone25.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
