// ============================================================
//  camera.js  –  Smooth following camera + coordinate helpers
// ============================================================

class Camera {
  constructor(vw, vh) {
    this.x   = 0;   // world px of top-left corner
    this.y   = 0;
    this.vw  = vw;  // viewport width  (canvas width)
    this.vh  = vh;  // viewport height (canvas height)
  }

  resize(vw, vh) {
    this.vw = vw;
    this.vh = vh;
  }

  /**
   * Smoothly follow a target (world px coordinates).
   * Clamps to world boundaries.
   */
  follow(targetWx, targetWy) {
    const worldPxW = CFG.WORLD_W * CFG.TILE;
    const worldPxH = CFG.WORLD_H * CFG.TILE;

    // Desired top-left so target is centred
    const desiredX = targetWx - this.vw / 2;
    const desiredY = targetWy - this.vh / 2;

    // Lerp toward desired
    this.x += (desiredX - this.x) * CFG.CAMERA_LERP;
    this.y += (desiredY - this.y) * CFG.CAMERA_LERP;

    // Clamp
    this.x = Math.max(0, Math.min(this.x, worldPxW - this.vw));
    this.y = Math.max(0, Math.min(this.y, worldPxH - this.vh));
  }

  /** Convert world px → screen px */
  worldToScreen(wx, wy) {
    return { sx: wx - this.x, sy: wy - this.y };
  }

  /** Convert screen px → world px */
  screenToWorld(sx, sy) {
    return { wx: sx + this.x, wy: sy + this.y };
  }

  /** Is a world rect visible in viewport? */
  isVisible(wx, wy, w, h) {
    return wx + w > this.x && wx < this.x + this.vw &&
           wy + h > this.y && wy < this.y + this.vh;
  }
}
