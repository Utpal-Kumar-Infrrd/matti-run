
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
            planeTexture = THREE.ImageUtils.loadTexture('/concrete.png'),
            wallTexture = THREE.ImageUtils.loadTexture('/assets/wall.png'),
            gameState = undefined,
            collectibles = [],
            collectedCount = 0,
            mazeStartTime = 0,
            mazeEndTime = 0,
            mazeComplete = false,
            exitHintTimeout = undefined,
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
            lastReportedCollectibles = -1;


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
            maze[mazeDimension - 1][mazeDimension - 2] = false;
            placeCollectibles(rng);
        }


        function placeCollectibles(rng) {
            var cells = getWalkableCells(maze);
            var excluded = {};
            excluded['1,1'] = true;
            excluded[(mazeDimension - 1) + ',' + (mazeDimension - 2)] = true;
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
            return Math.max(12, getShipPixelSize() * COLLECTIBLE_PIXEL_SCALE);
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
            var headingDeg = shipDisplayHeading * 180 / Math.PI;
            var speed = wBall ? wBall.GetLinearVelocity().Length() : 0;
            var thrust = Math.min(speed / 1.5, 1);

            marker.css({
                left: (screen.x - sizePx / 2) + 'px',
                top: (screen.y - heightPx / 2 - hoverPx) + 'px',
                width: sizePx + 'px',
                height: heightPx + 'px',
                transform: 'rotate(' + headingDeg + 'deg)'
            }).toggleClass('ship-thrusting', speed > 0.03).show();

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

            if (speed > 0.03) {
                var glowW = sizePx * (0.3 + thrust * 0.2);
                var glowH = glowW * 0.65;
                glow.css({
                    left: (screen.x - glowW / 2) + 'px',
                    top: (screen.y - heightPx / 2 - hoverPx + heightPx * 0.38) + 'px',
                    width: glowW + 'px',
                    height: glowH + 'px',
                    opacity: 0.4 + thrust * 0.5,
                    transform: 'rotate(' + headingDeg + 'deg) scale(' + (0.9 + thrust * 0.35) + ')'
                }).show();
            } else {
                glow.hide();
            }
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
                        reportMultiplayerProgress(true);
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
            $('#end-screen').show();
        }




        function getMazeElapsedMs() {
            if (!mazeStartTime) {
                return 0;
            }
            var end = mazeEndTime || Date.now();
            return Math.max(0, end - mazeStartTime);
        }


        function getPuzzleElapsedMs() {
            var start = Puzzle.getPuzzleStartTime ? Puzzle.getPuzzleStartTime() : 0;
            if (!start) {
                return 0;
            }
            return Math.max(0, Date.now() - start);
        }


        function buildProgressState() {
            var mazePassed = mazeComplete;
            var puzzleSolved = gameState === 'end';
            return {
                collectedCount: collectedCount,
                mazePassed: mazePassed,
                puzzleSolved: puzzleSolved,
                mazeMs: getMazeElapsedMs(),
                puzzleMs: gameState === 'puzzle' || gameState === 'end' ? getPuzzleElapsedMs() : 0
            };
        }


        function reportMultiplayerProgress(force) {
            if (!isMultiplayer) {
                return;
            }
            Multiplayer.reportProgress(buildProgressState(), force);
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
            Puzzle.reset();
            Joystick.hide();
            $('#end-screen').hide();
            $('#countdown-screen').hide();
            if (isMultiplayer) {
                Multiplayer.disconnect();
                isMultiplayer = false;
                $('#collectible-counter').hide();
                $('#collectible-markers').hide().empty();
                $('#collect-effects').empty();
                $('#ship-marker').hide();
                $('#ship-shadow').hide();
                $('#ship-engine-glow').hide();
                $('#exit-hint').hide();
                $('#help').show();
                    renderer.domElement.style.display = 'block';
                collectedCount = 0;
                collectibles = [];
                mazeComplete = false;
                mazeStartTime = 0;
                mazeEndTime = 0;
                lastReportedCollectibles = -1;
                $('#lobby-join-form').show();
                $('#lobby-waiting').hide();
                $('#lobby-join-button').prop('disabled', false);
                $('#lobby-screen').css('display', 'flex');
                gameState = 'lobby';
                return;
            }
            $('#intro-screen').show();
            $('#collectible-counter').hide();
            $('#collectible-markers').hide().empty();
            $('#collect-effects').empty();
            $('#ship-marker').hide();
            $('#ship-shadow').hide();
            $('#ship-engine-glow').hide();
            $('#exit-hint').hide();
            $('#help').show();
            renderer.domElement.style.display = 'block';
            collectedCount = 0;
            collectibles = [];
            mazeComplete = false;
            mazeStartTime = 0;
            mazeEndTime = 0;
            lastReportedCollectibles = -1;
            gameState = 'intro';
        }


        function startGameInternal() {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(function () { });
            }
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
            for (var i = 0; i < maze.dimension; i++) {
                for (var j = 0; j < maze.dimension; j++) {
                    if (maze[i][j]) {
                        bodyDef.position.x = i;
                        bodyDef.position.y = j;
                        wWorld.CreateBody(bodyDef).CreateFixture(fixDef);
                    }
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
            for (var i = 0; i < field.dimension; i++) {
                for (var j = 0; j < field.dimension; j++) {
                    if (field[i][j]) {
                        var geometry = new THREE.CubeGeometry(1, 1, 1, 1, 1, 1);
                        var mesh_ij = new THREE.Mesh(geometry);
                        mesh_ij.position.x = i;
                        mesh_ij.position.y = j;
                        mesh_ij.position.z = 0.5;
                        THREE.GeometryUtils.merge(dummy, mesh_ij);
                    }
                }
            }
            applyMazeWallUVs(dummy, field.dimension);
            wallTexture.wrapS = wallTexture.wrapT = THREE.ClampToEdgeWrapping;
            wallTexture.repeat.set(1, 1);
            wallTexture.offset.set(0, 0);
            var material = new THREE.MeshPhongMaterial({ map: wallTexture });
            return new THREE.Mesh(dummy, material);
        }


        function createRenderWorld() {
            scene = new THREE.Scene();
            scene.add(new THREE.AmbientLight(0x666666));

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

            g = new THREE.PlaneGeometry(mazeDimension * 10, mazeDimension * 10, mazeDimension, mazeDimension);
            planeTexture.wrapS = planeTexture.wrapT = THREE.RepeatWrapping;
            planeTexture.repeat.set(mazeDimension * 5, mazeDimension * 5);
            m = new THREE.MeshPhongMaterial({ map: planeTexture });
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
            var heading = speed > 0.04 ? Math.atan2(vel.y, vel.x) - Math.PI / 2 : shipLastHeading;
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
                    checkCollectibles();
                    reportMultiplayerProgress(false);
                    renderer.render(scene, camera);

                    if (!shipGroup) {
                        break;
                    }
                    var mazeX = Math.floor(shipGroup.position.x + 0.5);
                    var mazeY = Math.floor(shipGroup.position.y + 0.5);
                    if (mazeX == mazeDimension && mazeY == mazeDimension - 2) {
                        if (collectedCount === COLLECTIBLE_COUNT) {
                            mazeEndTime = Date.now();
                            mazeComplete = true;
                            reportMultiplayerProgress(true);
                            gameState = 'fade out';
                        } else {
                            $('#exit-hint').show();
                            clearTimeout(exitHintTimeout);
                            exitHintTimeout = setTimeout(function () {
                                $('#exit-hint').hide();
                            }, 2000);
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
                            $('#help').hide();
                            $('#exit-hint').hide();
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
                    reportMultiplayerProgress(false);
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
                var saved = localStorage.getItem('mattiRunPlayerName');
                if (saved) {
                    $('#player-name-input').val(saved);
                }
            });
            $('#lobby-back-button').on('click', function () {
                Multiplayer.disconnect();
                isMultiplayer = false;
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
                localStorage.setItem('mattiRunPlayerName', name);
                $('#lobby-error').hide();
                $('#lobby-join-button').prop('disabled', true);
                Multiplayer.connectAndJoin(code, name, {
                    onJoined: function () {
                        $('#lobby-join-form').hide();
                        $('#lobby-waiting').show();
                        $('#lobby-room-code').text(code);
                    },
                    onRoomUpdated: function (data) {
                        var list = $('#lobby-player-list');
                        list.empty();
                        for (var i = 0; i < data.players.length; i++) {
                            list.append('<li>' + data.players[i].name + '</li>');
                        }
                    },
                    onCountdown: function (data) {
                        $('#lobby-screen').hide();
                        showCountdownThenStart(data.startAt, data.puzzleSeed);
                    },
                    onError: function (msg) {
                        $('#lobby-error').text(msg).show();
                        $('#lobby-join-button').prop('disabled', false);
                    }
                });
            });
            $('#play-again-button').on('click', resetGame);

            $('#collectible-counter').hide();
            $('#collectible-markers').hide();
            $('#ship-marker').hide();
            $('#ship-shadow').hide();
            $('#ship-engine-glow').hide();
            $('#puzzle-screen').hide();
            $('#end-screen').hide();
            $('#exit-hint').hide();
            Joystick.hide();

            gameState = 'intro';
            requestAnimationFrame(gameLoop);
        });

