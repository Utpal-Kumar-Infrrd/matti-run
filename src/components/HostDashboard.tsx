"use client";

import { useEffect, useRef, useState } from "react";

type Player = { id: string; name: string };

type LeaderboardRow = {
  rank: number;
  name: string;
  collectedCount: number;
  mazePassed: boolean;
  puzzleSolved: boolean;
  mazeMs: number;
  puzzleMs: number;
  totalMs: number;
};

function formatTime(ms: number) {
  if (!ms || ms <= 0) {
    return "—";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

const multiplayerUrl = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? "";

export default function HostDashboard() {
  const socketRef = useRef<ReturnType<typeof import("socket.io-client").io> | null>(null);
  const [status, setStatus] = useState({ text: "Connecting…", cls: "" });
  const [roomCode, setRoomCode] = useState("------");
  const [roomReady, setRoomReady] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [raceStarted, setRaceStarted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [shareOrigin, setShareOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareOrigin(window.location.origin);
    }

    if (!multiplayerUrl) {
      setStatus({
        text: "Set NEXT_PUBLIC_MULTIPLAYER_URL to your Socket.io server URL to use the host dashboard.",
        cls: "error",
      });
      return;
    }

    import("socket.io-client").then(({ io }) => {
      const sock = io(multiplayerUrl);
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

      sock.on("room:created", (data: { roomCode: string }) => {
        setRoomReady(true);
        setRoomCode(data.roomCode);
        setStatus({ text: `Room ready. Share code: ${data.roomCode}`, cls: "connected" });
      });

      sock.on("room:updated", (data: { players: Player[]; raceStarted: boolean }) => {
        setRaceStarted(data.raceStarted);
        setPlayers(data.players);
      });

      sock.on("leaderboard:update", (data: { rows: LeaderboardRow[]; raceStarted: boolean }) => {
        setRaceStarted(data.raceStarted);
        setLeaderboard(data.rows);
      });

      sock.on("race:finished", (data: { rows: LeaderboardRow[] }) => {
        setLeaderboard(data.rows);
        setStatus({ text: "Race finished!", cls: "connected" });
      });

      sock.on("error:message", (data: { message: string }) => {
        setStatus({ text: data.message, cls: "error" });
      });
    });

    return () => {
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
    setStatus({ text: "Race reset. Waiting for players.", cls: "connected" });
  };

  return (
    <div className="host-panel">
      <h1>Matti Run Host Dashboard</h1>
      <p className="host-hint">
        You are the host. Share the player URL and room code — you do not play in the race.
      </p>
      <p className={`host-status ${status.cls}`}>{status.text}</p>

      {multiplayerUrl && (
        <div>
          <h2>Player URL</h2>
          <p className="host-hint">Players open this URL, then choose Join Race.</p>
          <div className="host-share-url">{shareOrigin || "…"}</div>
        </div>
      )}

      {roomReady && (
        <div>
          <p>Room code:</p>
          <div className="host-room-code">{roomCode}</div>
          <p className="host-hint">Players enter this room code after opening the game URL above.</p>
          <h2>Players</h2>
          <ul>
            {players.length === 0 ? (
              <li>Waiting for players…</li>
            ) : (
              players.map((p) => <li key={p.id}>{p.name}</li>)
            )}
          </ul>
          <button type="button" onClick={startRace} disabled={raceStarted || players.length === 0}>
            Start Race
          </button>
          <button type="button" onClick={resetRace} disabled={!raceStarted}>
            New Race
          </button>
        </div>
      )}

      <h2>Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Collectibles</th>
            <th>Maze</th>
            <th>Puzzle</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.length === 0 ? (
            <tr>
              <td colSpan={6}>No players yet</td>
            </tr>
          ) : (
            leaderboard.map((row) => (
              <tr key={`${row.rank}-${row.name}`}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.collectedCount}/12</td>
                <td>{row.mazePassed ? "Done" : "—"}</td>
                <td>{row.puzzleSolved ? "Done" : "—"}</td>
                <td>
                  {row.puzzleSolved
                    ? formatTime(row.totalMs)
                    : row.mazePassed
                      ? formatTime(row.mazeMs)
                      : formatTime(row.mazeMs)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
