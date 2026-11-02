extends Node2D
## Cena de teste: chão, plataforma, Kane, boneco de treino e HUD.

var _cam: Camera2D

func _ready() -> void:
	_add_block(Vector2(480, 520), Vector2(1400, 40))
	_add_block(Vector2(700, 380), Vector2(200, 20))

	var hud := preload("res://scripts/kane/kane_hud.gd").new()
	add_child(hud)

	var kane := KanePlayer.new()
	kane.name = "Kane"
	kane.collision_layer = 0b100
	kane.collision_mask = 0b1
	kane.position = Vector2(200, 500)
	hud.bind(kane)  # liga antes do _ready do Kane para receber os valores iniciais
	add_child(kane)

	_cam = Camera2D.new()
	kane.add_child(_cam)
	kane.impact.connect(_on_impact)

	var dummy := preload("res://scripts/kane/training_dummy.gd").new()
	dummy.name = "Dummy"
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(32, 100)
	shape.shape = rect
	shape.position = Vector2(0, -50)
	dummy.add_child(shape)
	var vis := ColorRect.new()
	vis.size = rect.size
	vis.position = Vector2(-16, -100)
	vis.color = Color(0.8, 0.6, 0.2)
	dummy.add_child(vis)
	dummy.position = Vector2(320, 500)
	add_child(dummy)

func _process(delta: float) -> void:
	_cam.offset = _cam.offset.lerp(Vector2.ZERO, minf(delta * 20.0, 1.0))

func _on_impact(strength: float) -> void:
	_cam.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * strength * 3.0

func _add_block(center: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 0b1
	body.position = center
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	body.add_child(shape)
	var vis := ColorRect.new()
	vis.size = size
	vis.position = -size / 2
	vis.color = Color(0.18, 0.18, 0.22)
	body.add_child(vis)
	add_child(body)
