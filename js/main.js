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
    const dt = Math.min(time - this._lastTime, 50); // cap at 50ms
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

    // Pause
    if(INPUT.pause) { INPUT.pause=false; this._togglePause(); return; }

    // ── Player input ──
    const { dx, dy } = INPUT.getMovement();
    this.player.move(dx, dy, this.world);

    // Aim
    this.player.aimAt(INPUT.mouseWX, INPUT.mouseWY);

    // Shoot
    if(INPUT.shoot && this.player.activeWeapon?.auto) {
      this.player.tryShoot(time, this.bullets);
    }

    // Single shot (handled on mousedown event — but also check state)
    if(INPUT._fireOnce) {
      this.player.tryShoot(time, this.bullets);
      INPUT._fireOnce = false;
    }

    // Reload
    if(INPUT.reload) { INPUT.reload=false; this.player.startReload(time); }

    // Switch weapon
    if(INPUT.switchWep) { INPUT.switchWep=false; this.player.switchWeapon(); }

    // Use medical item
    if(INPUT.useItem) { INPUT.useItem=false; this._useFirstMedical(time); }

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
    for(const b of this.bullets) b.update(this.world);

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
      en.update(this.player, this.world, this.bullets, time);
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
    if(UI.showMap) UI.drawMapOverlay(ctx, this.world, this.player, vw, vh);

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

    // Weapon pickups go to loadout slots if empty
    if(id.startsWith('W:')) {
      const key = id.slice(2);
      const wep = CFG.WEAPONS[key];
      if(wep.slot==='main' && !this.player.mainWep) {
        this.player.mainWep = key;
        this.player.magAmmo[key] = wep.magSize;
        picked = true;
        UI.notify(`Equipped ${wep.label} (main)`, '#e8b84b');
      } else if(wep.slot==='secondary' && !this.player.secWep) {
        this.player.secWep = key;
        this.player.magAmmo[key] = wep.magSize;
        picked = true;
        UI.notify(`Equipped ${wep.label} (secondary)`, '#e8b84b');
      } else {
        // Add as inventory item (stash it)
        picked = this.player.addItem(id, 1);
        if(picked) UI.notify(`Picked up ${wep.label}`, '#ddd');
        else UI.notify('Bag full!', '#e74c3c');
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

  // ── Show Bunker (DOM) ────────────────────────────────────
  _showBunker() {
    this.state = 'bunker';
    this._updateMobileLayout(this.canvas.width, this.canvas.height);
    const bs = document.getElementById('bunker-screen');
    const ms = document.getElementById('market-screen');
    if(bs) { bs.style.display='flex'; this._renderBunkerUI(); }
    if(ms)   ms.style.display='none';
    UI.activeScreen = 'bunker';
  },

  // ── Render full Bunker UI into DOM ───────────────────────
  _renderBunkerUI() {
    const data = this.saveData;
    // Cash
    const cashEl = document.getElementById('bunker-cash');
    if(cashEl) cashEl.textContent = `$${data.cash.toLocaleString()}`;

    // Stats
    const statsEl = document.getElementById('bunker-stats');
    if(statsEl) statsEl.innerHTML =
      `Raids: ${data.stats.totalRaids} &nbsp;|&nbsp; Extractions: ${data.stats.totalExtracts} &nbsp;|&nbsp; Kills: ${data.stats.totalKills}`;

    // Stash
    this._renderStash();
    // Loadout
    this._renderLoadout();
  },

  _renderStash() {
    const el = document.getElementById('stash-grid');
    if(!el) return;
    el.innerHTML = '';
    for(const item of this.saveData.stash) {
      const label = WorldItem.getLabel(item.id);
      const value = WorldItem.getValue(item.id);
      const div = document.createElement('div');
      div.className = 'stash-item';
      div.title     = `${label} — Value: $${value}`;
      div.innerHTML = `<span class="item-label">${label}</span><span class="item-qty">x${item.qty}</span>`;
      div.addEventListener('click', () => this._onStashItemClick(item));
      el.appendChild(div);
    }
    if(this.saveData.stash.length === 0) {
      el.innerHTML = '<div class="empty-stash">Stash empty</div>';
    }
  },

  _renderLoadout() {
    const ld = this.saveData.loadout;
    const setText = (id, val) => { const e=document.getElementById(id); if(e) e.textContent=val; };
    setText('slot-main',   ld.mainWep ? CFG.WEAPONS[ld.mainWep]?.label : 'Empty');
    setText('slot-sec',    ld.secWep  ? CFG.WEAPONS[ld.secWep]?.label  : 'Empty');
    setText('slot-helm',   ld.helm    !== 'none' ? CFG.HELMETS[ld.helm]?.label  : 'None');
    setText('slot-armor',  ld.armor   !== 'none' ? CFG.ARMORS[ld.armor]?.label  : 'None');
    setText('slot-bag',    ld.bag     !== 'none' ? CFG.BAGS[ld.bag]?.label      : 'None');
  },

  // ── Stash → Loadout assignment ───────────────────────────
  _onStashItemClick(item) {
    const id  = item.id;
    const ld  = this.saveData.loadout;

    if(id.startsWith('W:')) {
      const key = id.slice(2);
      const wep = CFG.WEAPONS[key];
      if(wep.slot==='main')      { ld.mainWep = key; UI.notify(`Main: ${wep.label}`, '#e8b84b', 1500); }
      else if(wep.slot==='secondary') { ld.secWep = key; UI.notify(`Secondary: ${wep.label}`, '#e8b84b', 1500); }
    } else if(id.startsWith('H:')) {
      ld.helm  = id.slice(2); UI.notify(`Helmet: ${CFG.HELMETS[ld.helm].label}`, '#7ecfff', 1500);
    } else if(id.startsWith('A:')) {
      ld.armor = id.slice(2); UI.notify(`Armor: ${CFG.ARMORS[ld.armor].label}`, '#7ecfff', 1500);
    } else if(id.startsWith('B:')) {
      ld.bag   = id.slice(2); UI.notify(`Bag: ${CFG.BAGS[ld.bag].label}`, '#7ecfff', 1500);
    } else {
      // Consumable → add to raid items
      const existing = ld.items?.find(i=>i.id===id);
      if(existing) existing.qty++;
      else { ld.items = ld.items||[]; ld.items.push({ id, qty:1 }); }
      UI.notify(`+1 ${WorldItem.getLabel(id)} to loadout`, '#ddd', 1500);
    }
    STORAGE.save(this.saveData);
    this._renderLoadout();
  },

  // ── Market ──────────────────────────────────────────────
  openMarket() {
    document.getElementById('bunker-screen').style.display = 'none';
    const ms = document.getElementById('market-screen');
    ms.style.display = 'flex';
    this._renderMarket();
  },

  closeMarket() {
    document.getElementById('market-screen').style.display = 'none';
    this._showBunker();
  },

  _renderMarket() {
    const el   = document.getElementById('market-listings');
    if(!el) return;
    el.innerHTML = '';
    const data   = this.saveData;

    // Build listing: all weapon/gear/item types
    const listings = [
      ...Object.entries(CFG.WEAPONS).map(([k,v])=>({ id:'W:'+k, label:v.label, value:v.value })),
      ...Object.entries(CFG.HELMETS).filter(([k])=>k!=='none').map(([k,v])=>({ id:'H:'+k, label:v.label, value:v.value })),
      ...Object.entries(CFG.ARMORS).filter(([k])=>k!=='none').map(([k,v])=>({ id:'A:'+k, label:v.label, value:v.value })),
      ...Object.entries(CFG.BAGS).filter(([k])=>k!=='none').map(([k,v])=>({ id:'B:'+k, label:v.label, value:v.value })),
      ...Object.entries(CFG.ITEMS).map(([k,v])=>({ id:k, label:v.label, value:v.value })),
    ];

    for(const item of listings) {
      const buyPrice  = Math.floor(item.value * CFG.MARKET_BUY_MUL);
      const sellPrice = item.value;
      const owned     = data.stash.find(s=>s.id===item.id)?.qty || 0;

      const row = document.createElement('div');
      row.className = 'market-row';
      row.innerHTML = `
        <span class="market-name">${item.label}</span>
        <span class="market-owned">Own: ${owned}</span>
        <span class="market-buy-price">$${buyPrice.toLocaleString()}</span>
        <button class="btn-buy" data-id="${item.id}" data-price="${buyPrice}">BUY</button>
        <button class="btn-sell" data-id="${item.id}" data-price="${sellPrice}" ${owned<1?'disabled':''}>SELL</button>
      `;
      el.appendChild(row);
    }

    // Update cash display
    const cashEl = document.getElementById('market-cash');
    if(cashEl) cashEl.textContent = `$${data.cash.toLocaleString()}`;

    // Bind buttons
    el.querySelectorAll('.btn-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        const id    = btn.dataset.id;
        const price = parseInt(btn.dataset.price);
        if(data.cash >= price) {
          data.cash -= price;
          STORAGE.addToStash(data, id, 1);
          STORAGE.save(data);
          UI.notify(`Bought ${WorldItem.getLabel(id)}`, '#2ecc71', 2000);
          this._renderMarket();
        } else {
          UI.notify('Not enough cash!', '#e74c3c', 2000);
        }
      });
    });
    el.querySelectorAll('.btn-sell').forEach(btn => {
      btn.addEventListener('click', () => {
        const id    = btn.dataset.id;
        const price = parseInt(btn.dataset.price);
        if(STORAGE.removeFromStash(data, id, 1) > 0) {
          data.cash += price;
          STORAGE.save(data);
          UI.notify(`Sold for $${price.toLocaleString()}`, '#e8b84b', 2000);
          this._renderMarket();
        }
      });
    });
  },
};

// ── Boot ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => GAME.init());
