if (!Math.imul) {
    Math.imul = function(a, b) {
        var ah = (a >>> 16) & 0xffff;
        var al = a & 0xffff;
        var bh = (b >>> 16) & 0xffff;
        var bl = b & 0xffff;
        return (al * bl + ((ah * bl + al * bh) << 16)) | 0;
    };
}

function hashSeed(seed) {
    var h = 1779033703;
    var str = String(seed);
    for (var i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return (h >>> 0) || 1;
}

function createSeededRng(seed) {
    var state = hashSeed(seed);
    return {
        random: function() {
            state = (state + 0x6D2B79F5) >>> 0;
            var t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    };
}

function seededShuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(rng.random() * (i + 1));
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}
