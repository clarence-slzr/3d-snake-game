// ============================================
//  🐍 3D SNAKE GAME - Three.js
// ============================================

// ---- Config ----
const GRID_SIZE = 15;        // 15x15 grid
const CELL_SIZE = 1;         // world units per cell
const SPEED_MS = 200;        // movement interval (ms)
const HALF = (GRID_SIZE * CELL_SIZE) / 2;

// ---- State ----
let scene, camera, renderer;
let snake = [];              // array of {x, z}
let direction = { x: 1, z: 0 };
let nextDirection = { x: 1, z: 0 };
let food = { x: 0, z: 0 };
let score = 0;
let best = parseInt(localStorage.getItem('snake3d_best') || '0');
let running = false;
let gameLoop = null;
let snakeGroup;              // group holding all snake meshes
let foodMesh;

// Materials (reused)
let snakeMat, headMat, foodMat;
let gridGroup;

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

    // Camera (isometric-ish, tilt down)
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
    updateCamera();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

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

    // Ground plane
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

    // Grid lines
    gridGroup = new THREE.Group();
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
        gridGroup.add(new THREE.Line(g1, gridMat));
        gridGroup.add(new THREE.Line(g2, gridMat));
    }
    scene.add(gridGroup);

    // Border walls (glowing)
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x00ffc8,
        emissive: 0x00ffc8,
        emissiveIntensity: 1.5,
    });
    const wallH = 0.4;
    const wallT = 0.15;
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

    // Food mesh
    const foodGeo = new THREE.IcosahedronGeometry(0.4, 0);
    foodMesh = new THREE.Mesh(foodGeo, foodMat);
    foodMesh.castShadow = true;
    scene.add(foodMesh);

    // Resize handler
    window.addEventListener('resize', onResize);

    // Animation loop
    animate();
}

function updateCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;

    // Responsive camera distance (para kasya yung buong board kahit maliit screen)
    const dist = aspect < 1 ? 26 : 22;
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

function startGame() {
    // Reset state
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

    // Apply buffered direction
    direction = nextDirection;

    // Compute new head
    const head = snake[0];
    const newHead = { x: head.x + direction.x, z: head.z + direction.z };

    // Wall collision
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.z < 0 || newHead.z >= GRID_SIZE) {
        return endGame();
    }

    // Self collision (ignore tail since it will move)
    for (let i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === newHead.x && snake[i].z === newHead.z) {
            return endGame();
        }
    }

    snake.unshift(newHead);

    // Ate food?
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
    // Clear old meshes
    while (snakeGroup.children.length) {
        const c = snakeGroup.children.pop();
        c.geometry.dispose();
    }

    snake.forEach((seg, i) => {
        const isHead = i === 0;
        const geo = isHead
            ? new THREE.BoxGeometry(0.85, 0.85, 0.85)
            : new THREE.BoxGeometry(0.75, 0.75, 0.75);

        // Rounded look (bevel via scale + extra sphere on top?) — keep simple but shiny
        const mesh = new THREE.Mesh(geo, isHead ? headMat : snakeMat);
        const pos = gridToWorld(seg.x, seg.z);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Slight scale-down for tail taper
        const taper = 1 - (i / (snake.length * 2.5));
        mesh.scale.setScalar(Math.max(0.6, taper));

        snakeGroup.add(mesh);
    });
}

function pulseFood() {
    // simple bounce effect
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
    // Prevent 180° reverse
    if (d.x === -direction.x && d.z === -direction.z) return;
    nextDirection = d;
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

// D-Pad
document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setDirection(btn.dataset.dir);
    });
});

// Touch swipe
let touchStart = null;
document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absX = Math.abs(dx), absY = Math.abs(dy);

    if (Math.max(absX, absY) < 30) return; // ignore small taps

    if (absX > absY) {
        setDirection(dx > 0 ? 'right' : 'left');
    } else {
        setDirection(dy > 0 ? 'down' : 'up');
    }
    touchStart = null;
}, { passive: true });

// Buttons
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// ============================================
//  ANIMATION LOOP
// ============================================
let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Rotate & bob the food
    if (foodMesh) {
        foodMesh.rotation.y = t * 2;
        foodMesh.rotation.x = t * 1.5;
        const bob = Math.sin(t * 4) * 0.15 + 0.4;
        foodMesh.position.y = bob;
        // Smoothly shrink back after pulse
        foodMesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
    }

    // Gently rotate camera sa maliit na angle for life
    // (very subtle, para hindi nakakalito)
    // camera.rotation.y = Math.sin(t * 0.2) * 0.05;

    renderer.render(scene, camera);
}

// ============================================
//  BOOT
// ============================================
initThree();