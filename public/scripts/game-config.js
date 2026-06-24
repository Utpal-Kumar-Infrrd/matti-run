var MAZE_DIMENSION_LEVEL_2 = 25;
var MAZE_SEED = 42;
var PUZZLE_GRID_ROWS = 3;
var PUZZLE_GRID_COLS = 4;
var PUZZLE_IMAGE_PATH = '/assets/infrrd-mattie.jpeg';
var COLLECTIBLE_COUNT = PUZZLE_GRID_ROWS * PUZZLE_GRID_COLS;
var COLLECTIBLE_PIXEL_SCALE = 0.45;
var COLLECTIBLE_PICKUP_SCALE = 1.1;
var PLAYER_SPRITE_ROTATION_OFFSET = 0;

function pieceBackgroundSize() {
    return (PUZZLE_GRID_COLS * 100) + '% ' + (PUZZLE_GRID_ROWS * 100) + '%';
}

function pieceBackgroundPosition(pieceIndex) {
    var col = pieceIndex % PUZZLE_GRID_COLS;
    var row = Math.floor(pieceIndex / PUZZLE_GRID_COLS);
    var colPct = PUZZLE_GRID_COLS > 1 ? 100 / (PUZZLE_GRID_COLS - 1) : 0;
    var rowPct = PUZZLE_GRID_ROWS > 1 ? 100 / (PUZZLE_GRID_ROWS - 1) : 0;
    return (col * colPct) + '% ' + (row * rowPct) + '%';
}

function formatTime(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function selectSpreadCells(candidates, count, rng, anchor) {
    var placed = [];
    var remaining = candidates.slice();

    for (var n = 0; n < count && remaining.length > 0; n++) {
        var bestScore = -1;
        var bestIndices = [];

        for (var i = 0; i < remaining.length; i++) {
            var cell = remaining[i];
            var score;

            if (placed.length === 0) {
                var dx0 = cell[0] - anchor[0];
                var dy0 = cell[1] - anchor[1];
                score = Math.sqrt(dx0 * dx0 + dy0 * dy0);
            } else {
                score = Infinity;
                for (var p = 0; p < placed.length; p++) {
                    var dx = cell[0] - placed[p][0];
                    var dy = cell[1] - placed[p][1];
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < score) {
                        score = dist;
                    }
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestIndices = [i];
            } else if (score === bestScore) {
                bestIndices.push(i);
            }
        }

        var pick = bestIndices[Math.floor(rng.random() * bestIndices.length)];
        placed.push(remaining[pick]);
        remaining.splice(pick, 1);
    }

    return placed;
}

var MULTIPLAYER_SERVER_PORT = 8080;
var MULTIPLAYER_SERVER_URL_OVERRIDE = null;

function getMultiplayerServerUrl() {
    if (typeof window !== 'undefined' && window.__MATTIE_RUN_MULTIPLAYER_URL__) {
        return window.__MATTIE_RUN_MULTIPLAYER_URL__;
    }
    if (typeof window !== 'undefined' && window.location.hostname) {
        var protocol = window.location.protocol || 'http:';
        var host = window.location.hostname;
        var port = window.location.port;
        if (port === String(MULTIPLAYER_SERVER_PORT)) {
            return protocol + '//' + host + ':' + port;
        }
    }
    if (MULTIPLAYER_SERVER_URL_OVERRIDE) {
        return MULTIPLAYER_SERVER_URL_OVERRIDE;
    }
    return 'http://localhost:' + MULTIPLAYER_SERVER_PORT;
}
