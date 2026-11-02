class_name KanePlayer
extends CharacterBody2D
## Controlador do jogador Kane (kanepack001) para Godot 4.x.
##
## Locomoção: corrida, salto (coyote time + jump buffer + salto variável),
##            gravidade, e VOO livre em 8 direções.
## Ações:     LASER pelos olhos (manter premido, gasta FURY, hitscan)
##            SOCO (toque) / SOCO DE ENERGIA (manter, carregar e soltar; gasta FURY)
##
## Drop-in: os nós filhos (sprite, colisão, raycast, feixe) são criados em
## código, e as ações de input são registadas se ainda não existirem.
## Os inimigos só precisam de implementar:
##     func take_hit(damage: float, knockback: Vector2, source: Node) -> void

signal hp_changed(current: float, maximum: float)
signal fury_changed(current: float, maximum: float)
signal impact(strength: float)  # liga à câmara para screen shake
signal died

enum Action { NONE, PUNCH_CHARGE, PUNCH, LASER }

# ---------------------------------------------------------------- exports
@export_group("Assets")
@export_file("*.json") var pack_json := "res://assets/kane/kanepack001.json"
@export var idle_sheet: Texture2D
@export var run_flight_sheet: Texture2D
@export var attack_sheet: Texture2D

@export_group("Stats")
@export var max_hp := 100.0
@export var max_fury := 100.0
@export var fury_regen := 8.0           ## por segundo, quando não usa laser
@export var invuln_time := 0.6

@export_group("Movement")
@export var run_speed := 220.0
@export var ground_accel := 1800.0
@export var ground_friction := 2400.0
@export var air_accel := 1100.0
@export var gravity := 1400.0
@export var fall_gravity_mult := 1.5
@export var max_fall_speed := 900.0
@export var jump_velocity := -480.0
@export_range(0.0, 1.0) var jump_cut := 0.45  ## soltar salto cedo = salto mais baixo
@export var coyote_time := 0.1
@export var jump_buffer_time := 0.12

@export_group("Flight")
@export var flight_speed := 320.0
@export var flight_accel := 1600.0
@export var flight_fury_cost := 0.0     ## por segundo (0 = voo grátis)

@export_group("Laser Eyes")
@export var eye_offset := Vector2(6, -104)   ## relativo aos pés, a olhar para a direita
@export var laser_range := 640.0
@export var laser_windup := 0.12
@export var laser_dps := 45.0
@export var laser_tick := 0.1
@export var laser_fury_per_sec := 30.0
@export var laser_min_fury := 10.0
@export var laser_move_mult := 0.35
@export var laser_knockback := 60.0
@export_flags_2d_physics var laser_mask := 0b11   ## mundo + inimigos
@export var laser_color := Color(1.0, 0.15, 0.2)

@export_group("Punch")
@export var punch_damage := 18.0
@export var punch_knockback := 320.0
@export var punch_windup := 0.07
@export var punch_active := 0.1
@export var punch_recovery := 0.16
@export var punch_lunge := 180.0
@export var punch_size := Vector2(44, 52)
@export var punch_offset := Vector2(28, -72)
@export var fury_on_hit := 6.0
@export_flags_2d_physics var hit_mask := 0b10     ## inimigos

@export_group("Energy Punch")
@export var charge_time := 0.4
@export var energy_punch_cost := 25.0
@export var energy_damage_mult := 2.5
@export var energy_knockback_mult := 2.2
@export var energy_size_mult := 1.6
@export var energy_color := Color(0.4, 0.75, 1.0)

# ---------------------------------------------------------------- estado
var hp: float
var fury: float
var facing := 1.0
var action := Action.NONE
var is_flying := false
var is_dead := false

var _sprite: AnimatedSprite2D
var _ray: RayCast2D
var _beam: Line2D
var _beam_core: Line2D
var _punch_query := PhysicsShapeQueryParameters2D.new()
var _punch_shape := RectangleShape2D.new()
var _hit_ids: Dictionary = {}

var _input := Vector2.ZERO
var _coyote_t := 0.0
var _jump_buf_t := 0.0
var _invuln_t := 0.0
var _action_t := 0.0
var _laser_tick_t := 0.0
var _punch_is_energy := false
var _current_anim: StringName

const A_IDLE := &"idle"
const A_RUN := &"run_flight"
const A_LASER := &"attack_laser"
const A_PUNCH := &"attack_punch"


# ================================================================ setup
func _ready() -> void:
	_ensure_input_actions()
	_build_nodes()
	hp = max_hp
	fury = max_fury
	hp_changed.emit(hp, max_hp)
	fury_changed.emit(fury, max_fury)


