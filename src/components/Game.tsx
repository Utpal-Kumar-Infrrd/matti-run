"use client";

import { useEffect } from "react";

const GAME_SCRIPTS = [
  "/scripts/Box2dWeb.min.js",
  "/scripts/Three.js",
  "/scripts/keyboard.js",
  "/scripts/jquery.js",
  "/scripts/rng.js",
  "/scripts/maze.js",
  "/scripts/game-config.js",
  "/scripts/puzzle.js",
  "/scripts/joystick.js",
  "/scripts/multiplayer.js",
  "/scripts/game-main.js",
] as const;

const multiplayerUrl = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? "";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export default function Game() {
  useEffect(() => {
    window.__MATTI_RUN_MULTIPLAYER_URL__ = multiplayerUrl;

    let cancelled = false;

    (async () => {
      for (const src of GAME_SCRIPTS) {
        if (cancelled) {
          return;
        }
        await loadScript(src);
      }
    })().catch((err) => {
      console.error("Failed to load game scripts:", err);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div id="intro-screen" className="screen-overlay">
        <div className="screen-panel">
          <h1>Matti Run</h1>
          <p>
            Pilot your ship through the maze and collect all 12 image pieces.
            You can only exit once every piece is collected.
          </p>
          <p>
            Best played in landscape orientation.
            <br />
            Use arrow keys or the on-screen joystick to move.
            <br />
            Vim trainees: h, j, k, l
          </p>
          <button id="start-button" className="game-button" type="button">
            Single Player
          </button>
          <button id="join-race-button" className="game-button secondary" type="button">
            Join Race
          </button>
        </div>
      </div>

      <div id="lobby-screen" className="screen-overlay" style={{ display: "none" }}>
        <div className="screen-panel">
          <h1>Join Race</h1>
          <div id="lobby-join-form" className="lobby-form">
            <label htmlFor="player-name-input">Your name</label>
            <input id="player-name-input" type="text" maxLength={24} placeholder="Player name" />
            <label htmlFor="room-code-input">Room code</label>
            <input
              id="room-code-input"
              type="text"
              maxLength={6}
              placeholder="6-letter code"
              autoCapitalize="characters"
            />
            <p id="lobby-error" />
            <button id="lobby-join-button" className="game-button" type="button">
              Join
            </button>
            <button id="lobby-back-button" className="game-button secondary" type="button">
              Back
            </button>
          </div>
          <div id="lobby-waiting">
            <p>
              Room: <strong id="lobby-room-code" />
            </p>
            <p>Waiting for host to start the race…</p>
            <ul id="lobby-player-list" />
          </div>
        </div>
      </div>

      <div id="countdown-screen" className="screen-overlay">
        <div className="screen-panel">
          <h1>Get Ready</h1>
          <div id="countdown-value">3</div>
        </div>
      </div>

      <div id="puzzle-screen" className="screen-overlay">
        <div className="screen-panel">
          <h1>Solve the Puzzle</h1>
          <p>Tap two tiles to swap them. Reassemble the image.</p>
          <div id="puzzle-grid" />
        </div>
      </div>

      <div id="end-screen" className="screen-overlay">
        <div className="screen-panel end-panel">
          <h1>Complete!</h1>
          <div className="end-content">
            <img id="end-full-image" src="" alt="Completed puzzle image" />
            <div className="end-stats">
              <div className="time-row">
                Maze time: <span id="maze-time">0:00</span>
              </div>
              <div className="time-row">
                Puzzle time: <span id="puzzle-time">0:00</span>
              </div>
              <div id="total-time">
                Total time: <span id="total-time-value">0:00</span>
              </div>
            </div>
          </div>
          <button id="play-again-button" className="game-button" type="button">
            Play Again
          </button>
        </div>
      </div>

      <div id="rotate-prompt" className="screen-overlay">
        <div className="screen-panel">
          <div className="rotate-icon">📱</div>
          <h1>Rotate Your Device</h1>
          <p>Please turn your device to landscape mode for the best experience.</p>
        </div>
      </div>

      <div id="instructions">
        How to play Matti Run:
        <br />
        <br />
        Collect all 12 image pieces in the maze, then reach the exit.
        <br />
        <br />
        Solve the puzzle by clicking two tiles to swap them.
        <br />
        <br />
        Use arrow keys or the joystick to move the ship.
        <br />
        <br />
        Vim trainees: h, j, k, l
      </div>

      <div id="help">Hold down the &apos;I&apos; key for instructions.</div>

      <div id="collectible-markers" />
      <div id="ship-shadow" />
      <div id="ship-engine-glow" />
      <img id="ship-marker" src="/assets/ship.png" alt="" />
      <div id="collect-effects" />

      <div id="collectible-counter">Collected: 0/12</div>
      <div id="exit-hint">Collect all pieces first!</div>

      <div id="joystick">
        <div id="joystick-base">
          <div id="joystick-stick" />
        </div>
      </div>
    </>
  );
}
