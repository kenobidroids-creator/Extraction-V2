// ============================================================
//  main.js  –  Game state machine + main loop
//              States: bunker → raid → dead/extracted → bunker
// ============================================================

const GAME = {

  // ── State ────────────────────────────────────────────────
  state:   'bunker',   // 'bunker' | 'raid' | 'dead' | 'extracted' | 'paused'
  prevState: null,

  // Runtime raid objects
  world:    null,
  camera:   null,
  player:   null,
  enemies:  [],
  bullets:  [],

  // Raid timers
  raidStart:    0,
  raidTimeLeft: CFG.RAID_DURATION,

  // Save data
  saveData: null,

  // Nearby interaction tracking
  nearbyItem:       null,
  nearExtraction:   null,
  extractingZoneId: null,

  // ── Init ─────────────────────────────────────────────────
  init() {
    this.canvas  = document.getElementById('game-canvas');
    this.ctx     = this.canvas.getContext('2d');

    // Responsive canvas
    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(()=>this._resize(), 200));

    // Load persistent data
    this.saveData = STORAGE.load();

    // Camera
    this.camera = new Camera(this.canvas.width, this.canvas.height);

    // Input
    INPUT.init(this.canvas, this.camera);

    // UI
    UI.init();

    // Expose globally for UI hints
    window.GAME = this;

    // Show bunker
    this._showBunker();

    // Start loop
    this._lastTime = 0;
    requestAnimationFrame(t => this._loop(t));
  },

  // ── Resize ───────────────────────────────────────────────
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = window.innerWidth;
    const h   = window.innerHeight;
    this.canvas.width  = w;
    this.canvas.height = h;
    if(this.camera) this.camera.resize(w, h);
    // Update mobile UI layout
    this._updateMobileLayout(w, h);
  },

  _updateMobileLayout(w, h) {
    const mobile = document.getElementById('mobile-hud');
    if(!mobile) return;
    const isMobile = w < 900 || /Android|iPhone|iPad/i.test(navigator.userAgent);
    mobile.style.display = (isMobile && this.state === 'raid') ? 'block' : 'none';
  },

  // ── Main Loop ────────────────────────────────────────────
  _loop(time) {
    const rawDt = time - this._lastTime;
    // Cap dt at 100ms to prevent huge jumps after tab switch
    // Convert to seconds for all physics
    const dt = Math.min(rawDt, 100) / 1000;
    this._lastTime = time;

    const ctx = this.ctx;
    const vw  = this.canvas.width;
    const vh  = this.canvas.height;

    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, vw, vh);

    switch(this.state) {
      case 'raid':      this._updateRaid(time, dt, ctx, vw, vh); break;
      case 'bunker':    this._drawBunkerBg(ctx, vw, vh); break;
      case 'dead':      this._drawEndScreen(ctx, vw, vh, false); break;
      case 'extracted': this._drawEndScreen(ctx, vw, vh, true); break;
      case 'paused':    this._drawPauseScreen(ctx, vw, vh); break;
    }

    requestAnimationFrame(t => this._loop(t));
  },

  // ── Bunker background (canvas layer under DOM) ───────────
  _drawBunkerBg(ctx, vw, vh) {
    // Atmospheric dark grid
    ctx.fillStyle = '#0d0f0d';
    ctx.fillRect(0, 0, vw, vh);
    ctx.strokeStyle = '#1a2a1a';
    ctx.lineWidth   = 1;
    const sz = 40;
    for(let x=0;x<vw;x+=sz){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,vh); ctx.stroke(); }
    for(let y=0;y<vh;y+=sz){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(vw,y); ctx.stroke(); }
  },

  // ── Raid State ───────────────────────────────────────────
  _updateRaid(time, dt, ctx, vw, vh) {
    // Reset "seen" flags for fog
    for(const t of this.world.tiles) t.seen = false;

    // Reveal around player
    this.world.revealAround(this.player.wx, this.player.wy, CFG.FOG_RADIUS);
    // Reveal extraction zones near player
    for(const ex of this.world.extractions) {
      const d = Math.hypot(ex.wx-this.player.wx, ex.wy-this.player.wy);
      if(d < CFG.FOG_RADIUS * 1.5) ex.revealed = true;
    }

    // Update camera
    this.camera.follow(this.player.wx, this.player.wy);
    INPUT.updateMouseWorld();
    INPUT.updateJoystick();

    // Pause toggle (consume once per press)
    if(INPUT.pause) { INPUT.pause = false; this._togglePause(); return; }

    // Skip all gameplay input if inventory or map open
    const overlayOpen = INPUT.mapOpen || INPUT.openInv;

    // ── Player input ──
    if(!overlayOpen) {
      const { dx, dy } = INPUT.getMovement();
      this.player.move(dx, dy, this.world, dt);

      // Aim toward mouse/touch world position
      this.player.aimAt(INPUT.mouseWX, INPUT.mouseWY);

      // Shooting — auto weapons fire while held, semi-auto only on _fireOnce
      const wep = this.player.activeWeapon;
      if(wep) {
        if(wep.auto && INPUT.shoot) {
          this.player.tryShoot(time, this.bullets);
        } else if(!wep.auto && INPUT._fireOnce) {
          this.player.tryShoot(time, this.bullets);
        }
      }
      // Always consume _fireOnce
      INPUT._fireOnce = false;

      // Reload
      if(INPUT.reload) { INPUT.reload = false; this.player.startReload(time); }

      // Switch weapon
      if(INPUT.switchWep) { INPUT.switchWep = false; this.player.switchWeapon(); }

      // Use medical
      if(INPUT.useItem) { INPUT.useItem = false; this._useFirstMedical(time); }

      // Drop first bag item [G]
      if(INPUT.dropItem) {
        INPUT.dropItem = false;
        this._dropFirstBagItem();
      }
    } else {
      INPUT._fireOnce = false; // discard shots while overlay open
    }

    // Timers
    this.player.updateReload(time);
    this.player.updateUse(time);

    // ── Raid timer ──
    this.raidTimeLeft = Math.max(0, CFG.RAID_DURATION - (time - this.raidStart)/1000);
    if(this.raidTimeLeft <= 0) {
      UI.notify('TIME UP! All extractions closed!', '#e74c3c');
      this._playerDied();
      return;
    }

    // ── Nearby item ──
    this.nearbyItem     = null;
    this.nearExtraction = null;
    const PICK_RANGE    = 40;
    const EXTRAC_RANGE  = CFG.EXTRACTION_RADIUS;

    // Check loot items
    for(const item of this.world.lootItems) {
      const d = Math.hypot(item.wx-this.player.wx, item.wy-this.player.wy);
      if(d < PICK_RANGE) { this.nearbyItem = item; break; }
    }

    // Check extraction zones
    for(const ex of this.world.extractions) {
      if(!ex.active) continue;
      const d = Math.hypot(ex.wx-this.player.wx, ex.wy-this.player.wy);
      if(d < EXTRAC_RANGE) { this.nearExtraction = ex; break; }
    }

    // Interact key — pickup or hold to extract
    if(INPUT.interact && this.nearbyItem && !this.nearExtraction) {
      INPUT.interact = false;
      this._pickupItem(this.nearbyItem);
    }

    // Extraction hold (hold F while in extraction zone)
    this._handleExtraction(time);

    // ── Update bullets ──
    for(const b of this.bullets) b.update(this.world, dt);

    // ── Bullet ↔ enemy collision ──
    for(const b of this.bullets) {
      if(b.dead || b.owner !== 'player') continue;
      for(const en of this.enemies) {
        if(!en.alive) continue;
        const d = Math.hypot(en.wx-b.wx, en.wy-b.wy);
        if(d < en.radius + 4) {
          en.takeDamage(b.damage);
          b.dead = true;
          if(!en.alive) {
            en.dropLoot(this.world);
            this.player.kills++;
            UI.notify(`+ ${en.def.xp} XP`, '#e8b84b');
          }
          break;
        }
      }
    }

    // ── Bullet ↔ player collision ──
    for(const b of this.bullets) {
      if(b.dead || b.owner !== 'enemy') continue;
      const d = Math.hypot(this.player.wx-b.wx, this.player.wy-b.wy);
      if(d < this.player.radius + 3) {
        this.player.takeDamage(b.damage);
        b.dead = true;
        if(!this.player.alive) { this._playerDied(); return; }
      }
    }

    // ── Update enemies ──
    for(const en of this.enemies) {
      if(!en.alive && !en.dead) { en.dropLoot(this.world); continue; }
      if(en.dead) continue;
      en.update(this.player, this.world, this.bullets, time, dt);
    }

    // Cull dead entities
    this.enemies = this.enemies.filter(en => !en.dead);
    this.bullets = this.bullets.filter(b  => !b.dead);

    // ── Draw world ──
    this.world.draw(ctx, this.camera);

    // ── Draw extraction zones ──
    this._drawExtractions(ctx, time);

    // ── Draw loot items ──
    for(const item of this.world.lootItems) item.draw(ctx, this.camera, time);

    // ── Draw enemies ──
    for(const en of this.enemies) en.draw(ctx, this.camera);

    // ── Draw player ──
    this.player.draw(ctx, this.camera);

    // ── Draw bullets ──
    for(const b of this.bullets) b.draw(ctx, this.camera);

    // ── Draw HUD ──
    const extractProg = this._extractionProgress(time);
    UI.drawHUD(ctx, this.player, this.raidTimeLeft, vw, vh, extractProg);
    UI.drawMinimap(ctx, this.world, this.player, vw, vh);
    UI.drawNotifications(ctx, vw, vh);
    if(INPUT.mapOpen) UI.drawMapOverlay(ctx, this.world, this.player, vw, vh);
    if(INPUT.openInv)  UI.drawRaidInventory(ctx, this.player, vw, vh);

    // Joystick overlay
    INPUT.drawJoystick(ctx);

    // Mobile layout update
    this._updateMobileLayout(vw, vh);
  },

  // ── Draw extraction zones ────────────────────────────────
  _drawExtractions(ctx, time) {
    for(const ex of this.world.extractions) {
      if(!ex.revealed) continue;
      const { sx, sy } = this.camera.worldToScreen(ex.wx, ex.wy);
      const pulse = Math.abs(Math.sin(time*0.003))*10;
      ctx.save();
      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth   = 2;
      ctx.setLineDash([6,4]);
      ctx.beginPath();
      ctx.arc(sx, sy, ex.radius + pulse, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(46,204,113,0.08)';
      ctx.beginPath();
      ctx.arc(sx, sy, ex.radius, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle   = '#2ecc71';
      ctx.font        = 'bold 11px "Share Tech Mono",monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(ex.label, sx, sy - ex.radius - 6);
      ctx.restore();
    }
  },

  // ── Extraction hold logic ────────────────────────────────
  _handleExtraction(time) {
    // Player must be holding F (INPUT.interact=true, not consumed) while in zone
    if(this.nearExtraction && INPUT.interact) {
      if(!this._extractStart) this._extractStart = time;
      this._holdingExtract = true;
      const progress = (time - this._extractStart) / CFG.EXTRACTION_TIME;
      if(progress >= 1) {
        this._extractStart   = null;
        this._holdingExtract = false;
        INPUT.interact       = false;
        this._playerExtracted();
      }
    } else {
      this._extractStart   = null;
      this._holdingExtract = false;
    }
  },

  _extractionProgress(time) {
    if(!this._holdingExtract || !this._extractStart) return 0;
    return Math.min(1, (time - this._extractStart) / CFG.EXTRACTION_TIME);
  },

  // ── Pickup ───────────────────────────────────────────────
  _pickupItem(item) {
    const id = item.lootId;
    let picked = false;

    // Weapon pickups: fill empty slot first, otherwise bag
    if(id.startsWith('W:')) {
      const key  = id.slice(2);
      const wep  = CFG.WEAPONS[key];
      const isSecondary = wep.slot === 'secondary';  // pistols
      if(!isSecondary && !this.player.mainWep) {
        // Auto-equip to primary slot
        this.player.mainWep = key;
        this.player.magAmmo[key] = wep.magSize;
        if(this.player.activeSlot !== 'main') this.player.activeSlot = 'main';
        picked = true;
        UI.notify(`🔫 Equipped ${wep.label} → Primary`, '#e8b84b');
      } else if(isSecondary && !this.player.secWep) {
        // Auto-equip to secondary slot
        this.player.secWep = key;
        this.player.magAmmo[key] = wep.magSize;
        picked = true;
        UI.notify(`🔫 Equipped ${wep.label} → Secondary`, '#e8b84b');
      } else if(!isSecondary && !this.player.secWep) {
        // Primary full but secondary empty — offer it there
        this.player.secWep = key;
        this.player.magAmmo[key] = wep.magSize;
        picked = true;
        UI.notify(`🔫 Equipped ${wep.label} → Secondary`, '#e8b84b');
      } else {
        // Both slots full — add to bag
        picked = this.player.addItem(id, 1);
        if(picked) UI.notify(`+ ${wep.label} in bag`, '#ddd');
        else UI.notify('Bag full! [G] to drop something', '#e74c3c');
      }
    } else if(id.startsWith('H:')) {
      this.player.helm = id.slice(2);
      picked = true;
      UI.notify(`Equipped ${CFG.HELMETS[id.slice(2)].label}`, '#7ecfff');
    } else if(id.startsWith('A:')) {
      this.player.armor = id.slice(2);
      picked = true;
      UI.notify(`Equipped ${CFG.ARMORS[id.slice(2)].label}`, '#7ecfff');
    } else if(id.startsWith('B:')) {
      this.player.bag = id.slice(2);
      picked = true;
      UI.notify(`Equipped ${CFG.BAGS[id.slice(2)].label}`, '#7ecfff');
    } else {
      // Regular item / ammo / consumable
      const def = CFG.ITEMS[id];
      if(def) {
        if(def.type === 'ammo') {
          this.player.reserveAmmo[def.ammoType] = (this.player.reserveAmmo[def.ammoType]||0) + def.qty;
          picked = true;
          UI.notify(`+ ${def.label}`, '#ddd');
        } else {
          picked = this.player.addItem(id, 1);
          if(picked) UI.notify(`+ ${def.label}`, '#ddd');
          else UI.notify('Bag full!', '#e74c3c');
        }
      }
    }

    if(picked) {
      this.world.lootItems = this.world.lootItems.filter(i => i.id !== item.id);
      this.nearbyItem = null;
    }
  },

  // ── Drop first bag item ─────────────────────────────────
  _dropFirstBagItem() {
    const inv = this.player.inventory;
    if(inv.length === 0) { UI.notify('Bag empty', '#888'); return; }
    const slot = inv[0];
    const id   = slot.id;
    // Spawn on ground
    this.world.lootItems.push(new WorldItem(
      this.player.wx + (Math.random()-0.5)*30,
      this.player.wy + 20,
      id
    ));
    this.player.removeItem(id, 1);
    UI.notify(`Dropped ${WorldItem.getLabel(id)}`, '#888');
  },

  // ── Use first available medical ──────────────────────────
  _useFirstMedical(time) {
    const medOrder = ['medkit','painkillers','bandage'];
    for(const id of medOrder) {
      if(this.player.useItem(id, time)) {
        UI.notify(`Using ${CFG.ITEMS[id].label}...`, '#2ecc71');
        return;
      }
    }
    UI.notify('No meds!', '#e74c3c');
  },

  // ── Start Raid ───────────────────────────────────────────
  startRaid() {
    // Hide bunker DOM
    document.getElementById('bunker-screen').style.display = 'none';
    document.getElementById('market-screen').style.display = 'none';

    // Generate world
    this.world   = new World();
    this.bullets = [];
    this.enemies = [];
    this._holdingExtract = false;
    this._extractStart   = null;

    // Build player from loadout
    const spawn = this.world.playerSpawn;
    this.player = new Player(spawn.x, spawn.y);

    const ld = this.saveData.loadout;
    this.player.mainWep = ld.mainWep || null;
    this.player.secWep  = ld.secWep  || null;
    this.player.helm    = ld.helm    || 'none';
    this.player.armor   = ld.armor   || 'none';
    this.player.bag     = ld.bag     || 'none';

    // Mag ammo for equipped weapons
    if(this.player.mainWep) this.player.magAmmo[this.player.mainWep] = CFG.WEAPONS[this.player.mainWep].magSize;
    if(this.player.secWep)  this.player.magAmmo[this.player.secWep]  = CFG.WEAPONS[this.player.secWep].magSize;

    const { inventory, reserveAmmo } = STORAGE.buildRaidLoadout(this.saveData);
    this.player.inventory    = inventory;
    this.player.reserveAmmo  = reserveAmmo;

    // Consume gear from stash (no stash-lock for prototype)
    // In future: lock gear going into raid

    // Spawn enemies
    const spawns = this.world.enemySpawns;
    const types  = Object.keys(CFG.ENEMY_TYPES);
    const weights= [0.5, 0.35, 0.15]; // scavenger, guard, heavy
    for(let i=0;i<Math.min(CFG.ENEMY_SPAWN_PER_RAID, spawns.length);i++){
      const sp = spawns[i];
      let r = Math.random(), typeIdx = 0;
      for(let t=0;t<weights.length;t++){ r-=weights[t]; if(r<=0){ typeIdx=t; break; } }
      this.enemies.push(new Enemy(sp.x, sp.y, types[typeIdx]));
    }

    // Camera snap to player
    this.camera.x = this.player.wx - this.camera.vw/2;
    this.camera.y = this.player.wy - this.camera.vh/2;

    // Raid timer
    this.raidStart    = performance.now();
    this.raidTimeLeft = CFG.RAID_DURATION;

    // Handle single shots via mousedown
    this.canvas.addEventListener('mousedown', e => {
      if(e.button===0 && this.state==='raid') INPUT._fireOnce = true;
    });

    this.state = 'raid';
    this._updateMobileLayout(this.canvas.width, this.canvas.height);
    UI.notify('Raid started. Extract to survive.', '#e8b84b', 4000);
  },

  // ── Player Extracted ─────────────────────────────────────
  _playerExtracted() {
    STORAGE.extractionPayout(this.saveData, this.player);
    this.state = 'extracted';
    UI.activeScreen = 'extracted';
    setTimeout(()=>{ this._showBunker(); }, 3500);
  },

  // ── Player Died ──────────────────────────────────────────
  _playerDied() {
    STORAGE.deathPenalty(this.saveData, this.player);
    this.player.alive = false;
    this.state = 'dead';
    setTimeout(()=>{ this._showBunker(); }, 3500);
  },

  // ── End Screen ───────────────────────────────────────────
  _drawEndScreen(ctx, vw, vh, extracted) {
    ctx.fillStyle = extracted ? 'rgba(0,40,0,0.85)' : 'rgba(40,0,0,0.85)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = extracted ? '#2ecc71' : '#e74c3c';
    ctx.font      = 'bold 42px "Share Tech Mono",monospace';
    ctx.fillText(extracted ? '✓ EXTRACTED' : '✗ KILLED IN ACTION', vw/2, vh/2-30);
    ctx.fillStyle = '#aaa';
    ctx.font      = '18px "Share Tech Mono",monospace';
    ctx.fillText(extracted ? 'Returning to bunker...' : 'You lost your gear. Returning...', vw/2, vh/2+20);
    if(this.player){
      ctx.fillStyle = '#ddd';
      ctx.font      = '14px "Share Tech Mono",monospace';
      ctx.fillText(`Kills: ${this.player.kills}   Cash: $${(this.player.cash||0).toLocaleString()}`, vw/2, vh/2+50);
    }
  },

  // ── Pause Screen ────────────────────────────────────────
  _drawPauseScreen(ctx, vw, vh) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle   = '#e8b84b';
    ctx.font        = 'bold 36px "Share Tech Mono",monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('PAUSED', vw/2, vh/2);
    ctx.fillStyle   = '#aaa';
    ctx.font        = '16px "Share Tech Mono",monospace';
    ctx.fillText('[ESC] Resume', vw/2, vh/2+40);
  },

  _togglePause() {
    if(this.state==='raid')   { this.prevState='raid'; this.state='paused'; }
    else if(this.state==='paused') { this.state=this.prevState||'raid'; }
  },

  // ══════════════════════════════════════════════════════════
  //  BUNKER SCREEN
  // ══════════════════════════════════════════════════════════

  _showBunker() {
    this.state = 'bunker';
    this._updateMobileLayout(this.canvas.width, this.canvas.height);
    document.getElementById('bunker-screen').style.display = 'flex';
    document.getElementById('market-screen').style.display = 'none';
    this._renderBunkerUI();
    this._initBunkerInteractions();  // bind once each time screen shown
  },

  _renderBunkerUI() {
    const d = this.saveData;
    const ce = document.getElementById('bunker-cash');
    if(ce) ce.textContent = `$${d.cash.toLocaleString()}`;
    const se = document.getElementById('bunker-stats');
    if(se) se.textContent = `Raids: ${d.stats.totalRaids}  |  Extractions: ${d.stats.totalExtracts}  |  Kills: ${d.stats.totalKills}`;

    this._renderEquipSlots();
    this._renderBagGrid();
    this._renderStashGrid();
    // Re-bind drag targets every render (eq-slots persist but need fresh listeners after rebuild)
    this._bindEqSlotDrop();
    this._bindEqClearBtns();
  },

  // ── Equip slots (left panel) ────────────────────────────
  _renderEquipSlots() {
    const ld = this.saveData.loadout;

    const slots = [
      { domId:'eq-helm',  valId:'eq-helm-val',  key: ld.helm,    cfg: CFG.HELMETS, slotName:'helm'   },
      { domId:'eq-main',  valId:'eq-main-val',  key: ld.mainWep, cfg: CFG.WEAPONS, slotName:'mainWep'},
      { domId:'eq-sec',   valId:'eq-sec-val',   key: ld.secWep,  cfg: CFG.WEAPONS, slotName:'secWep' },
      { domId:'eq-armor', valId:'eq-armor-val', key: ld.armor,   cfg: CFG.ARMORS,  slotName:'armor'  },
      { domId:'eq-bag',   valId:'eq-bag-val',   key: ld.bag,     cfg: CFG.BAGS,    slotName:'bag'    },
    ];

    for(const s of slots) {
      const el    = document.getElementById(s.domId);
      const valEl = document.getElementById(s.valId);
      if(!el || !valEl) continue;

      const isFilled = s.key && s.key !== 'none' && s.cfg[s.key];
      const label    = isFilled ? s.cfg[s.key].label : null;

      valEl.textContent = label || (s.slotName.includes('Wep') ? '— Empty —' : '— None —');
      valEl.className   = 'eq-val' + (isFilled ? '' : ' empty');
      el.classList.toggle('filled', !!isFilled);
    }

    // Stats summary
    const statsEl = document.getElementById('loadout-stats');
    if(statsEl) {
      const armorVal = (CFG.ARMORS[ld.armor]?.armor || 0) + (CFG.HELMETS[ld.helm]?.armor || 0);
      const bagSlots = CFG.BAGS[ld.bag]?.slots || 0;
      const packed   = (ld.items || []).reduce((s, i) => s + i.qty, 0);
      const mainLbl  = ld.mainWep ? `${CFG.WEAPONS[ld.mainWep]?.magSize}rnd` : '—';
      const secLbl   = ld.secWep  ? `${CFG.WEAPONS[ld.secWep]?.magSize}rnd`  : '—';
      statsEl.innerHTML = `
        <div>Armor <span>${armorVal}</span></div>
        <div>Bag <span>${packed}/${bagSlots}</span></div>
        <div>Main mag <span>${mainLbl}</span></div>
        <div>Sec mag <span>${secLbl}</span></div>
      `;
    }
  },

  // ── Bag grid (middle panel) ─────────────────────────────
  _renderBagGrid() {
    const el = document.getElementById('bag-grid');
    if(!el) return;
    el.innerHTML = '';

    const ld       = this.saveData.loadout;
    const bagSlots = CFG.BAGS[ld.bag]?.slots || 0;
    const items    = ld.items || [];
    const packed   = items.reduce((s, i) => s + i.qty, 0);

    // Slots label
    const lbl = document.getElementById('bag-slots-label');
    const bagName = ld.bag && ld.bag !== 'none' ? CFG.BAGS[ld.bag]?.label : 'No bag equipped';
    if(lbl) lbl.textContent = ld.bag && ld.bag !== 'none'
      ? `${packed}/${bagSlots} slots  (${bagName})`
      : `No bag — equip one to carry items`;

    // Flat list of all packed items
    const flatItems = [];
    for(const it of items) {
      for(let q = 0; q < it.qty; q++) flatItems.push(it.id);
    }

    // Render filled + empty cells
    for(let i = 0; i < Math.max(bagSlots, flatItems.length); i++) {
      const id   = i < flatItems.length ? flatItems[i] : null;
      const cell = document.createElement('div');
      cell.className = 'bag-cell' + (id ? ' occupied' : (i < bagSlots ? ' empty-slot' : ' empty-slot'));

      if(id) {
        const { icon } = WorldItem.getIcon(id);
        const def      = CFG.ITEMS[id];
        cell.innerHTML = `<span class="cell-icon">${icon}</span><span class="cell-name">${(def?.label || id).slice(0,10)}</span>`;
        cell.title     = `${def?.label || id} — click to remove`;
        // Click to remove one from bag
        cell.addEventListener('click', () => {
          const idx = ld.items.findIndex(it => it.id === id);
          if(idx !== -1) {
            ld.items[idx].qty--;
            if(ld.items[idx].qty <= 0) ld.items.splice(idx, 1);
            STORAGE.save(this.saveData);
            this._renderBunkerUI();
          }
        });
      } else {
        cell.innerHTML = '<span style="font-size:10px; color:#1a2a1a;">·</span>';
      }
      el.appendChild(cell);
    }

    if(bagSlots === 0) {
      el.innerHTML = '<div class="empty-stash">Equip a backpack to carry items into raid</div>';
    }
  },

  // ── Stash grid (right panel) ────────────────────────────
  _stashFilter: 'all',

  _renderStashGrid() {
    const el = document.getElementById('stash-grid');
    if(!el) return;
    el.innerHTML = '';
    const ld    = this.saveData.loadout;
    const filt  = this._stashFilter;
    let   count = 0;

    for(const item of this.saveData.stash) {
      const id  = item.id;

      // Filter check
      if(filt !== 'all') {
        if(filt === 'W' && !id.startsWith('W:'))       continue;
        if(filt === 'H' && !id.startsWith('H:'))       continue;
        if(filt === 'A' && !id.startsWith('A:'))       continue;
        if(filt === 'B' && !id.startsWith('B:'))       continue;
        if(filt === 'medical' && CFG.ITEMS[id]?.type !== 'medical') continue;
        if(filt === 'ammo'    && CFG.ITEMS[id]?.type !== 'ammo')    continue;
        if(filt === 'junk'    && CFG.ITEMS[id]?.type !== 'junk')    continue;
        if(['W','H','A','B','medical','ammo','junk'].includes(filt)) {
          // already handled above — skip if none matched
        }
      }

      count++;
      const label = WorldItem.getLabel(id);
      const value = WorldItem.getValue(id);
      const { icon, col } = WorldItem.getIcon(id);

      // Category label
      let cat = 'ITEM';
      if(id.startsWith('W:'))                     cat = CFG.WEAPONS[id.slice(2)]?.type?.toUpperCase() || 'GUN';
      else if(id.startsWith('H:'))                cat = 'HELMET';
      else if(id.startsWith('A:'))                cat = 'ARMOR';
      else if(id.startsWith('B:'))                cat = 'BAG';
      else if(CFG.ITEMS[id]?.type === 'medical')  cat = 'MED';
      else if(CFG.ITEMS[id]?.type === 'ammo')     cat = 'AMMO';
      else if(CFG.ITEMS[id]?.type === 'currency') cat = 'CASH';
      else if(CFG.ITEMS[id]?.type === 'junk')     cat = 'JUNK';

      // Equipped check
      const rawKey    = id.includes(':') ? id.slice(2) : id;
      const isEquipped = (ld.mainWep === rawKey) || (ld.secWep === rawKey) ||
                         (ld.helm  === rawKey && ld.helm  !== 'none') ||
                         (ld.armor === rawKey && ld.armor !== 'none') ||
                         (ld.bag   === rawKey && ld.bag   !== 'none');

      const card = document.createElement('div');
      card.className   = 'stash-card' + (isEquipped ? ' equipped' : '');
      card.draggable   = true;
      card.dataset.id  = id;
      card.title       = `${label}\n$${value.toLocaleString()}`;
      card.innerHTML   = `
        <span class="card-icon">${icon}</span>
        <span class="card-cat" style="color:${col}">${cat}</span>
        <span class="card-name">${label}</span>
        <span class="card-qty">×${item.qty}</span>
        ${isEquipped ? '<span class="card-eq-badge">✓</span>' : ''}
      `;

      // Click to equip/pack
      card.addEventListener('click', () => this._equipItem(id));

      // Drag start
      card.addEventListener('dragstart', e => {
        this._dragId = id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        const ghost = document.getElementById('drag-ghost');
        if(ghost) { ghost.textContent = label; ghost.style.display = 'block'; }
      });
      card.addEventListener('dragend', () => {
        this._dragId = null;
        card.classList.remove('dragging');
        const ghost = document.getElementById('drag-ghost');
        if(ghost) ghost.style.display = 'none';
      });

      // Tooltip on hover
      card.addEventListener('mouseenter', e => this._showTooltip(e, id, label, value, col, cat));
      card.addEventListener('mouseleave', ()  => this._hideTooltip());
      card.addEventListener('mousemove',  e  => this._moveTooltip(e));

      el.appendChild(card);
    }

    // Stash count
    const sc = document.getElementById('stash-count');
    if(sc) sc.textContent = `${count} item${count !== 1 ? 's' : ''}`;

    if(count === 0) {
      el.innerHTML = '<div class="empty-stash">Nothing here — visit the Market to buy gear!</div>';
    }
  },

  // ── Tooltip ─────────────────────────────────────────────
  _showTooltip(e, id, label, value, col, cat) {
    const tt = document.getElementById('item-tooltip');
    if(!tt) return;
    let details = `<div class="tt-name">${label}</div>`;
    details += `<div class="tt-row"><span>Type:</span> <span>${cat}</span></div>`;
    details += `<div class="tt-row"><span>Value:</span> <span>$${value.toLocaleString()}</span></div>`;
    // Weapon stats
    if(id.startsWith('W:')) {
      const wep = CFG.WEAPONS[id.slice(2)];
      if(wep) {
        details += `<div class="tt-row"><span>Damage:</span><span>${wep.damage}</span></div>`;
        details += `<div class="tt-row"><span>Fire rate:</span><span>${wep.fireRate}ms</span></div>`;
        details += `<div class="tt-row"><span>Mag:</span><span>${wep.magSize}rnd</span></div>`;
        details += `<div class="tt-row"><span>Range:</span><span>${wep.range}px</span></div>`;
        details += `<div class="tt-row"><span>Ammo:</span><span>${wep.ammoType}</span></div>`;
      }
    }
    // Armor stats
    if(id.startsWith('A:') || id.startsWith('H:')) {
      const cfg = id.startsWith('A:') ? CFG.ARMORS[id.slice(2)] : CFG.HELMETS[id.slice(2)];
      if(cfg) details += `<div class="tt-row"><span>Armor:</span><span>${cfg.armor}</span></div>`;
    }
    // Bag stats
    if(id.startsWith('B:')) {
      const cfg = CFG.BAGS[id.slice(2)];
      if(cfg) details += `<div class="tt-row"><span>Slots:</span><span>${cfg.slots}</span></div>`;
    }
    // Med stats
    if(CFG.ITEMS[id]?.healAmt) {
      details += `<div class="tt-row"><span>Heals:</span><span>+${CFG.ITEMS[id].healAmt} HP</span></div>`;
    }
    tt.innerHTML  = details;
    tt.style.display = 'block';
    this._moveTooltip(e);
  },
  _moveTooltip(e) {
    const tt = document.getElementById('item-tooltip');
    if(!tt || tt.style.display === 'none') return;
    const x = Math.min(e.clientX + 14, window.innerWidth  - 240);
    const y = Math.min(e.clientY + 14, window.innerHeight - 200);
    tt.style.left = x + 'px';
    tt.style.top  = y + 'px';
  },
  _hideTooltip() {
    const tt = document.getElementById('item-tooltip');
    if(tt) tt.style.display = 'none';
  },

  // ── Equip / pack item ────────────────────────────────────
  _equipItem(id) {
    const ld = this.saveData.loadout;
    let msg = '', color = '#e8b84b';

    if(id.startsWith('W:')) {
      const key = id.slice(2);
      const wep = CFG.WEAPONS[key];
      if(!wep) return;
      // SMG and rifle → main; pistol → secondary
      if(wep.type === 'pistol') {
        ld.secWep = key;
        msg = `Secondary: ${wep.label}`; color = '#e8b84b';
      } else {
        ld.mainWep = key;
        msg = `Primary: ${wep.label}`; color = '#e8b84b';
      }
    } else if(id.startsWith('H:')) {
      ld.helm  = id.slice(2);
      msg = `Head: ${CFG.HELMETS[ld.helm]?.label}`; color = '#5dade2';
    } else if(id.startsWith('A:')) {
      ld.armor = id.slice(2);
      msg = `Armor: ${CFG.ARMORS[ld.armor]?.label}`; color = '#5dade2';
    } else if(id.startsWith('B:')) {
      ld.bag = id.slice(2);
      msg = `Bag: ${CFG.BAGS[ld.bag]?.label}`; color = '#8e44ad';
    } else {
      // Consumable/ammo → pack into bag
      const bagSlots = CFG.BAGS[ld.bag]?.slots || 0;
      const packed   = (ld.items || []).reduce((s, i) => s + i.qty, 0);
      if(packed >= bagSlots && bagSlots > 0) {
        UI.notify('Bag is full!', '#e74c3c', 2000);
        STORAGE.save(this.saveData);
        this._renderBunkerUI();
        return;
      }
      ld.items = ld.items || [];
      const ex = ld.items.find(i => i.id === id);
      if(ex) ex.qty++;
      else ld.items.push({ id, qty: 1 });
      msg = `+1 ${WorldItem.getLabel(id)} packed`; color = '#aaa';
    }

    if(msg) UI.notify(msg, color, 1800);
    STORAGE.save(this.saveData);
    this._renderBunkerUI();
  },

  // ── Unequip slot ─────────────────────────────────────────
  _unequipSlot(slotName) {
    const ld = this.saveData.loadout;
    if(slotName === 'helm')   ld.helm   = 'none';
    if(slotName === 'armor')  ld.armor  = 'none';
    if(slotName === 'bag')    { ld.bag = 'none'; ld.items = []; }
    if(slotName === 'mainWep') ld.mainWep = null;
    if(slotName === 'secWep')  ld.secWep  = null;
    UI.notify('Unequipped', '#888', 1200);
    STORAGE.save(this.saveData);
    this._renderBunkerUI();
  },

  // ── Bind all interactive elements once per show ──────────
  _initBunkerInteractions() {
    this._bindEqSlotDrop();
    this._bindEqClearBtns();

    // Stash filter tabs
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
        fresh.classList.add('active');
        this._stashFilter = fresh.dataset.filter;
        this._renderStashGrid();
        this._bindEqSlotDrop(); // rebind after stash re-render
      });
    });

    // Drag ghost tracking (once only)
    if(!this._ghostBound) {
      this._ghostBound = true;
      document.addEventListener('mousemove', e => {
        const g = document.getElementById('drag-ghost');
        if(g && g.style.display !== 'none') {
          g.style.left = e.clientX + 'px';
          g.style.top  = e.clientY + 'px';
        }
      });
    }
  },

  _bindEqSlotDrop() {
    document.querySelectorAll('.eq-slot').forEach(slot => {
      // Remove old listeners by cloning
      const fresh = slot.cloneNode(true);
      slot.parentNode.replaceChild(fresh, slot);
      fresh.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); fresh.classList.add('drag-over'); });
      fresh.addEventListener('dragleave', e => { fresh.classList.remove('drag-over'); });
      fresh.addEventListener('drop',      e => {
        e.preventDefault();
        e.stopPropagation();
        fresh.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain') || this._dragId;
        if(id) this._equipItem(id);
      });
      // Also click-to-equip from stash doesn't need this, but clicking an eq-slot with a
      // drag-id active (touch) should work too
    });
    // Re-bind clear buttons since cloneNode above copies them without listeners
    this._bindEqClearBtns();
  },

  _bindEqClearBtns() {
    document.querySelectorAll('.eq-clear').forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', e => {
        e.stopPropagation();
        this._unequipSlot(fresh.dataset.slot);
      });
    });
  },

  // ══════════════════════════════════════════════════════════
  //  MARKET
  // ══════════════════════════════════════════════════════════

  openMarket() {
    document.getElementById('bunker-screen').style.display = 'none';
    document.getElementById('market-screen').style.display = 'flex';
    this._marketFilter = 'all';
    this._renderMarket();
    // Bind market filter tabs
    document.querySelectorAll('.filter-btn[data-mfilter]').forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn[data-mfilter]').forEach(b => b.classList.remove('active'));
        fresh.classList.add('active');
        this._marketFilter = fresh.dataset.mfilter;
        this._renderMarket();
      });
    });
  },

  closeMarket() {
    document.getElementById('market-screen').style.display = 'none';
    this._showBunker();
  },

  _marketFilter: 'all',

  _renderMarket() {
    const el   = document.getElementById('market-listings');
    if(!el) return;
    el.innerHTML = '';
    const data  = this.saveData;
    const filt  = this._marketFilter;

    const allListings = [
      ...Object.entries(CFG.WEAPONS).map(([k,v])=>({ id:'W:'+k, label:v.label, value:v.value, cat:'W' })),
      ...Object.entries(CFG.HELMETS).filter(([k])=>k!=='none').map(([k,v])=>({ id:'H:'+k, label:v.label, value:v.value, cat:'H' })),
      ...Object.entries(CFG.ARMORS).filter(([k])=>k!=='none').map(([k,v])=>({ id:'A:'+k, label:v.label, value:v.value, cat:'A' })),
      ...Object.entries(CFG.BAGS).filter(([k])=>k!=='none').map(([k,v])=>({ id:'B:'+k, label:v.label, value:v.value, cat:'B' })),
      ...Object.entries(CFG.ITEMS).map(([k,v])=>({ id:k, label:v.label, value:v.value, cat: v.type })),
    ];

    const filtered = filt === 'all' ? allListings : allListings.filter(i => i.cat === filt || i.id.startsWith(filt + ':'));

    for(const item of filtered) {
      const buyPrice  = Math.floor(item.value * CFG.MARKET_BUY_MUL);
      const sellPrice = item.value;
      const owned     = data.stash.find(s => s.id === item.id)?.qty || 0;
      const { icon }  = WorldItem.getIcon(item.id);

      const row = document.createElement('div');
      row.className = 'market-row';
      row.innerHTML = `
        <span class="market-name">${icon} ${item.label}</span>
        <span class="market-owned">Own: ${owned}</span>
        <span class="market-buy-price">$${buyPrice.toLocaleString()}</span>
        <button class="btn-buy" data-id="${item.id}" data-price="${buyPrice}">BUY</button>
        <button class="btn-sell" data-id="${item.id}" data-price="${sellPrice}" ${owned<1?'disabled':''}>SELL</button>
      `;
      el.appendChild(row);

      row.querySelector('.btn-buy').addEventListener('click', () => {
        if(data.cash >= buyPrice) {
          data.cash -= buyPrice;
          STORAGE.addToStash(data, item.id, 1);
          STORAGE.save(data);
          UI.notify(`Bought ${item.label}`, '#27ae60', 2000);
          this._renderMarket();
        } else {
          UI.notify('Not enough cash!', '#e74c3c', 2000);
        }
      });
      row.querySelector('.btn-sell').addEventListener('click', () => {
        if(STORAGE.removeFromStash(data, item.id, 1) > 0) {
          data.cash += sellPrice;
          STORAGE.save(data);
          UI.notify(`Sold for $${sellPrice.toLocaleString()}`, '#e8b84b', 2000);
          this._renderMarket();
        }
      });
    }

    const cashEl = document.getElementById('market-cash');
    if(cashEl) cashEl.textContent = `$${data.cash.toLocaleString()}`;
  },
};

// ── Boot ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => GAME.init());
