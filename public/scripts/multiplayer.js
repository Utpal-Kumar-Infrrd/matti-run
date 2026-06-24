var Multiplayer = (function () {

    var socket = null;
    var active = false;
    var playerId = null;
    var playerName = '';
    var puzzleSeed = null;
    var raceStartAt = 0;
    var lastProgressKey = '';
    var lastProgressAt = 0;
    var finalStandings = null;
    var onCountdownCallback = null;
    var onJoinedCallback = null;
    var onErrorCallback = null;
    var onRoomUpdatedCallback = null;

    function loadSocketIo(callback) {
        if (typeof io !== 'undefined') {
            callback();
            return;
        }
        var script = document.createElement('script');
        script.src = getMultiplayerServerUrl() + '/socket.io/socket.io.js';
        script.onload = callback;
        script.onerror = function () {
            if (onErrorCallback) {
                onErrorCallback('Could not load multiplayer server. Is it running?');
            }
        };
        document.head.appendChild(script);
    }

    function progressKey(state) {
        return [
            state.collectedCount,
            state.mazePassed,
            state.puzzleSolved,
            state.mazeMs,
            state.puzzleMs
        ].join(':');
    }

    function bindSocketEvents() {
        socket.on('room:joined', function (data) {
            playerId = data.playerId;
            if (onJoinedCallback) {
                onJoinedCallback(data);
            }
        });

        socket.on('room:updated', function (data) {
            if (onRoomUpdatedCallback) {
                onRoomUpdatedCallback(data);
            }
        });

        socket.on('race:countdown', function (data) {
            puzzleSeed = data.puzzleSeed;
            raceStartAt = data.startAt;
            if (onCountdownCallback) {
                onCountdownCallback(data);
            }
        });

        socket.on('leaderboard:update', function () {
        });

        socket.on('race:finished', function (data) {
            finalStandings = data.rows;
        });

        socket.on('error:message', function (data) {
            if (onErrorCallback) {
                onErrorCallback(data.message);
            }
        });
    }

    return {
        isActive: function () {
            return active;
        },

        getPuzzleSeed: function () {
            return puzzleSeed;
        },

        getRaceStartAt: function () {
            return raceStartAt;
        },

        getFinalStandings: function () {
            return finalStandings;
        },

        connectAndJoin: function (roomCode, name, callbacks) {
            onJoinedCallback = callbacks.onJoined;
            onCountdownCallback = callbacks.onCountdown;
            onErrorCallback = callbacks.onError;
            onRoomUpdatedCallback = callbacks.onRoomUpdated;

            loadSocketIo(function () {
                socket = io(getMultiplayerServerUrl());
                active = true;
                finalStandings = null;
                lastProgressKey = '';
                playerName = name;

                bindSocketEvents();

                socket.on('connect', function () {
                    socket.emit('room:join', {
                        roomCode: roomCode,
                        playerName: name
                    });
                });

                socket.on('connect_error', function () {
                    if (onErrorCallback) {
                        onErrorCallback('Could not connect to multiplayer server at ' + getMultiplayerServerUrl());
                    }
                });
            });
        },

        disconnect: function () {
            active = false;
            playerId = null;
            puzzleSeed = null;
            raceStartAt = 0;
            finalStandings = null;
            lastProgressKey = '';
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        },

        reportProgress: function (state, force) {
            if (!active || !socket || !raceStartAt) {
                return;
            }

            var now = Date.now();
            var key = progressKey(state);
            if (!force && key === lastProgressKey && (now - lastProgressAt) < MULTIPLAYER_PROGRESS_INTERVAL_MS) {
                return;
            }

            lastProgressKey = key;
            lastProgressAt = now;
            socket.emit('player:progress', state);
        },

        reportFinish: function (mazeMs, puzzleMs) {
            if (!active || !socket) {
                return;
            }
            var totalMs = mazeMs + puzzleMs;
            socket.emit('player:finish', {
                mazeMs: mazeMs,
                puzzleMs: puzzleMs,
                totalMs: totalMs
            });
            this.reportProgress({
                collectedCount: COLLECTIBLE_COUNT,
                mazePassed: true,
                puzzleSolved: true,
                mazeMs: mazeMs,
                puzzleMs: puzzleMs
            }, true);
        },

    };

})();
