from pathlib import Path
import subprocess
import sys


FILE = Path("scripts/acceptance/milestone26.py")


def run(cmd, *, check=True, capture=False):
    print("$ " + " ".join(str(x) for x in cmd))

    kwargs = {
        "check": check,
    }

    if capture:
        kwargs.update(
            {
                "text": True,
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
            }
        )

    return subprocess.run(cmd, **kwargs)


def fail(message):
    print(f"\nERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main():
    if not Path(".git").exists():
        fail("Run this from the FreightBridge repository root.")

    branch = run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture=True,
    ).stdout.strip()

    if branch != "main":
        fail(
            f"You are currently on '{branch}'.\n"
            "Run:\n"
            "git switch main\n"
            "git pull origin main"
        )

    # Ignore untracked helper files, but protect tracked work.
    if run(
        ["git", "diff", "--quiet"],
        check=False,
    ).returncode != 0:
        fail(
            "There are tracked unstaged changes. "
            "Review or commit them before running this fixer."
        )

    if run(
        ["git", "diff", "--cached", "--quiet"],
        check=False,
    ).returncode != 0:
        fail(
            "There are already staged changes. "
            "Commit or unstage them first."
        )

    if not FILE.exists():
        fail(f"Missing expected file: {FILE}")

    text = FILE.read_text(encoding="utf-8")

    old = """      page.goto(f'{analyst_ui_base_url.rstrip("/")}/#/learn', wait_until='domcontentloaded')
      expect(page.get_by_test_id('training-home-page')).to_be_visible(timeout=15000)
"""

    new = """      # TrainingHomePage reads progress from localStorage when it renders.
      # Writing localStorage does not itself trigger a React rerender, and
      # navigating to the same hash route is not guaranteed to remount it.
      # Reload so the deployed UI reads the seeded Mission 1 completion.
      page.reload(wait_until='domcontentloaded')
      expect(page.get_by_test_id('training-home-page')).to_be_visible(timeout=15000)
"""

    if new in text:
        print("[SKIP] Progress reload fix is already present.")

    elif old in text:
        text = text.replace(old, new, 1)

        FILE.write_text(
            text,
            encoding="utf-8",
        )

        print(
            "[OK] Replaced same-route goto with a real browser reload."
        )

    else:
        fail(
            "Could not find the expected Milestone 26 acceptance block."
        )

    print("\n--- Syntax check ---")

    run(
        [
            sys.executable,
            "-m",
            "py_compile",
            str(FILE),
        ]
    )

    print("\n--- Milestone 26 acceptance unit tests ---")

    run(
        [
            sys.executable,
            "-m",
            "pytest",
            "scripts/acceptance/tests/test_milestone26.py",
            "-q",
        ]
    )

    print("\n--- Diff check ---")

    run(
        [
            "git",
            "diff",
            "--check",
        ]
    )

    run(
        [
            "git",
            "--no-pager",
            "diff",
            "--",
            str(FILE),
        ]
    )

    print("\n--- Commit ---")

    run(
        [
            "git",
            "add",
            "--",
            str(FILE),
        ]
    )

    run(
        [
            "git",
            "commit",
            "-m",
            "Fix Milestone 26 progress seeding reload",
        ]
    )

    print("\n--- Push main ---")

    run(
        [
            "git",
            "push",
            "origin",
            "main",
        ]
    )

    sha = run(
        [
            "git",
            "rev-parse",
            "HEAD",
        ],
        capture=True,
    ).stdout.strip()

    print("\nSUCCESS")
    print(f"Pushed main commit: {sha}")
    print()
    print(
        "Wait for main CI/Vercel to finish, then rerun "
        "Deployed Acceptance with milestone26."
    )


if __name__ == "__main__":
    main()