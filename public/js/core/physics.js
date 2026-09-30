// Envoltorio de Rapier: mundo físico, colliders estáticos, raycasts y grupos de colisión.
import RAPIER from 'rapier';

export { RAPIER };

// Grupos de colisión (membresía). Filtro = con qué grupos colisiona.
export const GR = {
  WORLD: 1, // estático
  ME: 2, // cápsula del jugador local
  REMOTE: 4, // cápsulas cinemáticas de otros jugadores
  PROP: 8,
  VEHICLE: 16,
  RAGDOLL: 32,
  DEBRIS: 64,
  PAWN: 128, // cápsula de movimiento de otros jugadores: frena a la mía (no se atraviesan)
};
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const FIXED_DT = 1 / 60;

export class Physics {
  async init() {
    await RAPIER.init();
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -12, z: 0 });
    this.world.timestep = FIXED_DT;
    this.acc = 0;
    this.alpha = 0;
    this.meta = new Map(); // collider handle -> info { kind, ref }
    this.steps = 0;
  }

  // Avanza con paso fijo. onStep(dt) se llama antes de cada paso.
  step(dt, onStep, afterStep) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= FIXED_DT) {
      if (n < 4) {
        onStep && onStep(FIXED_DT);
        this.world.step();
        afterStep && afterStep(FIXED_DT);
        this.steps++;
      }
      this.acc -= FIXED_DT;
      n++;
    }
    this.alpha = this.acc / FIXED_DT;
  }

  tag(collider, info) {
    this.meta.set(collider.handle, info);
    return collider;
  }
  info(collider) {
    return collider ? this.meta.get(collider.handle) : null;
  }
  untag(collider) {
    this.meta.delete(collider.handle);
  }

  // ---------------------------------------------------------------- estáticos
  _static(desc, x, y, z, yaw, opts) {
    desc.setTranslation(x, y, z);
    if (yaw) desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    if (opts && opts.rot) desc.setRotation(opts.rot);
    desc.setFriction(opts?.friction ?? 0.8);
    desc.setCollisionGroups(groups(GR.WORLD, 0xffff));
    const c = this.world.createCollider(desc);
    this.tag(c, { kind: 'world', mat: opts?.mat || 'stone', paint: !!opts?.paint, holes: !!opts?.holes });
    return c;
  }
  // Analytic floor: avoids capsule shape-cast jitter against the former 900m cuboid.
  // The visual ground and playable bounds are still finite.
  ground(y = 0, opts = {}) {
    const shape = new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 });
    return this._static(new RAPIER.ColliderDesc(shape), 0, y, 0, 0, { ...opts, paint: true });
  }
  box(x, y, z, hx, hy, hz, yaw = 0, opts) {
    return this._static(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, yaw, { ...opts, paint: opts?.paint ?? true });
  }
  cylinder(x, y, z, hh, r, opts) {
    return this._static(RAPIER.ColliderDesc.cylinder(hh, r), x, y, z, 0, opts);
  }
  ball(x, y, z, r, opts) {
    return this._static(RAPIER.ColliderDesc.ball(r), x, y, z, 0, opts);
  }
  // Rampa: cuña (convexa) con base w x l y altura h, sube hacia +Z local.
  wedge(x, y, z, w, l, h, yaw, opts) {
    const hw = w / 2, hl = l / 2;
    const pts = new Float32Array([
      -hw, 0, -hl, hw, 0, -hl, -hw, 0, hl, hw, 0, hl, -hw, h, hl, hw, h, hl,
    ]);
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    return this._static(desc, x, y, z, yaw, { ...opts, paint: true });
  }

  // ---------------------------------------------------------------- consultas
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filterGroups = groups(0xffff, GR.WORLD), exclude = null, predicate = null) {
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRayAndGetNormal(
      ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, filterGroups, exclude, null, predicate,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      dist: t,
      x: ox + dx * t, y: oy + dy * t, z: oz + dz * t,
      nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z,
      collider: hit.collider,
      info: this.info(hit.collider),
    };
  }

  // Punto más cercano de la superficie de un collider (aunque el punto esté adentro): { x, y, z, inside, info }
  nearest(x, y, z, filterGroups, predicate = null) {
    const pr = this.world.projectPoint({ x, y, z }, false, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, filterGroups, null, null, predicate);
    if (!pr) return null;
    return { x: pr.point.x, y: pr.point.y, z: pr.point.z, inside: pr.isInside, collider: pr.collider, info: this.info(pr.collider) };
  }
}
