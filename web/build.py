#!/usr/bin/env python3
"""Gera web/kane-teste.html (ficheiro único) a partir de web/src/shell.html,
web/src/game.js e do atlas web/kane_atlas.png (embutido em base64).
Uso: python3 web/build.py"""
import base64, pathlib
root = pathlib.Path(__file__).parent
shell = (root / "src/shell.html").read_text()
game = (root / "src/game.js").read_text()
atlas = "data:image/png;base64," + base64.b64encode((root / "kane_atlas.png").read_bytes()).decode()
assert "/*__GAME__*/" in shell and '"__ATLAS__"' in game
out = shell.replace("/*__GAME__*/", game.replace('"__ATLAS__"', '"' + atlas + '"'))
(root / "kane-teste.html").write_text(out)
print(f"kane-teste.html: {len(out) // 1024} KB")
