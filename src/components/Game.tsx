"use client";

import { useEffect } from "react";

const GAME_SCRIPTS_BASE = [
  "/scripts/Box2dWeb.min.js",
  "/scripts/Three.js",
  "/scripts/keyboard.js",
  "/scripts/jquery.js",
  "/scripts/rng.js",
  "/scripts/maze.js",
  "/scripts/game-config.js",
  "/scripts/puzzle.js",
  "/scripts/joystick.js",
] as const;

const MULTIPLAYER_SCRIPT = "/scripts/multiplayer.js";
const GAME_MAIN_SCRIPT = "/scripts/game-main.js";

export type GameMode = "multiplayer" | "single";

const buildTimeMultiplayerUrl = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? "";

async function resolveMultiplayerUrl(mode: GameMode): Promise<string> {
  if (mode === "single") {
    return "";
  }
  if (buildTimeMultiplayerUrl) {
    return buildTimeMultiplayerUrl;
  }
  try {
    const res = await fetch("/api/config");
    if (!res.ok) {
      return "";
    }
    const data = (await res.json()) as { multiplayerUrl?: string };
    return data.multiplayerUrl ?? "";
  } catch {
    return "";
  }
}

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

type GameProps = {
  mode: GameMode;
};

export default function Game({ mode }: GameProps) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      window.__MATTIE_RUN_GAME_MODE__ = mode;
      const url = await resolveMultiplayerUrl(mode);
      if (cancelled) {
        return;
      }
      window.__MATTIE_RUN_MULTIPLAYER_URL__ = url;

      for (const src of GAME_SCRIPTS_BASE) {
        if (cancelled) {
          return;
        }
        await loadScript(src);
      }
      if (mode === "multiplayer") {
        if (cancelled) {
          return;
        }
        await loadScript(MULTIPLAYER_SCRIPT);
      }
      if (cancelled) {
        return;
      }
      await loadScript(GAME_MAIN_SCRIPT);
    })().catch((err) => {
      console.error("Failed to load game scripts:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <>
      <div id="intro-screen" className="screen-overlay">
        <div className="screen-panel">
          <h1>Mattie Run</h1>
          {mode === "multiplayer" ? (
            <>
              <p>
                Join a multiplayer race. Collect all 12 image pieces in the maze, then solve the
                puzzle. The exit opens once every piece is collected.
              </p>
              <p>
                Get the room code from your host, then join below.
                <br />
                Best played in landscape orientation.
              </p>
              <button id="join-race-button" className="game-button" type="button">
                Join Game
              </button>
              <button id="start-button" className="game-button" type="button" style={{ display: "none" }}>
                Start Game
              </button>
            </>
          ) : (
            <>
              <p>
                Pilot your character through the maze and collect all 12 image pieces. The exit opens
                once every piece is collected.
              </p>
              <p>
                Best played in landscape orientation.
                <br />
                Use arrow keys or the on-screen joystick to move.
              </p>
              <button id="start-button" className="game-button" type="button">
                Start Game
              </button>
              <button id="join-race-button" className="game-button secondary" type="button" style={{ display: "none" }}>
                Join Game
              </button>
            </>
          )}
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
            <img id="end-full-image" alt="Completed puzzle image" />
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
          <button id="quit-room-button" className="game-button quit-room-button" type="button" style={{ display: "none" }}>
            Quit Room
          </button>
        </div>
      </div>

      <div id="exit-warning-screen" className="screen-overlay exit-warning-overlay" style={{ display: "none" }}>
        <div className="screen-panel exit-warning-panel">
          <div className="exit-warning-icon" aria-hidden="true">
            ⚠
          </div>
          <h1>Leave this room?</h1>
          <p className="exit-warning-lead">
            You are in an active multiplayer session.
          </p>
          <p className="exit-warning-text">
            If you leave now, the <strong>host will lose all race progress</strong> for everyone in this
            room — including times, collectibles, and leaderboard standings.
          </p>
          <p className="exit-warning-sub">This cannot be undone.</p>
          <div className="exit-warning-actions">
            <button id="exit-warning-cancel" className="game-button secondary" type="button">
              Stay in room
            </button>
            <button id="exit-warning-confirm" className="game-button exit-warning-confirm-btn" type="button">
              Leave anyway
            </button>
          </div>
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
        How to play Mattie Run:
        <br />
        <br />
        Collect all 12 image pieces in the maze. The exit opens when you have them all.
        <br />
        <br />
        Solve the puzzle by clicking two tiles to swap them.
        <br />
        <br />
        Use arrow keys or the joystick to move.
        <br />
        <br />
        Vim trainees: h, j, k, l
      </div>

      <div id="help">Hold down the &apos;I&apos; key for instructions.</div>

      <div id="collectible-markers" />
      <div id="ship-shadow" />
      <div id="ship-engine-glow" />
      <img id="ship-marker" src="/assets/player.png" alt="" />
      <div id="collect-effects" />

      <div id="collectible-counter">Collected: 0/12</div>
      <div id="exit-hint" style={{ display: "none" }}>
        Collect all pieces first!
      </div>
      <div id="exit-marker">EXIT</div>

      <div id="joystick">
        <div id="joystick-base">
          <div id="joystick-stick" />
        </div>
      </div>
    </>
  );
}
