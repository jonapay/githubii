import { GAME, VIEWPORT, WORLD } from "./constants.js";
import { WorldView } from "./WorldView.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function roundRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export class FlappyPovApp {
  constructor({ canvas, actionButton, announcer }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.actionButton = actionButton;
    this.announcer = announcer;
    this.world = new WorldView();

    this.canvas.width = VIEWPORT.width;
    this.canvas.height = VIEWPORT.height;

    this.hoveredAction = null;
    this.buttonBounds = {};
    this.lastFrameTime = 0;
    this.suspendRealtimeUntil = 0;

    this.frame = this.frame.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.resetState("start");
    this.attachEvents();
    this.exposeHooks();
    this.render();
    this.frameHandle = window.requestAnimationFrame(this.frame);
  }

  attachEvents() {
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  resetState(mode = "start") {
    const best = this.state?.best ?? 0;
    this.state = {
      mode,
      best,
      score: 0,
      elapsed: 0,
      flash: 0,
      scorePulse: 0,
      crashPulse: 0,
      rng: 1337,
      travel: 0,
      spawnCount: 0,
      lastGapCenter: 0,
      player: {
        y: 0,
        vy: 0,
        pitch: 0,
        roll: 0,
        flapPulse: 0,
      },
      gates: [],
    };

    while (this.state.gates.length < WORLD.visibleGateCount) {
      const distance = 18 + this.state.gates.length * WORLD.gateSpacing;
      this.state.gates.push(this.createGate(distance));
    }

    this.syncAccessibility();
  }

  nextRandom() {
    this.state.rng = (this.state.rng * 1664525 + 1013904223) >>> 0;
    return this.state.rng / 4294967296;
  }

  createGate(distance) {
    const introGap = GAME.introGaps[this.state.spawnCount];
    const target = introGap ?? (this.nextRandom() * 2 - 1) * 0.92;
    const mix = introGap == null ? 0.52 : 0.8;
    const gapCenter = clamp(
      this.state.lastGapCenter * (1 - mix) + target * mix,
      GAME.minGapCenter,
      GAME.maxGapCenter
    );
    const difficulty =
      Math.min(this.state.score, GAME.maxDifficultyScore) / GAME.maxDifficultyScore;
    const gapHalf =
      (introGap == null ? GAME.baseGapHalf : GAME.introGapHalf) -
      difficulty * GAME.difficultyGapReduction;

    this.state.lastGapCenter = gapCenter;
    this.state.spawnCount += 1;

    return {
      distance,
      gapCenter,
      gapHalf,
      passed: false,
    };
  }

  startRun() {
    const best = this.state.best;
    this.resetState("playing");
    this.state.best = best;
    this.applyFlap(true);
    this.announce("Run gestartet");
  }

  applyFlap(isStart = false) {
    if (this.state.mode === "start" || this.state.mode === "gameover") {
      this.startRun();
      return;
    }

    if (this.state.mode !== "playing") {
      return;
    }

    this.state.player.vy = isStart ? GAME.flapVelocity * 0.94 : GAME.flapVelocity;
    this.state.player.flapPulse = 1;
  }

  boostFromUser() {
    this.applyFlap();
  }

  crash() {
    if (this.state.mode !== "playing") {
      return;
    }
    this.state.mode = "gameover";
    this.state.best = Math.max(this.state.best, this.state.score);
    this.state.crashPulse = 1;
    this.syncAccessibility();
    this.announce(`Absturz bei ${this.state.score} Punkten`);
  }

  advanceGates(dt, speedScale, collisionEnabled) {
    const movement = GAME.obstacleSpeed * speedScale * dt;
    this.state.travel += movement;

    for (const gate of this.state.gates) {
      gate.distance -= movement;

      if (collisionEnabled && !gate.passed && gate.distance <= WORLD.collisionDistance) {
        const safeHalf = gate.gapHalf - GAME.playerRadius;
        if (Math.abs(this.state.player.y - gate.gapCenter) <= safeHalf) {
          gate.passed = true;
          this.state.score += 1;
          this.state.best = Math.max(this.state.best, this.state.score);
          this.state.scorePulse = 1;
          this.state.flash = 0.22;
          this.syncAccessibility();
        } else {
          this.crash();
          return;
        }
      }
    }

    this.state.gates = this.state.gates.filter((gate) => gate.distance > -2.2);

    while (
      this.state.gates.length < WORLD.visibleGateCount ||
      this.state.gates[this.state.gates.length - 1].distance < WORLD.gateSpawnDistance
    ) {
      const distance = this.state.gates.length
        ? this.state.gates[this.state.gates.length - 1].distance + WORLD.gateSpacing
        : WORLD.gateSpawnDistance;
      this.state.gates.push(this.createGate(distance));
    }
  }

  update(dt) {
    const step = Math.min(dt, GAME.maxDt);
    const player = this.state.player;

    this.state.elapsed += step;
    this.state.flash = Math.max(0, this.state.flash - step);
    this.state.scorePulse = Math.max(0, this.state.scorePulse - step * 2.4);
    this.state.crashPulse = Math.max(0, this.state.crashPulse - step * 2.2);
    player.flapPulse = Math.max(0, player.flapPulse - step * 3.6);

    if (this.state.mode === "start") {
      player.y = Math.sin(this.state.elapsed * 1.15) * 0.18;
      player.vy = 0;
      player.pitch = Math.sin(this.state.elapsed * 1.3) * 0.018;
      player.roll = Math.sin(this.state.elapsed * 0.9) * 0.015;
      this.advanceGates(step, GAME.idleSpeed / GAME.obstacleSpeed, false);
      return;
    }

    if (this.state.mode === "gameover") {
      player.vy += GAME.gravity * 0.4 * step;
      player.y = clamp(player.y + player.vy * step, WORLD.floorY + 0.44, WORLD.ceilingY - 0.44);
      player.pitch = lerp(player.pitch, -0.1, step * 4);
      player.roll = lerp(player.roll, 0, step * 3);
      this.advanceGates(step, 0.26, false);
      return;
    }

    player.vy += GAME.gravity * step;
    player.y += player.vy * step;
    player.pitch = lerp(player.pitch, clamp(-player.vy * 0.05, -0.14, 0.2), step * 7);
    player.roll = lerp(player.roll, clamp(-player.vy * 0.02, -0.035, 0.04), step * 7);

    if (
      player.y >= WORLD.ceilingY - GAME.playerRadius ||
      player.y <= WORLD.floorY + GAME.playerRadius
    ) {
      this.crash();
      return;
    }

    this.advanceGates(step, 1, true);
  }

  frame(now) {
    if (!this.lastFrameTime) {
      this.lastFrameTime = now;
    }

    if (now < this.suspendRealtimeUntil) {
      this.lastFrameTime = now;
      this.render();
      this.frameHandle = window.requestAnimationFrame(this.frame);
      return;
    }

    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;
    let remaining = delta;

    while (remaining > 0) {
      const step = Math.min(remaining, GAME.maxDt);
      this.update(step);
      remaining -= step;
    }

    this.render();
    this.frameHandle = window.requestAnimationFrame(this.frame);
  }

  render() {
    this.world.sync(this.state);
    this.world.render();

    this.ctx.clearRect(0, 0, VIEWPORT.width, VIEWPORT.height);
    this.ctx.drawImage(this.world.canvas, 0, 0, VIEWPORT.width, VIEWPORT.height);

    this.drawAtmosphere();
    this.drawHud();
    this.drawCockpit();

    if (this.state.mode === "start") {
      this.drawStartScreen();
    } else if (this.state.mode === "gameover") {
      this.drawCrashScreen();
    }
  }

  getLayout() {
    const compact = window.innerWidth < 960;
    const portrait = compact && window.innerHeight > window.innerWidth;
    return { compact, portrait };
  }

  drawAtmosphere() {
    const skyGlow = this.ctx.createLinearGradient(0, 0, 0, VIEWPORT.height * 0.68);
    skyGlow.addColorStop(0, "rgba(118, 198, 239, 0.2)");
    skyGlow.addColorStop(0.5, "rgba(62, 114, 155, 0.08)");
    skyGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = skyGlow;
    this.ctx.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height * 0.68);

    const portalGlow = this.ctx.createRadialGradient(
      VIEWPORT.width / 2,
      VIEWPORT.height * 0.46,
      48,
      VIEWPORT.width / 2,
      VIEWPORT.height * 0.46,
      420
    );
    portalGlow.addColorStop(0, "rgba(247, 228, 184, 0.26)");
    portalGlow.addColorStop(0.45, "rgba(126, 198, 238, 0.12)");
    portalGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = portalGlow;
    this.ctx.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);

    const topWash = this.ctx.createLinearGradient(0, 0, 0, VIEWPORT.height);
    topWash.addColorStop(0, "rgba(0, 0, 0, 0.18)");
    topWash.addColorStop(0.58, "rgba(0, 0, 0, 0)");
    topWash.addColorStop(1, "rgba(0, 0, 0, 0.28)");
    this.ctx.fillStyle = topWash;
    this.ctx.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);

    const vignette = this.ctx.createRadialGradient(
      VIEWPORT.width / 2,
      VIEWPORT.height * 0.46,
      180,
      VIEWPORT.width / 2,
      VIEWPORT.height * 0.46,
      980
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(5, 10, 18, 0.42)");
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);

    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    this.ctx.lineWidth = 1;
    roundRectPath(this.ctx, 20, 20, VIEWPORT.width - 40, VIEWPORT.height - 40, 26);
    this.ctx.stroke();

    if (this.state.flash > 0) {
      this.ctx.fillStyle = `rgba(255, 248, 230, ${(this.state.flash * 0.48).toFixed(3)})`;
      this.ctx.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);
    }
  }

  drawHud() {
    const scoreScale = 1 + this.state.scorePulse * 0.08;
    const startAlpha = this.state.mode === "start" ? 0.42 : 1;
    this.ctx.save();
    this.ctx.globalAlpha = startAlpha;
    this.ctx.fillStyle = "rgba(243, 237, 225, 0.88)";
    this.ctx.font = "700 24px Manrope";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(`Best ${this.state.best}`, 56, 42);

    this.ctx.translate(VIEWPORT.width / 2, 64);
    this.ctx.scale(scoreScale, scoreScale);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "top";
    this.ctx.lineWidth = 12;
    this.ctx.strokeStyle = "rgba(10, 19, 28, 0.42)";
    this.ctx.fillStyle = "#f6f0e2";
    this.ctx.font = this.state.mode === "start" ? "700 78px Sora" : "700 88px Sora";
    this.ctx.strokeText(String(this.state.score), 0, 0);
    this.ctx.fillText(String(this.state.score), 0, 0);
    this.ctx.restore();
  }

  drawCockpit() {
    const pulseLift = this.state.player.flapPulse * 20;
    const baseY = VIEWPORT.height - 92 - pulseLift;
    const centerX = VIEWPORT.width / 2;

    this.ctx.fillStyle = "rgba(5, 11, 17, 0.24)";
    this.ctx.fillRect(0, VIEWPORT.height - 228, VIEWPORT.width, 228);

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    this.ctx.beginPath();
    this.ctx.moveTo(150, VIEWPORT.height - 22);
    this.ctx.quadraticCurveTo(302, VIEWPORT.height - 138, 520, VIEWPORT.height - 104);
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    this.ctx.lineWidth = 5;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(VIEWPORT.width - 150, VIEWPORT.height - 22);
    this.ctx.quadraticCurveTo(VIEWPORT.width - 302, VIEWPORT.height - 138, VIEWPORT.width - 520, VIEWPORT.height - 104);
    this.ctx.stroke();

    const hullGradient = this.ctx.createLinearGradient(0, baseY - 80, 0, VIEWPORT.height);
    hullGradient.addColorStop(0, "rgba(246, 188, 82, 0.9)");
    hullGradient.addColorStop(1, "rgba(207, 111, 25, 0.95)");
    this.ctx.fillStyle = hullGradient;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 86, VIEWPORT.height);
    this.ctx.lineTo(centerX - 32, baseY + 16);
    this.ctx.lineTo(centerX, baseY - 56);
    this.ctx.lineTo(centerX + 32, baseY + 16);
    this.ctx.lineTo(centerX + 86, VIEWPORT.height);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(247, 229, 182, 0.66)";
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 42, VIEWPORT.height);
    this.ctx.lineTo(centerX - 10, baseY + 28);
    this.ctx.lineTo(centerX, baseY - 8);
    this.ctx.lineTo(centerX + 10, baseY + 28);
    this.ctx.lineTo(centerX + 42, VIEWPORT.height);
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawStartScreen() {
    const { compact, portrait } = this.getLayout();
    const x = portrait ? 76 : 82;
    const y = portrait ? 88 : 98;
    const width = portrait ? VIEWPORT.width - 152 : compact ? 468 : 520;
    const height = portrait ? 324 : 382;
    const chipY = y + 244;
    const buttonY = y + height - 94;

    const panelGradient = this.ctx.createLinearGradient(x, y, x + width, y + height);
    panelGradient.addColorStop(0, "rgba(7, 18, 27, 0.68)");
    panelGradient.addColorStop(0.55, "rgba(7, 18, 27, 0.52)");
    panelGradient.addColorStop(1, "rgba(7, 18, 27, 0.24)");
    this.ctx.fillStyle = panelGradient;
    roundRectPath(this.ctx, x, y, width, height, 34);
    this.ctx.fill();

    this.ctx.strokeStyle = "rgba(255, 245, 220, 0.14)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(247, 226, 180, 0.95)";
    this.ctx.font = "700 16px Manrope";
    this.ctx.fillText("PREMIUM ARCADE RUNNER", x + 34, y + 34);

    this.ctx.fillStyle = "#f7f0e1";
    this.ctx.font = portrait ? "700 62px Sora" : "700 74px Sora";
    this.ctx.fillText("Flappy POV", x + 30, y + 112);

    this.ctx.fillStyle = "rgba(231, 237, 241, 0.9)";
    this.ctx.font = portrait ? "500 28px Manrope" : "500 30px Manrope";
    this.ctx.fillText("One-button Flug durch einen", x + 34, y + 164);
    this.ctx.fillText("stilisierten 3D-Korridor.", x + 34, y + 202);

    this.drawChip(x + 34, chipY, "Space / Tap", compact);
    this.drawChip(x + 178, chipY, "Ein Input", compact);
    this.drawChip(x + 304, chipY, "F Vollbild", compact);

    this.buttonBounds.primary = {
      x: x + 34,
      y: buttonY,
      width: compact ? 234 : 248,
      height: 58,
    };
    this.drawPrimaryButton(
      this.buttonBounds.primary,
      "Run starten",
      this.hoveredAction === "primary"
    );

    this.ctx.fillStyle = "rgba(245, 242, 235, 0.74)";
    this.ctx.font = "500 16px Manrope";
    this.ctx.fillText(
      "Klick oder Leertaste startet sofort. Danach traegt derselbe Input den gesamten Run.",
      x + 34,
      buttonY + 82
    );
  }

  drawCrashScreen() {
    const width = 420;
    const height = 184;
    const x = 76;
    const y = VIEWPORT.height - height - 72;

    const panelGradient = this.ctx.createLinearGradient(x, y, x + width, y + height);
    panelGradient.addColorStop(0, "rgba(9, 19, 28, 0.78)");
    panelGradient.addColorStop(1, "rgba(9, 19, 28, 0.52)");
    this.ctx.fillStyle = panelGradient;
    roundRectPath(this.ctx, x, y, width, height, 30);
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255, 239, 214, 0.16)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    this.ctx.fillStyle = "#f7f0e1";
    this.ctx.font = "700 20px Manrope";
    this.ctx.fillText("Crash", x + 30, y + 30);

    this.ctx.font = "700 60px Sora";
    this.ctx.fillText(String(this.state.score), x + 28, y + 64);

    this.ctx.font = "500 20px Manrope";
    this.ctx.fillStyle = "rgba(241, 245, 247, 0.88)";
    this.ctx.fillText(`Bestwert ${this.state.best}`, x + 146, y + 76);
    this.ctx.fillText("Leertaste, Pfeil hoch oder Klick", x + 146, y + 108);

    this.buttonBounds.primary = {
      x: x + 28,
      y: y + 118,
      width: 210,
      height: 50,
    };
    this.drawPrimaryButton(
      this.buttonBounds.primary,
      "Erneut fliegen",
      this.hoveredAction === "primary"
    );
  }

  drawChip(x, y, label, compact) {
    const paddingX = compact ? 16 : 18;
    this.ctx.font = "700 15px Manrope";
    const textWidth = this.ctx.measureText(label).width;
    const width = textWidth + paddingX * 2;
    const height = 38;

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    roundRectPath(this.ctx, x, y, width, height, 19);
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(244, 238, 226, 0.9)";
    this.ctx.fillText(label, x + paddingX, y + 25);
  }

  drawPrimaryButton(bounds, label, hovered) {
    const gradient = this.ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y);
    gradient.addColorStop(0, hovered ? "#f5cf8b" : "#efbf68");
    gradient.addColorStop(1, hovered ? "#f3a03a" : "#d9822e");

    this.ctx.fillStyle = gradient;
    roundRectPath(this.ctx, bounds.x, bounds.y, bounds.width, bounds.height, 18);
    this.ctx.fill();

    this.ctx.strokeStyle = "rgba(255, 247, 230, 0.28)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    this.ctx.fillStyle = "#152836";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.font = "700 20px Manrope";
    this.ctx.fillText(label, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 1);
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "alphabetic";
  }

  handlePointerMove(event) {
    const point = this.getCanvasPoint(event);
    this.hoveredAction = this.hitTestAction(point);
    this.canvas.style.cursor =
      this.state.mode === "playing"
        ? "default"
        : this.hoveredAction === "primary"
          ? "pointer"
          : "pointer";
  }

  handlePointerLeave() {
    this.hoveredAction = null;
    this.canvas.style.cursor = this.state.mode === "playing" ? "default" : "pointer";
  }

  handlePointerDown(event) {
    event.preventDefault();
    this.canvas.focus();
    this.boostFromUser();
  }

  handleKeyDown(event) {
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      this.boostFromUser();
      return;
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.toggleFullscreen().catch(() => {});
      return;
    }

    if (event.key === "Escape" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  async toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await this.canvas.requestFullscreen();
    }
  }

  getCanvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = VIEWPORT.width / rect.width;
    const scaleY = VIEWPORT.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  hitTestAction(point) {
    const bounds = this.buttonBounds.primary;
    if (
      bounds &&
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return "primary";
    }
    return null;
  }

  syncAccessibility() {
    if (!this.actionButton) {
      return;
    }

    if (this.state.mode === "start") {
      this.actionButton.textContent = "Run starten";
    } else if (this.state.mode === "gameover") {
      this.actionButton.textContent = "Run neu starten";
    } else {
      this.actionButton.textContent = "Schub ausloesen";
    }
  }

  announce(message) {
    if (this.announcer) {
      this.announcer.textContent = message;
    }
  }

  exposeHooks() {
    window.render_game_to_text = () =>
      JSON.stringify({
        coordinateSystem:
          "y is vertical player position, z is forward gate distance toward collision plane; smaller z is closer",
        mode: this.state.mode,
        score: this.state.score,
        best: this.state.best,
        player: {
          y: Number(this.state.player.y.toFixed(3)),
          vy: Number(this.state.player.vy.toFixed(3)),
          pitch: Number(this.state.player.pitch.toFixed(3)),
        },
        collisionPlaneZ: WORLD.collisionDistance,
        gates: this.state.gates.slice(0, 4).map((gate) => ({
          z: Number(gate.distance.toFixed(3)),
          gapCenter: Number(gate.gapCenter.toFixed(3)),
          gapTop: Number((gate.gapCenter + gate.gapHalf).toFixed(3)),
          gapBottom: Number((gate.gapCenter - gate.gapHalf).toFixed(3)),
          passed: gate.passed,
        })),
      });

    window.advanceTime = (ms) => {
      this.suspendRealtimeUntil = performance.now() + 120;
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      const dt = ms / 1000 / steps;
      for (let index = 0; index < steps; index += 1) {
        this.update(dt);
      }
      this.render();
    };
  }
}
