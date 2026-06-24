
        var camera = undefined,
            scene = undefined,
            renderer = undefined,
            light = undefined,
            maze = undefined,
            mazeMesh = undefined,
            mazeDimension = MAZE_DIMENSION_LEVEL_2,
            planeMesh = undefined,
            shipGroup = undefined,
            shipDisplayHeading = 0,
            shipLastHeading = 0,
            shipRadius = 0.25,
            keyAxis = [0, 0],
            planeTexture = undefined,
            wallTexture = THREE.ImageUtils.loadTexture('/assets/wall.png'),
            gameState = undefined,
            collectibles = [],
            collectedCount = 0,
            mazeStartTime = 0,
            mazeEndTime = 0,
            mazeComplete = false,
            exitHintTimeout = undefined,
            exitGateOpen = false,
            exitWallBody = undefined,
            exitWallMesh = undefined,
            collectibleHeight = 0.5,
            collectibleRadius = 0.25,
            screenProjector = new THREE.Projector(),

            // Box2D shortcuts
            b2World = Box2D.Dynamics.b2World,
            b2FixtureDef = Box2D.Dynamics.b2FixtureDef,
            b2BodyDef = Box2D.Dynamics.b2BodyDef,
            b2Body = Box2D.Dynamics.b2Body,
            b2CircleShape = Box2D.Collision.Shapes.b2CircleShape,
            b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape,
            b2Vec2 = Box2D.Common.Math.b2Vec2,

            // Box2D world variables
            wWorld = undefined,
            wBall = undefined,

            isMultiplayer = false,
            lastReportedCollectibles = -1,
            multiplayerRoomJoined = false,
            pendingExitCallback = null,
            exitWarningVisible = false;


        function getExitCellX() {
            return mazeDimension - 1;
        }


        function getExitCellY() {
            return mazeDimension - 2;
        }


        function isExitCell(i, j) {
            return i === getExitCellX() && j === getExitCellY();
        }


        function requestGameFullscreen() {
            var el = document.documentElement;
            var request = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (request) {
                request.call(el).catch(function () { });
            }
        }


        function isInMultiplayerSession() {
            return !!(multiplayerRoomJoined || isMultiplayer || Multiplayer.isActive());
        }


        function updateEndScreenButtons() {
            if (isMultiplayer) {
                $('#play-again-button').hide();
                $('#quit-room-button').show();
            } else {
                $('#play-again-button').show();
                $('#quit-room-button').hide();
            }
        }


        function showExitWarning(onConfirm) {
            exitWarningVisible = true;
            pendingExitCallback = onConfirm;
            $('#exit-warning-screen').css('display', 'flex');
        }


        function hideExitWarning() {
            exitWarningVisible = false;
            pendingExitCallback = null;
            $('#exit-warning-screen').hide();
        }


        function requestMultiplayerExit() {
            if (!isInMultiplayerSession()) {
                return;
            }
            showExitWarning(quitMultiplayerRoom);
        }


        function quitMultiplayerRoom() {
            Puzzle.reset();
            Joystick.hide();
            $('#end-screen').hide();
            $('#countdown-screen').hide();
            $('#puzzle-screen').hide();
            $('#lobby-screen').hide();
            $('#lobby-error').hide();
            $('#lobby-join-form').show();
            $('#lobby-waiting').hide();
            $('#lobby-join-button').prop('disabled', false);
            Multiplayer.disconnect();
            isMultiplayer = false;
            multiplayerRoomJoined = false;
            $('#collectible-counter').hide();
            $('#collectible-markers').hide().empty();
            $('#collect-effects').empty();
            $('#ship-marker').hide();
            $('#ship-shadow').hide();
            $('#ship-engine-glow').hide();
            $('#exit-hint').hide().removeClass('exit-hint--success');
            $('#exit-marker').hide();
            $('#help').show();
            if (renderer && renderer.domElement) {
                renderer.domElement.style.display = 'block';
            }
            collectedCount = 0;
            collectibles = [];
            mazeComplete = false;
            mazeStartTime = 0;
            mazeEndTime = 0;
            lastReportedCollectibles = -1;
            updateEndScreenButtons();
            $('#intro-screen').show();
            gameState = 'intro';
        }


        function getWalkableCells(field) {
            var cells = [];
            for (var i = 0; i < field.dimension; i++) {
                for (var j = 0; j < field.dimension; j++) {
                    if (!field[i][j]) {
                        cells.push([i, j]);
                    }
                }
            }
            return cells;
        }


        function buildMazeLayout() {
            var rng = createSeededRng(MAZE_SEED);
            maze = generateSquareMaze(mazeDimension, rng);
            maze[getExitCellX()][getExitCellY()] = true;
            placeCollectibles(rng);
        }


        function placeCollectibles(rng) {
            var cells = getWalkableCells(maze);
            var excluded = {};
            excluded['1,1'] = true;
            excluded[(getExitCellX()) + ',' + (getExitCellY())] = true;
            cells = cells.filter(function (c) {
                return !excluded[c[0] + ',' + c[1]];
            });
            var positions = selectSpreadCells(cells, COLLECTIBLE_COUNT, rng, [1, 1]);
            collectibles = [];
            for (var i = 0; i < positions.length; i++) {
                collectibles.push({
                    x: positions[i][0],
                    y: positions[i][1],
                    pieceIndex: i,
                    collected: false,
                    marker: null
                });
            }
        }


        function getShipPixelSize() {
            if (!camera || !shipGroup) {
                return 32;
            }
            camera.updateMatrixWorld();
            var center = new THREE.Vector3(
                shipGroup.position.x,
                shipGroup.position.y,
                shipGroup.position.z
            );
            var edge = new THREE.Vector3(
                shipGroup.position.x + shipRadius * 2,
                shipGroup.position.y,
                shipGroup.position.z
            );
            screenProjector.projectVector(center, camera);
            screenProjector.projectVector(edge, camera);
            var cx = (center.x + 1) / 2 * window.innerWidth;
            var cy = (-center.y + 1) / 2 * window.innerHeight;
            var ex = (edge.x + 1) / 2 * window.innerWidth;
            var ey = (-edge.y + 1) / 2 * window.innerHeight;
            var dx = ex - cx;
            var dy = ey - cy;
            return Math.max(28, Math.sqrt(dx * dx + dy * dy) * 2.4);
        }


        function getCollectiblePixelSize() {
            return Math.max(8, getShipPixelSize() * COLLECTIBLE_PIXEL_SCALE);
        }


        function projectWorldToScreen(wx, wy, wz) {
            var vector = new THREE.Vector3(wx, wy, wz);
            screenProjector.projectVector(vector, camera);
            if (vector.z < -1 || vector.z > 1) {
                return null;
            }
            return {
                x: (vector.x + 1) / 2 * window.innerWidth,
                y: (-vector.y + 1) / 2 * window.innerHeight
            };
        }


        function updateShipMarker() {
            var marker = $('#ship-marker');
            var shadow = $('#ship-shadow');
            var glow = $('#ship-engine-glow');

            if (!camera || !shipGroup) {
                marker.hide();
                shadow.hide();
                glow.hide();
                return;
            }

            camera.updateMatrixWorld();

            var sizePx = getShipPixelSize();
            var heightPx = sizePx * 0.92;
            var screen = projectWorldToScreen(
                shipGroup.position.x,
                shipGroup.position.y,
                shipGroup.position.z
            );

            if (!screen) {
                marker.hide();
                shadow.hide();
                glow.hide();
                return;
            }

            var t = Date.now() / 1000;
            var hoverPx = Math.sin(t * 3.2) * 6 + Math.sin(t * 11) * 2;
            var headingDeg = (shipDisplayHeading + PLAYER_SPRITE_ROTATION_OFFSET) * 180 / Math.PI;

            marker.css({
                left: (screen.x - sizePx / 2) + 'px',
                top: (screen.y - heightPx / 2 - hoverPx) + 'px',
                width: sizePx + 'px',
                height: heightPx + 'px',
                transform: 'rotate(' + headingDeg + 'deg)'
            }).show();

            var shadowScreen = projectWorldToScreen(
                shipGroup.position.x,
                shipGroup.position.y,
                0.02
            );
            if (shadowScreen) {
                var hover = Math.sin(t * 3.2) * shipRadius * 0.14;
                var shadowScale = Math.max(0.55, 1.05 - hover * 1.6);
                var shadowW = sizePx * 0.85 * shadowScale;
                var shadowH = sizePx * 0.4 * shadowScale;
                shadow.css({
                    left: (shadowScreen.x - shadowW / 2) + 'px',
                    top: (shadowScreen.y - shadowH / 2) + 'px',
                    width: shadowW + 'px',
                    height: shadowH + 'px',
                    opacity: 0.18 + shadowScale * 0.12
                }).show();
            } else {
                shadow.hide();
            }

            glow.hide();
        }


        function updateExitMarker() {
            var marker = $('#exit-marker');
            if (!exitGateOpen || !camera) {
                marker.hide();
                return;
            }

            camera.updateMatrixWorld();
            var screen = projectWorldToScreen(getExitCellX(), getExitCellY(), 0.5);
            if (!screen) {
                marker.hide();
                return;
            }

            var w = marker.outerWidth() || 48;
            var h = marker.outerHeight() || 48;
            marker.css({
                left: (screen.x - w / 2) + 'px',
                top: (screen.y - h / 2) + 'px',
                display: 'block'
            });
        }


        function openExitGate() {
            if (exitGateOpen) {
                return;
            }
            exitGateOpen = true;
            maze[getExitCellX()][getExitCellY()] = false;

            if (exitWallBody) {
                wWorld.DestroyBody(exitWallBody);
                exitWallBody = undefined;
            }
            if (exitWallMesh && scene) {
                scene.remove(exitWallMesh);
                exitWallMesh = undefined;
            }

            $('#exit-hint')
                .text('All pieces collected! Find the exit!')
                .addClass('exit-hint--success')
                .show();
            $('#exit-marker').show();
        }


        function resizeCollectibleCube(wrap, sizePx) {
            if (wrap.data('size') === sizePx) {
                return;
            }
            wrap.data('size', sizePx);
            var half = sizePx / 2;
            var faceSize = { width: sizePx + 'px', height: sizePx + 'px' };
            wrap.css({ width: sizePx + 'px', height: sizePx + 'px' });
            wrap.find('.collectible-cube').css(faceSize);
            wrap.find('.cube-face').css(faceSize);
            wrap.find('.cube-front').css('transform', 'translateZ(' + half + 'px)');
            wrap.find('.cube-back').css('transform', 'rotateY(180deg) translateZ(' + half + 'px)');
            wrap.find('.cube-right').css('transform', 'rotateY(90deg) translateZ(' + half + 'px)');
            wrap.find('.cube-left').css('transform', 'rotateY(-90deg) translateZ(' + half + 'px)');
            wrap.find('.cube-top').css('transform', 'rotateX(90deg) translateZ(' + half + 'px)');
            wrap.find('.cube-bottom').css('transform', 'rotateX(-90deg) translateZ(' + half + 'px)');
        }


        function createCollectibleCubeElement(pieceIndex, sizePx) {
            var half = sizePx / 2;
            var bg = {
                'background-image': 'url(' + PUZZLE_IMAGE_PATH + ')',
                'background-size': pieceBackgroundSize(),
                'background-position': pieceBackgroundPosition(pieceIndex),
                'width': sizePx + 'px',
                'height': sizePx + 'px'
            };

            var wrap = $('<div class="collectible-cube-wrap"></div>');
            wrap.css({ width: sizePx + 'px', height: sizePx + 'px' });

            var cube = $('<div class="collectible-cube"></div>');
            cube.css({ width: sizePx + 'px', height: sizePx + 'px' });

            var faces = [
                { cls: 'cube-front', transform: 'translateZ(' + half + 'px)' },
                { cls: 'cube-back', transform: 'rotateY(180deg) translateZ(' + half + 'px)' },
                { cls: 'cube-right', transform: 'rotateY(90deg) translateZ(' + half + 'px)' },
                { cls: 'cube-left', transform: 'rotateY(-90deg) translateZ(' + half + 'px)' },
                { cls: 'cube-top', transform: 'rotateX(90deg) translateZ(' + half + 'px)' },
                { cls: 'cube-bottom', transform: 'rotateX(-90deg) translateZ(' + half + 'px)' }
            ];

            for (var f = 0; f < faces.length; f++) {
                var face = $('<div class="cube-face ' + faces[f].cls + '"></div>');
                face.css(bg);
                face.css('transform', faces[f].transform);
                cube.append(face);
            }

            wrap.append(cube);
            return wrap;
        }


        function createCollectibleMarkers() {
            collectibleRadius = shipRadius * COLLECTIBLE_PICKUP_SCALE;
            collectibleHeight = shipRadius * COLLECTIBLE_PIXEL_SCALE;

            var markerPx = getCollectiblePixelSize();
            $('#collectible-markers').empty();

            for (var i = 0; i < collectibles.length; i++) {
                var c = collectibles[i];
                c.marker = createCollectibleCubeElement(c.pieceIndex, markerPx);
                $('#collectible-markers').append(c.marker);
            }
        }


        function updateCollectibleMarkers() {
            if (!camera) {
                return;
            }
            camera.updateMatrixWorld();

            var markerPx = getCollectiblePixelSize();
            var t = Date.now() / 450;
            var bob = shipRadius * 0.15;

            for (var i = 0; i < collectibles.length; i++) {
                var c = collectibles[i];
                if (c.collected || !c.marker) {
                    continue;
                }
                if (c.marker.hasClass('collectible-collecting')) {
                    continue;
                }

                resizeCollectibleCube(c.marker, markerPx);

                var z = collectibleHeight + Math.sin(t + c.pieceIndex) * bob;
                var vector = new THREE.Vector3(c.x, c.y, z);
                screenProjector.projectVector(vector, camera);

                if (vector.z < -1 || vector.z > 1) {
                    c.marker.hide();
                    continue;
                }

                var sx = (vector.x + 1) / 2 * window.innerWidth;
                var sy = (-vector.y + 1) / 2 * window.innerHeight;
                var spin = (Date.now() / 20 + c.pieceIndex * 40) % 360;

                c.marker.css({
                    left: (sx - markerPx / 2) + 'px',
                    top: (sy - markerPx / 2) + 'px',
                    display: 'block'
                });
                c.marker.find('.collectible-cube').css(
                    'transform', 'rotateX(-24deg) rotateY(' + spin + 'deg)'
                );
            }
        }


        function updateCollectibleCounter() {
            $('#collectible-counter').html('Collected: ' + collectedCount + '/' + COLLECTIBLE_COUNT);
        }


        function playCollectAnimation(c) {
            if (!c.marker) {
                return;
            }
            var marker = c.marker;
            if (marker.hasClass('collectible-collecting')) {
                return;
            }
            marker.addClass('collectible-collecting');

            var left = parseFloat(marker.css('left')) || 0;
            var top = parseFloat(marker.css('top')) || 0;
            var size = marker.outerWidth() || 48;

            var burst = $('<div class="collect-burst"></div>');
            burst.css({
                left: (left + size / 2 - size / 2) + 'px',
                top: (top + size / 2 - size / 2) + 'px',
                width: size + 'px',
                height: size + 'px'
            });
            $('#collect-effects').append(burst);

            var sparkle = $('<div class="collect-sparkle">+1</div>');
            sparkle.css({
                left: (left + size / 2 - 16) + 'px',
                top: (top - 10) + 'px'
            });
            $('#collect-effects').append(sparkle);

            setTimeout(function () {
                marker.remove();
                burst.remove();
                sparkle.remove();
                c.marker = null;
            }, 650);
        }


        function checkCollectibles() {
            if (!shipGroup) {
                return;
            }
            var sx = shipGroup.position.x;
            var sy = shipGroup.position.y;
            for (var i = 0; i < collectibles.length; i++) {
                var c = collectibles[i];
                if (c.collected) {
                    continue;
                }
                var dx = sx - c.x;
                var dy = sy - c.y;
                if (dx * dx + dy * dy < collectibleRadius * collectibleRadius) {
                    c.collected = true;
                    collectedCount++;
                    playCollectAnimation(c);
                    updateCollectibleCounter();
                    if (collectedCount !== lastReportedCollectibles) {
                        lastReportedCollectibles = collectedCount;
                        if (isMultiplayer) {
                            Multiplayer.reportCollected(collectedCount);
                        }
                    }
                    if (collectedCount === COLLECTIBLE_COUNT) {
                        openExitGate();
                    }
                }
            }
        }


        function showEndScreen(mazeElapsed, puzzleElapsed) {
            $('#puzzle-screen').hide();
            $('#maze-time').text(formatTime(mazeElapsed));
            $('#puzzle-time').text(formatTime(puzzleElapsed));
            $('#total-time-value').text(formatTime(mazeElapsed + puzzleElapsed));
            $('#end-full-image').attr('src', PUZZLE_IMAGE_PATH);
            if (isMultiplayer) {
                Multiplayer.reportFinish(mazeElapsed, puzzleElapsed);
            }
            updateEndScreenButtons();
            $('#end-screen').show();
        }




        function beginMultiplayerRace(startAt, seed) {
            isMultiplayer = true;
            mazeStartTime = startAt;
            lastReportedCollectibles = -1;
            $('#countdown-screen').hide();
            $('#lobby-screen').hide();
            startGameInternal();
        }


        function showCountdownThenStart(startAt, seed) {
            var countdownEl = $('#countdown-value');
            $('#countdown-screen').css('display', 'flex');

            function tick() {
                var remaining = startAt - Date.now();
                if (remaining <= 0) {
                    countdownEl.text('Go!');
                    setTimeout(function () {
                        beginMultiplayerRace(startAt, seed);
                    }, 400);
                    return;
                }
                var seconds = Math.ceil(remaining / 1000);
                countdownEl.text(seconds);
                requestAnimationFrame(tick);
            }
            tick();
        }

        function resetGame() {
            if (isInMultiplayerSession()) {
                requestMultiplayerExit();
                return;
            }
            Puzzle.reset();
            Joystick.hide();
            $('#end-screen').hide();
            $('#countdown-screen').hide();
            $('#intro-screen').show();
            $('#lobby-screen').hide();
            $('#collectible-markers').hide().empty();
            $('#collect-effects').empty();
            $('#ship-marker').hide();
            $('#ship-shadow').hide();
            $('#ship-engine-glow').hide();
            $('#exit-hint').hide().removeClass('exit-hint--success');
            $('#exit-marker').hide();
            $('#help').show();
            renderer.domElement.style.display = 'block';
            collectedCount = 0;
            collectibles = [];
            mazeComplete = false;
            mazeStartTime = 0;
            mazeEndTime = 0;
            lastReportedCollectibles = -1;
            updateEndScreenButtons();
            gameState = 'intro';
        }


        function startGameInternal() {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(function () { });
            }
            requestGameFullscreen();
            exitGateOpen = false;
            exitWallBody = undefined;
            exitWallMesh = undefined;
            $('#exit-hint').hide().removeClass('exit-hint--success');
            $('#exit-marker').hide();
            $('#collectible-counter').show();
            $('#collectible-markers').show();
            $('#ship-marker').show();
            $('#help').show();
            Joystick.hide();
            renderer.domElement.style.display = 'block';
            collectedCount = 0;
            collectibles = [];
            mazeComplete = false;
            if (!isMultiplayer) {
                mazeStartTime = Date.now();
            }
            mazeEndTime = 0;
            lastReportedCollectibles = -1;
            gameState = 'initialize';
        }


        function startSinglePlayerGame() {
            isMultiplayer = false;
            $('#intro-screen').hide();
            $('#lobby-screen').hide();
            startGameInternal();
        }


        function createPhysicsWorld() {
            wWorld = new b2World(new b2Vec2(0, 0), true);

            var bodyDef = new b2BodyDef();
            bodyDef.type = b2Body.b2_dynamicBody;
            bodyDef.position.Set(1, 1);
            wBall = wWorld.CreateBody(bodyDef);
            var fixDef = new b2FixtureDef();
            fixDef.density = 1.0;
            fixDef.friction = 0.0;
            fixDef.restitution = 0.25;
            fixDef.shape = new b2CircleShape(shipRadius);
            wBall.CreateFixture(fixDef);

            bodyDef.type = b2Body.b2_staticBody;
            fixDef.shape = new b2PolygonShape();
            fixDef.shape.SetAsBox(0.5, 0.5);
            exitWallBody = undefined;
            for (var i = 0; i < maze.dimension; i++) {
                for (var j = 0; j < maze.dimension; j++) {
                    if (!maze[i][j]) {
                        continue;
                    }
                    if (isExitCell(i, j) && !exitGateOpen) {
                        bodyDef.position.x = i;
                        bodyDef.position.y = j;
                        exitWallBody = wWorld.CreateBody(bodyDef);
                        exitWallBody.CreateFixture(fixDef);
                        continue;
                    }
                    bodyDef.position.x = i;
                    bodyDef.position.y = j;
                    wWorld.CreateBody(bodyDef).CreateFixture(fixDef);
                }
            }
        }


        function applyMazeWallUVs(geometry, dimension) {
            var faces = geometry.faces;
            var verts = geometry.vertices;
            geometry.faceVertexUvs[0] = [];
            for (var i = 0; i < faces.length; i++) {
                var face = faces[i];
                var uvs = [];
                var indices;
                if (face instanceof THREE.Face4) {
                    indices = [face.a, face.b, face.c, face.d];
                } else {
                    indices = [face.a, face.b, face.c];
                }
                for (var j = 0; j < indices.length; j++) {
                    var v = verts[indices[j]];
                    uvs.push(new THREE.UV(v.x / dimension, v.y / dimension));
                }
                geometry.faceVertexUvs[0][i] = uvs;
            }
        }


        function generate_maze_mesh(field) {
            var dummy = new THREE.Geometry();
            exitWallMesh = undefined;
            for (var i = 0; i < field.dimension; i++) {
                for (var j = 0; j < field.dimension; j++) {
                    if (!field[i][j]) {
                        continue;
                    }
                    if (isExitCell(i, j) && !exitGateOpen) {
                        continue;
                    }
                    var geometry = new THREE.CubeGeometry(1, 1, 1, 1, 1, 1);
                    var mesh_ij = new THREE.Mesh(geometry);
                    mesh_ij.position.x = i;
                    mesh_ij.position.y = j;
                    mesh_ij.position.z = 0.5;
                    THREE.GeometryUtils.merge(dummy, mesh_ij);
                }
            }
            applyMazeWallUVs(dummy, field.dimension);
            wallTexture.wrapS = wallTexture.wrapT = THREE.ClampToEdgeWrapping;
            wallTexture.repeat.set(1, 1);
            wallTexture.offset.set(0, 0);
            var material = new THREE.MeshPhongMaterial({ map: wallTexture });
            if (!exitGateOpen && field[getExitCellX()][getExitCellY()]) {
                var exitGeo = new THREE.CubeGeometry(1, 1, 1, 1, 1, 1);
                exitWallMesh = new THREE.Mesh(exitGeo, material);
                exitWallMesh.position.set(getExitCellX(), getExitCellY(), 0.5);
            }
            return new THREE.Mesh(dummy, material);
        }


        function createRenderWorld() {
            scene = new THREE.Scene();
            scene.add(new THREE.AmbientLight(0x999999));

            light = new THREE.PointLight(0xffffff, 1);
            light.position.set(1, 1, 1.3);
            scene.add(light);

            shipGroup = new THREE.Object3D();
            shipGroup.position.set(1, 1, shipRadius);
            scene.add(shipGroup);

            var aspect = window.innerWidth / window.innerHeight;
            camera = new THREE.PerspectiveCamera(60, aspect, 1, 1000);
            camera.position.set(1, 1, 5);

            mazeMesh = generate_maze_mesh(maze);
            scene.add(mazeMesh);
            if (exitWallMesh) {
                scene.add(exitWallMesh);
            }

            g = new THREE.PlaneGeometry(mazeDimension * 10, mazeDimension * 10, mazeDimension, mazeDimension);
            if (!planeTexture || !planeTexture.image || !planeTexture.image.complete) {
                planeTexture = THREE.ImageUtils.loadTexture('/assets/space.jpg', undefined, function () {
                    if (planeTexture) {
                        planeTexture.wrapS = planeTexture.wrapT = THREE.RepeatWrapping;
                        planeTexture.repeat.set(mazeDimension * 5, mazeDimension * 5);
                        planeTexture.needsUpdate = true;
                        if (m && planeMesh) {
                            m.map = planeTexture;
                            m.needsUpdate = true;
                        }
                    }
                });
            }
            planeTexture.wrapS = planeTexture.wrapT = THREE.RepeatWrapping;
            planeTexture.repeat.set(mazeDimension * 5, mazeDimension * 5);
            planeTexture.needsUpdate = true;
            m = new THREE.MeshPhongMaterial({ map: planeTexture, side: THREE.DoubleSide });
            planeMesh = new THREE.Mesh(g, m);
            planeMesh.position.set((mazeDimension - 1) / 2, (mazeDimension - 1) / 2, 0);
            planeMesh.rotation.set(Math.PI / 2, 0, 0);
            scene.add(planeMesh);

            createCollectibleMarkers();
        }


        function updatePhysicsWorld() {
            var lv = wBall.GetLinearVelocity();
            lv.Multiply(0.95);
            wBall.SetLinearVelocity(lv);

            var moveX = keyAxis[0];
            var moveY = keyAxis[1];
            var joy = Joystick.getAxis();
            if (Math.abs(joy[0]) > 0.02 || Math.abs(joy[1]) > 0.02) {
                moveX = joy[0];
                moveY = joy[1];
            }

            var f = new b2Vec2(moveX * wBall.GetMass() * 0.25, moveY * wBall.GetMass() * 0.25);
            wBall.ApplyImpulse(f, wBall.GetPosition());
            keyAxis = [0, 0];

            wWorld.Step(1 / 60, 8, 3);
        }


        function updateRenderWorld() {
            if (!shipGroup || !wBall) {
                return;
            }

            var stepX = wBall.GetPosition().x - shipGroup.position.x;
            var stepY = wBall.GetPosition().y - shipGroup.position.y;
            shipGroup.position.x += stepX;
            shipGroup.position.y += stepY;

            var t = Date.now() / 1000;
            var hover = Math.sin(t * 3.2) * shipRadius * 0.14;
            var flutter = Math.sin(t * 11) * shipRadius * 0.03;
            shipGroup.position.z = shipRadius + hover + flutter;

            var vel = wBall.GetLinearVelocity();
            var speed = vel.Length();
            var heading = speed > 0.04 ? Math.atan2(vel.y, -vel.x) - Math.PI / 2 : shipLastHeading;
            var turnDelta = 0;
            if (speed > 0.04) {
                turnDelta = heading - shipLastHeading;
                while (turnDelta > Math.PI) { turnDelta -= Math.PI * 2; }
                while (turnDelta < -Math.PI) { turnDelta += Math.PI * 2; }
                shipLastHeading = heading;
            }

            var bank = Math.max(-0.22, Math.min(0.22, -turnDelta * 1.5));
            shipDisplayHeading = heading + bank + Math.sin(t * 2.5) * 0.04;

            camera.position.x += (shipGroup.position.x - camera.position.x) * 0.1;
            camera.position.y += (shipGroup.position.y - camera.position.y) * 0.1;
            camera.position.z += (5 - camera.position.z) * 0.1;
            light.position.x = camera.position.x;
            light.position.y = camera.position.y;
            light.position.z = camera.position.z - 3.7;

            updateShipMarker();
        }


        function gameLoop() {
            switch (gameState) {

                case 'intro':
                case 'lobby':
                    break;

                case 'initialize':
                    buildMazeLayout();
                    shipLastHeading = 0;
                    createPhysicsWorld();
                    createRenderWorld();
                    camera.position.set(1, 1, 5);
                    light.position.set(1, 1, 1.3);
                    light.intensity = 0;
                    updateCollectibleCounter();
                    gameState = 'fade in';
                    break;

                case 'fade in':
                    light.intensity += 0.1 * (1.0 - light.intensity);
                    updateCollectibleMarkers();
                    updateShipMarker();
                    updateExitMarker();
                    renderer.render(scene, camera);
                    if (Math.abs(light.intensity - 1.0) < 0.05) {
                        light.intensity = 1.0;
                        Joystick.show();
                        gameState = 'play';
                    }
                    break;

                case 'play':
                    updatePhysicsWorld();
                    updateRenderWorld();
                    updateCollectibleMarkers();
                    updateExitMarker();
                    checkCollectibles();
                    renderer.render(scene, camera);

                    if (!shipGroup) {
                        break;
                    }
                    var mazeX = Math.floor(shipGroup.position.x + 0.5);
                    var mazeY = Math.floor(shipGroup.position.y + 0.5);
                    if (mazeX == mazeDimension && mazeY == mazeDimension - 2) {
                        if (collectedCount === COLLECTIBLE_COUNT && exitGateOpen) {
                            mazeEndTime = Date.now();
                            mazeComplete = true;
                            if (isMultiplayer) {
                                Multiplayer.reportMazeComplete(mazeEndTime - mazeStartTime);
                            }
                            gameState = 'fade out';
                        }
                    }
                    break;

                case 'fade out':
                    updatePhysicsWorld();
                    updateRenderWorld();
                    updateCollectibleMarkers();
                    light.intensity += 0.1 * (0.0 - light.intensity);
                    renderer.render(scene, camera);
                    if (Math.abs(light.intensity - 0.0) < 0.1) {
                        light.intensity = 0.0;
                        renderer.render(scene, camera);
                        if (mazeComplete) {
                            renderer.domElement.style.display = 'none';
                            Joystick.hide();
                            $('#collectible-counter').hide();
                            $('#collectible-markers').hide();
                            $('#ship-marker').hide();
                            $('#ship-shadow').hide();
                            $('#ship-engine-glow').hide();
                            $('#exit-hint').hide().removeClass('exit-hint--success');
                            $('#exit-marker').hide();
                            $('#help').hide();
                            var mazeElapsed = mazeEndTime - mazeStartTime;
                            var seed = isMultiplayer ? Multiplayer.getPuzzleSeed() : null;
                            Puzzle.init(function (puzzleElapsed) {
                                showEndScreen(mazeElapsed, puzzleElapsed);
                                gameState = 'end';
                            }, seed);
                            gameState = 'puzzle';
                        } else {
                            gameState = 'initialize';
                        }
                    }
                    break;

                case 'puzzle':
                    break;

                case 'end':
                    break;
            }

            requestAnimationFrame(gameLoop);
        }


        function onResize() {
            renderer.setSize(window.innerWidth, window.innerHeight);
            if (camera) {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
            }
        }


        function onMoveKey(axis) {
            if (gameState === 'play') {
                keyAxis = axis.slice(0);
            }
        }


        jQuery.fn.center = function () {
            var wh = window.innerHeight;
            var ww = window.innerWidth;
            var h = this.outerHeight();
            var w = this.outerWidth();
            this.css({
                position: 'fixed',
                top: Math.max(0, (wh - h) / 2) + 'px',
                left: Math.max(0, (ww - w) / 2) + 'px'
            });
            return this;
        };


        $(document).ready(function () {
            $('#instructions').center();
            $('#instructions').hide();
            KeyboardJS.bind.key('i', function () { $('#instructions').show(); },
                function () { $('#instructions').hide(); });

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.domElement.style.position = 'fixed';
            renderer.domElement.style.top = '0';
            renderer.domElement.style.left = '0';
            renderer.domElement.style.zIndex = '0';
            renderer.domElement.style.touchAction = 'none';
            renderer.domElement.style.pointerEvents = 'none';
            renderer.domElement.addEventListener('webglcontextlost', function (e) {
                e.preventDefault();
            }, false);
            document.body.appendChild(renderer.domElement);

            $('#joystick').appendTo('body');
            Joystick.init();

            KeyboardJS.bind.axis('left', 'right', 'down', 'up', onMoveKey);
            KeyboardJS.bind.axis('h', 'l', 'j', 'k', onMoveKey);
            $(window).resize(onResize);

            $('#start-button').on('click', startSinglePlayerGame);
            $('#join-race-button').on('click', function () {
                $('#intro-screen').hide();
                $('#lobby-screen').css('display', 'flex');
                gameState = 'lobby';
                var saved = localStorage.getItem('mattieRunPlayerName');
                if (saved) {
                    $('#player-name-input').val(saved);
                }
            });
            $('#lobby-back-button').on('click', function () {
                if (isInMultiplayerSession()) {
                    requestMultiplayerExit();
                    return;
                }
                $('#lobby-screen').hide();
                $('#lobby-error').hide();
                $('#intro-screen').show();
                gameState = 'intro';
            });
            $('#lobby-join-button').on('click', function () {
                var name = $('#player-name-input').val().trim();
                var code = $('#room-code-input').val().trim().toUpperCase();
                if (!name) {
                    $('#lobby-error').text('Enter your name.').show();
                    return;
                }
                if (!code) {
                    $('#lobby-error').text('Enter the room code.').show();
                    return;
                }
                localStorage.setItem('mattieRunPlayerName', name);
                $('#lobby-error').hide();
                $('#lobby-join-button').prop('disabled', true);
                Multiplayer.connectAndJoin(code, name, {
                    onJoined: function (data) {
                        multiplayerRoomJoined = true;
                        $('#lobby-join-form').hide();
                        $('#lobby-waiting').show();
                        $('#lobby-room-code').text(code);
                        var count = data.playerCount || 0;
                        var limit = data.playerLimit || count;
                        $('#lobby-player-count').text(count + ' / ' + limit + ' players in room');
                    },
                    onCountdown: function (data) {
                        $('#lobby-screen').hide();
                        showCountdownThenStart(data.startAt, data.puzzleSeed);
                    },
                    onError: function (msg) {
                        $('#lobby-error').text(msg).show();
                        $('#lobby-join-button').prop('disabled', false);
                        multiplayerRoomJoined = false;
                    }
                });
            });
            $('#play-again-button').on('click', resetGame);
            $('#quit-room-button').on('click', requestMultiplayerExit);
            $('#exit-warning-cancel').on('click', hideExitWarning);
            $('#exit-warning-confirm').on('click', function () {
                var callback = pendingExitCallback;
                hideExitWarning();
                if (callback) {
                    callback();
                }
            });

            $(window).on('beforeunload', function (e) {
                if (isInMultiplayerSession() && !exitWarningVisible) {
                    var message = 'Leaving will reset host progress for this room.';
                    e.preventDefault();
                    e.returnValue = message;
                    return message;
                }
            });

            var gameMode = (typeof window !== 'undefined' && window.__MATTIE_RUN_GAME_MODE__) || 'multiplayer';
            if (gameMode === 'multiplayer') {
                history.pushState({ mattieRunRoom: true }, '', window.location.href);
                window.addEventListener('popstate', function () {
                    if (isInMultiplayerSession()) {
                        history.pushState({ mattieRunRoom: true }, '', window.location.href);
                        requestMultiplayerExit();
                    }
                });
                $('#start-button').hide();
                $('#join-race-button').show();
            } else {
                $('#join-race-button').hide();
                $('#start-button').show();
            }

            $('#exit-warning-screen').hide();
            updateEndScreenButtons();

            $('#collectible-counter').hide();
            $('#collectible-markers').hide();
            $('#ship-marker').hide();
            $('#ship-shadow').hide();
            $('#ship-engine-glow').hide();
            $('#puzzle-screen').hide();
            $('#end-screen').hide();
            $('#exit-hint').hide().removeClass('exit-hint--success');
            $('#exit-marker').hide();
            Joystick.hide();

            gameState = 'intro';
            requestAnimationFrame(gameLoop);
        });

