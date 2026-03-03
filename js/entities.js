// ============================================================
//  entities.js  –  Player, Enemy, Bullet
//  All movement/physics now use delta-time (dt in seconds)
//  so speed is frame-rate independent on all devices.
// ============================================================

// ── Bullet ───────────────────────────────────────────────────
class Bullet {
  /**
   * @param {number} speed  – pixels per second (NOT per frame)
   */
  constructor(wx, wy, angle, speed, damage, range, owner, pelletSpread = 0) {
    this.wx     = wx;
    this.wy     = wy;
    const a     = angle + (Math.random() - 0.5) * pelletSpread;
    // Store unit direction; actual px/s speed applied in update(dt)
    this.dirX   = Math.cos(a);
    this.dirY   = Math.sin(a);
    this.speed  = speed;       // px / second
    this.damage = damage;
    this.range  = range;
    this.owner  = owner;
    this.dist   = 0;
    this.dead   = false;
    // Trail points for visual
    this._trail = [];
  }

  update(world, dt) {
    // dt in seconds; speed in px/s
    const move = this.speed * dt;
    this._trail.unshift({ x: this.wx, y: this.wy });
    if(this._trail.length > 5) this._trail.pop();

    this.wx   += this.dirX * move;
    this.wy   += this.dirY * move;
    this.dist += move;

    if(this.dist >= this.range)           this.dead = true;
    if(!world.isWalkable(this.wx, this.wy)) this.dead = true;
  }

