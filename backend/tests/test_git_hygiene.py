"""Git hygiene tests to ensure test files are tracked in source control."""

import os
import subprocess

import pytest


def test_no_untracked_test_files():
    """Fail if there are untracked Python test files."""
    try:
        # Get list of untracked files
        result = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            capture_output=True,
            text=True,
            check=True,
        )

        untracked_files = [f for f in result.stdout.strip().split("\n") if f]

        # Filter for Python test files
        untracked_test_files = [
            f
            for f in untracked_files
            if f.startswith("tests/") and os.path.basename(f).startswith("test_") and f.endswith(".py")
        ]

        if untracked_test_files:
            error_msg = (
                "❌ Found untracked test files that should be committed:\n"
                + "\n".join(f"  - {f}" for f in untracked_test_files)
                + f"\nRun: git add {' '.join(untracked_test_files)}"
            )
            pytest.fail(error_msg)

    except subprocess.CalledProcessError as e:
        if "not a git repository" in str(e):
            pytest.skip("Not in a git repository")
        raise


def test_no_unstaged_test_files():
    """Warn if there are modified but unstaged Python test files."""
    try:
        # Get list of modified but unstaged files
        result = subprocess.run(
            ["git", "diff", "--name-only"], capture_output=True, text=True, check=True
        )

        modified_files = [f for f in result.stdout.strip().split("\n") if f]

        # Filter for Python test files
        modified_test_files = [
            f
            for f in modified_files
            if f.startswith("tests/") and os.path.basename(f).startswith("test_") and f.endswith(".py")
        ]

        if modified_test_files:
            warning_msg = (
                "⚠️  Found modified test files that are not staged:\n"
                + "\n".join(f"  - {f}" for f in modified_test_files)
                + f"\nRun: git add {' '.join(modified_test_files)}"
            )
            print(warning_msg)
            # Don't fail, just warn

    except subprocess.CalledProcessError as e:
        if "not a git repository" in str(e):
            pytest.skip("Not in a git repository")
        raise
