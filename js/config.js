// ============================================================
//  config.js  –  All static game data, tuning values, item/
//                weapon/enemy/loot tables for Escape From Duckov
// ============================================================

const CFG = {

  // ── Canvas / Tile ─────────────────────────────────────────
  TILE:        32,       // px per world tile
  WORLD_W:     128,      // tiles wide
  WORLD_H:     128,      // tiles tall
  FPS:         60,

  // ── Player ────────────────────────────────────────────────
  PLAYER_SPEED:      3.5,   // px/frame base
  PLAYER_HP:         100,
  PLAYER_SPRINT_MUL: 1.7,
  STAMINA_MAX:       100,
  STAMINA_DRAIN:     0.4,
  STAMINA_REGEN:     0.2,

  // ── Camera ────────────────────────────────────────────────
  CAMERA_LERP:  0.1,
  FOG_RADIUS:   280,   // px reveal radius around player

  // ── Extraction ────────────────────────────────────────────
  EXTRACTION_RADIUS: 48,
  EXTRACTION_TIME:   4000,  // ms hold time to extract
  EXTRACTION_COUNT:  4,     // zones per raid

  // ── Raid ─────────────────────────────────────────────────
  RAID_DURATION:     900,   // seconds (15 min)

  // ── Enemies ───────────────────────────────────────────────
  ENEMY_TYPES: {
    scavenger: {
      label:    'Scavenger',
      hp:       40,
      speed:    1.4,
      sight:    180,
      attackRange: 140,
      damage:   8,
      fireRate: 1200,   // ms between shots
      color:    '#c0392b',
      lootTable: ['pistol_ammo','bandage','junk_bottle','junk_cloth','pistol'],
      xp:       25,
    },
    guard: {
      label:    'Guard',
      hp:       80,
      speed:    1.7,
      sight:    220,
      attackRange: 200,
      damage:   14,
      fireRate: 800,
      color:    '#8e44ad',
      lootTable: ['rifle_ammo','medkit','helmet_basic','armor_basic','rifle'],
      xp:       60,
    },
    heavy: {
      label:    'Heavy',
      hp:       160,
      speed:    1.0,
      sight:    160,
      attackRange: 120,
      damage:   22,
      fireRate: 600,
      color:    '#2c3e50',
      lootTable: ['rifle_ammo','rifle_ammo','medkit','armor_heavy','cash'],
      xp:       120,
    },
  },

  ENEMY_SPAWN_PER_RAID: 40,

  // ── Weapons ───────────────────────────────────────────────
  WEAPONS: {
    // ── Pistols ──
    pistol_basic: {
      label:      'Colt M9',
      type:       'pistol',
      slot:       'secondary',
      damage:     22,
      fireRate:   400,   // ms
      magSize:    15,
      reloadTime: 1800,
      range:      260,
      spread:     0.06,
      auto:       false,
      ammoType:   'pistol_ammo',
      icon:       '🔫',
      weight:     1,
      value:      800,
    },
    pistol_heavy: {
      label:      'Desert Hawk',
      type:       'pistol',
      slot:       'secondary',
      damage:     40,
      fireRate:   700,
      magSize:    7,
      reloadTime: 2200,
      range:      280,
      spread:     0.08,
      auto:       false,
      ammoType:   'pistol_ammo',
      icon:       '🔫',
      weight:     2,
      value:      2200,
    },
    // ── SMGs ──
    smg_basic: {
      label:      'MP5k',
      type:       'smg',
      slot:       'main',
      damage:     18,
      fireRate:   90,
      magSize:    30,
      reloadTime: 2000,
      range:      220,
      spread:     0.09,
      auto:       true,
      ammoType:   'pistol_ammo',
      icon:       '🔫',
      weight:     2,
      value:      3000,
    },
    // ── Rifles ──
    rifle: {
      label:      'AK-74',
      type:       'rifle',
      slot:       'main',
      damage:     32,
      fireRate:   110,
      magSize:    30,
      reloadTime: 2600,
      range:      380,
      spread:     0.05,
      auto:       true,
      ammoType:   'rifle_ammo',
      icon:       '🔫',
      weight:     4,
      value:      6000,
    },
    rifle_dmr: {
      label:      'SVD Dragunov',
      type:       'dmr',
      slot:       'main',
      damage:     65,
      fireRate:   700,
      magSize:    10,
      reloadTime: 3000,
      range:      550,
      spread:     0.02,
      auto:       false,
      ammoType:   'sniper_ammo',
      icon:       '🔫',
      weight:     5,
      value:      12000,
    },
    shotgun: {
      label:      'Mossberg 500',
      type:       'shotgun',
      slot:       'main',
      damage:     18,   // per pellet x6
      pellets:    6,
      fireRate:   900,
      magSize:    6,
      reloadTime: 3200,
      range:      160,
      spread:     0.22,
      auto:       false,
      ammoType:   'shotgun_ammo',
      icon:       '🔫',
      weight:     4,
      value:      4500,
    },
  },

  // ── Armour / Helmets ──────────────────────────────────────
  HELMETS: {
    none:          { label:'None',          armor:0,  weight:0, value:0 },
    helmet_basic:  { label:'Ballistic Cap', armor:15, weight:1, value:1200 },
    helmet_heavy:  { label:'FAST Helmet',   armor:30, weight:2, value:4000 },
    helmet_nvg:    { label:'NVG Helmet',    armor:25, weight:3, value:8000 },
  },
  ARMORS: {
    none:          { label:'None',           armor:0,  weight:0, value:0 },
    armor_basic:   { label:'Class II Vest',  armor:25, weight:3, value:2000 },
    armor_heavy:   { label:'Class IV Plate', armor:55, weight:7, value:9000 },
  },
  BAGS: {
    none:      { label:'None',          slots:0,  weight:0, value:0 },
    bag_small: { label:'Sling Pack',    slots:6,  weight:1, value:800 },
    bag_medium:{ label:'Assault Pack',  slots:12, weight:2, value:2400 },
    bag_large: { label:'Hunting Pack',  slots:20, weight:3, value:5000 },
  },

  // ── Consumables / Misc Items ──────────────────────────────
  ITEMS: {
    // Ammo
    pistol_ammo:  { label:'9mm x30',       type:'ammo',  value:120,  weight:0.5, healAmt:0, ammoType:'pistol_ammo',  qty:30 },
    rifle_ammo:   { label:'5.45x39 x30',   type:'ammo',  value:200,  weight:1,   healAmt:0, ammoType:'rifle_ammo',   qty:30 },
    shotgun_ammo: { label:'12g x8',         type:'ammo',  value:90,   weight:0.5, healAmt:0, ammoType:'shotgun_ammo', qty:8  },
    sniper_ammo:  { label:'7.62x54 x10',   type:'ammo',  value:350,  weight:1,   healAmt:0, ammoType:'sniper_ammo',  qty:10 },
    // Medical
    bandage:  { label:'Bandage',   type:'medical', value:300,  weight:0.2, healAmt:20,  useTime:2000 },
    medkit:   { label:'Med Kit',   type:'medical', value:1200, weight:1,   healAmt:60,  useTime:5000 },
    painkillers:{ label:'Painkillers',type:'medical',value:600, weight:0.2, healAmt:30, useTime:3000 },
    // Junk (sell for cash)
    junk_bottle:  { label:'Plastic Bottle', type:'junk', value:80,   weight:0.1, healAmt:0 },
    junk_cloth:   { label:'Cloth Scraps',   type:'junk', value:120,  weight:0.2, healAmt:0 },
    junk_wire:    { label:'Copper Wire',    type:'junk', value:200,  weight:0.3, healAmt:0 },
    junk_circuit: { label:'Circuit Board',  type:'junk', value:600,  weight:0.3, healAmt:0 },
    junk_watch:   { label:'Wrist Watch',    type:'junk', value:1400, weight:0.1, healAmt:0 },
    junk_gold:    { label:'Gold Chain',     type:'junk', value:3000, weight:0.2, healAmt:0 },
    // Currency
    cash:         { label:'Cash Bundle',    type:'currency', value:500, weight:0.1, healAmt:0 },
  },

  // ── Loot Spawn Table (tile-level) ─────────────────────────
  LOOT_SPAWN_RATES: {
    road:     0.002,
    dirt:     0.008,
    grass:    0.005,
    building: 0.12,
  },

  // ── Market buy multiplier (sell = value, buy = value * mul) ─
  MARKET_BUY_MUL: 1.8,

  // ── Tile colours ─────────────────────────────────────────
  TILE_COLORS: {
    grass:    ['#4a7c3f','#3d6b34','#527a45','#436e3a'],
    dirt:     ['#8b6f47','#7a6040','#967550','#7d6244'],
    road:     ['#555','#4a4a4a','#5a5a5a','#505050'],
    building_floor: ['#888','#7a7a7a','#909090'],
    wall:     ['#555','#4e4e4e','#5c5c5c'],
    water:    ['#2c6e8a','#246080','#2f7090'],
  },

  // ── Colours (UI) ─────────────────────────────────────────
  UI: {
    bg:        '#0d0d0d',
    panel:     '#1a1a1a',
    border:    '#333',
    accent:    '#e8b84b',
    danger:    '#e74c3c',
    safe:      '#2ecc71',
    text:      '#ddd',
    textDim:   '#888',
    hp:        '#e74c3c',
    stamina:   '#f39c12',
  },
};