func _build_nodes() -> void:
	var loader := KaneSpriteLoader.new()
	_sprite = AnimatedSprite2D.new()
	_sprite.sprite_frames = loader.build(pack_json, idle_sheet, run_flight_sheet, attack_sheet)
	_sprite.centered = false
	_sprite.offset = -loader.origin          # a origem do nó fica nos pés
	_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(_sprite)
	_play(A_IDLE)

	if not _has_child_of_type(CollisionShape2D):
		var col := CollisionShape2D.new()
		var cap := CapsuleShape2D.new()
		cap.radius = 14.0
		cap.height = 108.0
		col.shape = cap
		col.position = Vector2(0, -54)
		add_child(col)

	_ray = RayCast2D.new()
	_ray.enabled = false                     # só atualizamos à mão (force_raycast_update)
	_ray.collision_mask = laser_mask
	_ray.collide_with_areas = true
	_ray.add_exception(self)
	add_child(_ray)

	_beam = _make_line(10.0, laser_color)
	_beam_core = _make_line(3.0, Color(1, 0.9, 0.9))

	_punch_query.shape = _punch_shape
	_punch_query.collision_mask = hit_mask
	_punch_query.collide_with_areas = true
	_punch_query.exclude = [get_rid()]


func _make_line(width: float, color: Color) -> Line2D:
	var l := Line2D.new()
	l.width = width
	l.default_color = color
	l.begin_cap_mode = Line2D.LINE_CAP_ROUND
	l.end_cap_mode = Line2D.LINE_CAP_ROUND
	l.points = PackedVector2Array([Vector2.ZERO, Vector2.ZERO])
	l.visible = false
	l.z_index = 1
	add_child(l)
	return l


func _has_child_of_type(t) -> bool:
	for c in get_children():
		if is_instance_of(c, t):
			return true
	return false


# ================================================================ loop
func _physics_process(delta: float) -> void:
	if is_dead:
		velocity.y = minf(velocity.y + gravity * delta, max_fall_speed)
		velocity.x = move_toward(velocity.x, 0.0, ground_friction * delta)
		move_and_slide()
		return

	_read_input()
	_tick_timers(delta)
	_update_actions(delta)
	_apply_locomotion(delta)
	move_and_slide()
	_update_fury(delta)
	_update_animation()


func _read_input() -> void:
	_input = Input.get_vector(&"move_left", &"move_right", &"move_up", &"move_down")
	if Input.is_action_just_pressed(&"jump"):
		_jump_buf_t = jump_buffer_time
	if Input.is_action_just_pressed(&"fly"):
		_set_flying(not is_flying)
	# Só vira quando não está a meio de um ataque comprometido.
	if action == Action.NONE or action == Action.PUNCH_CHARGE:
		if _input.x > 0.1:
			facing = 1.0
		elif _input.x < -0.1:
			facing = -1.0
		_sprite.flip_h = facing < 0.0


func _tick_timers(delta: float) -> void:
	_jump_buf_t = maxf(_jump_buf_t - delta, 0.0)
	_invuln_t = maxf(_invuln_t - delta, 0.0)
	if is_on_floor():
		_coyote_t = coyote_time
	else:
		_coyote_t = maxf(_coyote_t - delta, 0.0)
	# piscar durante invulnerabilidade
	_sprite.visible = _invuln_t <= 0.0 or int(_invuln_t * 20.0) % 2 == 0


# ================================================================ locomoção
func _apply_locomotion(delta: float) -> void:
	var mult := _move_multiplier()

	if is_flying:
		var target := _input * flight_speed * mult
		velocity = velocity.move_toward(target, flight_accel * delta)
		# aterra ao tocar no chão com "baixo" premido
		if is_on_floor() and _input.y > 0.5:
			_set_flying(false)
		return

	# Horizontal
	var target_x := _input.x * run_speed * mult
	var accel := air_accel
	if is_on_floor():
		accel = ground_friction if is_zero_approx(target_x) else ground_accel
	velocity.x = move_toward(velocity.x, target_x, accel * delta)

	# Gravidade (mais pesada a cair = salto com melhor "feel")
	var g := gravity * (fall_gravity_mult if velocity.y > 0.0 else 1.0)
	velocity.y = minf(velocity.y + g * delta, max_fall_speed)

	# Salto / entrada em voo
	var can_jump := action != Action.PUNCH and action != Action.LASER
	if _jump_buf_t > 0.0 and can_jump:
		if _coyote_t > 0.0:
			velocity.y = jump_velocity
			_jump_buf_t = 0.0
			_coyote_t = 0.0
		elif Input.is_action_just_pressed(&"jump"):
			_set_flying(true)  # saltar no ar = levantar voo
			_jump_buf_t = 0.0

	if Input.is_action_just_released(&"jump") and velocity.y < 0.0:
		velocity.y *= jump_cut


