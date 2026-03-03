// ============================================================
//  input.js  –  Unified input: keyboard / mouse / touch
//               Virtual joystick + right-half aim & shoot
// ============================================================

const INPUT = {
  // Movement
  up: false, down: false, left: false, right: false, sprint: false,

  // Actions
  shoot:     false,   // held = fires auto weapons every frame
  _fireOnce: false,   // consumed = fires one shot for semi-auto
  reload:    false,
  interact:  false,
  switchWep: false,
  useItem:   false,
  openInv:   false,
  dropItem:  false,
  pause:     false,
  mapOpen:   false,   // toggled, not held

  // Mouse aim (screen px)
  _mouseRaw: { x: 0, y: 0 },
  mouseWX: 0,
  mouseWY: 0,

  // Joystick
  _joystickId:      null,
  _joystickActive:  false,
  _joystickOrigin:  { x: 0, y: 0 },
  _joystickCurrent: { x: 0, y: 0 },
  joystickDX: 0,
  joystickDY: 0,

  // Right-half aim touch
  _aimTouchId: null,

  init(canvas, camera) {
    this._canvas = canvas;
    this._camera = camera;

    // Keyboard
    window.addEventListener('keydown', e => {
      if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch(e.code) {
        case 'KeyW': case 'ArrowUp':         this.up       = true;  break;
        case 'KeyS': case 'ArrowDown':       this.down     = true;  break;
        case 'KeyA': case 'ArrowLeft':       this.left     = true;  break;
        case 'KeyD': case 'ArrowRight':      this.right    = true;  break;
        case 'ShiftLeft': case 'ShiftRight': this.sprint   = true;  break;
        case 'KeyR':  this.reload    = true;  break;
        case 'KeyF':  this.interact  = true;  break;
        case 'KeyQ':  this.switchWep = true;  break;
        case 'KeyH':  this.useItem   = true;  break;
        case 'KeyG':  this.dropItem  = true;  break;
        case 'KeyM':  this.mapOpen   = !this.mapOpen; break;
        case 'Tab':   e.preventDefault(); this.openInv = !this.openInv; break;
        case 'Escape': this.pause    = true;  break;
      }
    });
    window.addEventListener('keyup', e => {
      switch(e.code) {
        case 'KeyW': case 'ArrowUp':         this.up       = false; break;
        case 'KeyS': case 'ArrowDown':       this.down     = false; break;
        case 'KeyA': case 'ArrowLeft':       this.left     = false; break;
        case 'KeyD': case 'ArrowRight':      this.right    = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.sprint   = false; break;
        case 'KeyR':  this.reload    = false; break;
        case 'KeyF':  this.interact  = false; break;
        case 'KeyQ':  this.switchWep = false; break;
        case 'KeyH':  this.useItem   = false; break;
        case 'KeyG':  this.dropItem  = false; break;
        case 'Escape': this.pause    = false; break;
      }
    });

    // Mouse
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this._mouseRaw.x = (e.clientX - r.left) * (canvas.width  / r.width);
      this._mouseRaw.y = (e.clientY - r.top)  * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', e => {
      if(e.button === 0) { this.shoot = true; this._fireOnce = true; }
    });
    canvas.addEventListener('mouseup', e => {
      if(e.button === 0) this.shoot = false;
    });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.reload = true;
      setTimeout(() => { this.reload = false; }, 50);
    });

    // Touch
    canvas.addEventListener('touchstart',  e => this._onTouchStart(e),  { passive: false });
    canvas.addEventListener('touchmove',   e => this._onTouchMove(e),   { passive: false });
    canvas.addEventListener('touchend',    e => this._onTouchEnd(e),    { passive: false });
    canvas.addEventListener('touchcancel', e => this._onTouchEnd(e),    { passive: false });
  },

  updateMouseWorld() {
    if(!this._camera) return;
    const { wx, wy } = this._camera.screenToWorld(this._mouseRaw.x, this._mouseRaw.y);
    this.mouseWX = wx;
    this.mouseWY = wy;
  },

  _touchPos(touch) {
    const r = this._canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - r.left) * (this._canvas.width  / r.width),
      y: (touch.clientY - r.top)  * (this._canvas.height / r.height),
    };
  },

  _onTouchStart(e) {
    e.preventDefault();
    for(const touch of e.changedTouches) {
      const pos   = this._touchPos(touch);
      const halfW = this._canvas.width / 2;

      if(pos.x < halfW) {
        // Left = joystick
        if(this._joystickId === null) {
          this._joystickId      = touch.identifier;
          this._joystickActive  = true;
          this._joystickOrigin  = { ...pos };
          this._joystickCurrent = { ...pos };
        }
      } else {
        // Right = aim + shoot
        if(this._aimTouchId === null) {
          this._aimTouchId    = touch.identifier;
          this._mouseRaw.x    = pos.x;
          this._mouseRaw.y    = pos.y;
          if(this._camera) {
            const { wx, wy } = this._camera.screenToWorld(pos.x, pos.y);
            this.mouseWX = wx;
            this.mouseWY = wy;
          }
          this.shoot     = true;
          this._fireOnce = true;
        }
      }
    }
  },

  _onTouchMove(e) {
    e.preventDefault();
    for(const touch of e.changedTouches) {
      const pos = this._touchPos(touch);
      if(touch.identifier === this._joystickId) {
        this._joystickCurrent = { ...pos };
      }
      if(touch.identifier === this._aimTouchId) {
        this._mouseRaw.x = pos.x;
        this._mouseRaw.y = pos.y;
        if(this._camera) {
          const { wx, wy } = this._camera.screenToWorld(pos.x, pos.y);
          this.mouseWX = wx;
          this.mouseWY = wy;
        }
      }
    }
  },

  _onTouchEnd(e) {
    e.preventDefault();
    for(const touch of e.changedTouches) {
      if(touch.identifier === this._joystickId) {
        this._joystickActive = false;
        this._joystickId     = null;
        this.joystickDX      = 0;
        this.joystickDY      = 0;
      }
      if(touch.identifier === this._aimTouchId) {
        this._aimTouchId = null;
        this.shoot       = false;
      }
    }
  },

  updateJoystick() {
    if(!this._joystickActive) { this.joystickDX = 0; this.joystickDY = 0; return; }
    const DEAD = 10, MAX = 60;
    const dx   = this._joystickCurrent.x - this._joystickOrigin.x;
    const dy   = this._joystickCurrent.y - this._joystickOrigin.y;
    const dist = Math.hypot(dx, dy);
    if(dist < DEAD) { this.joystickDX = 0; this.joystickDY = 0; return; }
    const c = Math.min(dist, MAX);
    this.joystickDX = (dx / dist) * (c / MAX);
    this.joystickDY = (dy / dist) * (c / MAX);
  },

  drawJoystick(ctx) {
    if(!this._joystickActive) return;
    const ox = this._joystickOrigin.x, oy = this._joystickOrigin.y;
    const MAX = 60;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, MAX, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ox + this.joystickDX*MAX, oy + this.joystickDY*MAX, 22, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  },

  getMovement() {
    let dx = 0, dy = 0;
    if(this.up)    dy -= 1;
    if(this.down)  dy += 1;
    if(this.left)  dx -= 1;
    if(this.right) dx += 1;
    if(this._joystickActive) { dx = this.joystickDX; dy = this.joystickDY; }
    const len = Math.hypot(dx, dy);
    if(len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  },
};

window.INPUT = INPUT;
