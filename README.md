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
| `web/src/arena.js` | Arena de luta 1 contra 1 (palco, chão em perspetiva, fundos) — é a que o build usa |
| `web/src/level.js` | Mapa de plataformas "Distrito das Cinzas" (versão anterior, não incluída no build) |
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
- **Laser com energia infinita:** a barra LASER mostra a potência do feixe. Enche enquanto disparas (nível 2 aos 0,9 s, máximo aos 2 s, cheia aos 2,9 s) e esvazia em ~1,8 s depois de largar. A largura do feixe segue a barra de forma contínua e a cor muda em cada nível (vermelho → laranja → branco incandescente). Voltar a disparar antes de a barra esvaziar continua da potência que resta.
- **Sobrecarga:** disparar no nível máximo cansa o corpo. Ao largar depois de mais de 0,6 s no máximo, o Kane ajoelha-se para recuperar (0,9 s + 0,35 s por cada segundo no máximo, até 2,4 s). Disparos curtos não o cansam.
- **Pose do laser:** no chão usa a guarda; no ar usa a pose de pairar. O corpo inclina-se com a mira (para cima/baixo).
- **Parado:** frame com os dois pés no chão e respiração (só o tronco mexe).
- **Soldado de Choque** (`assets/trooper`, `tools/extract_trooper_sprites.py`): patrulha, persegue, ajoelha-se e dispara 3 projéteis com aviso de mira. O soco devolve os projéteis; o soco de energia e o laser máximo atordoam-no. Ao morrer, explode e deixa destroços a fumegar.
- **Controlo analógico:** no ecrã tátil, o analógico aparece onde tocas na metade esquerda; empurrar mais = andar/voar mais depressa, e o laser aponta para o ângulo do polegar (até ±60°). Comandos físicos (Gamepad API): stick esquerdo ou D-pad, A salto, X soco, Y ou RT laser, LB/RB voo.
- **Mapa "Distrito das Cinzas"** (5200×1000): rua de partida com carro a arder → praça elevada → viaduto partido → telhados com néon → zona industrial com torre e farol → terra queimada com fendas de lava. Céu com lua e fumo, 3 camadas de prédios em parallax, nevoeiro, cinzas a cair, candeeiros/néon/fogueiras que iluminam o cenário. A câmara segue o Kane também na vertical. Os soldados não caem dos telhados.

## Modo luta (versão web atual)
Kane contra o Soldado de Choque, de lado, como nos jogos de luta: melhor de 3 rondas de 99 s, "ROUND / LUTA! / K.O." com câmara lenta, barras de vida com dano recente, retratos, relógio e contador de golpes.
- **Kane:** fica sempre virado para o adversário; segurar para trás defende (dano reduzido a 15%); salto com direção; DASH (no chão e uma vez no ar); socos encadeiam em combo; soco de energia e laser por níveis atordoam.
- **Soldado:** mantém distância, dispara o canhão com aviso de mira (3 projéteis) ou faz uma investida de ombro com aviso (aguenta golpes leves). Pode ser devolvido o projétil com o soco.
- Câmara enquadra os dois lutadores e aproxima quando estão perto.

### Animações de luta (sheets "Postura de combate")
`tools/extract_kane_fight.py` gera `web/kane_fight_atlas.png` a partir de `assets/kane/source/kane_fight_sheet1/2.jpg`
(escala pela altura em pé e pela distância topo→visor; FX pintados removidos). Usadas em: entrada da ronda, guarda, passada
(5 frames, ao contrário a recuar), agachar (transição), salto (preparação, ar, aterragem), defesa alta e baixa, jab,
soco de energia (pose do especial), soco agachado, rasteira (agachado + segurar soco, derruba), pontapé aéreo (soco no ar)
e vitória. Laser, reação ao golpe e joelhos continuam com os sprites anteriores.
