import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/700.css";
import "./styles.css";

import { FlappyPovApp } from "./game/FlappyPovApp.js";

const appRoot = document.getElementById("app");

appRoot.innerHTML = `
  <main class="app-shell">
    <section class="stage-shell" aria-label="Flappy POV Szene">
      <canvas
        id="game-canvas"
        width="1440"
        height="810"
        tabindex="0"
        aria-label="Flappy POV Premium-Arcade Spiel"
      ></canvas>
      <button id="sr-action" class="sr-only" type="button">Run starten</button>
      <div id="announcer" class="sr-only" aria-live="polite"></div>
    </section>
  </main>
`;

const canvas = document.getElementById("game-canvas");
const actionButton = document.getElementById("sr-action");
const announcer = document.getElementById("announcer");

const game = new FlappyPovApp({
  canvas,
  actionButton,
  announcer,
});

actionButton.addEventListener("click", () => {
  game.boostFromUser();
  canvas.focus();
});
