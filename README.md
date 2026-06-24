# mattie-run

A WebGL maze game built with Next.js, Three.js, and Box2dWeb. Pilot your ship through the maze, collect puzzle pieces, and solve the sliding puzzle to win.

## Deploy everything on Render (recommended)

Deploy the game and multiplayer server together with one [Render Blueprint](https://render.com/docs/blueprint-spec).

### One-click setup

1. Push the `deploy/render` branch to GitHub
2. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect repo `Utpal-Kumar-Infrrd/matti-run` and select branch **`deploy/render`**
4. Click **Apply** — Render creates two services:
   - **`mattie-run`** — Next.js game + host dashboard
   - **`mattie-run-multiplayer`** — Socket.io backend
5. Wait for both deploys to finish (first build ~5–10 min)

`NEXT_PUBLIC_MULTIPLAYER_URL` and `MULTIPLAYER_SERVER_URL` are wired automatically from the multiplayer service URL.

### URLs after deploy

| Role | URL |
|------|-----|
| **Players (multiplayer)** | `https://mattie-run.onrender.com` |
| **Single player** | `https://mattie-run.onrender.com/single` |
| **Host** | `https://mattie-run.onrender.com/host` |
| **Health check** | `https://mattie-run-multiplayer.onrender.com/health` |

Service names may differ slightly if Render suffixes them; check your dashboard.

### Free tier notes

- Services spin down after ~15 min idle; first visit can take 30–60s to wake up
- Open `/health` on the multiplayer service before hosting a race
- Avoid refreshing the host page mid-session (or wait for reconnect — server allows host takeover when the old connection is gone)

### Manual setup (without Blueprint)

**Service 1 — multiplayer** (`server/`):

| Setting | Value |
|---------|--------|
| Root Directory | `server` |
| Build | `npm install` |
| Start | `npm start` |
| Health Check | `/health` |

**Service 2 — game** (repo root):

| Setting | Value |
|---------|--------|
| Build | `npm install && npm run build` |
| Start | `npm start` |
| Env | `MULTIPLAYER_SERVER_URL=https://YOUR-MULTIPLAYER.onrender.com` (and optionally `NEXT_PUBLIC_MULTIPLAYER_URL` for build-time) |

Redeploy the game service after setting the env var.

---

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for multiplayer, or [http://localhost:3000/single](http://localhost:3000/single) for single player.

For local multiplayer:

```bash
# terminal 1
npm run dev

# terminal 2
cd server && npm install && npm start
```

Create `.env.local`:

```
MULTIPLAYER_SERVER_URL=http://localhost:8080
NEXT_PUBLIC_MULTIPLAYER_URL=http://localhost:8080
```

## Play

- **Multiplayer** — `/` — join a race with a room code from the host
- **Single player** — `/single` — play solo on your own
- **Host** — `/host` — create a room and share the multiplayer URL with players

## Scale branch (`feat/scale-300-players`)

Optimized for large races (up to **300 players** on Render free tier):

- **Event-driven progress** — clients report milestones only (collectible, maze done, finish) with timestamps
- **Host-only leaderboard** — no progress fan-out to players
- **Host sets room cap** — dashboard limit up to `MAX_PLAYERS` (default 300, server hard ceiling)
- **Pre-warm** — hit `/health` on the multiplayer service before opening the room to many players

Load-test in steps: 10 → 50 → 150 → 300 before a live event.

## Tech stack

- Next.js 15 (App Router)
- Three.js + Box2D for the 3D maze
- Socket.io for optional multiplayer

## License

See [License.md](License.md).
