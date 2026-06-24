# matti-run

A WebGL maze game built with Next.js, Three.js, and Box2dWeb. Pilot your ship through the maze, collect puzzle pieces, and solve the sliding puzzle to win.

## Deploy on Vercel

1. Push this repository to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Deploy — no build configuration needed

Single-player works out of the box on Vercel.

### Multiplayer (optional)

Vercel does not host persistent WebSocket servers. For multiplayer races:

1. Deploy the Socket.io server in `server/` to a host that supports long-running processes (Railway, Fly.io, Render, etc.)
2. In Vercel project settings, set:
   ```
   NEXT_PUBLIC_MULTIPLAYER_URL=https://your-socket-server.example.com
   ```
3. Players use the main site URL; hosts open `/host` to manage rooms

Local multiplayer server:

```bash
cd server && npm install && npm start
```

Then set `NEXT_PUBLIC_MULTIPLAYER_URL=http://localhost:8080` in `.env.local` and run `npm run dev`.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Play

- **Single Player** — maze + puzzle on your own
- **Join Race** — multiplayer (requires `NEXT_PUBLIC_MULTIPLAYER_URL`)
- **Host** — [http://localhost:3000/host](http://localhost:3000/host)

## Tech stack

- Next.js 15 (App Router)
- Three.js + Box2D for the 3D maze
- Socket.io for optional multiplayer

## License

See [License.md](License.md).
