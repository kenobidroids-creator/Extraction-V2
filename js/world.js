// ============================================================
//  world.js  –  Procedural map generation
//               Tiles, buildings, roads, POIs, extractions
// ============================================================

class World {
  constructor(seed) {
    this.seed   = seed || Math.floor(Math.random()*999999);
    this.W      = CFG.WORLD_W;
    this.H      = CFG.WORLD_H;
    this.T      = CFG.TILE;

    // Tile data: each cell = { type, variant, walkable, explored, seen }
    this.tiles  = [];
    // Buildings: array of { x,y,w,h,rooms,doors,type }
    this.buildings = [];
    // Loot items on ground: array of WorldItem
    this.lootItems = [];
    // Extraction zones
    this.extractions = [];
    // Spawn points for enemies/player
    this.playerSpawn = null;
    this.enemySpawns = [];

    this._rng = this._mkRng(this.seed);
    this._generate();
  }

  // ── Simple seeded RNG ─────────────────────────────────────
  _mkRng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  rnd()           { return this._rng(); }
  rndInt(a,b)     { return a + Math.floor(this.rnd()*(b-a+1)); }
  rndItem(arr)    { return arr[Math.floor(this.rnd()*arr.length)]; }

  // ── Main generation pipeline ─────────────────────────────
  _generate() {
    this._initTiles();
    this._paintNoise();
    this._placeRoads();
    this._placeBuildings();
    this._placePOIs();
    this._placeExtractions();
    this._scatterLoot();
    this._findSpawns();
  }

  // Allocate flat tile array
  _initTiles() {
    for(let i=0;i<this.W*this.H;i++){
      this.tiles.push({ type:'grass', variant:0, walkable:true, explored:false, seen:false });
    }
  }

  idx(x,y){ return y*this.W+x; }
  tile(x,y){
    if(x<0||y<0||x>=this.W||y>=this.H) return null;
    return this.tiles[this.idx(x,y)];
  }
  setTile(x,y,type,walkable=true){
    const t = this.tile(x,y);
    if(!t) return;
    t.type = type;
    t.walkable = walkable;
    t.variant = Math.floor(this.rnd()*4);
  }

  // Simplex-like noise via layered RNG for grass/dirt patches
  _paintNoise() {
    for(let y=0;y<this.H;y++){
      for(let x=0;x<this.W;x++){
        const n = this._noise(x,y);
        if(n < 0.3) this.setTile(x,y,'dirt');
        else         this.setTile(x,y,'grass');
      }
    }
  }

  // Very cheap "noise" – not true Perlin but good enough for tile variety
  _noise(x,y){
    const scale = 12;
    const nx = x/scale, ny = y/scale;
    const ix = Math.floor(nx), iy = Math.floor(ny);
    const fx = nx-ix, fy = ny-iy;
    const h = (a,b) => {
      let s = (a*374761393+b*668265263+this.seed) & 0xffffffff;
      s = ((s^(s>>13))*1274126177) & 0xffffffff;
      return ((s>>>0)/0xffffffff);
    };
    const v00=h(ix,iy),v10=h(ix+1,iy),v01=h(ix,iy+1),v11=h(ix+1,iy+1);
    const lx = fx*fx*(3-2*fx);
    const ly = fy*fy*(3-2*fy);
    return v00+(v10-v00)*lx + ((v01-v00)+(v00-v10-v01+v11)*lx)*ly;
  }

  // Draw roads as grid + random diagonals
  _placeRoads() {
    const spacing = 20; // tiles between main roads
    // Horizontal roads
    for(let y=10;y<this.H-10;y+=spacing){
      const jitter = this.rndInt(-3,3);
      for(let x=0;x<this.W;x++) this.setTile(x,y+jitter,'road');
    }
    // Vertical roads
    for(let x=10;x<this.W-10;x+=spacing){
      const jitter = this.rndInt(-3,3);
      for(let y=0;y<this.H;y++) this.setTile(x+jitter,y,'road');
    }
    // Dirt paths between roads
    const paths = 8;
    for(let i=0;i<paths;i++){
      let px=this.rndInt(5,this.W-5), py=this.rndInt(5,this.H-5);
      const steps = this.rndInt(30,80);
      const dx = this.rndItem([-1,0,1]);
      for(let s=0;s<steps;s++){
        this.setTile(px,py,'dirt');
        if(this.rnd()<0.3) py += this.rndItem([-1,0,1]);
        px += dx;
        if(px<1||px>=this.W-1) break;
      }
    }
  }

