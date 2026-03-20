export const VIEWPORT = {
  width: 1440,
  height: 810,
  aspect: 16 / 9,
};

export const WORLD = {
  corridorWidth: 7.4,
  corridorHeight: 5.4,
  floorY: -2.55,
  ceilingY: 2.55,
  sideX: 3.75,
  cameraZ: 2.7,
  cameraY: 0.12,
  gateWidth: 6.3,
  gateDepth: 0.96,
  collisionDistance: 1.8,
  gateSpawnDistance: 35,
  gateSpacing: 7.1,
  visibleGateCount: 6,
  corridorFrameCount: 17,
  corridorFrameSpacing: 3.2,
  floorStripCount: 18,
  floorStripSpacing: 4.2,
};

export const GAME = {
  gravity: -10.6,
  flapVelocity: 4.55,
  obstacleSpeed: 13.4,
  idleSpeed: 3.2,
  playerRadius: 0.32,
  minGapCenter: -1.18,
  maxGapCenter: 1.18,
  introGaps: [0, 0.08, -0.04, 0.12, -0.08],
  baseGapHalf: 1.12,
  introGapHalf: 1.22,
  difficultyGapReduction: 0.12,
  maxDifficultyScore: 24,
  maxDt: 1 / 30,
};

export const PALETTE = {
  void: 0x0c1f2d,
  bgTop: 0x163d53,
  bgBottom: 0x2c5a71,
  fog: 0x17384d,
  corridor: 0x29485a,
  corridorSoft: 0x3b6578,
  accent: 0xecc98f,
  cream: 0xf4eee1,
  gateOuter: 0x426b5b,
  gateInner: 0xc8dfb7,
  gateGlow: 0xf7e3b6,
  shadow: 0x050c11,
};
