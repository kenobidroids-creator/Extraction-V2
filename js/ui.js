// ============================================================
//  ui.js  –  HUD, Minimap, Full Map, Raid Inventory Panel,
//            Bunker Loadout (drag & drop + click-to-equip),
//            Market, Notifications, Mobile button bindings
// ============================================================

const UI = {

  notifications: [],  // { msg, color, time, duration }

  // ── Init ─────────────────────────────────────────────────
  init() {
    this._bindMobileButtons();
  },

  // ── Notifications ────────────────────────────────────────
  notify(msg, color = '#e8b84b', duration = 3000) {
    this.notifications.push({ msg, color, time: performance.now(), duration });
  },

  drawNotifications(ctx, vw, vh) {
    const now = performance.now();
    this.notifications = this.notifications.filter(n => now - n.time < n.duration);
    let y = vh - 140;
    for(const n of [...this.notifications].reverse()) {
      const age   = now - n.time;
      const alpha = age > n.duration * 0.7
        ? 1 - (age - n.duration * 0.7) / (n.duration * 0.3)
        : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle   = 'rgba(0,0,0,0.72)';
      const tw = ctx.measureText(n.msg).width + 24;
      ctx.fillRect(vw / 2 - tw / 2, y - 18, tw, 24);
      ctx.fillStyle = n.color;
      ctx.font      = 'bold 13px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.msg, vw / 2, y);
      ctx.restore();
      y -= 30;
    }
  },

  // ── HUD ──────────────────────────────────────────────────
  drawHUD(ctx, player, raidTimeLeft, vw, vh, extractProgress) {
    const barW = Math.min(200, vw * 0.35);
    const bx   = 12, by = vh - 52;

    // HP bar
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by, barW, 14);
    ctx.fillStyle = player.hp > 50 ? '#27ae60' : player.hp > 25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(bx, by, barW * (player.hp / player.maxHp), 14);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, 14);
    ctx.fillStyle = '#eee'; ctx.font = 'bold 11px "Share Tech Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText(`HP  ${Math.ceil(player.hp)} / ${player.maxHp}`, bx + 4, by + 11);

    // Stamina bar
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by - 9, barW, 5);
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(bx, by - 9, barW * (player.stamina / CFG.STAMINA_MAX), 5);

    // Armor
    if(player.armorVal > 0) {
      ctx.fillStyle = '#7ecfff'; ctx.font = '11px "Share Tech Mono",monospace';
      ctx.fillText(`ARM  ${player.armorVal}`, bx, by - 14);
    }

    // Weapon panel (bottom-right)
    const wx2 = vw - 14;
    ctx.textAlign = 'right';
    const wep = player.activeWeapon;
    if(wep) {
      ctx.fillStyle = '#e8b84b'; ctx.font = 'bold 14px "Share Tech Mono",monospace';
      ctx.fillText(wep.label, wx2, vh - 52);
      const mag     = player.magAmmo[player.activeWeaponKey] ?? wep.magSize;
      const reserve = player.reserveAmmo[wep.ammoType] || 0;
      ctx.fillStyle = mag === 0 ? '#e74c3c' : '#ddd';
      ctx.font      = 'bold 22px "Share Tech Mono",monospace';
      ctx.fillText(`${mag} / ${reserve}`, wx2, vh - 30);
      if(player.reloading) {
        ctx.fillStyle = '#f39c12'; ctx.font = 'bold 11px "Share Tech Mono",monospace';
        ctx.fillText('◌  RELOADING', wx2, vh - 10);
      }
    } else {
      ctx.fillStyle = '#555'; ctx.font = '13px "Share Tech Mono",monospace';
      ctx.fillText('NO WEAPON', wx2, vh - 32);
    }

    // Weapon slot labels (top-right)
    ctx.textAlign = 'right'; ctx.font = '11px "Share Tech Mono",monospace';
    const s1 = player.mainWep ? CFG.WEAPONS[player.mainWep].label : 'EMPTY';
    const s2 = player.secWep  ? CFG.WEAPONS[player.secWep].label  : 'EMPTY';
    ctx.fillStyle = player.activeSlot === 'main'      ? '#e8b84b' : '#444';
    ctx.fillText(`[1] ${s1}`, wx2, 24);
    ctx.fillStyle = player.activeSlot === 'secondary' ? '#e8b84b' : '#444';
    ctx.fillText(`[2] ${s2}`, wx2, 40);

    // Timer (top-center)
    const mins = Math.floor(raidTimeLeft / 60).toString().padStart(2, '0');
    const secs = Math.floor(raidTimeLeft % 60).toString().padStart(2, '0');
    ctx.fillStyle = raidTimeLeft < 120 ? '#e74c3c' : '#ddd';
    ctx.font = 'bold 16px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(`⏱  ${mins}:${secs}`, vw / 2, 28);

    // Kill counter (top-left)
    ctx.textAlign = 'left'; ctx.fillStyle = '#888'; ctx.font = '11px "Share Tech Mono",monospace';
    ctx.fillText(`☠  ${player.kills}`, 12, 20);

    // Bag fullness
    const bagUsed  = player.inventory.reduce((s, i) => s + i.qty, 0);
    const bagTotal = player.bagSlots;
    ctx.fillStyle = bagUsed >= bagTotal ? '#e74c3c' : '#555';
    ctx.fillText(`BAG  ${bagUsed}/${bagTotal}   [TAB] Inventory`, 12, by - 20);

    // Extraction progress bar
    if(extractProgress > 0) {
      const pw = Math.min(240, vw * 0.5), ph = 20;
      const px = (vw - pw) / 2, py = vh / 2 + 50;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(px - 4, py - 4, pw + 8, ph + 8);
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(px, py, pw * extractProgress, ph);
      ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 13px "Share Tech Mono",monospace';
      ctx.fillText('EXTRACTING…', vw / 2, py + 14);
    }

    // Interaction hints (center-bottom area)
    ctx.textAlign = 'center'; ctx.font = '12px "Share Tech Mono",monospace';
    if(window.GAME?.nearExtraction) {
      ctx.fillStyle = '#27ae60';
      ctx.fillText('[F] Hold to EXTRACT', vw / 2, vh / 2 + 90);
    } else if(window.GAME?.nearbyItem) {
      ctx.fillStyle = '#e8b84b';
      ctx.fillText(`[F] Pick up  ${window.GAME.nearbyItem.label}`, vw / 2, vh / 2 + 90);
    }

    // Med use progress
    if(player.using) {
      const prog = Math.min(1, (performance.now() - (player.useEnd - (CFG.ITEMS[player._pendingHeal?.itemId]?.useTime || 3000))) / (CFG.ITEMS[player._pendingHeal?.itemId]?.useTime || 3000));
      const pw = 160, ph = 14, px = (vw - pw) / 2, py = vh / 2 + 110;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
      ctx.fillStyle = '#27ae60'; ctx.fillRect(px, py, pw * prog, ph);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText('HEALING…', vw / 2, py + 11);
    }
  },

  // ── Minimap ───────────────────────────────────────────────
  drawMinimap(ctx, world, player, vw, vh) {
    const SIZE  = Math.min(130, vw * 0.24);
    const SCALE = SIZE / (CFG.WORLD_W * CFG.TILE);
    const MX    = vw - SIZE - 14;
    const MY    = 56;   // below weapon slots

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(MX, MY, SIZE, SIZE);

    // Tiles
    for(let y = 0; y < world.H; y++) {
      for(let x = 0; x < world.W; x++) {
        const t = world.tiles[world.idx(x, y)];
        if(!t.explored) continue;
        const px = MX + x * CFG.TILE * SCALE;
        const py = MY + y * CFG.TILE * SCALE;
        const sz = Math.max(1, CFG.TILE * SCALE);
        ctx.fillStyle = t.type === 'wall'           ? '#666'
                      : t.type === 'building_floor' ? '#aaa'
                      : t.type === 'road'           ? '#555'
                      : t.type === 'grass'          ? '#3d6b34'
                      : '#7a6040';
        ctx.globalAlpha = t.seen ? 1 : 0.35;
        ctx.fillRect(px, py, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    // Loot dots on minimap (only in explored+seen area)
    for(const item of world.lootItems) {
      const tx = Math.floor(item.wx / CFG.TILE);
      const ty = Math.floor(item.wy / CFG.TILE);
      const t  = world.tile(tx, ty);
      if(!t || !t.seen) continue;
      const px = MX + item.wx * SCALE;
      const py = MY + item.wy * SCALE;
      ctx.fillStyle = '#e8b84b';
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // Extraction zones
    for(const ex of world.extractions) {
      if(!ex.revealed) continue;
      const px    = MX + ex.wx * SCALE;
      const py    = MY + ex.wy * SCALE;
      const pulse = Math.sin(performance.now() * 0.005) * 2;
      ctx.fillStyle = '#27ae60';
      ctx.beginPath(); ctx.arc(px, py, 3 + pulse, 0, Math.PI * 2); ctx.fill();
    }

    // Player
    const ppx = MX + player.wx * SCALE;
    const ppy = MY + player.wy * SCALE;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ppx, ppy, 3, 0, Math.PI * 2); ctx.fill();
    // Direction tick
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ppx, ppy);
    ctx.lineTo(ppx + Math.cos(player.angle) * 6, ppy + Math.sin(player.angle) * 6);
    ctx.stroke();

    ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
    ctx.strokeRect(MX, MY, SIZE, SIZE);
  },

  // ── Full Map Overlay ─────────────────────────────────────
  drawMapOverlay(ctx, world, player, vw, vh) {
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, vw, vh);

    const PAD   = Math.min(40, vw * 0.05);
    const avail = Math.min(vw, vh) - PAD * 2;
    const SCALE = avail / (CFG.WORLD_W * CFG.TILE);
    const OX    = (vw - avail) / 2;
    const OY    = (vh - avail) / 2;

    // Tiles
    for(let y = 0; y < world.H; y++) {
      for(let x = 0; x < world.W; x++) {
        const t = world.tiles[world.idx(x, y)];
        if(!t.explored) continue;
        const px = OX + x * CFG.TILE * SCALE;
        const py = OY + y * CFG.TILE * SCALE;
        const sz = Math.max(1.5, CFG.TILE * SCALE);
        ctx.fillStyle = t.type === 'wall'           ? '#555'
                      : t.type === 'building_floor' ? '#888'
                      : t.type === 'road'           ? '#444'
                      : t.type === 'grass'          ? '#2d5a25'
                      : '#6b5030';
        ctx.globalAlpha = t.seen ? 1 : 0.35;
        ctx.fillRect(px, py, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    // ── Loot items on map ─────────────────────────────────
    // Only show items in explored tiles so the map rewards exploration
    for(const item of world.lootItems) {
      const tx = Math.floor(item.wx / CFG.TILE);
      const ty = Math.floor(item.wy / CFG.TILE);
      const t  = world.tile(tx, ty);
      if(!t || !t.explored) continue;

      const px = OX + item.wx * SCALE;
      const py = OY + item.wy * SCALE;

      // Colour-code by type
      const id = item.lootId;
      let col = '#e8b84b'; // default junk = gold
      if(id.startsWith('W:'))       col = '#e74c3c';  // weapons = red
      else if(id.startsWith('H:') || id.startsWith('A:')) col = '#7ecfff'; // gear = blue
      else if(id.startsWith('B:'))  col = '#9b59b6';  // bags = purple
      else if(CFG.ITEMS[id]?.type === 'medical') col = '#27ae60'; // meds = green
      else if(CFG.ITEMS[id]?.type === 'ammo')    col = '#f39c12'; // ammo = orange

      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Extraction zones (always show label if revealed)
    const now = performance.now();
    for(const ex of world.extractions) {
      const px    = OX + ex.wx * SCALE;
      const py    = OY + ex.wy * SCALE;
      const pulse = Math.abs(Math.sin(now * 0.003)) * 6;

      if(ex.revealed) {
        ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 8 + pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(39,174,96,0.2)';
        ctx.beginPath(); ctx.arc(px, py, 8 + pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#27ae60'; ctx.font = 'bold 11px "Share Tech Mono",monospace';
        ctx.textAlign = 'center'; ctx.fillText(ex.label, px, py - 14);
      } else {
        // Show undiscovered extraction as faint "?" marker
        ctx.strokeStyle = 'rgba(39,174,96,0.3)'; ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(39,174,96,0.3)'; ctx.font = 'bold 12px "Share Tech Mono",monospace';
        ctx.textAlign = 'center'; ctx.fillText('?', px, py + 4);
      }
    }

    // Map legend
    ctx.textAlign = 'left';
    ctx.font = '11px "Share Tech Mono",monospace';
    const legend = [
      { col: '#e74c3c', txt: 'Weapon' },
      { col: '#27ae60', txt: 'Medical' },
      { col: '#f39c12', txt: 'Ammo' },
      { col: '#e8b84b', txt: 'Loot' },
      { col: '#7ecfff', txt: 'Gear' },
      { col: '#27ae60', txt: '⊙ Extract' },
    ];
    let lx = OX, ly = OY + avail + 18;
    for(const l of legend) {
      ctx.fillStyle = l.col;
      ctx.fillRect(lx, ly - 9, 10, 10);
      ctx.fillStyle = '#aaa'; ctx.fillText(l.txt, lx + 14, ly);
      lx += 90;
      if(lx > OX + avail - 80) { lx = OX; ly += 18; }
    }

    // Player dot
    const ppx = OX + player.wx * SCALE;
    const ppy = OY + player.wy * SCALE;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ppx, ppy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ppx, ppy);
    ctx.lineTo(ppx + Math.cos(player.angle) * 12, ppy + Math.sin(player.angle) * 12);
    ctx.stroke();

    // Header
    ctx.fillStyle = '#888'; ctx.font = '12px "Share Tech Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText('MAP  [ M ] close', OX, OY - 10);
  },

  // ── Raid Inventory Panel ─────────────────────────────────
  drawRaidInventory(ctx, player, vw, vh) {
    const PW   = Math.min(460, vw * 0.96);
    const PH   = Math.min(540, vh * 0.88);
    const PX   = (vw - PW) / 2;
    const PY   = (vh - PH) / 2;
    const CELL = 46;

    // Backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, vw, vh);

    // Panel
    ctx.fillStyle = '#0e160e';
    ctx.fillRect(PX, PY, PW, PH);
    ctx.strokeStyle = '#2a4a2a'; ctx.lineWidth = 1;
    ctx.strokeRect(PX, PY, PW, PH);

    // Title bar
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(PX, PY, PW, 32);
    ctx.fillStyle = '#e8b84b'; ctx.font = 'bold 15px "Share Tech Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText('🎒  INVENTORY   [ TAB ] close', PX + 12, PY + 21);

    // ── Equipped gear row ──
    const eqY  = PY + 42;
    const eqW  = (PW - 24) / 5 - 4;
    const eqSlots = [
      { label:'HEAD',  icon: player.helm  !== 'none' ? '⛑️' : '○', val: player.helm  !== 'none' ? CFG.HELMETS[player.helm]?.label  : 'None', col: player.helm  !== 'none' ? '#7ecfff' : '#333' },
      { label:'VEST',  icon: player.armor !== 'none' ? '🦺' : '○', val: player.armor !== 'none' ? CFG.ARMORS[player.armor]?.label  : 'None', col: player.armor !== 'none' ? '#5dade2' : '#333' },
      { label:'BAG',   icon: player.bag   !== 'none' ? '🎒' : '○', val: player.bag   !== 'none' ? CFG.BAGS[player.bag]?.label      : 'None', col: player.bag   !== 'none' ? '#9b59b6' : '#333' },
      { label:'MAIN',  icon: player.mainWep ? '🔫' : '○', val: player.mainWep ? CFG.WEAPONS[player.mainWep]?.label : 'Empty', col: player.mainWep ? '#e74c3c' : '#333' },
      { label:'SEC',   icon: player.secWep  ? '🔫' : '○', val: player.secWep  ? CFG.WEAPONS[player.secWep]?.label  : 'Empty', col: player.secWep  ? '#c0392b' : '#333' },
    ];

    let ex = PX + 12;
    for(const s of eqSlots) {
      ctx.fillStyle = s.col + '33';
      ctx.fillRect(ex, eqY, eqW, 50);
      ctx.strokeStyle = s.col; ctx.lineWidth = 1;
      ctx.strokeRect(ex, eqY, eqW, 50);

      // Icon
      ctx.font = '18px serif'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.icon, ex + eqW / 2, eqY + 16);
      ctx.textBaseline = 'alphabetic';

      // Label
      ctx.fillStyle = '#555'; ctx.font = '8px "Share Tech Mono",monospace';
      ctx.fillText(s.label, ex + eqW / 2, eqY + 28);

      // Value (truncated)
      ctx.fillStyle = s.col === '#333' ? '#444' : '#ccc';
      ctx.font = '9px "Share Tech Mono",monospace';
      const v = s.val.length > 10 ? s.val.slice(0, 9) + '…' : s.val;
      ctx.fillText(v, ex + eqW / 2, eqY + 42);

      ex += eqW + 4;
    }

    // ── Bag grid ──
    const gridY   = eqY + 62;
    const bagSlots = player.bagSlots;
    const cols     = Math.max(4, Math.min(8, Math.floor((PW - 24) / (CELL + 3))));
    const rows     = bagSlots > 0 ? Math.ceil(bagSlots / cols) : 1;

    // Section label
    const usedSlots = player.inventory.reduce((s, i) => s + i.qty, 0);
    ctx.fillStyle = usedSlots >= bagSlots && bagSlots > 0 ? '#e74c3c' : '#666';
    ctx.font = '10px "Share Tech Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText(`BAG CONTENTS  ${usedSlots} / ${bagSlots || '—'} slots${bagSlots === 0 ? '  (no bag equipped)' : ''}`, PX + 12, gridY - 5);

    // Flatten inventory to per-slot display
    const flatItems = [];
    for(const slot of player.inventory) {
      for(let q = 0; q < slot.qty; q++) flatItems.push(slot.id);
    }

    for(let r = 0; r < rows; r++) {
      for(let c = 0; c < cols; c++) {
        const ci   = r * cols + c;
        const cx   = PX + 12 + c * (CELL + 3);
        const cy   = gridY + r * (CELL + 3);
        const id   = ci < flatItems.length ? flatItems[ci] : null;

        // Cell bg
        ctx.fillStyle = id ? '#162016' : '#0c120c';
        ctx.fillRect(cx, cy, CELL, CELL);
        ctx.strokeStyle = id ? '#2a4a2a' : '#151f15';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, CELL, CELL);

        if(id) {
          const { icon, col } = WorldItem.getIcon(id);
          const def            = CFG.ITEMS[id];

          // Colour tint
          ctx.fillStyle = col + '22';
          ctx.fillRect(cx + 1, cy + 1, CELL - 2, CELL - 2);

          // Icon
          ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(icon, cx + CELL / 2, cy + CELL / 2 - 4);
          ctx.textBaseline = 'alphabetic';

          // Name (tiny)
          const lbl = (def?.label || id).slice(0, 7);
          ctx.fillStyle = '#aaa'; ctx.font = '7px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
          ctx.fillText(lbl, cx + CELL / 2, cy + CELL - 5);
        }
      }
    }

    // Hint
    ctx.fillStyle = '#333'; ctx.font = '10px "Share Tech Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('[ F ] pickup  ·  [ H ] heal  ·  [ G ] drop bag item  ·  [ TAB ] close', vw / 2, PY + PH - 10);
  },

  // ── Mobile button bindings ───────────────────────────────
  _bindMobileButtons() {
    const bind = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); onDown && onDown(); }, { passive: false });
      el.addEventListener('touchend',   e => { e.stopPropagation(); e.preventDefault(); onUp   && onUp();   }, { passive: false });
      el.addEventListener('mousedown',  e => { onDown && onDown(); });
      el.addEventListener('mouseup',    e => { onUp   && onUp();   });
    };

    bind('btn-reload',   () => INPUT.reload    = true,  () => INPUT.reload    = false);
    bind('btn-interact', () => INPUT.interact  = true,  () => INPUT.interact  = false);
    bind('btn-switch',   () => { INPUT.switchWep = true; }, () => { INPUT.switchWep = false; });
    bind('btn-heal',     () => INPUT.useItem   = true,  () => INPUT.useItem   = false);
    bind('btn-sprint',   () => INPUT.sprint    = true,  () => INPUT.sprint    = false);
    bind('btn-drop',     () => { INPUT.dropItem = true; }, null);
    bind('btn-map',      () => { INPUT.mapOpen = !INPUT.mapOpen; }, null);
    bind('btn-inv',      () => { INPUT.openInv = !INPUT.openInv; }, null);
  },
};
