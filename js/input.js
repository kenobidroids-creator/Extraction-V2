// ============================================================
//  input.js  –  Unified input system for desktop + mobile
//               Keyboard / Mouse / Touch / Virtual Joystick
// ============================================================

const INPUT = {
  // Movement
  up:     false,
  down:   false,
  left:   false,
  right:  false,
  sprint: false,

  // Actions
  shoot:    false,
  reload:   false,
  interact: false,   // pick up / use extraction
  switchWep:false,
  useItem:  false,   // use first available medical
  openMap:  false,
  openInv:  false,
  pause:    false,

  // Mouse / aim
  mouseWX:  0,
  mouseWY:  0,
  _mouseRaw:{ x:0, y:0 },

  // Mobile joystick state
  _joystickActive:  false,
  _joystickOrigin:  { x:0, y:0 },
  _joystickCurrent: { x:0, y:0 },
  _joystickId:      null,
  joystickDX:       0,   // normalized -1..1
  joystickDY:       0,

  // Mobile aim
  _aimTouchId:      null,
  _aimTouchOrigin:  { x:0, y:0 },
  _aimTouchCurrent: { x:0, y:0 },

  init(canvas, camera) {
    this._canvas = canvas;
    this._camera = camera;
    this._isMobile = /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || window.matchMedia('(pointer:coarse)').matches;

    // ── Keyboard ─────────────────────────────────────────
    window.addEventListener('keydown', e => {
      switch(e.code) {
        case 'KeyW': case 'ArrowUp':    this.up      = true; break;
        case 'KeyS': case 'ArrowDown':  this.down    = true; break;
        case 'KeyA': case 'ArrowLeft':  this.left    = true; break;
        case 'KeyD': case 'ArrowRight': this.right   = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.sprint = true; break;
        case 'KeyR':  this.reload    = true; break;
        case 'KeyF':  this.interact  = true; break;
        case 'KeyQ':  this.switchWep = true; break;
        case 'KeyH':  this.useItem   = true; break;
        case 'KeyM':  this.openMap   = !this.openMap; break;
        case 'Tab':   e.preventDefault(); this.openInv = !this.openInv; break;
        case 'Escape': this.pause    = !this.pause; break;
      }
    });
    window.addEventListener('keyup', e => {
      switch(e.code) {
        case 'KeyW': case 'ArrowUp':    this.up      = false; break;
        case 'KeyS': case 'ArrowDown':  this.down    = false; break;
        case 'KeyA': case 'ArrowLeft':  this.left    = false; break;
        case 'KeyD': case 'ArrowRight': this.right   = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.sprint = false; break;
        case 'KeyR':  this.reload    = false; break;
        case 'KeyF':  this.interact  = false; break;
        case 'KeyQ':  this.switchWep = false; break;
        case 'KeyH':  this.useItem   = false; break;
      }
    });

    // ── Mouse ─────────────────────────────────────────────
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this._mouseRaw.x = (e.clientX - r.left) * (canvas.width  / r.width);
      this._mouseRaw.y = (e.clientY - r.top)  * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', e => {
      if(e.button===0) this.shoot = true;
    });
    canvas.addEventListener('mouseup', e => {
      if(e.button===0) this.shoot = false;
    });
    // Right-click: reload
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.reload = true;
      setTimeout(()=>{ this.reload=false; }, 50);
    });

    // ── Touch ─────────────────────────────────────────────
    canvas.addEventListener('touchstart',  e => this._onTouchStart(e),  { passive:false });
    canvas.addEventListener('touchmove',   e => this._onTouchMove(e),   { passive:false });
    canvas.addEventListener('touchend',    e => this._onTouchEnd(e),    { passive:false });
    canvas.addEventListener('touchcancel', e => this._onTouchEnd(e),    { passive:false });
  },

  // Update mouse world coordinates (call each frame after camera moves)
  updateMouseWorld() {
    if(!this._camera) return;
    const { wx, wy } = this._camera.screenToWorld(this._mouseRaw.x, this._mouseRaw.y);
    this.mouseWX = wx;
    this.mouseWY = wy;
  },

  // ── Touch helpers ────────────────────────────────────────
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
      const pos = this._touchPos(touch);
      const halfW = this._canvas.width / 2;

      if(pos.x < halfW) {
        // Left half → joystick
        if(this._joystickId === null) {
          this._joystickId     = touch.identifier;
          this._joystickActive = true;
          this._joystickOrigin  = { ...pos };
          this._joystickCurrent = { ...pos };
        }
      } else {
        // Right half → aim + shoot
        if(this._aimTouchId === null) {
          this._aimTouchId     = touch.identifier;
          this._aimTouchOrigin  = { ...pos };
          this._aimTouchCurrent = { ...pos };
          this.shoot = true;
          // Update aim world coords
          const { wx, wy } = this._camera.screenToWorld(pos.x, pos.y);
          this.mouseWX = wx; this.mouseWY = wy;
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
        this._aimTouchCurrent = { ...pos };
        const { wx, wy } = this._camera.screenToWorld(pos.x, pos.y);
        this.mouseWX = wx; this.mouseWY = wy;
      }
    }
  },

  _onTouchEnd(e) {
    e.preventDefault();
    for(const touch of e.changedTouches) {
      if(touch.identifier === this._joystickId) {
        this._joystickActive  = false;
        this._joystickId      = null;
        this.joystickDX       = 0;
        this.joystickDY       = 0;
      }
      if(touch.identifier === this._aimTouchId) {
        this._aimTouchId = null;
        this.shoot       = false;
      }
    }
  },

  // Call each frame to compute normalized joystick vector
  updateJoystick() {
    if(!this._joystickActive) {
      this.joystickDX = 0; this.joystickDY = 0;
      return;
    }
    const DEAD = 10;   // dead zone px
    const MAX  = 60;   // max radius px
    const dx   = this._joystickCurrent.x - this._joystickOrigin.x;
    const dy   = this._joystickCurrent.y - this._joystickOrigin.y;
    const dist = Math.hypot(dx,dy);
    if(dist < DEAD) { this.joystickDX=0; this.joystickDY=0; return; }
    const clamped = Math.min(dist, MAX);
    this.joystickDX = (dx/dist)*(clamped/MAX);
    this.joystickDY = (dy/dist)*(clamped/MAX);
  },

  // Draw mobile joystick overlay onto canvas
  drawJoystick(ctx) {
    if(!this._joystickActive) return;

    const ox = this._joystickOrigin.x;
    const oy = this._joystickOrigin.y;
    const cx = this._joystickCurrent.x;
    const cy = this._joystickCurrent.y;
    const MAX = 60;

    // Outer ring
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(ox, oy, MAX, 0, Math.PI*2);
    ctx.stroke();

    // Inner knob
    const kdx = Math.min(1, Math.max(-1, (cx-ox)/MAX));
    const kdy = Math.min(1, Math.max(-1, (cy-oy)/MAX));
    ctx.globalAlpha = 0.6;
    ctx.fillStyle   = '#fff';
    ctx.beginPath();
    ctx.arc(ox+kdx*MAX, oy+kdy*MAX, 22, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  },

  // Get movement vector, unified keyboard + joystick
  getMovement() {
    let dx = 0, dy = 0;
    if(this.up    || this.joystickDY < -0.2) dy -= 1;
    if(this.down  || this.joystickDY >  0.2) dy += 1;
    if(this.left  || this.joystickDX < -0.2) dx -= 1;
    if(this.right || this.joystickDX >  0.2) dx += 1;
    // Analog movement from joystick
    if(Math.abs(this.joystickDX) > 0.1) dx = this.joystickDX;
    if(Math.abs(this.joystickDY) > 0.1) dy = this.joystickDY;
    // Normalize diagonal
    const len = Math.hypot(dx,dy);
    if(len > 1) { dx/=len; dy/=len; }
    return { dx, dy };
  },
};

// Expose globally (used by Player.speed getter)
window.INPUT = INPUT;
