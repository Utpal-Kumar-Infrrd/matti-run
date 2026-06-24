var Multiplayer = (function () {

    var socket = null;
    var active = false;
    var playerId = null;
    var playerName = '';
    var puzzleSeed = null;
    var raceStartAt = 0;
    var onCountdownCallback = null;
    var onJoinedCallback = null;
    var onErrorCallback = null;

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

    function bindSocketEvents() {
        socket.on('room:joined', function (data) {
            playerId = data.playerId;
            if (onJoinedCallback) {
                onJoinedCallback(data);
            }
        });

        socket.on('race:countdown', function (data) {
            puzzleSeed = data.puzzleSeed;
            raceStartAt = data.startAt;
            if (onCountdownCallback) {
                onCountdownCallback(data);
            }
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

        connectAndJoin: function (roomCode, name, callbacks) {
            onJoinedCallback = callbacks.onJoined;
            onCountdownCallback = callbacks.onCountdown;
            onErrorCallback = callbacks.onError;

            loadSocketIo(function () {
                socket = io(getMultiplayerServerUrl(), { transports: ['websocket'] });
                active = true;
                puzzleSeed = null;
                raceStartAt = 0;
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
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        },

        reportCollected: function (collectedCount) {
            if (!active || !socket || !raceStartAt) {
                return;
            }
            socket.emit('player:collected', {
                collectedCount: collectedCount,
                at: Date.now()
            });
        },

        reportMazeComplete: function (mazeMs) {
            if (!active || !socket || !raceStartAt) {
                return;
            }
            socket.emit('player:maze_complete', {
                mazeMs: mazeMs,
                at: Date.now()
            });
        },

        reportFinish: function (mazeMs, puzzleMs) {
            if (!active || !socket) {
                return;
            }
            var totalMs = mazeMs + puzzleMs;
            socket.emit('player:finish', {
                mazeMs: mazeMs,
                puzzleMs: puzzleMs,
                totalMs: totalMs,
                at: Date.now()
            });
        }

    };

})();
