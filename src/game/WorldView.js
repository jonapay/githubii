import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { PALETTE, VIEWPORT, WORLD } from "./constants.js";

function positiveMod(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function makeRoundedBar(width, height, depth, radius = 0.12) {
  return new RoundedBoxGeometry(width, height, depth, 6, radius);
}

function makeMaterial(color, emissive, emissiveIntensity, roughness = 0.42, metalness = 0.18) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness,
    metalness,
  });
}

function setBar(mesh, height, centerY) {
  mesh.scale.y = Math.max(height, 0.01);
  mesh.position.y = centerY;
}

function createRendererWithFallbacks() {
  const attempts = [
    {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    },
    {
      antialias: false,
      alpha: false,
      powerPreference: "default",
      depth: true,
      stencil: false,
      precision: "mediump",
    },
    {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
      depth: true,
      stencil: false,
      precision: "lowp",
      failIfMajorPerformanceCaveat: false,
    },
  ];

  let lastError = null;
  for (const options of attempts) {
    try {
      return new THREE.WebGLRenderer(options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export class WorldView {
  constructor() {
    this.renderer = createRendererWithFallbacks();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VIEWPORT.width, VIEWPORT.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.bgTop);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 11, 66);

    this.camera = new THREE.PerspectiveCamera(47, VIEWPORT.aspect, 0.1, 120);
    this.camera.position.set(0, WORLD.cameraY, WORLD.cameraZ);
    this.camera.rotation.order = "YXZ";

    this.cameraGroup = new THREE.Group();
    this.cameraGroup.add(this.camera);
    this.scene.add(this.cameraGroup);

    this.frameLoopLength = WORLD.corridorFrameCount * WORLD.corridorFrameSpacing;
    this.stripLoopLength = WORLD.floorStripCount * WORLD.floorStripSpacing;

    this.frameMaterials = [];
    this.stripMaterials = [];
    this.gatePool = [];

    this.buildLights();
    this.buildShell();
    this.buildFrames();
    this.buildFloorStrips();
    this.buildGatePool();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xd9eefc, 0x0c1620, 2.25);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xf7e3b5, 2.7);
    keyLight.position.set(4, 5, 6);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7fc7f0, 1.8);
    fillLight.position.set(-5, 1, -4);
    this.scene.add(fillLight);

    this.portalLight = new THREE.PointLight(0xf8dfb0, 15, 75, 2);
    this.portalLight.position.set(0, 0.22, -54);
    this.scene.add(this.portalLight);
  }

  buildShell() {
    const skyShell = new THREE.Mesh(
      new THREE.SphereGeometry(90, 28, 18),
      new THREE.MeshBasicMaterial({
        color: PALETTE.bgBottom,
        side: THREE.BackSide,
      })
    );
    skyShell.position.set(0, 0, -18);
    this.scene.add(skyShell);

    const roomMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.corridor,
      roughness: 0.68,
      metalness: 0.12,
      emissive: 0x102634,
      emissiveIntensity: 0.24,
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x35566a,
      roughness: 0.62,
      metalness: 0.18,
      emissive: 0x102536,
      emissiveIntensity: 0.18,
    });

    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x32556b,
      roughness: 0.74,
      metalness: 0.08,
      emissive: 0x17344a,
      emissiveIntensity: 0.2,
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 120), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, WORLD.floorY, -46);
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(12, 120), ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, WORLD.ceilingY, -46);
    this.scene.add(ceiling);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(120, 7), roomMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-WORLD.sideX, 0, -46);
    this.scene.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.x = WORLD.sideX;
    this.scene.add(rightWall);

    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(6.6, 5.4),
      new THREE.MeshBasicMaterial({
        color: PALETTE.gateGlow,
        transparent: true,
        opacity: 0.56,
      })
    );
    portal.position.set(0, 0.16, -58);
    this.scene.add(portal);

    const aura = new THREE.Mesh(
      new THREE.PlaneGeometry(9.8, 8.2),
      new THREE.MeshBasicMaterial({
        color: 0xb0e3ff,
        transparent: true,
        opacity: 0.18,
      })
    );
    aura.position.set(0, 0.1, -57.6);
    this.scene.add(aura);
  }

  buildFrames() {
    const outerMaterial = makeMaterial(PALETTE.corridor, 0x173548, 0.18, 0.48, 0.16);
    const innerMaterial = makeMaterial(PALETTE.corridorSoft, 0x7dc3da, 0.18, 0.44, 0.24);

    const horizontalGeometry = makeRoundedBar(8.4, 0.22, 0.16, 0.08);
    const verticalGeometry = makeRoundedBar(0.22, 5.7, 0.16, 0.08);

    this.corridorFrames = Array.from({ length: WORLD.corridorFrameCount }, (_, index) => {
      const frameGroup = new THREE.Group();
      const frameMaterials = [outerMaterial.clone(), innerMaterial.clone()];

      const top = new THREE.Mesh(horizontalGeometry, frameMaterials[0]);
      top.position.y = WORLD.ceilingY + 0.24;
      frameGroup.add(top);

      const bottom = new THREE.Mesh(horizontalGeometry, frameMaterials[0]);
      bottom.position.y = WORLD.floorY - 0.24;
      frameGroup.add(bottom);

      const left = new THREE.Mesh(verticalGeometry, frameMaterials[0]);
      left.position.x = -WORLD.sideX - 0.24;
      frameGroup.add(left);

      const right = new THREE.Mesh(verticalGeometry, frameMaterials[0]);
      right.position.x = WORLD.sideX + 0.24;
      frameGroup.add(right);

      const innerTop = new THREE.Mesh(horizontalGeometry, frameMaterials[1]);
      innerTop.scale.set(0.9, 0.6, 0.7);
      innerTop.position.set(0, WORLD.ceilingY + 0.08, 0.05);
      frameGroup.add(innerTop);

      const innerBottom = innerTop.clone();
      innerBottom.position.y = WORLD.floorY - 0.08;
      frameGroup.add(innerBottom);

      const innerLeft = new THREE.Mesh(verticalGeometry, frameMaterials[1]);
      innerLeft.scale.set(0.6, 0.92, 0.7);
      innerLeft.position.set(-WORLD.sideX - 0.08, 0, 0.05);
      frameGroup.add(innerLeft);

      const innerRight = innerLeft.clone();
      innerRight.position.x = WORLD.sideX + 0.08;
      frameGroup.add(innerRight);

      frameGroup.position.z = -(6 + index * WORLD.corridorFrameSpacing);
      this.scene.add(frameGroup);
      this.frameMaterials.push(...frameMaterials);
      return frameGroup;
    });
  }

  buildFloorStrips() {
    const stripMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.accent,
      transparent: true,
      opacity: 0.26,
    });

    const centerGeometry = new THREE.PlaneGeometry(0.18, 1.1);
    const sideGeometry = new THREE.PlaneGeometry(0.08, 1.35);

    this.centerStrips = Array.from({ length: WORLD.floorStripCount }, (_, index) => {
      const strip = new THREE.Mesh(centerGeometry, stripMaterial.clone());
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, WORLD.floorY + 0.015, -(4 + index * WORLD.floorStripSpacing));
      this.scene.add(strip);
      this.stripMaterials.push(strip.material);
      return strip;
    });

    this.sideStrips = Array.from({ length: WORLD.floorStripCount }, (_, index) => {
      const left = new THREE.Mesh(sideGeometry, stripMaterial.clone());
      left.rotation.x = -Math.PI / 2;
      left.position.set(-2.2, WORLD.floorY + 0.01, -(6 + index * WORLD.floorStripSpacing));
      this.scene.add(left);
      this.stripMaterials.push(left.material);

      const right = left.clone();
      right.position.x = 2.2;
      this.scene.add(right);
      this.stripMaterials.push(right.material);

      return { left, right };
    });
  }

  buildGatePool() {
    const outerGeometry = makeRoundedBar(WORLD.gateWidth, 1, WORLD.gateDepth, 0.14);
    const innerGeometry = makeRoundedBar(WORLD.gateWidth * 0.9, 1, WORLD.gateDepth * 0.52, 0.12);
    const rimGeometry = makeRoundedBar(WORLD.gateWidth * 0.96, 0.18, 0.14, 0.08);

    for (let index = 0; index < WORLD.visibleGateCount + 1; index += 1) {
      const root = new THREE.Group();

      const outerMaterial = makeMaterial(PALETTE.gateOuter, 0x193528, 0.14, 0.38, 0.16);
      const innerMaterial = makeMaterial(PALETTE.gateInner, 0x3d5a42, 0.3, 0.28, 0.12);
      const rimMaterial = makeMaterial(PALETTE.gateGlow, 0xdab675, 0.6, 0.2, 0.02);

      const topOuter = new THREE.Mesh(outerGeometry, outerMaterial);
      const bottomOuter = new THREE.Mesh(outerGeometry, outerMaterial);
      const topInner = new THREE.Mesh(innerGeometry, innerMaterial);
      const bottomInner = new THREE.Mesh(innerGeometry, innerMaterial);
      const topRim = new THREE.Mesh(rimGeometry, rimMaterial);
      const bottomRim = new THREE.Mesh(rimGeometry, rimMaterial);

      root.add(topOuter, bottomOuter, topInner, bottomInner, topRim, bottomRim);
      root.visible = false;
      this.scene.add(root);

      this.gatePool.push({
        root,
        topOuter,
        bottomOuter,
        topInner,
        bottomInner,
        topRim,
        bottomRim,
        outerMaterial,
        innerMaterial,
        rimMaterial,
      });
    }
  }

  sync(simulationState) {
    const { player, gates, travel, mode, scorePulse } = simulationState;

    this.cameraGroup.position.y = THREE.MathUtils.lerp(
      this.cameraGroup.position.y,
      player.y * 0.72,
      0.1
    );
    this.camera.rotation.x = THREE.MathUtils.lerp(this.camera.rotation.x, 0.028 - player.pitch, 0.12);
    this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, -player.roll, 0.12);

    this.portalLight.intensity = 9 + scorePulse * 5;

    const frameTravel = travel * 0.78;
    const stripTravel = travel * 1.08;

    this.corridorFrames.forEach((frame, index) => {
      const distance = 6 + positiveMod(index * WORLD.corridorFrameSpacing - frameTravel, this.frameLoopLength);
      frame.position.z = -distance;
      const emphasis = THREE.MathUtils.clamp(1.2 - distance / 24, 0.1, 0.8);
      frame.children.forEach((child, childIndex) => {
        const material = child.material;
        material.emissiveIntensity = childIndex < 4 ? 0.16 + emphasis * 0.22 : 0.2 + emphasis * 0.28;
      });
    });

    this.centerStrips.forEach((strip, index) => {
      const distance = 5 + positiveMod(index * WORLD.floorStripSpacing - stripTravel, this.stripLoopLength);
      strip.position.z = -distance;
      strip.material.opacity = 0.12 + THREE.MathUtils.clamp(1.18 - distance / 22, 0, 0.34);
    });

    this.sideStrips.forEach((pair, index) => {
      const distance = 7 + positiveMod(index * WORLD.floorStripSpacing - stripTravel * 0.92, this.stripLoopLength);
      pair.left.position.z = -distance;
      pair.right.position.z = -distance;
      const opacity = 0.08 + THREE.MathUtils.clamp(1 - distance / 24, 0, 0.2);
      pair.left.material.opacity = opacity;
      pair.right.material.opacity = opacity;
    });

    this.gatePool.forEach((visual, index) => {
      const gate = gates[index];
      if (!gate) {
        visual.root.visible = false;
        return;
      }

      visual.root.visible = true;
      visual.root.position.z = -gate.distance;

      const topHeight = WORLD.ceilingY - (gate.gapCenter + gate.gapHalf);
      const bottomHeight = gate.gapCenter - gate.gapHalf - WORLD.floorY;

      setBar(visual.topOuter, topHeight, WORLD.ceilingY - topHeight / 2);
      setBar(visual.bottomOuter, bottomHeight, WORLD.floorY + bottomHeight / 2);
      setBar(visual.topInner, topHeight * 0.92, WORLD.ceilingY - topHeight / 2);
      setBar(visual.bottomInner, bottomHeight * 0.92, WORLD.floorY + bottomHeight / 2);

      visual.topInner.position.z = -0.05;
      visual.bottomInner.position.z = -0.05;

      visual.topRim.position.set(0, gate.gapCenter + gate.gapHalf + 0.04, 0.16);
      visual.bottomRim.position.set(0, gate.gapCenter - gate.gapHalf - 0.04, 0.16);

      const proximity = THREE.MathUtils.clamp(1.24 - gate.distance / 22, 0.18, 1.05);
      const scoreBonus = gate.passed ? 0.12 : 0;
      visual.outerMaterial.emissiveIntensity = 0.22 + proximity * 0.24 + scoreBonus;
      visual.innerMaterial.emissiveIntensity = 0.28 + proximity * 0.42 + scoreBonus;
      visual.rimMaterial.emissiveIntensity = 0.52 + proximity * 0.86 + scoreBonus * 1.4;
    });

    if (mode === "gameover") {
      this.camera.rotation.x = THREE.MathUtils.lerp(this.camera.rotation.x, -0.08, 0.08);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  get canvas() {
    return this.renderer.domElement;
  }
}