  // Place rectangular buildings with interior floors and walls
  _placeBuildings() {
    const attempts = 80;
    for(let a=0;a<attempts;a++){
      const bw = this.rndInt(5,14);
      const bh = this.rndInt(4,10);
      const bx = this.rndInt(3,this.W-bw-3);
      const by = this.rndInt(3,this.H-bh-3);

      // Reject if overlaps existing building or road
      if(!this._canPlaceBuilding(bx,by,bw,bh)) continue;

      const building = { x:bx, y:by, w:bw, h:bh, doors:[], type: this.rndItem(['house','warehouse','barracks','shop']) };
      this.buildings.push(building);

      // Walls
      for(let y=by;y<by+bh;y++){
        for(let x=bx;x<bx+bw;x++){
          const isWall = x===bx||x===bx+bw-1||y===by||y===by+bh-1;
          this.setTile(x,y, isWall?'wall':'building_floor', !isWall);
        }
      }
      // Door(s)
      const doorCount = this.rndInt(1,2);
      for(let d=0;d<doorCount;d++){
        const side = this.rndInt(0,3);
        let dx,dy;
        if(side===0){ dx=this.rndInt(bx+1,bx+bw-2); dy=by; }
        else if(side===1){ dx=bx+bw-1; dy=this.rndInt(by+1,by+bh-2); }
        else if(side===2){ dx=this.rndInt(bx+1,bx+bw-2); dy=by+bh-1; }
        else { dx=bx; dy=this.rndInt(by+1,by+bh-2); }
        this.setTile(dx,dy,'building_floor',true);
        building.doors.push({x:dx,y:dy});
      }
    }
  }

  _canPlaceBuilding(bx,by,bw,bh){
    for(let y=by-1;y<by+bh+1;y++){
      for(let x=bx-1;x<bx+bw+1;x++){
        const t=this.tile(x,y);
        if(!t) return false;
        if(t.type==='wall'||t.type==='building_floor') return false;
      }
    }
    return true;
  }

  // POIs: clusters of buildings with extra loot
  _placePOIs() {
    const poiCount = this.rndInt(4,7);
    for(let i=0;i<poiCount;i++){
      const cx = this.rndInt(15,this.W-15);
      const cy = this.rndInt(15,this.H-15);
      // Mark area (used for higher loot density during scatter)
      // We just place a few extra junk piles around cx,cy
      for(let j=0;j<6;j++){
        const ox = cx+this.rndInt(-6,6);
        const oy = cy+this.rndInt(-6,6);
        const t = this.tile(ox,oy);
        if(t && t.walkable && t.type!=='wall'){
          this.lootItems.push(new WorldItem(
            ox*this.T + this.T/2,
            oy*this.T + this.T/2,
            CFG.randomLoot()
          ));
        }
      }
    }
  }

  // Place extraction zones far from center
  _placeExtractions() {
    const zones = [
      { x:8,     y:8     },
      { x:this.W-10, y:8 },
      { x:8,     y:this.H-10 },
      { x:this.W-10, y:this.H-10 },
    ];
    zones.forEach((z,i)=>{
      this.extractions.push({
        id:     i,
        wx:     z.x*this.T + this.T/2,   // world px
        wy:     z.y*this.T + this.T/2,
        radius: CFG.EXTRACTION_RADIUS,
        label:  `Exfil ${String.fromCharCode(65+i)}`,
        active: true,
        revealed: false,
      });
    });
  }

  // Scatter loot across walkable tiles
  _scatterLoot() {
    for(let y=0;y<this.H;y++){
      for(let x=0;x<this.W;x++){
        const t = this.tiles[this.idx(x,y)];
        if(!t.walkable) continue;
        const rate = CFG.LOOT_SPAWN_RATES[t.type] || 0;
        if(Math.random() < rate){
          this.lootItems.push(new WorldItem(
            x*this.T + this.T/2,
            y*this.T + this.T/2,
            CFG.randomLoot()
          ));
        }
      }
    }
  }

  // Find a clear grass/road tile for player and enemy spawns
  _findSpawns() {
    // Player spawns near center
    for(let r=5;r<40;r++){
      const cx=Math.floor(this.W/2), cy=Math.floor(this.H/2);
      const t=this.tile(cx,cy);
      if(t && t.walkable){ this.playerSpawn={x:cx*this.T+this.T/2, y:cy*this.T+this.T/2}; break; }
    }

    // Enemy spawns away from player
    for(let i=0;i<CFG.ENEMY_SPAWN_PER_RAID*2;i++){
      const ex=this.rndInt(5,this.W-5);
      const ey=this.rndInt(5,this.H-5);
      const t=this.tile(ex,ey);
      if(t&&t.walkable){
        const dx=ex-this.W/2, dy=ey-this.H/2;
        if(Math.sqrt(dx*dx+dy*dy)>20) this.enemySpawns.push({x:ex*this.T+this.T/2,y:ey*this.T+this.T/2});
      }
      if(this.enemySpawns.length>=CFG.ENEMY_SPAWN_PER_RAID) break;
    }
  }

