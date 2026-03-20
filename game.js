const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const BASE_WIDTH = 420;
const BASE_HEIGHT = 720;
const FLOOR_HEIGHT = 120;
const PIPE_WIDTH = 76;
const PIPE_SPEED = 158;
const PIPE_GAP = 204;
const PIPE_INTERVAL = 1.7;
const GRAVITY = 1450;
const FLAP_VELOCITY = -440;
const MAX_DT = 1 / 30;

const state = {
  mode: "start",
  score: 0,
  best: 0,
  elapsed: 0,
  pipeTimer: 0,
  flashTimer: 0,
  bird: createBird(),
  pipes: [],
  stars: createStars(),
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  lastTime: 0,
  animationFrame: 0,
  rngSeed: 1337,
};

function createBird() {
  return {
    x: BASE_WIDTH * 0.32,
    y: BASE_HEIGHT * 0.45,
    vy: 0,
    radius: 18,
    tilt: 0,
    wingPhase: 0,
  };
}

function createStars() {
  return Array.from({ length: 9 }, (_, index) => ({
    x: 30 + ((index * 43) % (BASE_WIDTH - 60)),
    y: 70 + ((index * 97) % 180),
    r: 2 + (index % 3),
  }));
}

function resetGame(mode = "start") {
  state.mode = mode;
  state.score = 0;
  state.elapsed = 0;
  state.pipeTimer = 0;
  state.flashTimer = 0;
  state.bird = createBird();
  state.pipes = [];
  state.rngSeed = 1337;
}

function startGame() {
  resetGame("playing");
  flap();
}

function flap() {
  if (state.mode === "start") {
    startGame();
    return;
  }
  if (state.mode === "gameover") {
    startGame();
    return;
  }
  if (state.mode !== "playing") {
    return;
  }
  state.bird.vy = FLAP_VELOCITY;
  state.bird.wingPhase = 1;
}

function spawnPipe() {
  const minTop = 90;
  const maxTop = BASE_HEIGHT - FLOOR_HEIGHT - PIPE_GAP - 90;
  const topHeight = minTop + nextRandom() * (maxTop - minTop);
  state.pipes.push({
    x: BASE_WIDTH + 78,
    width: PIPE_WIDTH,
    topHeight,
    gap: PIPE_GAP,
    scored: false,
  });
}

function nextRandom() {
  state.rngSeed = (state.rngSeed * 1664525 + 1013904223) >>> 0;
  return state.rngSeed / 4294967296;
}

function update(dt) {
  const step = Math.min(dt, MAX_DT);

  if (state.mode === "start") {
    state.elapsed += step;
    const bob = Math.sin(state.elapsed * 2.6) * 10;
    state.bird.y = BASE_HEIGHT * 0.45 + bob;
    state.bird.tilt = -0.2 + Math.sin(state.elapsed * 5) * 0.08;
    return;
  }

  if (state.mode !== "playing") {
    state.flashTimer = Math.max(0, state.flashTimer - step);
    return;
  }

  state.elapsed += step;
  state.pipeTimer += step;
  state.bird.vy += GRAVITY * step;
  state.bird.y += state.bird.vy * step;
  state.bird.tilt = Math.max(-0.9, Math.min(1.15, state.bird.vy / 420));
  state.bird.wingPhase = Math.max(0, state.bird.wingPhase - step * 3.5);

  if (state.pipeTimer >= PIPE_INTERVAL) {
    state.pipeTimer -= PIPE_INTERVAL;
    spawnPipe();
  }

  for (const pipe of state.pipes) {
    pipe.x -= PIPE_SPEED * step;
    if (!pipe.scored && pipe.x + pipe.width < state.bird.x) {
      pipe.scored = true;
      state.score += 1;
      state.best = Math.max(state.best, state.score);
      state.flashTimer = 0.18;
    }
  }

  state.pipes = state.pipes.filter((pipe) => pipe.x + pipe.width > -40);

  if (state.bird.y + state.bird.radius >= BASE_HEIGHT - FLOOR_HEIGHT) {
    state.bird.y = BASE_HEIGHT - FLOOR_HEIGHT - state.bird.radius;
    endGame();
  }

  if (state.bird.y - state.bird.radius <= 0) {
    state.bird.y = state.bird.radius;
    state.bird.vy = 80;
  }

  for (const pipe of state.pipes) {
    const hitsX =
      state.bird.x + state.bird.radius > pipe.x &&
      state.bird.x - state.bird.radius < pipe.x + pipe.width;
    if (!hitsX) {
      continue;
    }
    const gapTop = pipe.topHeight;
    const gapBottom = pipe.topHeight + pipe.gap;
    if (state.bird.y - state.bird.radius < gapTop || state.bird.y + state.bird.radius > gapBottom) {
      endGame();
      return;
    }
  }
}

