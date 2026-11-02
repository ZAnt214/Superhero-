extends CanvasLayer
## HUD simples (HP / FURY). Liga-o ao jogador com bind(player).

var _hp := ProgressBar.new()
var _fury := ProgressBar.new()

func _ready() -> void:
	var box := VBoxContainer.new()
	box.position = Vector2(16, 16)
	add_child(box)
	for pair in [[_hp, "HP", Color(0.2, 0.85, 0.3)], [_fury, "FURY", Color(0.9, 0.15, 0.15)]]:
		var bar: ProgressBar = pair[0]
		bar.custom_minimum_size = Vector2(180, 14)
		bar.show_percentage = false
		var fill := StyleBoxFlat.new()
		fill.bg_color = pair[2]
		bar.add_theme_stylebox_override("fill", fill)
		var row := HBoxContainer.new()
		var lbl := Label.new()
		lbl.text = pair[1]
		lbl.custom_minimum_size.x = 48
		row.add_child(lbl)
		row.add_child(bar)
		box.add_child(row)

func bind(player: KanePlayer) -> void:
	player.hp_changed.connect(_on_hp)
	player.fury_changed.connect(_on_fury)

func _on_hp(current: float, maximum: float) -> void:
	_hp.max_value = maximum
	_hp.value = current

func _on_fury(current: float, maximum: float) -> void:
	_fury.max_value = maximum
	_fury.value = current
