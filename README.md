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

## Integrar a arte
1. Exporta do Aseprite 3 PNG em tira horizontal, com frames de 64×128:
   `idle_sheet.png` (6 frames), `run_flight_sheet.png` (4), `attack_sheet.png` (4).
2. Põe os PNG em `assets/kane/` e arrasta-os para os exports **Idle/Run Flight/Attack Sheet** do `KanePlayer`.
   Sem as sheets, o script usa retângulos de cor para poderes testar o controlo.
3. A origem (32,120) fica nos pés. A colisão é uma cápsula de 28×108.

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