// Convenience: flat list of all loot IDs for random picking
CFG.ALL_LOOT_IDS = [
  ...Object.keys(CFG.ITEMS),
  ...Object.keys(CFG.WEAPONS).map(k => 'W:'+k),
  ...Object.keys(CFG.HELMETS).filter(k=>k!=='none').map(k=>'H:'+k),
  ...Object.keys(CFG.ARMORS).filter(k=>k!=='none').map(k=>'A:'+k),
  ...Object.keys(CFG.BAGS).filter(k=>k!=='none').map(k=>'B:'+k),
];

// Weighted loot pool for ground spawns (junk heavy, gear rare)
CFG.LOOT_WEIGHTS = {
  junk_bottle:10, junk_cloth:8, junk_wire:6, junk_circuit:3, junk_watch:2, junk_gold:1,
  bandage:6, painkillers:3, medkit:1,
  pistol_ammo:5, rifle_ammo:3, shotgun_ammo:2, sniper_ammo:1,
  cash:4,
  'W:pistol_basic':2,'W:smg_basic':1,'W:rifle':0.5,'W:shotgun':1,'W:rifle_dmr':0.2,
  'H:helmet_basic':2,'H:helmet_heavy':0.5,
  'A:armor_basic':2,'A:armor_heavy':0.4,
  'B:bag_small':2,'B:bag_medium':1,'B:bag_large':0.3,
};

/**
 * Pick a random loot item ID respecting weights.
 */
CFG.randomLoot = function() {
  const keys = Object.keys(CFG.LOOT_WEIGHTS);
  const total = keys.reduce((s,k)=>s+CFG.LOOT_WEIGHTS[k],0);
  let r = Math.random()*total;
  for(const k of keys){ r-=CFG.LOOT_WEIGHTS[k]; if(r<=0) return k; }
  return 'junk_bottle';
};
