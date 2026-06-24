'use strict';

var express = require('express');
var http = require('http');
var { Server } = require('socket.io');

var PORT = process.env.PORT || 8080;
var COUNTDOWN_MS = 3000;
var ROOM_IDLE_MS = 30 * 60 * 1000;
var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var COLLECTIBLE_MAX = 12;
var MAX_PLAYERS_HARD = parseInt(process.env.MAX_PLAYERS, 10) || 300;
var LEADERBOARD_DEBOUNCE_MS = 500;
var ROOM_DEBOUNCE_MS = 500;
var MAX_EVENTS_PER_PLAYER = 16;

var app = express();
var server = http.createServer(app);
var io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket'],
    perMessageDeflate: false,
    pingInterval: 25000,
    pingTimeout: 20000
});

var room = null;
var idleTimer = null;
var leaderboardTimer = null;
var roomTimer = null;
var leaderboardDirty = false;

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
        leaderboardDirty = false;
        if (leaderboardTimer) {
            clearTimeout(leaderboardTimer);
            leaderboardTimer = null;
        }
        if (roomTimer) {
            clearTimeout(roomTimer);
            roomTimer = null;
        }
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
        joinOrder: joinOrder,
        lastCollectedAt: 0,
        mazeCompletedAt: 0,
        puzzleCompletedAt: 0,
        eventCount: 0
    };
}