  draw(ctx, cam) {
    if(this.dead) return;
    const sx = this.wx - cam.x;
    const sy = this.wy - cam.y;
    // Off-screen cull
    if(sx < -20 || sy < -20 || sx > cam.vw + 20 || sy > cam.vh + 20) return;

    const isPlayer = this.owner === 'player';
    const col      = isPlayer ? '#ffe07a' : '#ff5a5a';
    const r        = isPlayer ? 4 : 4.5;   // enemy bullets slightly bigger

    ctx.save();

    // Trail
    if(this._trail.length > 1) {
      ctx.strokeStyle = col + '55';
      ctx.lineWidth   = r * 1.2;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      for(const p of this._trail) ctx.lineTo(p.x - cam.x, p.y - cam.y);
      ctx.stroke();
    }

    // Glow
    ctx.shadowColor = col;
    ctx.shadowBlur  = isPlayer ? 8 : 12;

    // Bullet dot
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ── Player ───────────────────────────────────────────────────
class Player {
  constructor(wx, wy) {
    this.wx    = wx;
    this.wy    = wy;
    this.radius = 10;
    this.angle  = 0;

    this.hp     = CFG.PLAYER_HP;
    this.maxHp  = CFG.PLAYER_HP;
    this.stamina = CFG.STAMINA_MAX;
    this.alive  = true;
    this.dead   = false;

    // Loadout
    this.helm  = 'none';
    this.armor = 'none';
    this.bag   = 'none';
    this.mainWep    = null;
    this.secWep     = null;
    this.activeSlot = 'main';

    // Inventory: [{ id, qty }]
    this.inventory   = [];
    this.magAmmo     = {};   // { weaponKey: currentMag }
    this.reserveAmmo = {};   // { ammoType: count }

    // Timers
    this.reloading     = false;
    this.reloadEnd     = 0;
    this.lastShotTime  = 0;
    this.using         = false;
    this.useEnd        = 0;
    this._pendingHeal  = null;
    this.extracting    = false;

    // Stats
    this.kills = 0;
    this.cash  = 0;
  }

  // ── Derived ──────────────────────────────────────────────
  get armorVal()  {
    return (CFG.ARMORS[this.armor]?.armor  || 0)
         + (CFG.HELMETS[this.helm]?.armor  || 0);
  }
  get bagSlots()  { return CFG.BAGS[this.bag]?.slots || 0; }
  get activeWeapon() {
    const k = this.activeSlot === 'main' ? this.mainWep : this.secWep;
    return k ? CFG.WEAPONS[k] : null;
  }
  get activeWeaponKey() {
    return this.activeSlot === 'main' ? this.mainWep : this.secWep;
  }

  // ── Move (dt in seconds) ─────────────────────────────────
  move(dx, dy, world, dt) {
    if(!this.alive || this.using || this.extracting) return;

    const sprinting = window.INPUT?.sprint && this.stamina > 5;
    const spd = CFG.PLAYER_SPEED * (sprinting ? CFG.PLAYER_SPRINT_MUL : 1) * dt;

    const nx = this.wx + dx * spd;
    const ny = this.wy + dy * spd;

    if(world.isWalkable(nx, this.wy)) this.wx = nx;
    if(world.isWalkable(this.wx, ny)) this.wy = ny;

    // Stamina drain / regen (per second)
    if(sprinting && (dx || dy)) {
      this.stamina = Math.max(0, this.stamina - CFG.STAMINA_DRAIN * dt * 60);
    } else {
      this.stamina = Math.min(CFG.STAMINA_MAX, this.stamina + CFG.STAMINA_REGEN * dt * 60);
    }
  }

  aimAt(wx, wy) {
    this.angle = Math.atan2(wy - this.wy, wx - this.wx);
  }

  // ── Shoot ────────────────────────────────────────────────
  tryShoot(now, bullets) {
    const wep = this.activeWeapon;
    if(!wep || this.reloading || !this.alive) return;
    if(now - this.lastShotTime < wep.fireRate) return;

    const key = this.activeWeaponKey;
    if(this.magAmmo[key] === undefined) this.magAmmo[key] = wep.magSize;
    if(this.magAmmo[key] <= 0) { this.startReload(now); return; }

    this.lastShotTime = now;
    this.magAmmo[key]--;
    this._recoilTime  = now;

    const pellets = wep.pellets || 1;
    for(let i = 0; i < pellets; i++) {
      bullets.push(new Bullet(
        this.wx, this.wy,
        this.angle,
        CFG.BULLET_SPEED,   // px/s from config
        wep.damage,
        wep.range,
        'player',
        wep.spread
      ));
    }
  }

  // ── Reload ───────────────────────────────────────────────
  startReload(now) {
    const wep = this.activeWeapon;
    if(!wep || this.reloading) return;
    const reserve = this.reserveAmmo[wep.ammoType] || 0;
    if(reserve <= 0) return;
    this.reloading = true;
    this.reloadEnd = now + wep.reloadTime;
  }

  updateReload(now) {
    if(!this.reloading) return;
    if(now >= this.reloadEnd) {
      this.reloading = false;
      const wep = this.activeWeapon;
      if(!wep) return;
      const key     = this.activeWeaponKey;
      const current = this.magAmmo[key] || 0;
      const needed  = wep.magSize - current;
      const reserve = this.reserveAmmo[wep.ammoType] || 0;
      const fill    = Math.min(needed, reserve);
      this.magAmmo[key]              = current + fill;
      this.reserveAmmo[wep.ammoType] = reserve - fill;
    }
  }

  // ── Use item ─────────────────────────────────────────────
  useItem(itemId, now) {
    const def = CFG.ITEMS[itemId];
    if(!def?.healAmt) return false;
    const slot = this.inventory.find(s => s.id === itemId);
    if(!slot || slot.qty < 1 || this.using) return false;
    this.using        = true;
    this.useEnd       = now + def.useTime;
    this._pendingHeal = { itemId, amount: def.healAmt };
    return true;
  }

  updateUse(now) {
    if(!this.using) return;
    if(now >= this.useEnd) {
      this.using = false;
      if(this._pendingHeal) {
        this.hp = Math.min(this.maxHp, this.hp + this._pendingHeal.amount);
        this.removeItem(this._pendingHeal.itemId, 1);
        this._pendingHeal = null;
      }
    }
  }

  // ── Inventory ────────────────────────────────────────────
  addItem(id, qty = 1) {
    const used = this.inventory.reduce((s, i) => s + i.qty, 0);
    if(used + qty > this.bagSlots) return false;
    const ex = this.inventory.find(i => i.id === id);
    if(ex) ex.qty += qty;
    else   this.inventory.push({ id, qty });
    return true;
  }

  removeItem(id, qty = 1) {
    const slot = this.inventory.find(i => i.id === id);
    if(!slot) return;
    slot.qty -= qty;
    if(slot.qty <= 0) this.inventory = this.inventory.filter(i => i.id !== id);
  }

  // ── Damage ───────────────────────────────────────────────
  takeDamage(amount) {
    const mit = Math.max(1, amount - this.armorVal * 0.4);
    this.hp = Math.max(0, this.hp - mit);
    this._hitFlash = performance.now();
    if(this.hp <= 0) this.die();
  }

  die() { this.alive = false; this.dead = true; }

  switchWeapon() {
    this.activeSlot = this.activeSlot === 'main' ? 'secondary' : 'main';
    this.reloading  = false;
  }

  // ── Draw ─────────────────────────────────────────────────
  draw(ctx, cam) {
    const sx = this.wx - cam.x;
    const sy = this.wy - cam.y;

    ctx.save();
    ctx.translate(sx, sy);

    // Hit flash
    const hitAge = performance.now() - (this._hitFlash || 0);
    if(hitAge < 120) {
      ctx.shadowColor = '#e74c3c';
      ctx.shadowBlur  = 20;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(2, 5, 10, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Body
    ctx.fillStyle = '#3a7d44';
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();

    // Armor overlay
    if(this.armor !== 'none') {
      ctx.fillStyle = 'rgba(80,105,140,0.55)';
      ctx.beginPath(); ctx.arc(0, 0, this.radius - 1, 0, Math.PI * 2); ctx.fill();
    }

    // Helmet
    if(this.helm !== 'none') {
      ctx.fillStyle = '#556b2f';
      ctx.beginPath(); ctx.arc(0, -2, this.radius - 4, 0, Math.PI * 2); ctx.fill();
    }

    // Gun barrel
    ctx.strokeStyle = this.reloading ? '#f39c12' : '#ccc';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(Math.cos(this.angle) * 4, Math.sin(this.angle) * 4);
    ctx.lineTo(Math.cos(this.angle) * (this.radius + 8), Math.sin(this.angle) * (this.radius + 8));
    ctx.stroke();

    // Muzzle flash
    const recoilAge = performance.now() - (this._recoilTime || 0);
    if(recoilAge < 60) {
      ctx.fillStyle   = 'rgba(255,230,100,0.8)';
      ctx.shadowColor = '#ffe07a'; ctx.shadowBlur = 10;
      const mx = Math.cos(this.angle) * (this.radius + 10);
      const my = Math.sin(this.angle) * (this.radius + 10);
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
    }

    // HP bar
    const bw = 24, bh = 4;
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#222';
    ctx.fillRect(-bw / 2, -this.radius - 10, bw, bh);
    ctx.fillStyle   = this.hp > 50 ? '#27ae60' : this.hp > 25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(-bw / 2, -this.radius - 10, bw * (this.hp / this.maxHp), bh);

    // Reload ring
    if(this.reloading) {
      const prog  = 1 - Math.max(0, (this.reloadEnd - performance.now()) / (this.activeWeapon?.reloadTime || 2000));
      ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Enemy ─────────────────────────────────────────────────────
class Enemy {
  constructor(wx, wy, typeName) {
    this.wx       = wx;
    this.wy       = wy;
    this.radius   = 10;
    this.angle    = Math.random() * Math.PI * 2;
    this.typeName = typeName;
    this.def      = CFG.ENEMY_TYPES[typeName];

    this.hp       = this.def.hp;
    this.maxHp    = this.def.hp;
    this.alive    = true;
    this.dead     = false;
    this.id       = ++Enemy._uid;

    this.state       = 'patrol';
    this.lastShot    = 0;
    this.alertTimer  = 0;
    this.patrolTarget = null;
    this.patrolWait   = 0;
    this.lootDropped  = false;
    this._hitFlash    = 0;
  }

  static _uid = 0;

  // ── AI Update (dt in seconds) ────────────────────────────
  update(player, world, bullets, now, dt) {
    if(!this.alive) return;

    const dx   = player.wx - this.wx;
    const dy   = player.wy - this.wy;
    const dist = Math.hypot(dx, dy);
    const canSee = dist < this.def.sight && player.alive && this._hasLoS(player, world);

    if(canSee) {
      this.state      = dist < this.def.attackRange ? 'attack' : 'chase';
      this.alertTimer = now + 4000;
    } else if(now < this.alertTimer) {
      this.state = 'search';
    } else {
      this.state = 'patrol';
    }

    switch(this.state) {
      case 'patrol': this._patrol(world, now, dt); break;
      case 'chase':
        this._moveToward(player.wx, player.wy, world, dt);
        this.angle = Math.atan2(dy, dx);
        break;
      case 'search':
        this._moveToward(
          player.wx + (Math.random() - 0.5) * 80,
          player.wy + (Math.random() - 0.5) * 80,
          world, dt
        );
        break;
      case 'attack':
        this.angle = Math.atan2(dy, dx);
        if(now - this.lastShot >= this.def.fireRate) {
          this.lastShot = now;
          bullets.push(new Bullet(
            this.wx, this.wy,
            this.angle + (Math.random() - 0.5) * 0.2,
            CFG.BULLET_SPEED * 0.85,   // slightly slower than player
            this.def.damage,
            this.def.attackRange * 1.3,
            'enemy'
          ));
        }
        break;
    }
  }

  _hasLoS(player, world) {
    const steps = 10;
    for(let i = 1; i < steps; i++) {
      const t = i / steps;
      if(!world.isWalkable(
        this.wx + (player.wx - this.wx) * t,
        this.wy + (player.wy - this.wy) * t
      )) return false;
    }
    return true;
  }

  _moveToward(tx, ty, world, dt) {
    const dx = tx - this.wx, dy = ty - this.wy;
    const d  = Math.hypot(dx, dy);
    if(d < 4) return;
    const spd  = this.def.speed * dt;
    const nx   = this.wx + (dx / d) * spd;
    const ny   = this.wy + (dy / d) * spd;
    if(world.isWalkable(nx, this.wy)) this.wx = nx;
    if(world.isWalkable(this.wx, ny)) this.wy = ny;
    this.angle = Math.atan2(dy, dx);
  }

  _patrol(world, now, dt) {
    if(!this.patrolTarget || now > this.patrolWait) {
      this.patrolTarget = {
        x: this.wx + (Math.random() - 0.5) * 140,
        y: this.wy + (Math.random() - 0.5) * 140,
      };
      this.patrolWait = now + 3000 + Math.random() * 2000;
    }
    this._moveToward(this.patrolTarget.x, this.patrolTarget.y, world, dt);
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this._hitFlash = performance.now();
    if(this.hp <= 0) this.die();
  }

  die() { this.alive = false; }

  dropLoot(world) {
    if(this.lootDropped) return;
    this.lootDropped = true;
    const table = this.def.lootTable;
    const count = 1 + Math.floor(Math.random() * 2);
    for(let i = 0; i < count; i++) {
      const id = table[Math.floor(Math.random() * table.length)];
      world.lootItems.push(new WorldItem(
        this.wx + (Math.random() - 0.5) * 24,
        this.wy + (Math.random() - 0.5) * 24,
        id
      ));
    }
    this.dead = true;
  }

  draw(ctx, cam) {
    if(this.dead) return;
    const sx = this.wx - cam.x;
    const sy = this.wy - cam.y;
    if(sx < -20 || sy < -20 || sx > cam.vw + 20 || sy > cam.vh + 20) return;

    ctx.save();
    ctx.translate(sx, sy);

    // Hit flash
    const hitAge = performance.now() - this._hitFlash;
    if(hitAge < 120) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(2, 5, 10, 5, 0, 0, Math.PI * 2); ctx.fill();

    // Body
    ctx.shadowBlur = 0;
    ctx.fillStyle  = this.alive ? this.def.color : '#444';
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();

    // Alert indicator
    if(this.state === 'attack' || this.state === 'chase') {
      ctx.fillStyle  = '#e74c3c';
      ctx.shadowColor = '#e74c3c'; ctx.shadowBlur = 6;
      ctx.font       = 'bold 13px monospace';
      ctx.textAlign  = 'center';
      ctx.fillText('!', 0, -this.radius - 4);
      ctx.shadowBlur = 0;
    } else if(this.state === 'search') {
      ctx.fillStyle = '#f39c12';
      ctx.font      = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', 0, -this.radius - 4);
    }

    // Barrel
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(Math.cos(this.angle) * 4, Math.sin(this.angle) * 4);
    ctx.lineTo(Math.cos(this.angle) * 14, Math.sin(this.angle) * 14);
    ctx.stroke();

    // HP bar
    const bw = 24, bh = 3;
    ctx.fillStyle = '#222';
    ctx.fillRect(-bw / 2, -this.radius - 8, bw, bh);
    ctx.fillStyle = this.hp / this.maxHp > 0.5 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(-bw / 2, -this.radius - 8, bw * (this.hp / this.maxHp), bh);

    ctx.restore();
  }
}
