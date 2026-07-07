import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
//#region src/tuning.ts
/** Fixed physics timestep (s). Vehicle tuning is dt-sensitive — never vary. */
var FIXED_DT = 1 / 60;
/** Gravity (m/s², Y-up). */
var GRAVITY = -9.81;
/** Collider half-extents (m): 1.70 m wide, 0.70 m tall body box, 4.04 m long. */
var CHASSIS_HALF_EXTENTS = {
	x: .85,
	y: .35,
	z: 2.02
};
/** Total vehicle mass (kg). ~compact hatchback with driver. */
var CHASSIS_MASS = 1220;
/**
* Centre of mass offset from the collider centre (m). Lowering it is THE
* anti-flip lever for raycast vehicles (COM ends up near sill height).
* Slightly forward (+Z) because the engine sits over the front axle → mild
* understeer + nose-heavy braking, correct for a FWD compact.
*/
var COM_OFFSET = {
	x: 0,
	y: -.32,
	z: .08
};
/**
* Multipliers on the analytic box inertia. Real cars carry mass in the
* corners (wheels, engine) so inertia is higher than a uniform box —
* raising yaw inertia calms twitchiness, raising roll inertia slows snap
* roll. (pitch = about X, yaw = about Y, roll = about Z.)
*/
var INERTIA_SCALE = {
	pitch: 1.1,
	yaw: 1.25,
	roll: 1.05
};
/** Rapier angular damping. Small — too much fights steering at speed. */
var CHASSIS_ANGULAR_DAMPING = .35;
/** Rapier linear damping. Near zero; real drag handled by AERO_DRAG below. */
var CHASSIS_LINEAR_DAMPING = .02;
var WHEEL_RADIUS = .32;
var WHEEL_WIDTH = .24;
/** Suspension attachment points in chassis-local space (m). Wheelbase 2.56 m, track 1.52 m. */
var WHEEL_POSITIONS = [
	{
		x: .76,
		y: -.1,
		z: 1.28
	},
	{
		x: -.76,
		y: -.1,
		z: 1.28
	},
	{
		x: .76,
		y: -.1,
		z: -1.28
	},
	{
		x: -.76,
		y: -.1,
		z: -1.28
	}
];
/** Indices of steered wheels (front axle). */
var STEERED_WHEELS = [0, 1];
/** Indices of driven wheels — FWD like most compacts. */
var DRIVEN_WHEELS = [0, 1];
/** Spring rest length (m) along local -Y from the attachment point. */
var SUSPENSION_REST_LENGTH = .3;
/** Compression damping. 1.9 ≈ ζ 0.37 — lets the nose dive, then catches it. */
var SUSPENSION_DAMPING_COMPRESSION = 1.9;
/** Rebound damping. 3.1 ≈ ζ 0.61 — body settles in ~1 oscillation. */
var SUSPENSION_DAMPING_RELAXATION = 3.1;
/** Max travel (m) either side of rest length before the hard clamp. */
var SUSPENSION_MAX_TRAVEL = .24;
/** Per-wheel force cap (N). Static load ≈ 3000 N/wheel; allow ~4 g spikes. */
var SUSPENSION_MAX_FORCE = 26e3;
/** Rear tyre μ. Keep ≥ front or the learner car oversteers. */
var FRICTION_SLIP_REAR = 2.2;
/**
* Available TOTAL tractive force (N) vs speed (km/h) — piecewise-linear,
* split across the driven wheels. Stands in for engine torque × gearing;
* tapers like a real power curve so top speed self-limits against AERO_DRAG
* (~135 km/h). Peak 4800 N ≈ 0–100 in ~10 s for 1220 kg. [kmh, newtons]
*/
var ENGINE_FORCE_CURVE = [
	[0, 4800],
	[30, 4800],
	[60, 3600],
	[90, 2600],
	[120, 1300],
	[145, 0]
];
/** Total reverse force (N) — deliberately weak, like a real reverse gear. */
var REVERSE_FORCE_N = 3e3;
/** Piecewise-linear lookup into ENGINE_FORCE_CURVE. */
function engineForceAt(speedKmh) {
	const pts = ENGINE_FORCE_CURVE;
	const first = pts[0];
	if (!first) return 0;
	if (speedKmh <= first[0]) return first[1];
	for (let i = 1; i < pts.length; i++) {
		const prev = pts[i - 1];
		const cur = pts[i];
		if (!prev || !cur) break;
		if (speedKmh <= cur[0]) {
			const t = (speedKmh - prev[0]) / (cur[0] - prev[0]);
			return prev[1] + (cur[1] - prev[1]) * t;
		}
	}
	return 0;
}
/** Total service-brake force (N). 11000 / 1220 kg ≈ 0.92 g — modern ABS-ish. */
var BRAKE_FORCE_N = 11e3;
/** Fraction of brake force on the front axle (weight transfers forward). */
var BRAKE_BIAS_FRONT = .62;
/** Handbrake force (N), rear axle only. */
var HANDBRAKE_FORCE_N = 6500;
/** Rear lateral grip multiplier while the handbrake is pulled → slides. */
var HANDBRAKE_REAR_GRIP = .4;
/** Max road-wheel angle (rad) at/below STEER_FULL_SPEED_KMH. ~34°. */
var STEER_MAX_ANGLE = .6;
/** Max road-wheel angle (rad) at/above STEER_MIN_SPEED_KMH. ~8°. */
var STEER_MIN_ANGLE = .14;
/** How fast the wheel turns toward the target (rad/s). */
var STEER_SPEED = 3.2;
/** How fast it self-centres (rad/s) — quicker than turn-in, like a caster. */
var STEER_RETURN_SPEED = 4.8;
/**
* Software anti-roll bar stiffness (N per metre of left/right compression
* difference). Front stiffer than rear → understeer balance. Set both to 0
* to feel the raw spring roll (educational: the car leans a LOT).
*/
var ANTI_ROLL_FRONT = 7e3;
var ANTI_ROLL_REAR = 5e3;
/** Quadratic air drag (N per (m/s)²). 0.42 ≈ Cd 0.32 × 2.2 m² frontal. */
var AERO_DRAG = .42;
/**
* Quadratic downforce (N per (m/s)²). Real compacts have ~0; a pinch keeps
* the raycast car planted over crests at 90 km/h. Cheap stability lever.
*/
var AERO_DOWNFORCE = 1.1;
/** Upshift display thresholds (km/h): below 16 → 1st, … above 80 → 5th. */
var GEAR_UPSHIFT_KMH = [
	16,
	34,
	55,
	80
];
/** Spawn on the south straight, facing +X (east), slight drop to settle. */
var SPAWN = {
	x: -20,
	y: .8,
	z: -40,
	yawRad: Math.PI / 2
};
/** Driver eye point, chassis-local (LHD: +X is the left/driver side). */
var COCKPIT_EYE = {
	x: .34,
	y: .62,
	z: .15
};
//#endregion
//#region src/vehicle.ts
var FL = 0;
var FR = 1;
var RL = 2;
var RR = 3;
var WHEEL_COUNT = 4;
var UP = new THREE.Vector3(0, 1, 0);
function approach(current, target, maxDelta) {
	if (current < target) return Math.min(current + maxDelta, target);
	return Math.max(current - maxDelta, target);
}
var Vehicle = class {
	/** Visual root, synced from the rigid body every frame. */
	root = new THREE.Group();
	/** Attach the cockpit camera here (already at driver eye height). */
	cockpitAnchor = new THREE.Object3D();
	body;
	collider;
	controller;
	wheelPivots = [];
	wheelSpins = [];
	steeringWheel = null;
	steer = 0;
	tmpQ = new THREE.Quaternion();
	tmpV = new THREE.Vector3();
	spawnRotation;
	constructor(world, scene) {
		this.spawnRotation = new THREE.Quaternion().setFromAxisAngle(UP, SPAWN.yawRad);
		const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(SPAWN.x, SPAWN.y, SPAWN.z).setRotation({
			x: this.spawnRotation.x,
			y: this.spawnRotation.y,
			z: this.spawnRotation.z,
			w: this.spawnRotation.w
		}).setAngularDamping(CHASSIS_ANGULAR_DAMPING).setLinearDamping(CHASSIS_LINEAR_DAMPING).setCcdEnabled(true);
		this.body = world.createRigidBody(bodyDesc);
		const m = CHASSIS_MASS;
		const ex = CHASSIS_HALF_EXTENTS.x * 2;
		const ey = CHASSIS_HALF_EXTENTS.y * 2;
		const ez = CHASSIS_HALF_EXTENTS.z * 2;
		const inertia = {
			x: m / 12 * (ey * ey + ez * ez) * INERTIA_SCALE.pitch,
			y: m / 12 * (ex * ex + ez * ez) * INERTIA_SCALE.yaw,
			z: m / 12 * (ex * ex + ey * ey) * INERTIA_SCALE.roll
		};
		const colliderDesc = RAPIER.ColliderDesc.cuboid(CHASSIS_HALF_EXTENTS.x, CHASSIS_HALF_EXTENTS.y, CHASSIS_HALF_EXTENTS.z).setMassProperties(m, COM_OFFSET, inertia, {
			x: 0,
			y: 0,
			z: 0,
			w: 1
		}).setFriction(.5).setRestitution(.05);
		this.collider = world.createCollider(colliderDesc, this.body);
		this.controller = world.createVehicleController(this.body);
		this.controller.indexUpAxis = 1;
		this.controller.setIndexForwardAxis = 2;
		const suspensionDir = new RAPIER.Vector3(0, -1, 0);
		const axle = new RAPIER.Vector3(-1, 0, 0);
		for (let i = 0; i < WHEEL_COUNT; i++) {
			const p = WHEEL_POSITIONS[i];
			if (!p) continue;
			this.controller.addWheel(new RAPIER.Vector3(p.x, p.y, p.z), suspensionDir, axle, SUSPENSION_REST_LENGTH, WHEEL_RADIUS);
		}
		for (let i = 0; i < WHEEL_COUNT; i++) {
			const isFront = i === FL || i === FR;
			this.controller.setWheelSuspensionStiffness(i, 26);
			this.controller.setWheelSuspensionCompression(i, SUSPENSION_DAMPING_COMPRESSION);
			this.controller.setWheelSuspensionRelaxation(i, SUSPENSION_DAMPING_RELAXATION);
			this.controller.setWheelMaxSuspensionTravel(i, SUSPENSION_MAX_TRAVEL);
			this.controller.setWheelMaxSuspensionForce(i, SUSPENSION_MAX_FORCE);
			this.controller.setWheelFrictionSlip(i, isFront ? 2 : FRICTION_SLIP_REAR);
			this.controller.setWheelSideFrictionStiffness(i, 1);
		}
		this.buildVisuals();
		scene.add(this.root);
	}
	update(input, dt) {
		const c = this.controller;
		const speedMs = c.currentVehicleSpeed();
		const speedKmh = speedMs * 3.6;
		const absKmh = Math.abs(speedKmh);
		const f = THREE.MathUtils.clamp((absKmh - 15) / 95, 0, 1);
		const maxSteer = THREE.MathUtils.lerp(STEER_MAX_ANGLE, STEER_MIN_ANGLE, f);
		const steerTarget = input.steer * maxSteer;
		const rate = Math.abs(steerTarget) < Math.abs(this.steer) ? STEER_RETURN_SPEED : STEER_SPEED;
		this.steer = approach(this.steer, steerTarget, rate * dt);
		for (const i of STEERED_WHEELS) c.setWheelSteering(i, this.steer);
		let engineTotal = 0;
		let brakePedal = 0;
		if (input.throttle > 0) if (speedMs < -.5) brakePedal = input.throttle;
		else engineTotal = engineForceAt(absKmh) * input.throttle;
		else if (input.brake > 0) {
			if (speedMs > .5) brakePedal = input.brake;
			else if (speedKmh > -25) engineTotal = -REVERSE_FORCE_N * input.brake;
		}
		const perWheelEngine = engineTotal / DRIVEN_WHEELS.length;
		for (let i = 0; i < WHEEL_COUNT; i++) c.setWheelEngineForce(i, DRIVEN_WHEELS.includes(i) ? perWheelEngine : 0);
		let frontBrakeN = brakePedal * BRAKE_FORCE_N * BRAKE_BIAS_FRONT / 2;
		let rearBrakeN = brakePedal * BRAKE_FORCE_N * (1 - BRAKE_BIAS_FRONT) / 2;
		if (engineTotal === 0 && brakePedal === 0) {
			frontBrakeN = Math.max(frontBrakeN, 280 / 4);
			rearBrakeN = Math.max(rearBrakeN, 280 / 4);
		}
		let rearGrip = 1;
		if (input.handbrake) {
			rearBrakeN = Math.max(rearBrakeN, HANDBRAKE_FORCE_N / 2);
			rearGrip = HANDBRAKE_REAR_GRIP;
		}
		c.setWheelBrake(FL, frontBrakeN * dt);
		c.setWheelBrake(FR, frontBrakeN * dt);
		c.setWheelBrake(RL, rearBrakeN * dt);
		c.setWheelBrake(RR, rearBrakeN * dt);
		c.setWheelSideFrictionStiffness(RL, rearGrip);
		c.setWheelSideFrictionStiffness(RR, rearGrip);
		this.body.resetForces(true);
		const vel = this.body.linvel();
		const v = Math.hypot(vel.x, vel.y, vel.z);
		if (v > .1) {
			const k = AERO_DRAG * v;
			this.body.addForce({
				x: -vel.x * k,
				y: -vel.y * k - AERO_DOWNFORCE * v * v,
				z: -vel.z * k
			}, true);
		}
		this.applyAntiRollAxle(FL, FR, ANTI_ROLL_FRONT, dt);
		this.applyAntiRollAxle(RL, RR, ANTI_ROLL_REAR, dt);
		c.updateVehicle(dt, void 0, void 0, (col) => col.handle !== this.collider.handle);
	}
	/** Copy physics state into the three.js visuals. Call once per frame. */
	syncVisuals() {
		const t = this.body.translation();
		const r = this.body.rotation();
		this.root.position.set(t.x, t.y, t.z);
		this.root.quaternion.set(r.x, r.y, r.z, r.w);
		for (let i = 0; i < WHEEL_COUNT; i++) {
			const pivot = this.wheelPivots[i];
			const spin = this.wheelSpins[i];
			const p = WHEEL_POSITIONS[i];
			if (!pivot || !spin || !p) continue;
			const susp = this.controller.wheelSuspensionLength(i) ?? .3;
			pivot.position.set(p.x, p.y - susp, p.z);
			pivot.rotation.y = i === FL || i === FR ? this.steer : 0;
			spin.rotation.x = -(this.controller.wheelRotation(i) ?? 0);
		}
		if (this.steeringWheel) this.steeringWheel.rotation.z = -this.steer * 6;
	}
	reset() {
		this.body.setTranslation({
			x: SPAWN.x,
			y: SPAWN.y,
			z: SPAWN.z
		}, true);
		this.body.setRotation({
			x: this.spawnRotation.x,
			y: this.spawnRotation.y,
			z: this.spawnRotation.z,
			w: this.spawnRotation.w
		}, true);
		this.body.setLinvel({
			x: 0,
			y: 0,
			z: 0
		}, true);
		this.body.setAngvel({
			x: 0,
			y: 0,
			z: 0
		}, true);
		this.body.resetForces(true);
		this.body.resetTorques(true);
		this.steer = 0;
	}
	/** Signed speed in km/h (+ forward). */
	get speedKmh() {
		return this.controller.currentVehicleSpeed() * 3.6;
	}
	/** Narrow debug readout (numeric tuning harness + future debug HUD). */
	debugState() {
		const t = this.body.translation();
		const r = this.body.rotation();
		const suspensionLengths = [];
		const wheelsInContact = [];
		for (let i = 0; i < WHEEL_COUNT; i++) {
			suspensionLengths.push(this.controller.wheelSuspensionLength(i) ?? .3);
			wheelsInContact.push(this.controller.wheelIsInContact(i));
		}
		return {
			position: {
				x: t.x,
				y: t.y,
				z: t.z
			},
			rotation: {
				x: r.x,
				y: r.y,
				z: r.z,
				w: r.w
			},
			suspensionLengths,
			wheelsInContact,
			steerRad: this.steer
		};
	}
	/** Cosmetic automatic gearbox for the HUD. */
	get gear() {
		const v = this.speedKmh;
		if (v < -.8) return "R";
		if (v < .8) return "N";
		let g = 1;
		for (const threshold of GEAR_UPSHIFT_KMH) if (v > threshold) g++;
		return String(g);
	}
	/**
	* Anti-roll bar: push the chassis up on the compressed side, pull it down
	* on the extended side, proportional to the compression difference. This is
	* how you keep raycast cars flat-ish in corners WITHOUT killing all lean.
	*/
	applyAntiRollAxle(left, right, stiffness, dt) {
		const c = this.controller;
		if (!c.wheelIsInContact(left) || !c.wheelIsInContact(right)) return;
		const rest = SUSPENSION_REST_LENGTH;
		const force = (rest - (c.wheelSuspensionLength(left) ?? rest) - (rest - (c.wheelSuspensionLength(right) ?? rest))) * stiffness;
		if (Math.abs(force) < 1) return;
		const t = this.body.translation();
		const r = this.body.rotation();
		this.tmpQ.set(r.x, r.y, r.z, r.w);
		const pL = WHEEL_POSITIONS[left];
		const pR = WHEEL_POSITIONS[right];
		if (!pL || !pR) return;
		this.tmpV.set(pL.x, pL.y, pL.z).applyQuaternion(this.tmpQ);
		this.body.applyImpulseAtPoint({
			x: 0,
			y: force * dt,
			z: 0
		}, {
			x: t.x + this.tmpV.x,
			y: t.y + this.tmpV.y,
			z: t.z + this.tmpV.z
		}, true);
		this.tmpV.set(pR.x, pR.y, pR.z).applyQuaternion(this.tmpQ);
		this.body.applyImpulseAtPoint({
			x: 0,
			y: -force * dt,
			z: 0
		}, {
			x: t.x + this.tmpV.x,
			y: t.y + this.tmpV.y,
			z: t.z + this.tmpV.z
		}, true);
	}
	buildVisuals() {
		const h = CHASSIS_HALF_EXTENTS;
		const bodyMat = new THREE.MeshStandardMaterial({
			color: 3108797,
			roughness: .45,
			metalness: .25
		});
		const darkMat = new THREE.MeshStandardMaterial({
			color: 1316893,
			roughness: .85
		});
		const glassMat = new THREE.MeshStandardMaterial({
			color: 922393,
			roughness: .2,
			metalness: .6
		});
		const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), bodyMat);
		bodyMesh.castShadow = true;
		this.root.add(bodyMesh);
		const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.44, .56, 1.9), glassMat);
		cabin.position.set(0, h.y + .28, -.35);
		cabin.castShadow = true;
		this.root.add(cabin);
		const front = new THREE.Mesh(new THREE.BoxGeometry(1.4, .12, .06), new THREE.MeshStandardMaterial({
			color: 16777215,
			emissive: 12303308,
			emissiveIntensity: .7
		}));
		front.position.set(0, .05, h.z + .03);
		this.root.add(front);
		const rear = new THREE.Mesh(new THREE.BoxGeometry(1.4, .12, .06), new THREE.MeshStandardMaterial({
			color: 10031377,
			emissive: 11145489,
			emissiveIntensity: .7
		}));
		rear.position.set(0, .05, -h.z - .03);
		this.root.add(rear);
		const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20);
		wheelGeo.rotateZ(Math.PI / 2);
		for (let i = 0; i < WHEEL_COUNT; i++) {
			const p = WHEEL_POSITIONS[i];
			if (!p) continue;
			const pivot = new THREE.Object3D();
			pivot.position.set(p.x, p.y - SUSPENSION_REST_LENGTH, p.z);
			const spin = new THREE.Mesh(wheelGeo, darkMat);
			spin.castShadow = true;
			pivot.add(spin);
			this.root.add(pivot);
			this.wheelPivots.push(pivot);
			this.wheelSpins.push(spin);
		}
		const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, .16, .3), darkMat);
		dash.position.set(0, .36, .62);
		this.root.add(dash);
		const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(.19, .025, 10, 24), darkMat);
		const spoke = new THREE.Mesh(new THREE.BoxGeometry(.34, .03, .02), darkMat);
		wheelRim.add(spoke);
		const wheelPivot = new THREE.Object3D();
		wheelPivot.position.set(COCKPIT_EYE.x, .3, .52);
		wheelPivot.rotation.x = -.45;
		wheelPivot.add(wheelRim);
		this.root.add(wheelPivot);
		this.steeringWheel = wheelRim;
		this.cockpitAnchor.position.set(COCKPIT_EYE.x, COCKPIT_EYE.y, COCKPIT_EYE.z);
		this.root.add(this.cockpitAnchor);
	}
};
//#endregion
//#region src/harness.ts
var IDLE = {
	throttle: 0,
	brake: 0,
	steer: 0,
	handbrake: false
};
function makeRig(setup) {
	const world = new RAPIER.World({
		x: 0,
		y: GRAVITY,
		z: 0
	});
	world.timestep = FIXED_DT;
	world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setFriction(1));
	setup?.(world);
	return {
		world,
		vehicle: new Vehicle(world, new THREE.Scene())
	};
}
function step(rig, input) {
	rig.vehicle.update(input, FIXED_DT);
	rig.world.step();
}
/** Roll/pitch in degrees from the chassis quaternion (small-angle friendly). */
function attitude(rig) {
	const d = rig.vehicle.debugState();
	const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
	const left = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
	const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
	const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
	return {
		rollDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(left.y, -1, 1))),
		pitchDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1))),
		upY: up.y
	};
}
var fmt = (n, digits = 2) => n.toFixed(digits);
await RAPIER.init();
console.log("rapier initialized (headless)\n");
{
	const rig = makeRig();
	for (let i = 0; i < 240; i++) step(rig, IDLE);
	const d = rig.vehicle.debugState();
	const a = attitude(rig);
	console.log("[settle after 4 s]");
	console.log(`  body centre y      ${fmt(d.position.y, 3)} m (expected ~0.63)`);
	console.log(`  roll/pitch         ${fmt(a.rollDeg)} / ${fmt(a.pitchDeg)} deg`);
	console.log(`  susp lengths       ${d.suspensionLengths.map((s) => fmt(s, 3)).join("  ")} (rest ${SUSPENSION_REST_LENGTH})`);
	console.log(`  wheels in contact  ${d.wheelsInContact.join(" ")}`);
	console.log(`  drift speed        ${fmt(Math.abs(rig.vehicle.speedKmh), 3)} km/h\n`);
}
{
	const rig = makeRig();
	for (let i = 0; i < 60; i++) step(rig, IDLE);
	const t50 = [];
	const t90 = [];
	const t100 = [];
	let top = 0;
	const startX = rig.vehicle.debugState().position.x;
	for (let i = 0; i < 1800; i++) {
		step(rig, {
			...IDLE,
			throttle: 1
		});
		const v = rig.vehicle.speedKmh;
		top = Math.max(top, v);
		const t = i / 60;
		if (v >= 50 && t50.length === 0) t50.push(t);
		if (v >= 90 && t90.length === 0) t90.push(t);
		if (v >= 100 && t100.length === 0) t100.push(t);
	}
	const endX = rig.vehicle.debugState().position.x;
	console.log("[full throttle 30 s]");
	console.log(`  direction check    moved ${fmt(endX - startX, 0)} m in +X (must be positive)`);
	console.log(`  0-50 / 0-90 / 0-100  ${fmt(t50[0] ?? -1, 1)} / ${fmt(t90[0] ?? -1, 1)} / ${fmt(t100[0] ?? -1, 1)} s`);
	console.log(`  top speed          ${fmt(top, 1)} km/h (target ~130-140)\n`);
}
{
	const rig = makeRig();
	for (let i = 0; i < 60; i++) step(rig, IDLE);
	while (rig.vehicle.speedKmh < 90) step(rig, {
		...IDLE,
		throttle: 1
	});
	const v0 = rig.vehicle.speedKmh / 3.6;
	const x0 = rig.vehicle.debugState().position.x;
	let frames = 0;
	let maxNoseDive = 0;
	while (rig.vehicle.speedKmh > 2 && frames < 900) {
		step(rig, {
			...IDLE,
			brake: 1
		});
		maxNoseDive = Math.min(maxNoseDive, attitude(rig).pitchDeg);
		frames++;
	}
	const dist = rig.vehicle.debugState().position.x - x0;
	const tStop = frames / 60;
	console.log("[full brake from 90 km/h]");
	console.log(`  stop time/distance ${fmt(tStop, 2)} s / ${fmt(dist, 1)} m (real compact ~ 35-40 m)`);
	console.log(`  avg decel          ${fmt(v0 / tStop / 9.81, 2)} g`);
	console.log(`  max nose dive      ${fmt(maxNoseDive, 1)} deg (negative = nose down)\n`);
}
{
	const rig = makeRig();
	for (let i = 0; i < 60; i++) step(rig, IDLE);
	let maxRoll = 0;
	let yawPrev = null;
	let yawRateDegS = 0;
	let minUpY = 1;
	for (let i = 0; i < 840; i++) {
		step(rig, {
			throttle: rig.vehicle.speedKmh < 50 ? 1 : 0,
			brake: 0,
			steer: i > 240 ? .3 : 0,
			handbrake: false
		});
		if (i > 480) {
			const a = attitude(rig);
			maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
			minUpY = Math.min(minUpY, a.upY);
			const d = rig.vehicle.debugState();
			const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
			const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
			const yaw = Math.atan2(f.x, f.z);
			if (yawPrev !== null) {
				let dy = yaw - yawPrev;
				if (dy > Math.PI) dy -= 2 * Math.PI;
				if (dy < -Math.PI) dy += 2 * Math.PI;
				yawRateDegS = THREE.MathUtils.radToDeg(dy) * 60;
			}
			yawPrev = yaw;
		}
	}
	console.log("[steady corner, ~50 km/h, steer input 0.3]");
	console.log(`  speed held         ${fmt(rig.vehicle.speedKmh, 1)} km/h`);
	console.log(`  body roll          ${fmt(maxRoll, 1)} deg (target 2-5: visible lean, not a boat)`);
	console.log(`  yaw rate           ${fmt(Math.abs(yawRateDegS), 1)} deg/s`);
	console.log(`  min up.y           ${fmt(minUpY, 3)} (1 = upright)\n`);
}
{
	const rig = makeRig((world) => {
		world.createCollider(RAPIER.ColliderDesc.cuboid(.15, .06, .8).setTranslation(25, .06, -39.3).setFriction(.9));
	});
	for (let i = 0; i < 60; i++) step(rig, IDLE);
	let maxRoll = 0;
	let maxPitch = 0;
	let minUpY = 1;
	let speedAtCurb = 0;
	for (let i = 0; i < 720; i++) {
		const x = rig.vehicle.debugState().position.x;
		step(rig, {
			...IDLE,
			throttle: x < 20 ? 1 : 0
		});
		const a = attitude(rig);
		maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
		maxPitch = Math.max(maxPitch, Math.abs(a.pitchDeg));
		minUpY = Math.min(minUpY, a.upY);
		if (speedAtCurb === 0 && x >= 25) speedAtCurb = rig.vehicle.speedKmh;
	}
	const end = attitude(rig);
	console.log("[12 cm curb under right wheels]");
	console.log(`  speed at strike    ${fmt(speedAtCurb, 1)} km/h (target ~50)`);
	console.log(`  max roll/pitch     ${fmt(maxRoll, 1)} / ${fmt(maxPitch, 1)} deg`);
	console.log(`  min up.y           ${fmt(minUpY, 3)} (flip if < 0)`);
	console.log(`  upright at end     ${end.upY > .9 ? "YES" : `NO (up.y ${fmt(end.upY, 2)})`}\n`);
}
{
	const rig = makeRig();
	for (let i = 0; i < 60; i++) step(rig, IDLE);
	while (rig.vehicle.speedKmh < 90) step(rig, {
		...IDLE,
		throttle: 1
	});
	let maxRoll = 0;
	let minUpY = 1;
	for (let i = 0; i < 300; i++) {
		const t = i / 60;
		let steer = 0;
		if (t < .6) steer = .5;
		else if (t < 1.2) steer = -.5;
		step(rig, {
			...IDLE,
			throttle: .4,
			steer
		});
		const a = attitude(rig);
		maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
		minUpY = Math.min(minUpY, a.upY);
	}
	const d = rig.vehicle.debugState();
	const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
	const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
	console.log("[lane change at 90 km/h, steer pulse 0.5/-0.5]");
	console.log(`  max roll           ${fmt(maxRoll, 1)} deg`);
	console.log(`  min up.y           ${fmt(minUpY, 3)}`);
	console.log(`  final speed        ${fmt(rig.vehicle.speedKmh, 1)} km/h`);
	console.log(`  final heading ok   ${Math.abs(f.z) < .7 ? "YES (still ~+X)" : "NO (spun)"}\n`);
}
{
	const rig = makeRig();
	for (let i = 0; i < 60; i++) step(rig, IDLE);
	while (rig.vehicle.speedKmh < 50) step(rig, {
		...IDLE,
		throttle: 1
	});
	let minUpY = 1;
	for (let i = 0; i < 240; i++) {
		const t = i / 60;
		step(rig, {
			throttle: 0,
			brake: 0,
			steer: t < 1 ? 1 : 0,
			handbrake: t < 1.2
		});
		minUpY = Math.min(minUpY, attitude(rig).upY);
	}
	const d = rig.vehicle.debugState();
	const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
	const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
	const headingDeg = THREE.MathUtils.radToDeg(Math.atan2(f.x, f.z));
	console.log("[handbrake + full steer at 50 km/h]");
	console.log(`  heading change     started at 90 deg, now ${fmt(headingDeg, 0)} deg (should rotate well past 90)`);
	console.log(`  min up.y           ${fmt(minUpY, 3)} (no flip)`);
	console.log(`  end speed          ${fmt(Math.abs(rig.vehicle.speedKmh), 1)} km/h\n`);
}
console.log("harness done");
//#endregion
export {};
