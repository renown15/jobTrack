"""
Fix unused exception names in ExceptHandler nodes in a Python file.
This script replaces `except Exception as e:` with `except Exception:` when
`e` is not referenced in the except body. It uses the AST so it's safe
against false positives.

Usage:
    python tools/fix_except_names.py path/to/file.py

It will make a backup at the same path with a `.bak` suffix before writing.
"""
import ast
import sys
from pathlib import Path


def name_used(node: ast.ExceptHandler, name: str) -> bool:
    # Walk the handler body to see if the name is referenced
    for child in ast.walk(node):
        if isinstance(child, ast.Name) and child.id == name:
            return True
    return False


class ExceptNameRemover(ast.NodeTransformer):
    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> ast.ExceptHandler:
        # If the except has a name and it isn't used in the body, drop it
        if node.name and isinstance(node.name, str):
            if not name_used(node, node.name):
                node.name = None
        return self.generic_visit(node)


def process(path: Path) -> int:
    src = path.read_text()
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        print(f"SyntaxError parsing {path}: {e}")
        return 1

    transformer = ExceptNameRemover()
    new_tree = transformer.visit(tree)
    ast.fix_missing_locations(new_tree)

    new_src = ast.unparse(new_tree)

    # Backup and write
    bak = path.with_suffix(path.suffix + ".bak")
    bak.write_text(src)
    path.write_text(new_src)
    print(f"Updated {path}; backup written to {bak}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python tools/fix_except_names.py path/to/file.py")
        sys.exit(2)
    sys.exit(process(Path(sys.argv[1])))
