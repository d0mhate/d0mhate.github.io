(function() {
    // режим: чередуем сферу и матрицу
    let modeSwitch = "sphere";
    const modeKey = "lastMode";
    try {
        const last = localStorage.getItem(modeKey);
        modeSwitch = last === "sphere" ? "matrix" : "sphere";
        localStorage.setItem(modeKey, modeSwitch);
    } catch (e) {
        modeSwitch = modeSwitch === "sphere" ? "matrix" : "sphere";
    }
    if (modeSwitch === "matrix") {
        runMatrix();
        return;
    }

    // ---- SHADERS ----
    const matrixCanvasExisting = document.getElementById("matrix");
    if (matrixCanvasExisting) matrixCanvasExisting.style.display = "none";
    const unameExisting = document.querySelector(".username-container");
    if (unameExisting) unameExisting.style.display = "none";
    const vertexShader = /* glsl */`
        uniform float uTime;
        uniform float uRadius;
        uniform float uNoiseAmp;
        uniform float uNoiseFreq1;
        uniform float uNoiseFreq2;
        uniform float uViscosity;
        uniform float uFlowStrength;
        uniform float uFlowSpeed;
        uniform float uFlowToImpact;
        uniform float uStreamTime;
        uniform float uStreamStrength;
        uniform vec3  uStreamPole;
        uniform float uImpactTime;
        uniform float uImpactStrength;
        uniform vec3  uImpactDir;
        uniform int uMode;
        uniform int uImpactType;
        uniform float uEnergy;
        uniform float uIrritation;
        attribute float aChar;
        varying float vChar;

        varying float vNoise;
        varying float vImpact;
        varying float vCrest;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v){
            const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 =   v - i + dot(i, C.xxx) ;

            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );

            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;

            i = mod289(i);
            vec4 p = permute( permute( permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                      + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

            float n_ = 0.142857142857;
            vec3  ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);

            vec4 norm = taylorInvSqrt(vec4(
                dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)
            ));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            vec4 m = max(0.6 - vec4(
                dot(x0,x0), dot(x1,x1),
                dot(x2,x2), dot(x3,x3)
            ), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(
                dot(p0,x0), dot(p1,x1),
                dot(p2,x2), dot(p3,x3)
            ));
        }

        // ориентировочный curl-шум для тангенциального сдвига точек
        vec3 curlNoise(vec3 p) {
            float e = 0.15;
            vec3 dx = vec3(e, 0.0, 0.0);
            vec3 dy = vec3(0.0, e, 0.0);
            vec3 dz = vec3(0.0, 0.0, e);

            float x1 = snoise(p + dy);
            float x2 = snoise(p - dy);
            float y1 = snoise(p + dz);
            float y2 = snoise(p - dz);
            float z1 = snoise(p + dx);
            float z2 = snoise(p - dx);

            float x = y1 - y2 - (z1 - z2);
            float y = z1 - z2 - (x1 - x2);
            float z = x1 - x2 - (y1 - y2);

            return normalize(vec3(x, y, z) / (2.0 * e + 1e-5));
        }

        void main() {
            vec3 dir = normalize(position);

            // тангенциальный поток по поверхности (как течение)
            vec3 curlP = dir * 1.8 + vec3(0.0, 0.0, uTime * uFlowSpeed);
            vec3 curl = curlNoise(curlP);
            // проекция на касательную плоскость
            vec3 tangential = curl - dir * dot(curl, dir);
            float tangentialLen = length(tangential);
            vec3 flowDir = normalize(tangential + 1e-5);
            float flowPulse = 0.6 + 0.4 * sin(uTime * 1.5 + tangentialLen * 4.0);
            float flowAmount = uFlowStrength * flowPulse * (0.4 + tangentialLen);
            // подтягиваем поток в сторону последнего удара
            vec3 impactDir = normalize(uImpactDir);
            float hemi = clamp(dot(impactDir, dir) * 0.5 + 0.5, 0.0, 1.0);
            float flowToImpact = uFlowToImpact * pow(hemi, 4.0); // сильно локализуем приток
            vec3 impactPull = normalize(impactDir - dir * dot(impactDir, dir) + 1e-5);
            dir = normalize(dir + flowDir * flowAmount + impactPull * flowToImpact * 0.45);

            // редкие «струи», стекающие с выбранного полюса вниз
            float streamDisp = 0.0;
            if (uStreamStrength > 0.001) {
                float sdt = uTime - uStreamTime;
                if (sdt >= 0.0) {
                    float life = 9.0;
                    float fade = exp(-sdt / life);
                    float progress = sdt * 0.48; // скорость сползания (в радианах по сфере)

                    vec3 pole = normalize(uStreamPole);
                    vec3 up = (abs(pole.y) > 0.8) ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
                    vec3 right = normalize(cross(pole, up));
                    vec3 forward = normalize(cross(right, pole));

                    float ang = acos(clamp(dot(dir, pole), -1.0, 1.0));
                    float az = atan(dot(dir, right), dot(dir, forward)); // 0 = меридиан струи

                    float band = exp(-pow(ang - progress, 2.0) * 70.0);  // узкая лента по углу
                    float thin = exp(-pow(az, 2.0) * 28.0);              // узкая по ширине
                    float streamMask = band * thin * fade;

                    // смещение вдоль меридиана «вниз» от полюса
                    vec3 meridian = normalize(dir - pole * dot(dir, pole));
                    dir = normalize(dir - meridian * streamMask * 0.6);
                    streamDisp = streamMask * uStreamStrength;
                }
            }

            // базовый мягкий шум
            float n1 = snoise(dir * uNoiseFreq1 + vec3(0.0, 0.0, uTime * 0.5));
            // более мелкая «текущая» детализация
            float n2 = snoise(dir * uNoiseFreq2 + vec3(uTime * 0.8, 0.0, 0.0));
            // волна, которая как бы «проходит» по сфере
            float band = sin(uTime * 1.2 + dot(dir, vec3(0.0, 1.0, 0.0)) * 8.0);

            // комбинируем: база + живая бегущая структура
            float combined = n1 * 0.7 + n2 * 0.3 * band;
            // вязкость: замедленное догоняющее смещение
            float lagged = snoise(dir * uNoiseFreq1 + vec3(0.0, 0.0, (uTime - 0.8) * 0.35));
            float viscousNoise = mix(combined, lagged, clamp(uViscosity, 0.0, 1.0));
            vNoise = viscousNoise;
            vCrest = smoothstep(0.4, 0.75, viscousNoise);
            vChar = aChar;

            // --- эффект «прокола» / импульса (жидкая деформация) ---
            float impact = 0.0;
            float dt = uTime - uImpactTime;

            if (dt > 0.0) {
                // сколько времени прошло с момента удара
                float life = dt;

                // частота осцилляций в зависимости от режима
                float freq = (uMode == 1) ? 6.0 : 3.0;        // в злом режиме дрожит чаще
                float decay = (uMode == 1) ? 1.0 : 1.2;       // чуть дольше держится
                // вязкость растягивает затухание и понижает частоту
                float viscK = clamp(uViscosity, 0.0, 1.0);
                decay *= mix(1.0, 1.85, viscK);
                freq = mix(freq, freq * 0.7, viscK);
                // специальные формы для редких «обвалов» и широких колец
                if (uImpactType == 1) { // обвал
                    freq = 5.0;
                    decay = 2.0;
                } else if (uImpactType == 2) { // большое кольцо
                    freq = 2.4;
                    decay = 1.8;
                }
                float temporal = exp(-life / decay) * sin(life * freq);

                // угол между направлением точки и направлением «прокола»
                float cosAngle = clamp(dot(dir, normalize(uImpactDir)), -1.0, 1.0);
                float ang = acos(cosAngle); // 0 в центре удара

                // параметры формы волны
                float speed      = (uMode == 1) ? 3.0 : 2.0;   // скорость фронта волны
                float centerK    = (uMode == 1) ? 18.0 : 10.0; // резкость центрального прогиба
                float ringK      = (uMode == 1) ? 16.0 : 8.0;  // резкость кольца
                if (uImpactType == 1) { // обвал — резче в центре
                    speed = 2.3;
                    centerK = 26.0;
                    ringK = 18.0;
                } else if (uImpactType == 2) { // большая кольцевая волна — растягиваем кольцо
                    speed = 1.2;
                    centerK = 6.0;
                    ringK = 5.0;
                }

                // фронт волны, который расширяется по сфере
                float waveFront = life * speed;
                float diff = ang - waveFront;

                // кольцевая волна вокруг точки удара
                float ring = exp(-diff * diff * ringK);

                // центральный «прогиб» вокруг точки удара
                float center = exp(-ang * ang * centerK);

                // итоговый эффект: центр + кольцо, оба с жидкой осцилляцией
                float shapeBoost = (uImpactType == 1) ? 1.4 : ((uImpactType == 2) ? 1.15 : 1.0);
                impact = (center + ring * 0.8) * temporal * uImpactStrength * shapeBoost;

                vImpact = impact;
            } else {
                vImpact = 0.0;
            }

            // при «проколе» сфера прогибается ВОВНУТРЬ (вычитаем impact)
            float displacement = viscousNoise * uNoiseAmp - impact - streamDisp * 12.0;
            vec3 newPos = dir * (uRadius + displacement);

            vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            float size = 3.2 + combined * 1.1 + impact * 0.6;
            gl_PointSize = size * (220.0 / -mvPosition.z);
        }
    `;

    const fragmentShader = /* glsl */`
        varying float vNoise;
        varying float vImpact;
        uniform float uTime;
        uniform int uMode;
        uniform float uEnergy;
        uniform float uIrritation;
        varying float vCrest;
        varying float vChar;
        uniform sampler2D uAtlas;
        uniform vec2 uAtlasGrid;

        void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;

            float glow = smoothstep(0.5, 0.0, d);

            // нормализуем шум
            float n = vNoise * 0.5 + 0.5;
            // лёгкий пульс по времени — чтобы точки чуть «дышали»
            float pulse = 0.5 + 0.5 * sin(uTime * 1.3 + n * 6.0);

            float intensity = 0.6
                              + (n - 0.5) * 0.2      // небольшая разница по поверхности
                              + (pulse - 0.5) * 0.15      // мягкий временной пульс
                              + abs(vImpact) * 0.25;      // локальное усиление яркости от деформации
            intensity = clamp(intensity, 0.0, 1.0);

            vec3 baseColor;
            // сдвиг цветовой температуры в зависимости от энергии: холоднее при низкой
            float temp = clamp(uEnergy, 0.0, 1.0);
            float coolMix = smoothstep(0.0, 0.4, 1.0 - temp);
            float irrit = clamp(uIrritation, 0.0, 1.0);

            // 0 = спокойный режим
            if (uMode == 0) {
                vec3 calmA = mix(vec3(0.3, 0.35, 0.8), vec3(0.8, 0.28, 0.08), 1.0 - coolMix); // тёплый/холодный
                vec3 calmB = mix(vec3(0.5, 0.65, 1.0), vec3(1.0, 0.45, 0.15), 1.0 - coolMix);
                baseColor = mix(calmA, calmB, intensity);
            }
            // 1 = злой / бурлящий
            else if (uMode == 1) {
                vec3 angryA = mix(vec3(0.25, 0.1, 0.6), vec3(0.55, 0.05, 0.05), 1.0 - coolMix);
                vec3 angryB = mix(vec3(0.4, 0.25, 1.0), vec3(1.0, 0.1, 0.1), 1.0 - coolMix);
                baseColor = mix(angryA, angryB, intensity * 1.3);
            }
            // 2 = хилящийся (светлый, желтоватый)
            else {
                vec3 healA = mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.7, 0.25), 1.0 - coolMix);
                vec3 healB = mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.9, 0.6), 1.0 - coolMix);
                baseColor = mix(healA, healB, intensity);
            }

            // раздражение добавляет красный оттенок и повышает яркость
            vec3 angryTint = vec3(1.0, 0.1, 0.12);
            baseColor = mix(baseColor, angryTint, irrit * 0.7);
            intensity *= (1.0 + irrit * 0.18);

            // доп. эмиссия на гребнях
            float crestGlow = vCrest * 0.35;
            // выбор символа из атласа (матрица)
            float idx = vChar;
            vec2 cell = vec2(mod(idx, uAtlasGrid.x), floor(idx / uAtlasGrid.x));
            vec2 uv = (cell + gl_PointCoord) / uAtlasGrid;
            float glyph = texture2D(uAtlas, uv).r;
            if (glyph < 0.2) discard;

            vec3 color = baseColor * glow * (1.35 + crestGlow) * glyph;

            gl_FragColor = vec4(color, glow * glyph);
        }
    `;

    // ---- THREE.JS ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 230;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.classList.add("three-canvas");
    document.body.appendChild(renderer.domElement);

    const radius = 80;
    const pointsGeom = new THREE.BufferGeometry();

    const particles = 60000; // количество точек
    const positions = new Float32Array(particles * 3);
    const charIndices = new Float32Array(particles);
    const charSet = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789";
    const atlasGridSize = 16.0; // 16x16 ячеек

    const goldenAngle = Math.PI * (3.0 - Math.sqrt(5.0));

    for (let i = 0; i < particles; i++) {
        const t = (i + 0.5) / particles;
        const phi = Math.acos(1.0 - 2.0 * t);
        const theta = goldenAngle * i;

        const x = radius * Math.cos(theta) * Math.sin(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(phi);

        const j = i * 3;
        positions[j]     = x;
        positions[j + 1] = y;
        positions[j + 2] = z;
        charIndices[i] = Math.floor(Math.random() * charSet.length);
    }

    pointsGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const charAttr = new THREE.BufferAttribute(charIndices, 1);
    pointsGeom.setAttribute("aChar", charAttr);

    function createAtlasTexture() {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const cell = size / atlasGridSize;
        ctx.font = `${cell * 0.8}px monospace`;
        for (let i = 0; i < atlasGridSize * atlasGridSize; i++) {
            const ch = charSet[i % charSet.length];
            const cx = (i % atlasGridSize) * cell + cell / 2;
            const cy = Math.floor(i / atlasGridSize) * cell + cell / 2 + cell * 0.08;
            ctx.fillText(ch, cx, cy);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }
    const atlasTexture = createAtlasTexture();

    // мысли (были команды внутри сферы) убраны

    const uniforms = {
        uTime:            { value: 0 },
        uRadius:          { value: radius },
        // волны выразительнее (больше амплитуда)
        uNoiseAmp:        { value: 12.0 },
        uNoiseFreq1:      { value: 3.0 },
        uNoiseFreq2:      { value: 8.0 },
        uViscosity:       { value: 0.65 },
        uFlowStrength:    { value: 0.3 },
        uFlowSpeed:       { value: 0.6 },
        uFlowToImpact:    { value: 0.0 },
        uStreamTime:      { value: -100.0 },
        uStreamStrength:  { value: 0.0 },
        uStreamPole:      { value: new THREE.Vector3(0, 1, 0) },
        // параметры «прокола» сферы
        uImpactTime:      { value: -100.0 },
        uImpactStrength:  { value: 0.0 },
        uImpactDir:       { value: new THREE.Vector3(0, 1, 0) },
        uImpactType:      { value: 0 },
        uMode:            { value: 0 },
        uEnergy:          { value: 1.0 },
        uIrritation:      { value: 0.0 },
        uAtlas:           { value: atlasTexture },
        uAtlasGrid:       { value: new THREE.Vector2(atlasGridSize, atlasGridSize) }
    };

    const pointsMat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const points = new THREE.Points(pointsGeom, pointsMat);
    scene.add(points);

    // Невидимая сфера для определения клика по сфере
    const hitSphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 32, 32),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    scene.add(hitSphere);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const clickImpactDir = new THREE.Vector3();
    let clickImpactPending = false;
    let lastClickTime = 0;
    const clickCooldown = 400; // мс задержка между кликами

    let mode = 0;          // 0 — спокойный, 1 — злой, 2 — хилящийся
    let energy = 1.0;      // «энергия» сферы (0..1)
    let irritation = 0.0;  // раздражение от сильных ударов (0..1)

    let lastImpactTime = -100;
    let lastModeChangeTime = 0;
    const clock = new THREE.Clock();

    // плавно блуждающие параметры шума
    const noiseState = {
        amp: 12.0,
        freq1: 3.0,
        freq2: 8.0
    };
    const noiseTarget = { ...noiseState };
    let nextNoiseUpdate = 0;
    let nextCharUpdate = 0;

    // редкие крупные события
    let nextCollapseTime = 12.0 + Math.random() * 10.0;
    let nextRingWaveTime = 9.0 + Math.random() * 10.0;
    let nextStreamTime = 14.0 + Math.random() * 12.0;
    const tmpDir = new THREE.Vector3();
    const cameraBase = new THREE.Vector3(0, 0, 230);
    let cameraShake = 0;

    function applyImpact(time, dir, strength, options = {}) {
        const { type = 0, energyFactor = 0.01, forceAngry = false } = options;

        lastImpactTime = time;
        uniforms.uImpactTime.value = time;
        uniforms.uImpactStrength.value = strength;
        uniforms.uImpactDir.value.copy(dir).normalize();
        uniforms.uImpactType.value = type;
        uniforms.uFlowToImpact.value = 0.4; // приток к месту удара (локализован в шейдере)
        cameraShake = Math.min(1.0, cameraShake + strength * 0.02);
        irritation = Math.min(1.0, irritation + strength * 0.025);

        const energyCost = strength * energyFactor;
        energy = Math.max(0.0, energy - energyCost);

        if ((strength > 18.0 && energy > 0.25) || forceAngry) {
            mode = 1;
            lastModeChangeTime = time;
        }

    }

    function animate() {
        requestAnimationFrame(animate);

        const delta = clock.getDelta();
        const t = clock.elapsedTime;
        uniforms.uTime.value = t;

        // синхронизируем uniform с локальным режимом
        uniforms.uMode.value = mode;

        // восстановление энергии со временем
        const energyRegen = 0.02;
        energy = Math.min(1.0, energy + energyRegen * delta);

        // плавные вариации шума
        if (t > nextNoiseUpdate) {
            noiseTarget.amp = 10.0 + Math.random() * 9.0;     // 10–19
            noiseTarget.freq1 = 2.4 + Math.random() * 2.6;    // 2.4–5.0
            noiseTarget.freq2 = 6.0 + Math.random() * 4.5;    // 6–10.5
            nextNoiseUpdate = t + 3.5 + Math.random() * 4.0;  // обновление каждые 3.5–7.5 сек
        }
        const noiseLerp = 1.0 - Math.exp(-delta * 0.8);
        noiseState.amp += (noiseTarget.amp - noiseState.amp) * noiseLerp;
        noiseState.freq1 += (noiseTarget.freq1 - noiseState.freq1) * noiseLerp;
        noiseState.freq2 += (noiseTarget.freq2 - noiseState.freq2) * noiseLerp;
        uniforms.uNoiseAmp.value = noiseState.amp;
        uniforms.uNoiseFreq1.value = noiseState.freq1;
        uniforms.uNoiseFreq2.value = noiseState.freq2;

        // вязкость и сила течения зависят от «усталости» энергии
        const viscTarget = Math.min(0.95, Math.max(0.4, 0.55 + (1.0 - energy) * 0.35));
        const flowTarget = 0.24 + (1.0 - energy) * 0.22;
        uniforms.uViscosity.value += (viscTarget - uniforms.uViscosity.value) * 0.08;
        uniforms.uFlowStrength.value += (flowTarget - uniforms.uFlowStrength.value) * 0.12;
        uniforms.uFlowSpeed.value = 0.55 + Math.sin(t * 0.25) * 0.08;
        uniforms.uEnergy.value = energy;
        irritation = Math.max(0.0, irritation - delta * 0.18);
        uniforms.uIrritation.value = irritation;
        // затухание притока к удару
        uniforms.uFlowToImpact.value *= Math.exp(-delta * 1.8);
        // затухание струи по силе
        const streamAge = t - uniforms.uStreamTime.value;
        if (streamAge > 9.0) {
            uniforms.uStreamStrength.value = 0.0;
        }

        // обновление символов матрицы
        if (t > nextCharUpdate) {
            const batch = 2000;
            for (let i = 0; i < batch; i++) {
                const idx = Math.floor(Math.random() * particles);
                charIndices[idx] = Math.floor(Math.random() * charSet.length);
            }
            charAttr.needsUpdate = true;
            nextCharUpdate = t + 0.12;
        }

        // автоматический переход в «хилящийся» режим при низкой энергии
        if (energy < 0.2 && mode !== 2) {
            mode = 2;
            lastModeChangeTime = t;
        }

        // если были злые, и прошло 10 секунд после последнего удара — возвращаемся в спокойный
        if (mode === 1 && t - lastImpactTime > 10.0 && energy > 0.25) {
            mode = 0;
            lastModeChangeTime = t;
        }

        // если энергию восстановили выше порога — можно выйти из хилящегося в спокойный
        if (mode === 2 && energy > 0.6 && t - lastModeChangeTime > 5.0) {
            mode = 0;
            lastModeChangeTime = t;
        }

        // обработка клика: принудительный «прокол» и переход в злой режим
        if (clickImpactPending) {
            clickImpactPending = false;

            // сильный удар от клика
            const strength = 28.0;
            applyImpact(t, clickImpactDir, strength, {
                type: 0,
                energyFactor: 0.02,
                forceAngry: energy > 0.1
            });
        }

        // время от времени запускаем «прокол» сферы
        let impactInterval;
        let impactChance;

        if (mode === 0) {           // спокойный
            impactInterval = 6.0;
            impactChance = 0.03;
        } else if (mode === 1) {    // злой
            impactInterval = 2.0;
            impactChance = 0.15;
        } else {                    // хилящийся
            impactInterval = 8.0;
            impactChance = 0.01;
        }

        if (t - lastImpactTime > impactInterval) {
            if (Math.random() < impactChance) {
                lastImpactTime = t;
                uniforms.uImpactTime.value = t;

                // случайное направление на сфере
                const theta = Math.random() * Math.PI * 2;
                const z = Math.random() * 2 - 1;
                const r = Math.sqrt(1 - z * z);
                const dir = uniforms.uImpactDir.value;
                dir.set(r * Math.cos(theta), r * Math.sin(theta), z);

                let strength;
                if (mode === 0) {
                    // спокойный — в основном мягкие удары,
                    // но иногда случается сильный «прокол», который может разозлить сферу
                    const base = 4.0 + Math.random() * 4.0; // 4–8
                    const bonus =
                        Math.random() < 0.25   // 25% шанс усиленного удара
                            ? 10.0 + Math.random() * 15.0  // +10–25
                            : 0.0;
                    strength = base + bonus; // итог: обычно 4–8, иногда до ~33
                } else if (mode === 1) {
                    // злой — сильные частые удары
                    strength = 15.0 + Math.random() * 20.0;
                } else {
                    // хилящийся — слабые, почти отсутствующие удары
                    strength = 2.0 + Math.random() * 2.0;
                }

                applyImpact(t, dir, strength, { type: 0 });
            }
        }

        // редкие обвалы — глубокие прогибы
        if (t > nextCollapseTime && t - lastImpactTime > 2.5) {
            const theta = Math.random() * Math.PI * 2;
            const z = Math.random() * 2 - 1;
            const r = Math.sqrt(1 - z * z);
            tmpDir.set(r * Math.cos(theta), r * Math.sin(theta), z);

            const strength = 38.0 + Math.random() * 18.0; // 38–56
            applyImpact(t, tmpDir, strength, { type: 1, energyFactor: 0.015, forceAngry: true });

            nextCollapseTime = t + 12.0 + Math.random() * 10.0;
        }

        // редкие большие кольцевые волны
        if (t > nextRingWaveTime && t - lastImpactTime > 2.0) {
            const theta = Math.random() * Math.PI * 2;
            const z = Math.random() * 2 - 1;
            const r = Math.sqrt(1 - z * z);
            tmpDir.set(r * Math.cos(theta), r * Math.sin(theta), z);

            const strength = 24.0 + Math.random() * 16.0; // 24–40
            applyImpact(t, tmpDir, strength, { type: 2, energyFactor: 0.012 });

            nextRingWaveTime = t + 9.0 + Math.random() * 10.0;
        }

        // редкие струи, стекающие вниз
        if (t > nextStreamTime && uniforms.uStreamStrength.value < 0.05) {
            const yaw = Math.random() * Math.PI * 2;
            const tilt = 0.25 + Math.random() * 0.35; // немного смещаем от идеального вверх
            tmpDir.set(Math.cos(yaw) * tilt, 1.0, Math.sin(yaw) * tilt).normalize();
            uniforms.uStreamPole.value.copy(tmpDir);
            uniforms.uStreamTime.value = t;
            uniforms.uStreamStrength.value = 0.7 + Math.random() * 0.5;

            nextStreamTime = t + 14.0 + Math.random() * 12.0;
        }

        // «дыхание» — мягкая пульсация размера
        const breathe = 1.0 + Math.sin(t * 0.7) * 0.03;
        points.scale.setScalar(breathe);

        // немного «живое» вращение: скорость слегка меняется во времени
        const rotBase = 0.0018;
        const rotWave = 0.0010 * Math.sin(t * 0.4);
        const rot = rotBase + rotWave;

        points.rotation.y += rot;
        points.rotation.x += rot * 0.6;
        // синхронизировать невидимую сферу с визуальной:
        hitSphere.rotation.copy(points.rotation);

        // покачивание камеры и маленький шейк от ударов
        cameraShake = Math.max(0, cameraShake - delta * 1.8);
        const shakeAmp = cameraShake * 6.0;
        const swayAmp = 2.5;
        const swayX = Math.sin(t * 0.35) * swayAmp;
        const swayY = Math.sin(t * 0.42) * swayAmp * 0.6;
        const shakeX = (Math.random() - 0.5) * shakeAmp;
        const shakeY = (Math.random() - 0.5) * shakeAmp;
        camera.position.set(
            cameraBase.x + swayX + shakeX,
            cameraBase.y + swayY + shakeY,
            cameraBase.z
        );
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
    }

animate();

renderer.domElement.addEventListener("click", (event) => {
        // защита от слишком частых кликов
        const now = performance.now();
        if (now - lastClickTime < clickCooldown || clickImpactPending) {
            return;
        }
        lastClickTime = now;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(hitSphere);

        if (intersects.length > 0) {
            const p = intersects[0].point;
            clickImpactDir.copy(p).normalize();
            clickImpactPending = true;
        }
    });

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ---- MATRIX ----
    function runMatrix() {
        const threeCanvas = document.querySelector("canvas.three-canvas");
        if (threeCanvas) threeCanvas.style.display = "none";

        let canvas = document.getElementById("matrix");
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.id = "matrix";
            document.body.appendChild(canvas);
        }
        canvas.style.display = "block";

        const ctx = canvas.getContext("2d");
        let width = window.innerWidth;
        let height = window.innerHeight;
        const symbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%";
        const fontSize = 18;
        let columns = Math.floor(width / fontSize);
        let drops = [];
        let leaders = [];
        let glitch = { frames: 0, offset: 0, cols: [] };
        let frameCount = 0;
        const speed = 4;

        function ensureUsername() {
            let uname = document.querySelector(".username-container");
            if (!uname) {
                uname = document.createElement("div");
                uname.className = "username-container";
                const name = "d0mhate";
                for (let i = 0; i < name.length; i++) {
                    const span = document.createElement("span");
                    span.className = "letter";
                    span.textContent = name[i];
                    uname.appendChild(span);
                }
                document.body.appendChild(uname);
            }
            uname.style.display = "flex";
        }

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            columns = Math.max(1, Math.floor(width / fontSize));
            drops = [];
            leaders = [];
            for (let x = 0; x < columns; x++) {
                drops[x] = Math.floor(Math.random() * height / fontSize);
                leaders[x] = 0;
            }
        }

        function drawMatrix() {
            ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
            ctx.fillRect(0, 0, width, height);

            ctx.font = `${fontSize}px monospace`;

            frameCount++;
            const t = performance.now() * 0.001;
            const pulse = 0.88 + 0.12 * Math.sin(t * 0.8);

            if (Math.random() < 0.006 && columns > 0) {
                const idx = Math.floor(Math.random() * columns);
                leaders[idx] = 8 + Math.floor(Math.random() * 8);
            }

            if (glitch.frames <= 0 && Math.random() < 0.004 && columns > 4) {
                glitch.frames = 2 + Math.floor(Math.random() * 3);
                glitch.offset = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 10);
                glitch.cols = [];
                const count = 4 + Math.floor(Math.random() * 8);
                for (let i = 0; i < count; i++) {
                    glitch.cols.push(Math.floor(Math.random() * columns));
                }
            } else if (glitch.frames > 0) {
                glitch.frames--;
            }

            if (frameCount % speed === 0) {
                for (let i = 0; i < drops.length; i++) {
                    const isLeader = leaders[i] > 0;
                    if (isLeader) leaders[i]--;

                    const baseG = Math.min(255, Math.floor(140 * pulse + 80));
                    const xPos = i * fontSize;
                    const yPos = drops[i] * fontSize;
                    const text = symbols.charAt(Math.floor(Math.random() * symbols.length));

                    ctx.fillStyle = `rgba(0, ${baseG}, 0, 0.85)`;
                    ctx.fillText(text, xPos, yPos);

                    if (isLeader) {
                        const tailLength = 6;
                        for (let t = 0; t < tailLength; t++) {
                            const alpha = Math.max(0.08, 1.0 - t * 0.15);
                            const g = Math.max(60, 170 - t * 18);
                            ctx.fillStyle = `rgba(${Math.max(0, g-40)}, ${Math.min(255, g+80)}, ${Math.max(60, g)}, ${alpha})`;
                            ctx.fillText(text, xPos, yPos - fontSize * t);
                        }
                    }

                    if (glitch.frames > 0 && glitch.cols.includes(i)) {
                        ctx.save();
                        ctx.translate(glitch.offset, 0);
                        ctx.fillStyle = "rgba(120, 255, 180, 0.3)";
                        ctx.fillText(text, xPos, yPos + fontSize * 0.3);
                        ctx.restore();
                    }

                    if (drops[i] * fontSize > height && Math.random() > 0.975) {
                        drops[i] = 0;
                    }

                    drops[i]++;
                }
            }

            requestAnimationFrame(drawMatrix);
        }

        resize();
        ensureUsername();
        window.addEventListener("resize", resize);
        drawMatrix();
    }
})();