func _move_multiplier() -> float:
	match action:
		Action.LASER:
			return laser_move_mult
		Action.PUNCH:
			return 0.0
		Action.PUNCH_CHARGE:
			return 0.5
	return 1.0


func _set_flying(on: bool) -> void:
	if on == is_flying:
		return
	if on and flight_fury_cost > 0.0 and fury <= 0.0:
		return
	is_flying = on
	if on:
		velocity.y = minf(velocity.y, 0.0)  # corta a queda ao levantar voo


# ================================================================ ações
func _update_actions(delta: float) -> void:
	_action_t += delta
	match action:
		Action.NONE:
			if Input.is_action_just_pressed(&"laser") and fury >= laser_min_fury:
				_start_action(Action.LASER)
				_laser_tick_t = 0.0
			elif Input.is_action_just_pressed(&"punch"):
				_start_action(Action.PUNCH_CHARGE)

		Action.PUNCH_CHARGE:
			var charged := _action_t >= charge_time and fury >= energy_punch_cost
			_sprite.modulate = energy_color.lightened(0.3) if charged else Color.WHITE
			if not Input.is_action_pressed(&"punch"):
				_punch_is_energy = charged
				if charged:
					_set_fury(fury - energy_punch_cost)
				_hit_ids.clear()
				_start_action(Action.PUNCH)
				velocity.x += facing * punch_lunge * (1.5 if charged else 1.0)

		Action.PUNCH:
			_sprite.modulate = energy_color if _punch_is_energy else Color.WHITE
			if _action_t >= punch_windup and _action_t < punch_windup + punch_active:
				_punch_hit_query()
			elif _action_t >= punch_windup + punch_active + punch_recovery:
				_sprite.modulate = Color.WHITE
				_start_action(Action.NONE)

		Action.LASER:
			if not Input.is_action_pressed(&"laser") or fury <= 0.0:
				_stop_laser()
			elif _action_t >= laser_windup:
				_fire_laser(delta)


func _start_action(a: Action) -> void:
	action = a
	_action_t = 0.0


# ---------------------------------------------------------------- laser
func _fire_laser(delta: float) -> void:
	var dir := Vector2(facing, 0.0)
	if _input.y < -0.5:
		dir = Vector2(facing, -1.0).normalized()
	elif _input.y > 0.5 and not is_on_floor():
		dir = Vector2(facing, 1.0).normalized()

	var origin := Vector2(eye_offset.x * facing, eye_offset.y)
	_ray.position = origin
	_ray.target_position = dir * laser_range
	_ray.force_raycast_update()

	var end := origin + dir * laser_range
	if _ray.is_colliding():
		end = to_local(_ray.get_collision_point())
		_laser_tick_t += delta
		if _laser_tick_t >= laser_tick:
			_laser_tick_t -= laser_tick
			_deal_damage(_ray.get_collider(), laser_dps * laser_tick, dir * laser_knockback)

	# Feixe com pulsação barata (sem shader obrigatório)
	var pulse := 1.0 + 0.25 * sin(_action_t * 60.0)
	_beam.width = 10.0 * pulse
	_beam.set_point_position(0, origin)
	_beam.set_point_position(1, end)
	_beam_core.set_point_position(0, origin)
	_beam_core.set_point_position(1, end)
	_beam.visible = true
	_beam_core.visible = true
	_set_fury(fury - laser_fury_per_sec * delta)


func _stop_laser() -> void:
	_beam.visible = false
	_beam_core.visible = false
	_start_action(Action.NONE)


# ---------------------------------------------------------------- soco
func _punch_hit_query() -> void:
	var s := energy_size_mult if _punch_is_energy else 1.0
	_punch_shape.size = punch_size * s
	var center := Vector2(punch_offset.x * s * facing, punch_offset.y)
	_punch_query.transform = Transform2D(0.0, global_position + center)

	var results := get_world_2d().direct_space_state.intersect_shape(_punch_query, 8)
	var dmg := punch_damage * (energy_damage_mult if _punch_is_energy else 1.0)
	var kb := punch_knockback * (energy_knockback_mult if _punch_is_energy else 1.0)
	for r in results:
		var target := _resolve_target(r.collider)
		if target == null:
			continue
		var id := target.get_instance_id()
		if _hit_ids.has(id):
			continue  # cada alvo só é atingido uma vez por soco
		_hit_ids[id] = true
		_deal_damage(target, dmg, Vector2(facing, -0.35).normalized() * kb)
		_set_fury(fury + fury_on_hit)
		impact.emit(2.0 if _punch_is_energy else 0.8)


