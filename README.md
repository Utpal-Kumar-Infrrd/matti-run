# matti-run

A WebGL maze game built with Next.js, Three.js, and Box2dWeb. Pilot your ship through the maze, collect puzzle pieces, and solve the sliding puzzle to win.

## Deploy everything on Render (recommended)

Deploy the game and multiplayer server together with one [Render Blueprint](https://render.com/docs/blueprint-spec).

### One-click setup

1. Push the `deploy/render` branch to GitHub
2. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect repo `Utpal-Kumar-Infrrd/matti-run` and select branch **`deploy/render`**
4. Click **Apply** — Render creates two services:
   - **`matti-run`** — Next.js game + host dashboard
   - **`matti-run-multiplayer`** — Socket.io backend
5. Wait for both deploys to finish (first build ~5–10 min)

`NEXT_PUBLIC_MULTIPLAYER_URL` is wired automatically from the multiplayer service URL.

### URLs after deploy

| Role | URL |
|------|-----|
| **Players (multiplayer)** | `https://matti-run.onrender.com` |
| **Single player** | `https://matti-run.onrender.com/single` |
| **Host** | `https://matti-run.onrender.com/host` |
| **Health check** | `https://matti-run-multiplayer.onrender.com/health` |

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
| Env | `NEXT_PUBLIC_MULTIPLAYER_URL=https://YOUR-MULTIPLAYER.onrender.com` |

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
NEXT_PUBLIC_MULTIPLAYER_URL=http://localhost:8080
```

## Play

- **Multiplayer** — `/` — join a race with a room code from the host
- **Single player** — `/single` — play solo on your own
- **Host** — `/host` — create a room and share the multiplayer URL with players

## Tech stack

- Next.js 15 (App Router)
- Three.js + Box2D for the 3D maze
- Socket.io for optional multiplayer

## License

See [License.md](License.md).