function endGame() {
  if (state.mode !== "playing") {
    return;
  }
  state.mode = "gameover";
  state.best = Math.max(state.best, state.score);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  sky.addColorStop(0, "#89d4ff");
  sky.addColorStop(0.62, "#dcf7ff");
  sky.addColorStop(0.63, "#f7d98a");
  sky.addColorStop(1, "#efc16d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  drawCloud(80, 110, 1);
  drawCloud(290, 160, 0.9);
  drawCloud(220, 78, 0.7);

  for (const star of state.stars) {
    ctx.fillStyle = "rgba(255, 255, 240, 0.35)";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#91d179";
  ctx.fillRect(0, BASE_HEIGHT - FLOOR_HEIGHT, BASE_WIDTH, FLOOR_HEIGHT);
  ctx.fillStyle = "#6aa553";
  for (let x = 0; x < BASE_WIDTH; x += 24) {
    ctx.fillRect(x, BASE_HEIGHT - FLOOR_HEIGHT, 15, 12);
  }
  ctx.fillStyle = "#d8af57";
  ctx.fillRect(0, BASE_HEIGHT - FLOOR_HEIGHT + 18, BASE_WIDTH, FLOOR_HEIGHT - 18);
}

function drawCloud(x, y, scale) {
  ctx.beginPath();
  ctx.arc(x, y, 24 * scale, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + 26 * scale, y - 10 * scale, 22 * scale, Math.PI, Math.PI * 2);
  ctx.arc(x + 50 * scale, y, 20 * scale, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawPipes() {
  for (const pipe of state.pipes) {
    const capHeight = 22;
    const gapTop = pipe.topHeight;
    const gapBottom = pipe.topHeight + pipe.gap;

    ctx.fillStyle = "#50a650";
    ctx.fillRect(pipe.x, 0, pipe.width, gapTop);
    ctx.fillRect(pipe.x, gapBottom, pipe.width, BASE_HEIGHT - FLOOR_HEIGHT - gapBottom);

    ctx.fillStyle = "#71c96f";
    ctx.fillRect(pipe.x + 8, 0, 10, gapTop);
    ctx.fillRect(pipe.x + 8, gapBottom, 10, BASE_HEIGHT - FLOOR_HEIGHT - gapBottom);

    ctx.fillStyle = "#3f7e3f";
    ctx.fillRect(pipe.x - 4, gapTop - capHeight, pipe.width + 8, capHeight);
    ctx.fillRect(pipe.x - 4, gapBottom, pipe.width + 8, capHeight);
  }
}

function drawBird() {
  const bird = state.bird;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.tilt);

  ctx.fillStyle = "#f4c542";
  ctx.beginPath();
  ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f19f23";
  ctx.beginPath();
  ctx.ellipse(-3, 6, 11, 8, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff3d6";
  ctx.beginPath();
  ctx.arc(6, -4, 9, 0, Math.PI * 2);
  ctx.fill();

  const wingLift = Math.sin(state.elapsed * 18) * 4 + state.bird.wingPhase * -9;
  ctx.fillStyle = "#f1aa2f";
  ctx.beginPath();
  ctx.ellipse(-7, 5 + wingLift, 10, 7, -0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(8, -7, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1f2a44";
  ctx.beginPath();
  ctx.arc(10, -7, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ef7347";
  ctx.beginPath();
  ctx.moveTo(16, -2);
  ctx.lineTo(30, 2);
  ctx.lineTo(16, 8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawHud() {
  ctx.textAlign = "center";
  ctx.fillStyle = "#fffdf6";
  ctx.strokeStyle = "rgba(22, 52, 70, 0.34)";
  ctx.lineWidth = 8;
  ctx.font = "700 60px 'Trebuchet MS', sans-serif";
  ctx.strokeText(String(state.score), BASE_WIDTH / 2, 82);
  ctx.fillText(String(state.score), BASE_WIDTH / 2, 82);

  ctx.textAlign = "left";
  ctx.font = "700 22px 'Trebuchet MS', sans-serif";
  ctx.fillStyle = "#1d4256";
  ctx.fillText(`Best ${state.best}`, 20, 40);

  if (state.flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.flashTimer * 2.4})`;
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  }
}

function drawCard(title, lines, footer) {
  ctx.save();
  ctx.translate(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 30);
  ctx.fillStyle = "rgba(253, 246, 227, 0.94)";
  roundRect(ctx, -145, -110, 290, 220, 28);
  ctx.fill();
  ctx.strokeStyle = "#29465a";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = "#22465c";
  ctx.textAlign = "center";
  ctx.font = "700 38px 'Trebuchet MS', sans-serif";
  ctx.fillText(title, 0, -48);

  ctx.font = "600 20px 'Trebuchet MS', sans-serif";
  lines.forEach((line, index) => {
    ctx.fillText(line, 0, -2 + index * 30);
  });

  if (footer) {
    ctx.font = "700 18px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#d26437";
    ctx.fillText(footer, 0, 92);
  }
  ctx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function render() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  drawBackground();
  drawPipes();
  drawBird();
  drawHud();

  if (state.mode === "start") {
    drawCard("Flappy Clone", ["Leertaste oder Klick", "weich durch die Roehren", "F fuer Vollbild"], "Tippen zum Start");
  }

  if (state.mode === "gameover") {
    drawCard("Crash", [`Punkte ${state.score}`, `Bestwert ${state.best}`, "Leertaste oder Klick"], "erneut fliegen");
  }
}

function frame(now) {
  if (!state.lastTime) {
    state.lastTime = now;
  }
  const delta = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;
  let remaining = delta;
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_DT);
    update(step);
    remaining -= step;
  }
  render();
  state.animationFrame = window.requestAnimationFrame(frame);
}

function resizeCanvas() {
  const fullscreen = document.fullscreenElement === canvas;
  if (fullscreen) {
    const scale = Math.min(window.innerWidth / BASE_WIDTH, window.innerHeight / BASE_HEIGHT);
    canvas.style.width = `${BASE_WIDTH * scale}px`;
    canvas.style.height = `${BASE_HEIGHT * scale}px`;
  } else {
    canvas.style.width = "";
    canvas.style.height = "";
  }
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await canvas.requestFullscreen();
  }
}

function handleInput(event) {
  if (event.type === "keydown") {
    if (event.code === "Space") {
      event.preventDefault();
      flap();
      return;
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen().catch(() => {});
    }
    if (event.key === "Escape" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    return;
  }

  event.preventDefault();
  flap();
}

window.addEventListener("keydown", handleInput);
canvas.addEventListener("pointerdown", handleInput);
document.addEventListener("fullscreenchange", resizeCanvas);

window.render_game_to_text = () =>
  JSON.stringify({
    coordinateSystem: "origin top-left, +x right, +y down",
    mode: state.mode,
    score: state.score,
    best: state.best,
    bird: {
      x: Number(state.bird.x.toFixed(1)),
      y: Number(state.bird.y.toFixed(1)),
      vy: Number(state.bird.vy.toFixed(1)),
      radius: state.bird.radius,
    },
    pipes: state.pipes.map((pipe) => ({
      x: Number(pipe.x.toFixed(1)),
      width: pipe.width,
      gapTop: Number(pipe.topHeight.toFixed(1)),
      gapBottom: Number((pipe.topHeight + pipe.gap).toFixed(1)),
      scored: pipe.scored,
    })),
    floorY: BASE_HEIGHT - FLOOR_HEIGHT,
  });

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  const dt = ms / 1000 / steps;
  for (let index = 0; index < steps; index += 1) {
    update(dt);
  }
  render();
};

resizeCanvas();
render();
state.animationFrame = window.requestAnimationFrame(frame);
