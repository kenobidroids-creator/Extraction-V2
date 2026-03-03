// ============================================================
//  ui.js  –  All UI panels: HUD, Bunker, Market, Inventory,
//            Map overlay, Mobile buttons
// ============================================================

const UI = {

  // ── State ────────────────────────────────────────────────
  activeScreen: 'bunker',  // 'bunker' | 'raid' | 'dead' | 'extracted'
  showMap:      false,
  showInventory:false,
  showMarket:   false,
  showLoadout:  false,
  notifications:[],        // [{ msg, time, duration, color }]

  // Loadout drag state
  _dragItem:    null,
  _dragFrom:    null,

  init() {
    this._buildBunkerHTML();
    this._buildMarketHTML();
    this._bindMobileButtons();
  },

  // ── Notification queue ───────────────────────────────────
  notify(msg, color='#e8b84b', duration=3000) {
    this.notifications.push({ msg, color, time:performance.now(), duration });
  },

  drawNotifications(ctx, vw, vh) {
    const now = performance.now();
    this.notifications = this.notifications.filter(n => now - n.time < n.duration);
    let y = vh - 120;
    for(const n of [...this.notifications].reverse()) {
      const alpha = 1 - Math.max(0, (now - n.time - n.duration*0.7) / (n.duration*0.3));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = 'rgba(0,0,0,0.7)';
      ctx.fillRect(vw/2 - 160, y-20, 320, 26);
      ctx.fillStyle   = n.color;
      ctx.font        = 'bold 13px "Share Tech Mono", monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(n.msg, vw/2, y);
      ctx.restore();
      y -= 32;
    }
  },

  // ── HUD (drawn on canvas) ────────────────────────────────
  drawHUD(ctx, player, raidTimeLeft, vw, vh, extractProgress) {
    // ── HP bar ──
    const barW = Math.min(200, vw*0.35);
    const barH = 14;
    const bx   = 12, by = vh - 50;

    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = player.hp > 50 ? '#2ecc71' : player.hp > 25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(bx, by, barW*(player.hp/player.maxHp), barH);
    ctx.strokeStyle = '#555'; ctx.lineWidth=1;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.fillStyle = '#ddd'; ctx.font='bold 11px "Share Tech Mono",monospace'; ctx.textAlign='left';
    ctx.fillText(`HP ${Math.ceil(player.hp)}/${player.maxHp}`, bx+4, by+11);

    // ── Stamina bar ──
    const sx = bx, sy = by - 10;
    ctx.fillStyle = '#111';
    ctx.fillRect(sx, sy, barW, 6);
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(sx, sy, barW*(player.stamina/CFG.STAMINA_MAX), 6);

    // ── Armor display ──
    if(player.armorVal > 0) {
      ctx.fillStyle = '#7ecfff';
      ctx.font      = '11px "Share Tech Mono",monospace';
      ctx.fillText(`ARM ${player.armorVal}`, bx, by-15);
    }

    // ── Weapon info ──
    const wep = player.activeWeapon;
    const wx2 = vw - 12;
    ctx.textAlign = 'right';
    if(wep) {
      ctx.fillStyle = '#e8b84b';
      ctx.font      = 'bold 15px "Share Tech Mono",monospace';
      ctx.fillText(wep.label, wx2, vh-50);
      const magNow  = player.magAmmo[player.activeWeaponKey] ?? wep.magSize;
      const reserve = player.reserveAmmo[wep.ammoType] || 0;
      ctx.fillStyle = magNow === 0 ? '#e74c3c' : '#ddd';
      ctx.font      = 'bold 20px "Share Tech Mono",monospace';
      ctx.fillText(`${magNow}/${reserve}`, wx2, vh-30);
      if(player.reloading) {
        ctx.fillStyle = '#f39c12';
        ctx.font      = 'bold 12px "Share Tech Mono",monospace';
        ctx.fillText('◌ RELOADING', wx2, vh-12);
      }
    } else {
      ctx.fillStyle = '#888';
      ctx.font      = '13px "Share Tech Mono",monospace';
      ctx.fillText('NO WEAPON', wx2, vh-30);
    }

    // ── Raid timer ──
    const mins = Math.floor(raidTimeLeft/60).toString().padStart(2,'0');
    const secs = Math.floor(raidTimeLeft%60).toString().padStart(2,'0');
    const timerColor = raidTimeLeft < 120 ? '#e74c3c' : '#ddd';
    ctx.fillStyle   = timerColor;
    ctx.font        = 'bold 16px "Share Tech Mono",monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(`⏱ ${mins}:${secs}`, vw/2, 28);

    // ── Extraction progress bar ──
    if(extractProgress > 0) {
      const pw = 200, ph = 20;
      const px = (vw-pw)/2, py = vh/2 + 40;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(px-4, py-4, pw+8, ph+8);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(px, py, pw*extractProgress, ph);
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth=2;
      ctx.strokeRect(px, py, pw, ph);
      ctx.fillStyle = '#fff'; ctx.textAlign='center';
      ctx.font      = 'bold 13px "Share Tech Mono",monospace';
      ctx.fillText('EXTRACTING...', vw/2, py+14);
    }

    // ── Kill counter ──
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aaa';
    ctx.font      = '11px "Share Tech Mono",monospace';
    ctx.fillText(`☠ ${player.kills}`, 12, 20);

    // ── Slot indicator ──
    ctx.textAlign = 'right';
    ctx.fillStyle = '#555';
    ctx.font      = '11px "Share Tech Mono",monospace';
    const slot1 = player.mainWep ? CFG.WEAPONS[player.mainWep].label : 'EMPTY';
    const slot2 = player.secWep  ? CFG.WEAPONS[player.secWep].label  : 'EMPTY';
    ctx.fillStyle = player.activeSlot==='main' ? '#e8b84b' : '#555';
    ctx.fillText(`[1] ${slot1}`, vw-12, 28);
    ctx.fillStyle = player.activeSlot==='secondary' ? '#e8b84b' : '#555';
    ctx.fillText(`[2] ${slot2}`, vw-12, 42);

    // ── Interaction hint ──
    if(window.GAME?.nearbyItem) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font      = '12px "Share Tech Mono",monospace';
      ctx.fillText(`[F] Pick up ${window.GAME.nearbyItem.label}`, vw/2, vh/2+80);
    }
    if(window.GAME?.nearExtraction) {
      ctx.fillStyle = '#2ecc71';
      ctx.textAlign = 'center';
      ctx.font      = 'bold 13px "Share Tech Mono",monospace';
      ctx.fillText(`[F] EXTRACT (hold)`, vw/2, vh/2+80);
    }
  },

  // ── Minimap drawn on canvas ──────────────────────────────
  drawMinimap(ctx, world, player, vw, vh) {
    const SIZE  = Math.min(120, vw*0.22);
    const SCALE = SIZE / (CFG.WORLD_W * CFG.TILE);
    const MX    = vw - SIZE - 12;
    const MY    = 12;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(MX, MY, SIZE, SIZE);

    // Draw explored tiles
    for(let y=0;y<world.H;y++){
      for(let x=0;x<world.W;x++){
        const t = world.tiles[world.idx(x,y)];
        if(!t.explored) continue;
        const px = MX + x*CFG.TILE*SCALE;
        const py = MY + y*CFG.TILE*SCALE;
        const sz = Math.max(1, CFG.TILE*SCALE);
        ctx.fillStyle = t.type==='wall' ? '#666'
                       : t.type==='building_floor' ? '#aaa'
                       : t.type==='road' ? '#555'
                       : t.type==='grass' ? '#3d6b34'
                       : '#7a6040';
        if(!t.seen) ctx.globalAlpha = 0.4;
        ctx.fillRect(px, py, sz, sz);
        ctx.globalAlpha = 1;
      }
    }

    // Extraction zones
    for(const ex of world.extractions) {
      if(!ex.revealed) continue;
      const px = MX + ex.wx*SCALE;
      const py = MY + ex.wy*SCALE;
      const pulse = Math.sin(performance.now()*0.004)*2;
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(px, py, 4+pulse, 0, Math.PI*2);
      ctx.fill();
    }

    // Player dot
    const ppx = MX + player.wx*SCALE;
    const ppy = MY + player.wy*SCALE;
    ctx.fillStyle   = '#fff';
    ctx.beginPath();
    ctx.arc(ppx, ppy, 3, 0, Math.PI*2);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#555'; ctx.lineWidth=1;
    ctx.strokeRect(MX, MY, SIZE, SIZE);
  },

  // ── Full Map overlay (drawn on canvas) ───────────────────
  drawMapOverlay(ctx, world, player, vw, vh) {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, vw, vh);

    const PAD   = 30;
    const avail = Math.min(vw, vh) - PAD*2;
    const SCALE = avail / (CFG.WORLD_W * CFG.TILE);
    const OX    = (vw - avail) / 2;
    const OY    = (vh - avail) / 2;

    // Draw explored tiles
    for(let y=0;y<world.H;y++){
      for(let x=0;x<world.W;x++){
        const t = world.tiles[world.idx(x,y)];
        if(!t.explored) continue;
        const px = OX + x*CFG.TILE*SCALE;
        const py = OY + y*CFG.TILE*SCALE;
        const sz = Math.max(1.5, CFG.TILE*SCALE);
        ctx.fillStyle = t.type==='wall' ? '#666'
                       : t.type==='building_floor' ? '#999'
                       : t.type==='road' ? '#555'
                       : t.type==='grass' ? '#3d6b34'
                       : '#7a6040';
        ctx.globalAlpha = t.seen ? 1 : 0.4;
        ctx.fillRect(px, py, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    // Extraction zones
    for(const ex of world.extractions) {
      const px = OX + ex.wx*SCALE;
      const py = OY + ex.wy*SCALE;
      const pulse = Math.abs(Math.sin(performance.now()*0.003))*8;
      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(px, py, 8+pulse, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle   = 'rgba(46,204,113,0.3)';
      ctx.beginPath();
      ctx.arc(px, py, 8+pulse, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle   = '#2ecc71';
      ctx.font        = '10px "Share Tech Mono",monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(ex.label, px, py-14);
    }

    // Player position
    const ppx = OX + player.wx*SCALE;
    const ppy = OY + player.wy*SCALE;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ppx, ppy, 5, 0, Math.PI*2);
    ctx.fill();
    // Direction cone
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(ppx, ppy);
    ctx.lineTo(ppx+Math.cos(player.angle)*14, ppy+Math.sin(player.angle)*14);
    ctx.stroke();

    // Legend
    ctx.fillStyle   = '#aaa';
    ctx.font        = '11px "Share Tech Mono",monospace';
    ctx.textAlign   = 'left';
    ctx.fillText('MAP — [M] to close', OX, OY-10);
  },

  // ── Mobile HUD buttons ───────────────────────────────────
  _buildBunkerHTML() {
    // The bunker screen is in HTML/CSS with DOM, triggered from JS
    // We'll create it dynamically
    const el = document.getElementById('bunker-screen');
    if(!el) return;
    this._renderBunker();
  },

  _buildMarketHTML() {
    const el = document.getElementById('market-screen');
    if(!el) return;
  },

  // ── Bind mobile action buttons ───────────────────────────
  _bindMobileButtons() {
    const bind = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); onDown && onDown(); }, { passive:false });
      el.addEventListener('touchend',   e => { e.preventDefault(); onUp   && onUp();   }, { passive:false });
      el.addEventListener('mousedown',  onDown||null);
      el.addEventListener('mouseup',    onUp  ||null);
    };

    bind('btn-reload',  () => INPUT.reload   = true,   () => INPUT.reload   = false);
    bind('btn-interact',() => INPUT.interact = true,   () => INPUT.interact = false);
    bind('btn-switch',  () => { INPUT.switchWep = true; },
                        () => { INPUT.switchWep = false; });
    bind('btn-heal',    () => INPUT.useItem  = true,   () => INPUT.useItem  = false);
    bind('btn-map',     () => { UI.showMap = !UI.showMap; INPUT.openMap = false; });
    bind('btn-sprint',  () => INPUT.sprint   = true,   () => INPUT.sprint   = false);
  },

  // ── Bunker screen render (DOM overlay) ──────────────────
  _renderBunker() {
    // Implemented as DOM HTML — see index.html template
    // This function is called to refresh the contents
    if(window.GAME?.saveData) this._updateBunkerUI(window.GAME.saveData);
  },

  _updateBunkerUI(data) {
    const cashEl = document.getElementById('bunker-cash');
    if(cashEl) cashEl.textContent = `$${data.cash.toLocaleString()}`;
  },
};