  // ── Fog of War ────────────────────────────────────────────
  revealAround(wx, wy, radius) {
    const tx = Math.floor(wx/this.T);
    const ty = Math.floor(wy/this.T);
    const tr = Math.ceil(radius/this.T);
    for(let y=ty-tr;y<=ty+tr;y++){
      for(let x=tx-tr;x<=tx+tr;x++){
        const t=this.tile(x,y); if(!t) continue;
        const dx=(x-tx)*this.T, dy=(y-ty)*this.T;
        if(dx*dx+dy*dy <= radius*radius){
          t.explored = true;
          t.seen = true;
        }
      }
    }
    // Unsee tiles just outside radius (for dynamic fog)
    // We keep explored=true permanently
  }

  // ── Collision check (world px) ────────────────────────────
  isWalkable(wx, wy) {
    const tx = Math.floor(wx/this.T);
    const ty = Math.floor(wy/this.T);
    const t  = this.tile(tx,ty);
    return t ? t.walkable : false;
  }

  // ── Draw method (called by renderer in main) ──────────────
  draw(ctx, cam) {
    const T = this.T;
    // Visible tile range
    const x0 = Math.max(0, Math.floor(cam.x/T));
    const y0 = Math.max(0, Math.floor(cam.y/T));
    const x1 = Math.min(this.W-1, Math.ceil((cam.x+cam.vw)/T));
    const y1 = Math.min(this.H-1, Math.ceil((cam.y+cam.vh)/T));

    for(let y=y0;y<=y1;y++){
      for(let x=x0;x<=x1;x++){
        const t = this.tiles[this.idx(x,y)];
        const sx = x*T - cam.x;
        const sy = y*T - cam.y;

        // Always draw; dim if not currently "seen"
        const cols = CFG.TILE_COLORS[t.type] || ['#444'];
        let col = cols[t.variant % cols.length];

        ctx.fillStyle = col;
        ctx.fillRect(sx, sy, T, T);

        // Dim explored-but-not-currently-seen tiles
        if(t.explored && !t.seen){
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(sx, sy, T, T);
        } else if(!t.explored){
          ctx.fillStyle = 'rgba(0,0,0,0.92)';
          ctx.fillRect(sx, sy, T, T);
        }
      }
    }

    // Mark current "seen" tiles as no longer actively seen
    // (will be refreshed each frame by revealAround)
    // This is done in camera/main update loop
  }
}

// ── WorldItem ────────────────────────────────────────────────
class WorldItem {
  constructor(wx, wy, lootId) {
    this.wx     = wx;
    this.wy     = wy;
    this.lootId = lootId;   // key into CFG.ITEMS, or 'W:key', 'H:key', etc.
    this.id     = ++WorldItem._uid;
    this.bobOffset = Math.random() * Math.PI * 2;
  }

  get label() { return WorldItem.getLabel(this.lootId); }
  get value()  { return WorldItem.getValue(this.lootId); }

  static _uid = 0;

  static getLabel(id) {
    if(id.startsWith('W:')) return CFG.WEAPONS[id.slice(2)]?.label || id;
    if(id.startsWith('H:')) return CFG.HELMETS[id.slice(2)]?.label || id;
    if(id.startsWith('A:')) return CFG.ARMORS[id.slice(2)]?.label  || id;
    if(id.startsWith('B:')) return CFG.BAGS[id.slice(2)]?.label    || id;
    return CFG.ITEMS[id]?.label || id;
  }
  static getValue(id) {
    if(id.startsWith('W:')) return CFG.WEAPONS[id.slice(2)]?.value || 0;
    if(id.startsWith('H:')) return CFG.HELMETS[id.slice(2)]?.value || 0;
    if(id.startsWith('A:')) return CFG.ARMORS[id.slice(2)]?.value  || 0;
    if(id.startsWith('B:')) return CFG.BAGS[id.slice(2)]?.value    || 0;
    return CFG.ITEMS[id]?.value || 0;
  }

  draw(ctx, cam, time) {
    const sx = this.wx - cam.x;
    const sy = this.wy - cam.y;
    if(sx<-20||sy<-20||sx>cam.vw+20||sy>cam.vh+20) return;

    // Bob animation
    const bob = Math.sin(time*0.003 + this.bobOffset)*3;

    // Glow
    ctx.save();
    ctx.shadowColor = '#e8b84b';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#e8b84b';
    ctx.beginPath();
    ctx.arc(sx, sy+bob, 6, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Item dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy+bob, 3, 0, Math.PI*2);
    ctx.fill();
  }
}
