class_name KaneSpriteLoader
extends RefCounted
## Constrói um SpriteFrames a partir do JSON do kanepack001 e das sprite sheets.
## Cada sheet é uma tira horizontal de frames 64x128 (lida coluna a coluna).
##
## Animações geradas:
##   "idle"          <- idle sheet
##   "run_flight"    <- run/flight sheet
##   "attack_laser"  <- attack sheet, colunas LASER_COLS
##   "attack_punch"  <- attack sheet, colunas PUNCH_COLS

## Colunas da attack sheet (0-based): 0 = guarda, 1 = braço esticado, 2 = recuo, 3 = regresso.
## A animação "attack_punch" tem 5 frames: guarda, esticado (impacto), esticado
## (follow-through), recuo, regresso. Os FX (explosão, onda de choque) são desenhados em código.
## O laser usa a pose de guarda; o feixe é desenhado pelo KanePlayer.
const LASER_COLS: Array[int] = [0, 0]
const PUNCH_COLS: Array[int] = [0, 1, 1, 2, 3]

var frame_size := Vector2i(224, 144)
var origin := Vector2(112, 140)  # pés do personagem dentro do frame


func build(json_path: String, idle_sheet: Texture2D, run_sheet: Texture2D, attack_sheet: Texture2D) -> SpriteFrames:
	var data := _read_json(json_path)
	var meta: Dictionary = data.get("meta", {})
	var size: Dictionary = meta.get("size", {})
	frame_size = Vector2i(int(size.get("w", 224)), int(size.get("h", 144)))
	var o: Dictionary = meta.get("origin", {})
	# O pack original tem "origin": {"x": 32, "h": 120} — aceitamos "y" ou "h".
	origin = Vector2(float(o.get("x", 112)), float(o.get("y", o.get("h", 140))))

	var anims: Dictionary = data.get("animations", {})
	var idle: Dictionary = anims.get("idle", {})
	var run: Dictionary = anims.get("run_flight", {})
	var attack: Dictionary = anims.get("attack", {})

	var frames := SpriteFrames.new()
	frames.remove_animation(&"default")

	_add_strip(frames, &"idle", _or_placeholder(idle_sheet, 4, Color(0.25, 0.3, 0.45)),
		_count(idle, 4), float(idle.get("fps", 8)), true, [])
	_add_strip(frames, &"run_flight", _or_placeholder(run_sheet, 4, Color(0.3, 0.35, 0.6)),
		_count(run, 4), float(run.get("fps", 12)), true, [])
	var atk := _or_placeholder(attack_sheet, 4, Color(0.7, 0.25, 0.25))
	var atk_fps := float(attack.get("fps", 12))
	_add_strip(frames, &"attack_laser", atk, 0, atk_fps, false, LASER_COLS)
	_add_strip(frames, &"attack_punch", atk, 0, atk_fps, false, PUNCH_COLS)
	return frames


func _add_strip(frames: SpriteFrames, anim: StringName, sheet: Texture2D, count: int,
		fps: float, loop: bool, cols: Array) -> void:
	frames.add_animation(anim)
	frames.set_animation_speed(anim, fps)
	frames.set_animation_loop(anim, loop)
	var available: int = maxi(1, int(sheet.get_width() / float(frame_size.x)))
	var list: Array = cols.duplicate()
	if list.is_empty():
		for i in mini(count, available):
			list.append(i)
	for col in list:
		var atlas := AtlasTexture.new()
		atlas.atlas = sheet
		atlas.region = Rect2(mini(col, available - 1) * frame_size.x, 0, frame_size.x, frame_size.y)
		frames.add_frame(anim, atlas)


func _count(anim: Dictionary, fallback: int) -> int:
	var f: Array = anim.get("frames", [])
	return f.size() if not f.is_empty() else fallback


## Se ainda não tens a arte importada, gera uma sheet sólida para testar o controlo.
func _or_placeholder(tex: Texture2D, cols: int, color: Color) -> Texture2D:
	if tex:
		return tex
	push_warning("KaneSpriteLoader: sheet em falta, a usar placeholder.")
	var img := Image.create(frame_size.x * cols, frame_size.y, false, Image.FORMAT_RGBA8)
	img.fill(color)
	return ImageTexture.create_from_image(img)


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_warning("KaneSpriteLoader: %s não encontrado, a usar valores por defeito." % path)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}
