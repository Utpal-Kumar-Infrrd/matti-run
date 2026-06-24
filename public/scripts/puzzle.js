var Puzzle = (function() {

    var tiles = [];
    var selectedIndex = null;
    var onWin = null;
    var puzzleStartTime = 0;
    var puzzleEndTime = 0;

    function shuffleArray(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function isSolved() {
        for (var i = 0; i < tiles.length; i++) {
            if (tiles[i] !== i) {
                return false;
            }
        }
        return true;
    }

    function applyPuzzleGridLayout() {
        var tileSize = 'min(18vh, 16vw, 110px)';
        $('#puzzle-grid').css({
            'grid-template-columns': 'repeat(' + PUZZLE_GRID_COLS + ', ' + tileSize + ')',
            'grid-template-rows': 'repeat(' + PUZZLE_GRID_ROWS + ', ' + tileSize + ')'
        });
        return tileSize;
    }

    function onTileClick() {
        var index = $(this).data('index');
        if (selectedIndex === null) {
            selectedIndex = index;
        } else if (selectedIndex === index) {
            selectedIndex = null;
        } else {
            var tmp = tiles[selectedIndex];
            tiles[selectedIndex] = tiles[index];
            tiles[index] = tmp;
            selectedIndex = null;
            if (isSolved()) {
                puzzleEndTime = Date.now();
                if (onWin) {
                    onWin(puzzleEndTime - puzzleStartTime);
                }
            }
        }
        renderGrid();
    }

    function renderGrid() {
        var grid = $('#puzzle-grid');
        var tileSize = applyPuzzleGridLayout();
        grid.empty();
        for (var i = 0; i < tiles.length; i++) {
            var tile = $('<div class="puzzle-tile"></div>');
            tile.data('index', i);
            tile.css({
                width: tileSize,
                height: tileSize,
                'background-image': 'url(' + PUZZLE_IMAGE_PATH + ')',
                'background-size': pieceBackgroundSize(),
                'background-position': pieceBackgroundPosition(tiles[i])
            });
            if (selectedIndex === i) {
                tile.addClass('selected');
            }
            tile.on('click', onTileClick);
            grid.append(tile);
        }
    }

    return {
        init: function(winCallback, puzzleSeed) {
            onWin = winCallback;
            selectedIndex = null;
            tiles = [];
            for (var i = 0; i < COLLECTIBLE_COUNT; i++) {
                tiles.push(i);
            }
            do {
                if (puzzleSeed != null) {
                    seededShuffle(tiles, createSeededRng(puzzleSeed));
                } else {
                    shuffleArray(tiles);
                }
            } while (isSolved());

            puzzleStartTime = Date.now();
            puzzleEndTime = 0;
            $('#puzzle-screen').show();
            renderGrid();
        },

        getPuzzleStartTime: function() {
            return puzzleStartTime;
        },

        reset: function() {
            $('#puzzle-screen').hide();
            selectedIndex = null;
            tiles = [];
            onWin = null;
        }
    };

})();
