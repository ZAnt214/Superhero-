#!/usr/bin/env python3
"""Gera web/kane-teste.html (ficheiro único) a partir de web/src/shell.html,
web/src/game.js e do atlas web/kane_atlas.png (embutido em base64).
Uso: python3 web/build.py"""
import base64, pathlib
root = pathlib.Path(__file__).parent
shell = (root / "src/shell.html").read_text()
game = (root / "src/game.js").read_text()
assert "/*__LEVEL__*/" in game
game = game.replace("/*__LEVEL__*/", (root / "src/arena.js").read_text())   # arena de luta (o mapa de plataformas está em level.js)
def uri(name):
    return '"data:image/png;base64,' + base64.b64encode((root / name).read_bytes()).decode() + '"'
assert "/*__GAME__*/" in shell and '"__ATLAS__"' in game and '"__TROOPER__"' in game
game = game.replace('"__ATLAS__"', uri("kane_atlas.png")).replace('"__TROOPER__"', uri("trooper_atlas.png")).replace('"__KANEFIGHT__"', uri("kane_fight_atlas.png"))
out = shell.replace("/*__GAME__*/", game)
(root / "kane-teste.html").write_text(out)
print(f"kane-teste.html: {len(out) // 1024} KB")
