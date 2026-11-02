#!/usr/bin/env python3
"""Gera web/vistas.html (página de comparação das 4 visões) com os atlases embutidos."""
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "views/vistas.src.html").read_text()
uri = lambda n: "data:image/png;base64," + base64.b64encode((root / n).read_bytes()).decode()
out = src.replace("__KANE__", uri("kane_atlas.png")).replace("__TROOPER__", uri("trooper_atlas.png"))
(root / "vistas.html").write_text(out)
print(f"vistas.html: {len(out) // 1024} KB")
