# Superhero — Kane (kanepack001)

Controlador do jogador para **Godot 4.3+**.

## Ficheiros
| Ficheiro | Função |
|---|---|
| `scripts/kane/kane_player.gd` | `KanePlayer`: movimento, gravidade/voo, laser pelos olhos, soco e soco de energia |
| `scripts/kane/kane_sprite_loader.gd` | Lê `kanepack001.json` e cria o `SpriteFrames` a partir das 3 sheets |
| `scripts/kane/kane_hud.gd` | Barras de HP/FURY (exemplo) |
| `scripts/kane/training_dummy.gd` | Inimigo de exemplo com `take_hit()` |
| `scenes/demo.tscn` | Cena de teste (corre com F5) |
| `web/kane-teste.html` | Versão web com controlos de toque e VFX (gerada: `python3 web/build.py`) |
| `web/src/game.js` | Código do jogo web e motor de VFX (bloom aditivo, partículas, luz dinâmica, câmara) |
| `tools/extract_kane_sprites.py` | Recorta a sheet de referência e gera as sprite sheets |

## Arte
As sheets em `assets/kane/` foram extraídas de `assets/kane/source/kane_sheet_source.jpg`
com `python3 tools/extract_kane_sprites.py` (sem fundo, frames 192×144, pés na origem 96,140):
- `idle_sheet.png`: 4 frames (parado / pairar)
- `run_flight_sheet.png`: 4 frames (deslocação em voo, também usada a correr)
- `attack_sheet.png`: 5 frames (guarda, soco, impacto, onda de choque, regresso). O laser usa a guarda e o feixe é desenhado em código.

O `KanePlayer` já carrega estas sheets por defeito. A colisão é uma cápsula de 28×108.

## Controlos (criados automaticamente se não existirem no Input Map)
| Ação | Teclado | Comando |
|---|---|---|
| Mover | WASD / setas | Stick esquerdo |
| Saltar (no ar: levantar voo) | Espaço | A |
| Ligar/desligar voo | Shift / F | LB |
| Laser (manter; ↑/↓ = diagonal) | J | Y |
| Soco (tocar) / Soco de energia (manter e soltar) | K | X |

No voo, aterras ao tocar no chão com **↓** premido.

## Contrato para inimigos
```gdscript
func take_hit(damage: float, knockback: Vector2, source: Node) -> void
```
O método pode estar no corpo do inimigo ou no pai de uma hurtbox `Area2D`.
Camadas de física: 1 = mundo, 2 = inimigos, 3 = jogador.

## Mecânicas (versão web)
- **Laser por níveis:** quanto mais tempo manténs o laser, mais forte fica. Nível 1 (vermelho) → nível 2 aos 0,9 s (laranja, mais largo, destrói projéteis) → máximo aos 2 s (branco incandescente, relâmpagos, atravessa inimigos e atordoa-os, empurra o Kane para trás). Cada nível gasta mais FURY.
- **Exaustão:** se a FURY chega a zero, o Kane perde as forças, cai se estiver a voar e ajoelha-se. Recupera mais depressa ajoelhado e só se levanta aos 40 de FURY. Abaixo de 25 fica fraco (mais lento, visor a falhar).
- **Soldado de Choque** (`assets/trooper`, `tools/extract_trooper_sprites.py`): patrulha, persegue, ajoelha-se e dispara 3 projéteis com aviso de mira. O soco devolve os projéteis; o soco de energia e o laser máximo atordoam-no. Ao morrer, explode e deixa destroços a fumegar.
