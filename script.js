// ============================================
//  🐍 3D SNAKE GAME - Three.js
//  Full responsive + cursor control
// ============================================

// ---- Config ----
const GRID_SIZE = 15;
const CELL_SIZE = 1;
const SPEED_MS = 200;
const HALF = (GRID_SIZE * CELL_SIZE) / 2;

// ---- State ----
let scene, camera, renderer;
let snake = [];
let direction = { x: 1, z: 0 };
let nextDirection = { x: 1, z: 0 };
let food = { x: 0, z: 0 };
let score = 0;
let best = parseInt(localStorage.getItem('snake3d_best') || '0');
let running = false;
let gameLoop = null;
let snakeGroup;
let foodMesh;
let snakeMat, headMat, foodMat;

// Cursor control state
let cursorTarget = null;       // world position ng mouse/touch
let cursorPlane = null;        // invisible plane for raycasting
let raycaster = null;
let pointerActive = false;

// ---- DOM ----
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const finalBestEl = document.getElementById('finalBest');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

bestEl.textContent = best;

// ============================================
//  INIT THREE.JS SCENE
// ============================================
function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e27);
    scene.fog = new THREE.Fog(0x0a0e27, 20, 45);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
    updateCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x00ffc8, 0.8, 30);
    pointLight.position.set(-5, 10, -5);
    scene.add(pointLight);

    // Materials
    snakeMat = new THREE.MeshStandardMaterial({
        color: 0x00ffc8,
        emissive: 0x008866,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.6,
    });

    headMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x00ffc8,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.8,
    });

    foodMat = new THREE.MeshStandardMaterial({
        color: 0xff00e5,
        emissive: 0xff00e5,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.5,
    });

    // Ground
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * CELL_SIZE + 4, GRID_SIZE * CELL_SIZE + 4);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x111633,
        roughness: 0.9,
        metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const gridMat = new THREE.LineBasicMaterial({ color: 0x00ffc8, opacity: 0.25, transparent: true });
    for (let i = 0; i <= GRID_SIZE; i++) {
        const p = -HALF + i * CELL_SIZE;
        const g1 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p, -0.49, -HALF),
            new THREE.Vector3(p, -0.49, HALF),
        ]);
        const g2 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-HALF, -0.49, p),
            new THREE.Vector3(HALF, -0.49, p),
        ]);
        scene.add(new THREE.Line(g1, gridMat));
        scene.add(new THREE.Line(g2, gridMat));
    }

    // Border walls
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x00ffc8,
        emissive: 0x00ffc8,
        emissiveIntensity: 1.5,
    });
    const wallH = 0.4, wallT = 0.15;
    const size = GRID_SIZE * CELL_SIZE;
    const walls = [
        { geo: new THREE.BoxGeometry(size + wallT * 2, wallH, wallT), pos: [0, 0, HALF] },
        { geo: new THREE.BoxGeometry(size + wallT * 2, wallH, wallT), pos: [0, 0, -HALF] },
        { geo: new THREE.BoxGeometry(wallT, wallH, size + wallT * 2), pos: [HALF, 0, 0] },
        { geo: new THREE.BoxGeometry(wallT, wallH, size + wallT * 2), pos: [-HALF, 0, 0] },
    ];
    walls.forEach(w => {
        const m = new THREE.Mesh(w.geo, wallMat);
        m.position.set(...w.pos);
        scene.add(m);
    });

    // Snake group
    snakeGroup = new THREE.Group();
    scene.add(snakeGroup);

    // Food
    const foodGeo = new THREE.IcosahedronGeometry(0.4, 0);
    foodMesh = new THREE.Mesh(foodGeo, foodMat);
    foodMesh.castShadow = true;
    scene.add(foodMesh);

    // Raycaster setup for cursor control
    raycaster = new THREE.Raycaster();
    cursorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0 plane

    window.addEventListener('resize', onResize);
    animate();
}

function updateCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;

    // Responsive distance — mas malayo sa mobile para kasya yung buong board
    let dist;
    if (aspect < 0.6) dist = 30;   // portrait phone
    else if (aspect < 1) dist = 26;   // small tablets
    else if (aspect < 1.5) dist = 22;   // square
    else dist = 20;   // landscape desktop

    camera.position.set(dist * 0.7, dist * 0.9, dist * 0.7);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
}

function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    updateCamera();
}

// ============================================
//  GAME LOGIC
// ============================================
function gridToWorld(gx, gz) {
    return {
        x: -HALF + gx * CELL_SIZE + CELL_SIZE / 2,
        z: -HALF + gz * CELL_SIZE + CELL_SIZE / 2,
    };
}

function worldToGrid(wx, wz) {
    return {
        x: Math.floor((wx + HALF) / CELL_SIZE),
        z: Math.floor((wz + HALF) / CELL_SIZE),
    };
}

function startGame() {
    snake = [
        { x: 7, z: 7 },
        { x: 6, z: 7 },
        { x: 5, z: 7 },
    ];
    direction = { x: 1, z: 0 };
    nextDirection = { x: 1, z: 0 };
    score = 0;
    scoreEl.textContent = '0';
    running = true;

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    spawnFood();
    rebuildSnake();

    clearInterval(gameLoop);
    gameLoop = setInterval(tick, SPEED_MS);

    if (navigator.vibrate) navigator.vibrate(30);
}

