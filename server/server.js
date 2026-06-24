'use strict';

var express = require('express');
var http = require('http');
var os = require('os');
var path = require('path');
var { Server } = require('socket.io');

var PORT = process.env.PORT || 8080;
var COUNTDOWN_MS = 3000;
var ROOM_IDLE_MS = 30 * 60 * 1000;
var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var COLLECTIBLE_MAX = 12;

var app = express();
var server = http.createServer(app);
var io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

var room = null;
var idleTimer = null;

function generateRoomCode() {
    var code = '';
    for (var i = 0; i < 6; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
}

function hashPuzzleSeed(roomCode, raceNumber) {
    var str = roomCode + ':' + raceNumber;
    var h = 1779033703;
    for (var i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return (h >>> 0) || 1;
}

function resetIdleTimer() {
    if (idleTimer) {
        clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(function () {
        room = null;
    }, ROOM_IDLE_MS);
}

function createPlayer(id, name, socketId, joinOrder) {
    return {
        id: id,
        name: name,
        socketId: socketId,
        collectedCount: 0,
        mazePassed: false,
        puzzleSolved: false,
        mazeMs: 0,
        puzzleMs: 0,
        totalMs: 0,
        joinOrder: joinOrder
    };
}

function assignRanks(sorted) {
    var rows = [];
    var lastKey = null;
    var lastRank = 0;

    for (var i = 0; i < sorted.length; i++) {
        var p = sorted[i];
        var key;
        if (p.puzzleSolved) {
            key = 'done:' + p.totalMs;
        } else if (p.mazePassed) {
            key = 'puzzle:' + p.mazeMs;
        } else if (room && room.raceStarted) {
            key = 'maze:' + p.collectedCount + ':' + p.mazeMs;
        } else {
            key = 'wait:' + p.joinOrder;
        }

        var rank;
        if (key === lastKey) {
            rank = lastRank;
        } else {
            rank = i + 1;
            lastRank = rank;
            lastKey = key;
        }

        rows.push({
            rank: rank,
            id: p.id,
            name: p.name,
            collectedCount: p.collectedCount,
            mazePassed: p.mazePassed,
            puzzleSolved: p.puzzleSolved,
            mazeMs: p.mazeMs,
            puzzleMs: p.puzzleMs,
            totalMs: p.totalMs
        });
    }

    return rows;
}

function rankPlayers() {
    if (!room) {
        return [];
    }

    var list = [];
    room.players.forEach(function (player) {
        list.push(player);
    });

    if (!room.raceStarted) {
        list.sort(function (a, b) {
            return a.joinOrder - b.joinOrder;
        });
        return assignRanks(list);
    }

    list.sort(function (a, b) {
        if (a.puzzleSolved !== b.puzzleSolved) {
            return a.puzzleSolved ? -1 : 1;
        }
        if (a.puzzleSolved && b.puzzleSolved) {
            return a.totalMs - b.totalMs;
        }
        if (a.mazePassed !== b.mazePassed) {
            return a.mazePassed ? -1 : 1;
        }
        if (a.mazePassed && b.mazePassed) {
            return a.mazeMs - b.mazeMs;
        }
        if (a.collectedCount !== b.collectedCount) {
            return b.collectedCount - a.collectedCount;
        }
        return a.mazeMs - b.mazeMs;
    });

    return assignRanks(list);
}

function broadcastRoom() {
    if (!room) {
        return;
    }
    var players = [];
    room.players.forEach(function (player) {
        players.push({ id: player.id, name: player.name });
    });
    io.emit('room:updated', {
        roomCode: room.code,
        players: players,
        raceStarted: room.raceStarted,
        raceNumber: room.raceNumber
    });
}

function broadcastLeaderboard() {
    if (!room) {
        return;
    }
    io.emit('leaderboard:update', {
        rows: rankPlayers(),
        raceStarted: room.raceStarted
    });
}

function broadcastRaceFinished() {
    if (!room) {
        return;
    }
    io.emit('race:finished', {
        rows: rankPlayers()
    });
}

function allPlayersFinished() {
    if (!room || room.players.size === 0) {
        return false;
    }
    var done = true;
    room.players.forEach(function (player) {
        if (!player.puzzleSolved) {
            done = false;
        }
    });
    return done;
}

function resetRaceProgress() {
    if (!room) {
        return;
    }
    room.raceStarted = false;
    room.raceNumber += 1;
    room.players.forEach(function (player) {
        player.collectedCount = 0;
        player.mazePassed = false;
        player.puzzleSolved = false;
        player.mazeMs = 0;
        player.puzzleMs = 0;
        player.totalMs = 0;
    });
}

function getPlayerBySocket(socketId) {
    if (!room) {
        return null;
    }
    var found = null;
    room.players.forEach(function (player) {
        if (player.socketId === socketId) {
            found = player;
        }
    });
    return found;
}

function isSocketConnected(socketId) {
    return Boolean(socketId && io.sockets.sockets.has(socketId));
}

function getLanAddresses() {
    var nets = os.networkInterfaces();
    var addresses = [];
    var name;

    for (name in nets) {
        if (!Object.prototype.hasOwnProperty.call(nets, name)) {
            continue;
        }
        var netList = nets[name];
        for (var i = 0; i < netList.length; i++) {
            var net = netList[i];
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push(net.address);
            }
        }
    }

    return addresses;
}

function getLanGameUrls() {
    return getLanAddresses().map(function (ip) {
        return 'http://' + ip + ':' + PORT;
    });
}

app.get('/host', function (req, res) {
    res.sendFile(path.join(__dirname, 'host.html'));
});

app.get('/health', function (req, res) {
    res.json({ ok: true, room: room ? room.code : null });
});

app.get('/lan-urls', function (req, res) {
    res.json({ urls: getLanGameUrls() });
});

var gameRoot = path.join(__dirname, '..');

app.get('/', function (req, res) {
    res.sendFile(path.join(gameRoot, 'index.html'));
});

app.use(function (req, res, next) {
    if (req.path.indexOf('/server') === 0) {
        return res.status(404).end();
    }
    next();
});

app.use(express.static(gameRoot, { index: 'index.html' }));

io.on('connection', function (socket) {
    resetIdleTimer();

    socket.on('room:create', function () {
        if (room && room.hostSocketId && room.hostSocketId !== socket.id) {
            if (isSocketConnected(room.hostSocketId)) {
                socket.emit('error:message', { message: 'A room already exists on this server.' });
                return;
            }
        }

        if (!room) {
            var code = generateRoomCode();
            room = {
                code: code,
                hostSocketId: socket.id,
                players: new Map(),
                raceStarted: false,
                raceNumber: 1,
                startAt: 0,
                puzzleSeed: hashPuzzleSeed(code, 1)
            };
        } else {
            room.hostSocketId = socket.id;
        }

        socket.emit('room:created', {
            roomCode: room.code,
            raceNumber: room.raceNumber
        });
        broadcastRoom();
        broadcastLeaderboard();
    });

    socket.on('room:join', function (data) {
        if (!room) {
            socket.emit('error:message', { message: 'No active room. Ask the host to open the dashboard.' });
            return;
        }

        var roomCode = (data && data.roomCode || '').toUpperCase().trim();
        var playerName = (data && data.playerName || '').trim();

        if (roomCode !== room.code) {
            socket.emit('error:message', { message: 'Invalid room code.' });
            return;
        }
        if (!playerName) {
            socket.emit('error:message', { message: 'Enter a player name.' });
            return;
        }
        if (room.raceStarted) {
            socket.emit('error:message', { message: 'Race already in progress.' });
            return;
        }

        var existing = getPlayerBySocket(socket.id);
        if (existing) {
            socket.emit('room:joined', {
                roomCode: room.code,
                playerId: existing.id,
                playerName: existing.name
            });
            return;
        }

        var playerId = socket.id;
        var player = createPlayer(playerId, playerName, socket.id, room.players.size);
        room.players.set(playerId, player);

        socket.emit('room:joined', {
            roomCode: room.code,
            playerId: playerId,
            playerName: playerName
        });
        broadcastRoom();
        broadcastLeaderboard();
    });

    socket.on('race:start', function () {
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error:message', { message: 'Only the host can start the race.' });
            return;
        }
        if (room.players.size === 0) {
            socket.emit('error:message', { message: 'Wait for at least one player to join.' });
            return;
        }
        if (room.raceStarted) {
            socket.emit('error:message', { message: 'Race already started.' });
            return;
        }

        room.raceStarted = true;
        room.startAt = Date.now() + COUNTDOWN_MS;
        room.puzzleSeed = hashPuzzleSeed(room.code, room.raceNumber);

        io.emit('race:countdown', {
            startAt: room.startAt,
            puzzleSeed: room.puzzleSeed,
            countdownMs: COUNTDOWN_MS
        });
        broadcastRoom();
        broadcastLeaderboard();
    });

    socket.on('race:reset', function () {
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error:message', { message: 'Only the host can reset the race.' });
            return;
        }

        resetRaceProgress();
        broadcastRoom();
        broadcastLeaderboard();
    });

    socket.on('player:progress', function (data) {
        if (!room || !room.raceStarted) {
            return;
        }

        var player = getPlayerBySocket(socket.id);
        if (!player || player.puzzleSolved) {
            return;
        }

        if (typeof data.collectedCount === 'number') {
            player.collectedCount = Math.max(0, Math.min(data.collectedCount, COLLECTIBLE_MAX));
        }
        if (typeof data.mazePassed === 'boolean') {
            player.mazePassed = data.mazePassed;
        }
        if (typeof data.puzzleSolved === 'boolean') {
            player.puzzleSolved = data.puzzleSolved;
        }
        if (typeof data.mazeMs === 'number') {
            player.mazeMs = Math.max(0, data.mazeMs);
        }
        if (typeof data.puzzleMs === 'number') {
            player.puzzleMs = Math.max(0, data.puzzleMs);
        }

        broadcastLeaderboard();
    });

    socket.on('player:finish', function (data) {
        if (!room || !room.raceStarted) {
            return;
        }

        var player = getPlayerBySocket(socket.id);
        if (!player) {
            return;
        }

        player.mazePassed = true;
        player.puzzleSolved = true;
        player.mazeMs = Math.max(0, data.mazeMs || 0);
        player.puzzleMs = Math.max(0, data.puzzleMs || 0);
        player.totalMs = Math.max(0, data.totalMs || (player.mazeMs + player.puzzleMs));
        player.collectedCount = COLLECTIBLE_MAX;

        broadcastLeaderboard();

        if (allPlayersFinished()) {
            broadcastRaceFinished();
        }
    });

    socket.on('disconnect', function () {
        if (!room) {
            return;
        }

        if (socket.id === room.hostSocketId) {
            return;
        }

        var player = getPlayerBySocket(socket.id);
        if (player) {
            room.players.delete(player.id);
            broadcastRoom();
            broadcastLeaderboard();
            if (room.raceStarted && allPlayersFinished()) {
                broadcastRaceFinished();
            }
        }
    });
});

server.listen(PORT, function () {
    var lanUrls = getLanGameUrls();
    console.log('Matti Run multiplayer server on http://localhost:' + PORT);
    console.log('Host dashboard:             http://localhost:' + PORT + '/host');
    if (lanUrls.length) {
        console.log('Game (share with players):');
        for (var i = 0; i < lanUrls.length; i++) {
            console.log('  ' + lanUrls[i]);
        }
    } else {
        console.log('Game (share with players):  http://localhost:' + PORT);
    }
});
