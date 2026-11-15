"""Static checks only: no generator imports, datasets, or output generation."""
import ast
import re
from pathlib import Path

root = Path(__file__).resolve().parent
sources = list(root.rglob("*.py"))
for path in sources:
    text = path.read_text(encoding="utf8")
    tree = ast.parse(text, filename=str(path))
    assert not re.search(r"[A-Za-z]:[/\\](?:Users|Projects)[/\\]", text), path
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            assert node.name not in ("kid", "child"), path
        if isinstance(node, ast.Call):
            name = getattr(node.func, "id", "")
            if name in ("person", "build_human", "export_glb"):
                assert not any(isinstance(a, ast.Constant) and a.value in ("kid", "child") for a in node.args), path
                assert not any(k.arg == "kid" for k in node.keywords), path
        if isinstance(node, ast.Dict):
            assert not any(isinstance(k, ast.Constant) and k.value == "kid" for k in node.keys), path
print(f"Static recovery checks passed: {len(sources)} Python files; no generators executed")
