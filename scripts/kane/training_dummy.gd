extends CharacterBody2D
## Boneco de treino: exemplo do contrato take_hit() que os inimigos devem seguir.

@export var max_hp := 200.0
var hp := max_hp
var _flash := 0.0

func _ready() -> void:
	collision_layer = 0b10   # inimigos
	collision_mask = 0b1     # mundo
	hp = max_hp

func take_hit(damage: float, knockback: Vector2, _source: Node) -> void:
	hp -= damage
	velocity += knockback
	_flash = 0.1
	print("Dummy: -%.1f HP (restam %.1f)" % [damage, hp])
	if hp <= 0.0:
		queue_free()

func _physics_process(delta: float) -> void:
	velocity.y = minf(velocity.y + 1400.0 * delta, 900.0)
	velocity.x = move_toward(velocity.x, 0.0, 1200.0 * delta)
	move_and_slide()
	_flash = maxf(_flash - delta, 0.0)
	modulate = Color(3, 3, 3) if _flash > 0.0 else Color.WHITE