function tick() {
    if (!running) return;

    // Cursor control: kung may pointer target, i-set direction papunta doon
    if (pointerActive && cursorTarget) {
        const head = snake[0];
        const headWorld = gridToWorld(head.x, head.z);
        const dx = cursorTarget.x - headWorld.x;
        const dz = cursorTarget.z - headWorld.z;
        const absX = Math.abs(dx), absZ = Math.abs(dz);

        // Piliin yung dominant axis
        if (absX > 0.3 || absZ > 0.3) {
            let newDir;
            if (absX > absZ) {
                newDir = { x: dx > 0 ? 1 : -1, z: 0 };
            } else {
                newDir = { x: 0, z: dz > 0 ? 1 : -1 };
            }
            // Bawal reverse
            if (!(newDir.x === -direction.x && newDir.z === -direction.z)) {
                nextDirection = newDir;
            }
        }
    }

    direction = nextDirection;

    const head = snake[0];
    const newHead = { x: head.x + direction.x, z: head.z + direction.z };

    // Wall collision
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.z < 0 || newHead.z >= GRID_SIZE) {
        return endGame();
    }

    // Self collision
    for (let i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === newHead.x && snake[i].z === newHead.z) {
            return endGame();
        }
    }

    snake.unshift(newHead);

    if (newHead.x === food.x && newHead.z === food.z) {
        score++;
        scoreEl.textContent = score;
        if (navigator.vibrate) navigator.vibrate(20);
        spawnFood();
        pulseFood();
    } else {
        snake.pop();
    }

    rebuildSnake();
}

function spawnFood() {
    const free = [];
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            if (!snake.some(s => s.x === x && s.z === z)) {
                free.push({ x, z });
            }
        }
    }
    if (free.length === 0) return endGame();
    food = free[Math.floor(Math.random() * free.length)];
    const pos = gridToWorld(food.x, food.z);
    foodMesh.position.set(pos.x, 0.4, pos.z);
}

function rebuildSnake() {
    while (snakeGroup.children.length) {
        const c = snakeGroup.children.pop();
        c.geometry.dispose();
    }

    snake.forEach((seg, i) => {
        const isHead = i === 0;
        const geo = isHead
            ? new THREE.BoxGeometry(0.85, 0.85, 0.85)
            : new THREE.BoxGeometry(0.75, 0.75, 0.75);

        const mesh = new THREE.Mesh(geo, isHead ? headMat : snakeMat);
        const pos = gridToWorld(seg.x, seg.z);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const taper = 1 - (i / (snake.length * 2.5));
        mesh.scale.setScalar(Math.max(0.6, taper));

        snakeGroup.add(mesh);
    });
}

function pulseFood() {
    foodMesh.scale.set(1.5, 1.5, 1.5);
}

function endGame() {
    running = false;
    clearInterval(gameLoop);

    if (score > best) {
        best = score;
        localStorage.setItem('snake3d_best', best);
        bestEl.textContent = best;
    }

    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    gameOverScreen.classList.remove('hidden');

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

// ============================================
//  INPUT
// ============================================
function setDirection(dir) {
    if (!running) return;
    const map = {
        up: { x: 0, z: -1 },
        down: { x: 0, z: 1 },
        left: { x: -1, z: 0 },
        right: { x: 1, z: 0 },
    };
    const d = map[dir];
    if (!d) return;
    if (d.x === -direction.x && d.z === -direction.z) return;
    nextDirection = d;
    pointerActive = false; // keyboard override
}

// Keyboard
document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') setDirection('up');
    if (k === 'arrowdown' || k === 's') setDirection('down');
    if (k === 'arrowleft' || k === 'a') setDirection('left');
    if (k === 'arrowright' || k === 'd') setDirection('right');
    if (k === ' ' && !running) startGame();
});

// ---- CURSOR CONTROL (Desktop) ----
function updateCursorTarget(clientX, clientY) {
    if (!raycaster || !camera) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const point = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(cursorPlane, point);
    if (hit) {
        cursorTarget = point;
        pointerActive = true;
    }
}

// Mouse move over canvas
renderer_domReady();
function renderer_domReady() {
    // We need to attach after renderer is created — defer
    setTimeout(() => {
        if (!renderer) return;
        renderer.domElement.addEventListener('mousemove', (e) => {
            if (running) updateCursorTarget(e.clientX, e.clientY);
        });
        renderer.domElement.addEventListener('mouseleave', () => {
            pointerActive = false;
            cursorTarget = null;
        });
    }, 100);
}

// Touch drag (for phones — pero may D-Pad naman, optional support)
document.addEventListener('touchstart', (e) => {
    if (!running) return;
    // Kung D-Pad ang na-touch, wag i-update yung cursor
    if (e.target.closest('.dpad')) return;
    if (e.touches.length === 1) {
        updateCursorTarget(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!running) return;
    if (e.target.closest('.dpad')) return;
    if (e.touches.length === 1) {
        updateCursorTarget(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: true });

// D-Pad
document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDirection(btn.dataset.dir);
    });
});

// Buttons
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// ============================================
//  ANIMATION LOOP
// ============================================
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (foodMesh) {
        foodMesh.rotation.y = t * 2;
        foodMesh.rotation.x = t * 1.5;
        const bob = Math.sin(t * 4) * 0.15 + 0.4;
        foodMesh.position.y = bob;
        foodMesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
    }

    renderer.render(scene, camera);
}

// ============================================
//  BOOT
// ============================================
initThree();