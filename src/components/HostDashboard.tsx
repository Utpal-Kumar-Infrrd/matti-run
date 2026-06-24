"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Player = { id: string; name: string };

type LeaderboardRow = {
  rank: number;
  id: string;
  name: string;
  collectedCount: number;
  mazePassed: boolean;
  puzzleSolved: boolean;
  mazeMs: number;
  puzzleMs: number;
  totalMs: number;
  lastCollectedAt: number;
  mazeCompletedAt: number;
  puzzleCompletedAt: number;
};

const PAGE_SIZE = 25;
const LIMIT_PRESETS = [50, 100, 150, 200, 300];

function formatTime(ms: number) {
  if (!ms || ms <= 0) {
    return "—";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function formatMilestoneAt(at: number, raceStartAt: number) {
  if (!at || at <= 0) {
    return "—";
  }
  if (raceStartAt > 0 && at >= raceStartAt) {
    return formatTime(at - raceStartAt);
  }
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const buildTimeMultiplayerUrl = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? "";

async function resolveMultiplayerUrl(): Promise<string> {
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

export default function HostDashboard() {
  const socketRef = useRef<ReturnType<typeof import("socket.io-client").io> | null>(null);
  const limitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raceStartAtRef = useRef(0);

  const [status, setStatus] = useState({ text: "Connecting…", cls: "" });
  const [roomCode, setRoomCode] = useState("------");
  const [roomReady, setRoomReady] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [raceStarted, setRaceStarted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [shareOrigin, setShareOrigin] = useState("");
  const [multiplayerUrl, setMultiplayerUrl] = useState(buildTimeMultiplayerUrl);
  const [playerLimit, setPlayerLimit] = useState(300);
  const [maxPlayersHard, setMaxPlayersHard] = useState(300);
  const [leaderboardPage, setLeaderboardPage] = useState(0);

  const setPlayerLimitOnServer = useCallback((limit: number) => {
    if (limitDebounceRef.current) {
      clearTimeout(limitDebounceRef.current);
    }
    limitDebounceRef.current = setTimeout(() => {
      socketRef.current?.emit("room:set_player_limit", { limit });
    }, 300);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareOrigin(window.location.origin);
    }

    let cancelled = false;

    (async () => {
      const url = await resolveMultiplayerUrl();
      if (cancelled) {
        return;
      }
      setMultiplayerUrl(url);

      if (!url) {
        setStatus({
          text: "Multiplayer server URL not configured. Set MULTIPLAYER_SERVER_URL or NEXT_PUBLIC_MULTIPLAYER_URL.",
          cls: "error",
        });
        return;
      }

      const { io } = await import("socket.io-client");
      if (cancelled) {
        return;
      }

      const sock = io(url, { transports: ["websocket"] });
      socketRef.current = sock;

      sock.on("connect", () => {
        setStatus({ text: "Connected. Creating room…", cls: "connected" });
        sock.emit("room:create");
      });

      sock.io.on("reconnect", () => {
        setStatus({ text: "Reconnected. Reclaiming room…", cls: "connected" });
        sock.emit("room:create");
      });

      sock.on("disconnect", () => {
        setStatus({ text: "Disconnected from server.", cls: "error" });
      });

      sock.on(
        "room:created",
        (data: { roomCode: string; playerLimit: number; maxPlayersHard: number }) => {
          setRoomReady(true);
          setRoomCode(data.roomCode);
          setPlayerLimit(data.playerLimit);
          setMaxPlayersHard(data.maxPlayersHard);
          setStatus({ text: `Room ready. Share code: ${data.roomCode}`, cls: "connected" });
        },
      );

      sock.on(
        "room:updated",
        (data: {
          players: Player[];
          raceStarted: boolean;
          playerLimit?: number;
          maxPlayersHard?: number;
        }) => {
          setRaceStarted(data.raceStarted);
          setPlayers(data.players);
          if (data.playerLimit) {
            setPlayerLimit(data.playerLimit);
          }
          if (data.maxPlayersHard) {
            setMaxPlayersHard(data.maxPlayersHard);
          }
        },
      );

      sock.on(
        "leaderboard:update",
        (data: { rows: LeaderboardRow[]; raceStarted: boolean; raceStartAt?: number }) => {
          setRaceStarted(data.raceStarted);
          setLeaderboard(data.rows);
          setLeaderboardPage(0);
          if (data.raceStartAt) {
            raceStartAtRef.current = data.raceStartAt;
          }
        },
      );

      sock.on("race:finished", (data: { rows: LeaderboardRow[]; raceStartAt?: number }) => {
        setLeaderboard(data.rows);
        if (data.raceStartAt) {
          raceStartAtRef.current = data.raceStartAt;
        }
        setStatus({ text: "Race finished!", cls: "connected" });
      });

      sock.on("error:message", (data: { message: string }) => {
        setStatus({ text: data.message, cls: "error" });
      });
    })();

    return () => {
      cancelled = true;
      if (limitDebounceRef.current) {
        clearTimeout(limitDebounceRef.current);
      }
      socketRef.current?.disconnect();
    };
  }, []);

  const startRace = () => {
    socketRef.current?.emit("race:start");
    setStatus({ text: "Starting race…", cls: "connected" });
  };

  const resetRace = () => {
    socketRef.current?.emit("race:reset");
    setRaceStarted(false);
    raceStartAtRef.current = 0;
    setStatus({ text: "Race reset. Waiting for players.", cls: "connected" });
  };

  const handleLimitChange = (value: number) => {
    const clamped = Math.max(players.length, Math.min(value, maxPlayersHard));
    setPlayerLimit(clamped);
    if (!raceStarted) {
      setPlayerLimitOnServer(clamped);
    }
  };

  const lobbyPreview = players.slice(0, 20);
  const lobbyOverflow = players.length - lobbyPreview.length;
  const totalLeaderboardPages = Math.max(1, Math.ceil(leaderboard.length / PAGE_SIZE));
  const pageRows = leaderboard.slice(
    leaderboardPage * PAGE_SIZE,
    leaderboardPage * PAGE_SIZE + PAGE_SIZE,
  );
  const raceStartAt = raceStartAtRef.current;

  return (
    <div className="host-panel">
      <h1>Mattie Run Host Dashboard</h1>
      <p className="host-hint">
        You are the host. Share the player URL and room code — you do not play in the race.
      </p>
      <p className={`host-status ${status.cls}`}>{status.text}</p>

      <div>
        <h2>Player URL</h2>
        <p className="host-hint">Players open this URL and tap Join Game to enter your room code.</p>
        <div className="host-share-url">{shareOrigin || "…"}</div>
        {shareOrigin && (
          <div className="host-qr-wrap">
            <p className="host-hint">Scan to join</p>
            <QRCodeSVG value={shareOrigin} size={180} level="M" includeMargin />
          </div>
        )}
      </div>

      {roomReady && (
        <div>
          <p>Room code:</p>
          <div className="host-room-code">{roomCode}</div>
          <p className="host-hint">Players enter this room code after opening the game URL above.</p>

          <h2>Room capacity</h2>
          <p className="host-hint">
            Players joined: <strong>{players.length}</strong> / <strong>{playerLimit}</strong> (server
            max {maxPlayersHard})
          </p>
          <div className="host-limit-controls">
            <label htmlFor="player-limit-input">Max players</label>
            <input
              id="player-limit-input"
              type="number"
              min={Math.max(1, players.length)}
              max={maxPlayersHard}
              value={playerLimit}
              disabled={raceStarted}
              onChange={(e) => handleLimitChange(parseInt(e.target.value, 10) || playerLimit)}
            />
            <div className="host-limit-presets">
              {LIMIT_PRESETS.filter((n) => n <= maxPlayersHard).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="host-limit-preset"
                  disabled={raceStarted || n < players.length}
                  onClick={() => handleLimitChange(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <h2>Players</h2>
          <ul>
            {players.length === 0 ? (
              <li>Waiting for players…</li>
            ) : (
              <>
                {lobbyPreview.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
                {lobbyOverflow > 0 && <li>…and {lobbyOverflow} more</li>}
              </>
            )}
          </ul>
          <button type="button" onClick={startRace} disabled={raceStarted || players.length === 0}>
            Start Race ({players.length}/{playerLimit})
          </button>
          <button type="button" onClick={resetRace} disabled={!raceStarted}>
            New Race
          </button>
        </div>
      )}

      <h2>Leaderboard</h2>
      {leaderboard.length > PAGE_SIZE && (
        <div className="host-pagination">
          <button
            type="button"
            disabled={leaderboardPage <= 0}
            onClick={() => setLeaderboardPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {leaderboardPage + 1} of {totalLeaderboardPages}
          </span>
          <button
            type="button"
            disabled={leaderboardPage >= totalLeaderboardPages - 1}
            onClick={() => setLeaderboardPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Collectibles</th>
            <th>Last pick</th>
            <th>Maze</th>
            <th>Maze done</th>
            <th>Puzzle</th>
            <th>Finished</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 ? (
            <tr>
              <td colSpan={9}>No players yet</td>
            </tr>
          ) : (
            pageRows.map((row) => (
              <tr key={row.id}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.collectedCount}/12</td>
                <td>{formatMilestoneAt(row.lastCollectedAt, raceStartAt)}</td>
                <td>{row.mazePassed ? "Done" : "—"}</td>
                <td>{formatMilestoneAt(row.mazeCompletedAt, raceStartAt)}</td>
                <td>{row.puzzleSolved ? "Done" : "—"}</td>
                <td>{formatMilestoneAt(row.puzzleCompletedAt, raceStartAt)}</td>
                <td>
                  {row.puzzleSolved
                    ? formatTime(row.totalMs)
                    : row.mazePassed
                      ? formatTime(row.mazeMs)
                      : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
