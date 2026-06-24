var Joystick = (function() {

    var baseEl = null;
    var stickEl = null;
    var wrapEl = null;
    var active = false;
    var axis = [0, 0];
    var centerX = 0;
    var centerY = 0;
    var maxRadius = 50;
    var documentHandlersBound = false;
    var useTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    function recalculateRadius() {
        if (!baseEl || !stickEl) {
            return;
        }
        var baseSize = baseEl.outerWidth();
        var stickSize = stickEl.outerWidth();
        maxRadius = Math.max(24, baseSize / 2 - stickSize / 2 - 4);
    }

    function getClientXY(e) {
        if (e.originalEvent) {
            e = e.originalEvent;
        }
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
            return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function setStickPosition(dx, dy) {
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxRadius) {
            dx = dx / dist * maxRadius;
            dy = dy / dist * maxRadius;
        }
        stickEl.css('transform', 'translate(-50%, -50%) translate(' + dx + 'px, ' + dy + 'px)');
        axis[0] = dx / maxRadius;
        axis[1] = -dy / maxRadius;
    }

    function updateCenter() {
        var rect = baseEl[0].getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
    }

    function resetStick() {
        if (stickEl) {
            stickEl.css('transform', 'translate(-50%, -50%)');
        }
        axis[0] = 0;
        axis[1] = 0;
        active = false;
        unbindDocumentHandlers();
    }

    function onMove(e) {
        if (!active) {
            return;
        }
        var p = getClientXY(e);
        setStickPosition(p.x - centerX, p.y - centerY);
    }

    function onEnd(e) {
        if (!active) {
            return;
        }
        if (e.type === 'touchend' && e.touches && e.touches.length > 0) {
            return;
        }
        resetStick();
    }

    function onStart(e) {
        if (active) {
            return;
        }
        active = true;
        recalculateRadius();
        updateCenter();
        var p = getClientXY(e);
        setStickPosition(p.x - centerX, p.y - centerY);
        bindDocumentHandlers();
    }

    function bindDocumentHandlers() {
        if (documentHandlersBound) {
            return;
        }
        documentHandlersBound = true;
        if (useTouch) {
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onEnd, { passive: true });
            document.addEventListener('touchcancel', onEnd, { passive: true });
        } else {
            $(document).on('pointermove.joystick', onMove);
            $(document).on('pointerup.joystick pointercancel.joystick', onEnd);
        }
    }

    function unbindDocumentHandlers() {
        if (!documentHandlersBound) {
            return;
        }
        documentHandlersBound = false;
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
        $(document).off('.joystick');
    }

    return {
        init: function() {
            wrapEl = $('#joystick');
            baseEl = $('#joystick-base');
            stickEl = $('#joystick-stick');
            recalculateRadius();

            var target = wrapEl[0];
            if (!target) {
                return;
            }

            if (useTouch) {
                target.addEventListener('touchstart', onStart, { passive: true });
            } else {
                baseEl.on('pointerdown', onStart);
            }
        },

        getAxis: function() {
            return axis;
        },

        show: function() {
            wrapEl.show();
            recalculateRadius();
        },

        hide: function() {
            wrapEl.hide();
            resetStick();
        }
    };

})();
