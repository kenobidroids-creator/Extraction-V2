// ============================================================
//  storage.js  –  Persistent player data (stash, loadout,
//                 cash) stored in localStorage
// ============================================================

const STORAGE = {
  KEY: 'duckov_save_v1',

  // Default save structure
  defaults() {
    return {
      cash:     2000,
      stash:    [
        // Pre-populate with starter gear
        { id:'pistol_basic',  qty:1 },
        { id:'pistol_ammo',   qty:3 },
        { id:'bandage',       qty:4 },
        { id:'bag_small',     qty:1 },
      ],
      loadout: {
        mainWep:  null,
        secWep:   'pistol_basic',
        helm:     'none',
        armor:    'none',
        bag:      'bag_small',
        ammo:     [],     // [{ ammoType, qty }]
        items:    [],     // consumables to bring into raid
      },
      stats: {
        totalRaids:    0,
        totalExtracts: 0,
        totalKills:    0,
        cashEarned:    0,
      },
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if(!raw) return this.defaults();
      return { ...this.defaults(), ...JSON.parse(raw) };
    } catch {
      return this.defaults();
    }
  },

  save(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch(e) {
      console.warn('[STORAGE] Save failed', e);
    }
  },

  // ── Stash helpers ────────────────────────────────────────

  /** Add item to stash */
  addToStash(data, id, qty=1) {
    const existing = data.stash.find(s=>s.id===id);
    if(existing) existing.qty += qty;
    else data.stash.push({ id, qty });
  },

  /** Remove item from stash. Returns qty actually removed. */
  removeFromStash(data, id, qty=1) {
    const slot = data.stash.find(s=>s.id===id);
    if(!slot) return 0;
    const removed = Math.min(slot.qty, qty);
    slot.qty -= removed;
    if(slot.qty <= 0) data.stash = data.stash.filter(s=>s.id!==id);
    return removed;
  },

  countInStash(data, id) {
    return data.stash.find(s=>s.id===id)?.qty || 0;
  },

  // ── Raid integration ────────────────────────────────────

  /**
   * Build a fresh player inventory from the current loadout.
   * Returns arrays for player.inventory and reserveAmmo.
   */
  buildRaidLoadout(data) {
    const loadout  = data.loadout;
    const inventory = [...(loadout.items || []).map(i=>({ id:i.id, qty:i.qty }))];
    const reserveAmmo = {};

    // Collect ammo from loadout.ammo entries
    for(const a of (loadout.ammo||[])) {
      reserveAmmo[a.ammoType] = (reserveAmmo[a.ammoType]||0) + a.qty;
    }

    // Weapons come from loadout, not inventory
    return { inventory, reserveAmmo };
  },

  /**
   * After successful extraction: merge player loot into stash and
   * add cash, update stats.
   */
  extractionPayout(data, player) {
    // Add loot from player inventory
    for(const item of player.inventory) {
      this.addToStash(data, item.id, item.qty);
    }
    // Cash
    data.cash += player.cash;

    // Preserve equipped gear back to stash if extracted
    if(player.mainWep)  this.addToStash(data, player.mainWep,  1);
    if(player.secWep)   this.addToStash(data, player.secWep,   1);
    if(player.helm !== 'none')  this.addToStash(data, player.helm,  1);
    if(player.armor !== 'none') this.addToStash(data, player.armor, 1);
    if(player.bag   !== 'none') this.addToStash(data, player.bag,   1);

    // Reserve ammo back to stash
    for(const [ammoType, qty] of Object.entries(player.reserveAmmo)) {
      if(qty>0) this.addToStash(data, ammoType, Math.floor(qty/30)||1);
    }

    // Stats
    data.stats.totalRaids++;
    data.stats.totalExtracts++;
    data.stats.totalKills   += player.kills;
    data.stats.cashEarned   += player.cash;

    this.save(data);
  },

  /**
   * On player death: lose equipped gear, keep nothing.
   */
  deathPenalty(data, player) {
    data.stats.totalRaids++;
    data.stats.totalKills += player.kills;
    this.save(data);
  },
};