# ---------------------------------------------------------------- dano
func _resolve_target(obj: Object) -> Node:
	if obj is Node:
		var n := obj as Node
		if n.has_method(&"take_hit"):
			return n
		var p := n.get_parent()  # hurtbox (Area2D) filha do inimigo
		if p and p.has_method(&"take_hit"):
			return p
	return null


func _deal_damage(obj: Object, damage: float, knockback: Vector2) -> void:
	var t := _resolve_target(obj)
	if t:
		t.call(&"take_hit", damage, knockback, self)


## Chamado pelos inimigos/projéteis.
func take_hit(damage: float, knockback: Vector2, _source: Node = null) -> void:
	if is_dead or _invuln_t > 0.0:
		return
	hp = maxf(hp - damage, 0.0)
	hp_changed.emit(hp, max_hp)
	_invuln_t = invuln_time
	velocity = knockback
	if action == Action.LASER:
		_stop_laser()
	else:
		_start_action(Action.NONE)
	_sprite.modulate = Color.WHITE
	impact.emit(1.0)
	if hp <= 0.0:
		is_dead = true
		is_flying = false
		died.emit()


# ================================================================ fury / animação
func _update_fury(delta: float) -> void:
	if action == Action.LASER:
		return
	var rate := fury_regen
	if is_flying and flight_fury_cost > 0.0:
		rate -= flight_fury_cost
		if fury <= 0.0:
			_set_flying(false)
	if rate != 0.0:
		_set_fury(fury + rate * delta)


func _set_fury(v: float) -> void:
	v = clampf(v, 0.0, max_fury)
	if v != fury:
		fury = v
		fury_changed.emit(fury, max_fury)


func _update_animation() -> void:
	match action:
		Action.LASER:
			_show_frame(A_LASER, 0 if _action_t < laser_windup else 1)
		Action.PUNCH_CHARGE:
			_show_frame(A_PUNCH, 0)
		Action.PUNCH:
			_show_frame(A_PUNCH, 0 if _action_t < punch_windup else 1)
		_:
			if is_flying or not is_on_floor() or absf(velocity.x) > 20.0:
				_play(A_RUN)
				_sprite.speed_scale = clampf(absf(velocity.x) / run_speed, 0.6, 1.4) \
					if is_on_floor() and not is_flying else 1.0
			else:
				_play(A_IDLE)
				_sprite.speed_scale = 1.0


func _play(anim: StringName) -> void:
	if _current_anim != anim:
		_current_anim = anim
		_sprite.play(anim)


## Frames de ataque são controlados à mão (sincronizados com o gameplay).
func _show_frame(anim: StringName, idx: int) -> void:
	if _current_anim != anim:
		_current_anim = anim
		_sprite.animation = anim
		_sprite.pause()
	_sprite.frame = mini(idx, _sprite.sprite_frames.get_frame_count(anim) - 1)


# ================================================================ input
static func _ensure_input_actions() -> void:
	var map := {
		&"move_left": [KEY_A, KEY_LEFT],
		&"move_right": [KEY_D, KEY_RIGHT],
		&"move_up": [KEY_W, KEY_UP],
		&"move_down": [KEY_S, KEY_DOWN],
		&"jump": [KEY_SPACE],
		&"fly": [KEY_SHIFT, KEY_F],
		&"laser": [KEY_J],
		&"punch": [KEY_K],
	}
	var pad := {
		&"jump": JOY_BUTTON_A,
		&"fly": JOY_BUTTON_LEFT_SHOULDER,
		&"laser": JOY_BUTTON_Y,
		&"punch": JOY_BUTTON_X,
	}
	var created: Array[StringName] = []
	for action_name in map:
		if InputMap.has_action(action_name):
			continue  # respeita o que já está no Project Settings
		InputMap.add_action(action_name, 0.2)
		created.append(action_name)
		for key in map[action_name]:
			var ev := InputEventKey.new()
			ev.physical_keycode = key
			InputMap.action_add_event(action_name, ev)
		if pad.has(action_name):
			var jb := InputEventJoypadButton.new()
			jb.button_index = pad[action_name]
			InputMap.action_add_event(action_name, jb)
	# stick esquerdo
	var axes := {&"move_left": [JOY_AXIS_LEFT_X, -1.0], &"move_right": [JOY_AXIS_LEFT_X, 1.0],
		&"move_up": [JOY_AXIS_LEFT_Y, -1.0], &"move_down": [JOY_AXIS_LEFT_Y, 1.0]}
	for action_name in axes:
		if action_name not in created:
			continue
		var jm := InputEventJoypadMotion.new()
		jm.axis = axes[action_name][0]
		jm.axis_value = axes[action_name][1]
		InputMap.action_add_event(action_name, jm)