function resetPlayerProgress(player) {
    player.collectedCount = 0;
    player.mazePassed = false;
    player.puzzleSolved = false;
    player.mazeMs = 0;
    player.puzzleMs = 0;
    player.totalMs = 0;
    player.lastCollectedAt = 0;
    player.mazeCompletedAt = 0;
    player.puzzleCompletedAt = 0;
    player.eventCount = 0;
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
            totalMs: p.totalMs,
            lastCollectedAt: p.lastCollectedAt,
            mazeCompletedAt: p.mazeCompletedAt,
            puzzleCompletedAt: p.puzzleCompletedAt
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

function emitToHost(event, payload) {
    if (!room || !room.hostSocketId) {
        return;
    }
    var hostSocket = io.sockets.sockets.get(room.hostSocketId);
    if (hostSocket) {
        hostSocket.emit(event, payload);
    }
}

function buildRoomPayload() {
    var players = [];
    room.players.forEach(function (player) {
        players.push({ id: player.id, name: player.name });
    });
    return {
        roomCode: room.code,
        players: players,
        playerCount: players.length,
        playerLimit: room.playerLimit,
        maxPlayersHard: MAX_PLAYERS_HARD,
        raceStarted: room.raceStarted,
        raceNumber: room.raceNumber
    };
}

function flushRoomToHost() {
    roomTimer = null;
    if (!room) {
        return;
    }
    emitToHost('room:updated', buildRoomPayload());
}

function scheduleRoomToHost() {
    if (roomTimer) {
        return;
    }
    roomTimer = setTimeout(flushRoomToHost, ROOM_DEBOUNCE_MS);
}

function flushLeaderboardToHost() {
    leaderboardTimer = null;
    leaderboardDirty = false;
    if (!room) {
        return;
    }
    emitToHost('leaderboard:update', {
        rows: rankPlayers(),
        raceStarted: room.raceStarted,
        raceStartAt: room.startAt
    });
}

function scheduleLeaderboardToHost() {
    leaderboardDirty = true;
    if (leaderboardTimer) {
        return;
    }
    leaderboardTimer = setTimeout(flushLeaderboardToHost, LEADERBOARD_DEBOUNCE_MS);
}

function broadcastRaceFinishedToHost() {
    if (!room) {
        return;
    }
    flushLeaderboardToHost();
    emitToHost('race:finished', {
        rows: rankPlayers(),
        raceStartAt: room.startAt
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
    room.startAt = 0;
    room.players.forEach(function (player) {
        resetPlayerProgress(player);
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

function isValidMilestoneAt(at) {
    if (typeof at !== 'number' || !isFinite(at)) {
        return false;
    }
    var now = Date.now();
    if (at > now + 5000) {
        return false;
    }
    if (room && room.startAt && at < room.startAt - COUNTDOWN_MS) {
        return false;
    }
    return true;
}

function canAcceptPlayerEvent(player) {
    if (!player || player.puzzleSolved) {
        return false;
    }
    if (player.eventCount >= MAX_EVENTS_PER_PLAYER) {
        return false;
    }
    player.eventCount += 1;
    return true;
}

app.get('/health', function (req, res) {
    res.json({
        ok: true,
        room: room ? room.code : null,
        playerCount: room ? room.players.size : 0,
        maxPlayersHard: MAX_PLAYERS_HARD
    });
});

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
                puzzleSeed: hashPuzzleSeed(code, 1),
                playerLimit: MAX_PLAYERS_HARD
            };
        } else {
            room.hostSocketId = socket.id;
        }

        socket.emit('room:created', {
            roomCode: room.code,
            raceNumber: room.raceNumber,
            playerLimit: room.playerLimit,
            maxPlayersHard: MAX_PLAYERS_HARD
        });
        flushRoomToHost();
        flushLeaderboardToHost();
    });

    socket.on('room:set_player_limit', function (data) {
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error:message', { message: 'Only the host can set the player limit.' });
            return;
        }
        if (room.raceStarted) {
            socket.emit('error:message', { message: 'Cannot change player limit after the race has started.' });
            return;
        }

        var limit = parseInt(data && data.limit, 10);
        if (!limit || limit < 1 || limit > MAX_PLAYERS_HARD) {
            socket.emit('error:message', { message: 'Player limit must be between 1 and ' + MAX_PLAYERS_HARD + '.' });
            return;
        }
        if (limit < room.players.size) {
            socket.emit('error:message', { message: 'Limit cannot be lower than current player count (' + room.players.size + ').' });
            return;
        }

        room.playerLimit = limit;
        flushRoomToHost();
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
                playerName: existing.name,
                playerCount: room.players.size,
                playerLimit: room.playerLimit
            });
            return;
        }

        if (room.players.size >= room.playerLimit) {
            socket.emit('error:message', {
                message: 'Room is full (' + room.players.size + '/' + room.playerLimit + ').'
            });
            return;
        }

        var playerId = socket.id;
        var player = createPlayer(playerId, playerName, socket.id, room.players.size);
        room.players.set(playerId, player);

        socket.emit('room:joined', {
            roomCode: room.code,
            playerId: playerId,
            playerName: playerName,
            playerCount: room.players.size,
            playerLimit: room.playerLimit
        });
        scheduleRoomToHost();
        scheduleLeaderboardToHost();
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
        flushRoomToHost();
        flushLeaderboardToHost();
    });

    socket.on('race:reset', function () {
        if (!room || room.hostSocketId !== socket.id) {
            socket.emit('error:message', { message: 'Only the host can reset the race.' });
            return;
        }

        resetRaceProgress();
        flushRoomToHost();
        flushLeaderboardToHost();
    });

    socket.on('player:collected', function (data) {
        if (!room || !room.raceStarted) {
            return;
        }

        var player = getPlayerBySocket(socket.id);
        if (!canAcceptPlayerEvent(player)) {
            return;
        }

        var at = data && data.at;
        var collectedCount = data && data.collectedCount;
        if (!isValidMilestoneAt(at) || typeof collectedCount !== 'number') {
            return;
        }
        if (collectedCount !== player.collectedCount + 1 || collectedCount > COLLECTIBLE_MAX) {
            return;
        }

        player.collectedCount = collectedCount;
        player.lastCollectedAt = at;
        scheduleLeaderboardToHost();
    });

    socket.on('player:maze_complete', function (data) {
        if (!room || !room.raceStarted) {
            return;
        }

        var player = getPlayerBySocket(socket.id);
        if (!canAcceptPlayerEvent(player) || player.mazePassed) {
            return;
        }

        var at = data && data.at;
        var mazeMs = data && data.mazeMs;
        if (!isValidMilestoneAt(at) || typeof mazeMs !== 'number') {
            return;
        }
        if (player.collectedCount < COLLECTIBLE_MAX) {
            return;
        }

        player.mazePassed = true;
        player.mazeMs = Math.max(0, mazeMs);
        player.mazeCompletedAt = at;
        scheduleLeaderboardToHost();
    });

    socket.on('player:finish', function (data) {
        if (!room || !room.raceStarted) {
            return;
        }

        var player = getPlayerBySocket(socket.id);
        if (!player || player.puzzleSolved) {
            return;
        }
        if (player.eventCount >= MAX_EVENTS_PER_PLAYER) {
            return;
        }
        player.eventCount += 1;

        var at = data && data.at;
        if (!isValidMilestoneAt(at)) {
            return;
        }

        player.mazePassed = true;
        player.puzzleSolved = true;
        player.mazeMs = Math.max(0, data.mazeMs || 0);
        player.puzzleMs = Math.max(0, data.puzzleMs || 0);
        player.totalMs = Math.max(0, data.totalMs || (player.mazeMs + player.puzzleMs));
        player.collectedCount = COLLECTIBLE_MAX;
        player.puzzleCompletedAt = at;
        if (!player.mazeCompletedAt) {
            player.mazeCompletedAt = at;
        }

        scheduleLeaderboardToHost();

        if (allPlayersFinished()) {
            broadcastRaceFinishedToHost();
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
            scheduleRoomToHost();
            scheduleLeaderboardToHost();
            if (room.raceStarted && allPlayersFinished()) {
                broadcastRaceFinishedToHost();
            }
        }
    });
});

server.listen(PORT, function () {
    console.log('Mattie Run multiplayer server listening on port ' + PORT);
    console.log('Health check: http://localhost:' + PORT + '/health');
    console.log('Max players (hard cap): ' + MAX_PLAYERS_HARD);
});
