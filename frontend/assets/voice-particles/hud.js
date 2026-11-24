// Adapted from Andrew Wolverton’s Particles export for StarNet Local Live.
import { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, GPUComputationRenderer } from "./three-bundle.js";

export function mountVoiceParticles(host) {
        // CONFIG
        const COUNT = 20000;
        const SPEED_MULT = 1;
        const AUTO_SPIN = false;
        let voiceLevel = 0;

        const PHYSICS_MODE = 'lerp';
        const STIFFNESS = 2;
        const DAMPING = 0.08;
        const NOISE_STRENGTH = 0;
        const MOUSE_MODE = 'none';
        const MOUSE_INFLUENCE = 2.5;

        // SETUP
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        camera.position.set(0, 0, 100);

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        renderer.domElement.setAttribute("aria-hidden", "true");

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = AUTO_SPIN;
        controls.autoRotateSpeed = 2.0;

        // POST PROCESSING
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));

        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.strength = 0.5; bloomPass.radius = 0.3; bloomPass.threshold = 0.25;
        composer.addPass(bloomPass);





        // 4.5 BACKGROUND COMPOSITE
        const BgCompositeShader = {
            uniforms: {
                "tDiffuse": { value: null },
                "bgColor": { value: new THREE.Color('#000000') }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec3 bgColor;
                varying vec2 vUv;
                void main() {
                    vec4 texel = texture2D( tDiffuse, vUv );
                    float alpha = clamp(max(texel.r, max(texel.g, texel.b)), 0.0, 1.0);
                    gl_FragColor = vec4( texel.rgb + bgColor * (1.0 - alpha), 1.0 );
                }
            `
        };
        const bgCompositePass = new ShaderPass(BgCompositeShader);
        composer.addPass(bgCompositePass);



        if (composer.passes.length > 0) {
            composer.passes[composer.passes.length - 1].renderToScreen = true;
        }


        // SWARM OBJECTS
        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        const target = new THREE.Vector3();

        // INSTANCED MESH
        const geometry = new THREE.PlaneGeometry(0.8, 0.8).clone();

        const W = Math.ceil(Math.sqrt(COUNT));
        const H = W;
        const references = new Float32Array(COUNT * 2);
        for (let i = 0; i < COUNT; i++) {
            references[i * 2] = ((i % W) + 0.5) / W;
            references[i * 2 + 1] = (Math.floor(i / W) + 0.5) / H;
        }
        geometry.setAttribute('reference', new THREE.InstancedBufferAttribute(references, 2));

        const scales = new Float32Array(COUNT);
        const opacities = new Float32Array(COUNT);
        for(let i=0; i<COUNT; i++) { scales[i] = 1.0; opacities[i] = 1.0; }
        geometry.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(scales, 1));
        geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(opacities, 1));

        const material = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        texturePosition: { value: null },
        gpgpuEnabled: { value: 1.0 }
    },
    vertexShader: `
        attribute vec2 reference;
        uniform sampler2D texturePosition;
        uniform float gpgpuEnabled;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
            vUv = uv;
            vColor = instanceColor;
            mat4 m = instanceMatrix;
            if (gpgpuEnabled > 0.5) {
                m[3] = vec4(0.0, 0.0, 0.0, 1.0);
            }
            vec4 localPos = m * vec4(position, 1.0);
            if (gpgpuEnabled > 0.5) {
                localPos.xyz += texture2D(texturePosition, reference).xyz;
            }
            gl_Position = projectionMatrix * modelViewMatrix * localPos;
        }
    `,
    fragmentShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        uniform float uTime;
        float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
        float noise(vec2 p) { vec2 ip = floor(p); vec2 u = fract(p); u = u*u*(3.0-2.0*u); float res = mix(mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y); return res * res; }
        void main() {
            float dist = distance(vUv, vec2(0.5));
            float n = noise(vUv * 5.0 + uTime * 0.5);
            float alpha = (1.0 - smoothstep(0.2, 0.5, dist)) * (0.5 + 0.5 * n);
            if(alpha < 0.1) discard;
            gl_FragColor = vec4(vColor + 0.2, alpha * 0.8);
        }
    `,
    transparent: true, depthWrite: false, side: 2, blending: 2
});

        const instancedMesh = new THREE.InstancedMesh(geometry, material, COUNT);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(instancedMesh);

        // DATA ARRAYS
        const positions = [];
        const targets = [];
        for(let i=0; i<COUNT; i++) {
            const p = new THREE.Vector3((Math.random()-0.5)*100, (Math.random()-0.5)*100, (Math.random()-0.5)*100);
            positions.push(p.clone());
            targets.push(p.clone());
            instancedMesh.setColorAt(i, color.setHex(0x00ff88)); // Init Color
        }

        // GPGPU PHYSICS ENGINE CORE
        let gpuCompute;
        let positionVariable, velocityVariable;
        let positionUniforms, velocityUniforms;

        let targetTex = new THREE.DataTexture(new Float32Array(W * H * 4), W, H, THREE.RGBAFormat, THREE.FloatType);

        function updateGPGPUTargets() {
            const data = targetTex.image.data;
            for (let i = 0; i < W * H; i++) {
                const idx = i * 4;
                if (i < COUNT && i < targets.length) {
                    const p = targets[i];
                    data[idx] = p.x;
                    data[idx + 1] = p.y;
                    data[idx + 2] = p.z;
                } else {
                    data[idx] = 999999.0;
                    data[idx + 1] = 999999.0;
                    data[idx + 2] = 999999.0;
                }
                data[idx + 3] = 1.0;
            }
            targetTex.needsUpdate = true;
        }

        gpuCompute = new GPUComputationRenderer(W, H, renderer);
        const dtPosition = gpuCompute.createTexture();
        const dtVelocity = gpuCompute.createTexture();

        const posArray = dtPosition.image.data;
        const velArray = dtVelocity.image.data;
        for (let i = 0; i < W * H; i++) {
            const idx = i * 4;
            let x = (Math.random() - 0.5) * 100;
            let y = (Math.random() - 0.5) * 100;
            let z = (Math.random() - 0.5) * 100;
            posArray[idx] = x;
            posArray[idx + 1] = y;
            posArray[idx + 2] = z;
            posArray[idx + 3] = 1.0;

            velArray[idx] = 0.0;
            velArray[idx + 1] = 0.0;
            velArray[idx + 2] = 0.0;
            velArray[idx + 3] = 0.0;
        }

        const posShader = `
            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec3 pos = texture2D(texturePosition, uv).xyz;
                vec3 vel = texture2D(textureVelocity, uv).xyz;
                pos += vel * 0.016;
                gl_FragColor = vec4(pos, 1.0);
            }
        `;

        const velShader = `
            uniform float uTime;
            uniform float uDeltaTime;
            uniform float uStiffness;
            uniform float uDamping;
            uniform float uNoiseStrength;
            uniform int uPhysicsMode;
            uniform int uMouseMode;
            uniform float uMouseInfluence;
            uniform vec3 uMouse3D;
            uniform sampler2D textureTarget;
            uniform vec3 uGravity;
            uniform vec3 uShockwaveCenter;
            uniform float uShockwaveForce;
            uniform float uShockwaveRadius;

            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, vec3(C.y)));
                vec3 x0 = v - i + dot(i, vec3(C.x));
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + vec3(C.x);
                vec3 x2 = x0 - i2 + vec3(C.y);
                vec3 x3 = x0 - D.yyy;
                i = mod289(i);
                vec4 p = permute(permute(permute(
                           i.z + vec4(0.0, i1.z, i2.z, 1.0))
                         + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                         + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }

            vec3 curlNoise(vec3 p) {
                const float e = 0.05;
                float dx = snoise(vec3(p.x + e, p.y, p.z)) - snoise(vec3(p.x - e, p.y, p.z));
                float dy = snoise(vec3(p.x, p.y + e, p.z)) - snoise(vec3(p.x, p.y - e, p.z));
                float dz = snoise(vec3(p.x, p.y, p.z + e)) - snoise(vec3(p.x, p.y, p.z - e));
                return vec3(dy - dz, dz - dx, dx - dy) / (2.0 * e);
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec3 pos = texture2D(texturePosition, uv).xyz;
                vec3 vel = texture2D(textureVelocity, uv).xyz;
                vec3 target = texture2D(textureTarget, uv).xyz;

                vec3 force = vec3(0.0);

                // 1. Target Attraction / Spring Force
                if (uPhysicsMode == 0) {
                    vec3 desiredVel = (target - pos) * 25.0;
                    force += (desiredVel - vel) * 40.0;
                } else {
                    vec3 springForce = -uStiffness * (pos - target);
                    force += springForce;
                }

                // 2. Mouse Force
                if (uMouseMode > 0) {
                    float d = distance(pos, uMouse3D);
                    float radius = uMouseInfluence * 15.0;
                    if (d < radius && d > 0.1) {
                        float strength = (1.0 - d / radius);
                        vec3 mouseDir = normalize(pos - uMouse3D);
                        if (uMouseMode == 1) {
                            force -= mouseDir * strength * 150.0;
                        } else if (uMouseMode == 2) {
                            force += mouseDir * strength * 150.0;
                        } else if (uMouseMode == 3) {
                            vec3 up = vec3(0.0, 1.0, 0.0);
                            vec3 tangent = normalize(cross(mouseDir, up));
                            force += tangent * strength * 150.0;
                        }
                    }
                }

                // 3. Curl Noise / Turbulence
                if (uNoiseStrength > 0.0 || uPhysicsMode == 3) {
                    float scale = 0.05;
                    vec3 noiseOffset = curlNoise(pos * scale + vec3(0.0, 0.0, uTime * 0.2));
                    float currentNoiseStrength = uNoiseStrength * (uPhysicsMode == 3 ? 15.0 : 5.0);
                    force += noiseOffset * currentNoiseStrength;
                }

                // 4. Stochastic Flocking
                if (uPhysicsMode == 2) {
                    float seed = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                    for(int k = 1; k <= 4; k++) {
                        vec2 sampleUv = fract(uv + vec2(
                            sin(float(k) * 1.7 + seed + uTime) * 0.27,
                            cos(float(k) * 2.3 + seed + uTime) * 0.31
                        ));
                        vec3 otherPos = texture2D(texturePosition, sampleUv).xyz;
                        float d = distance(pos, otherPos);
                        if (d < 4.0 && d > 0.01) {
                            vec3 repelDir = normalize(pos - otherPos);
                            force += repelDir * (1.0 - d / 4.0) * 120.0;
                        }
                    }
                }

                // 5. Gravity Override
                force += uGravity * 100.0;

                // 6. Shockwave (Radial Explosion)
                if (uShockwaveForce > 0.0) {
                    float d = distance(pos, uShockwaveCenter);
                    if (d < uShockwaveRadius && d > 0.1) {
                        float shockStrength = (1.0 - (d / uShockwaveRadius)) * uShockwaveForce;
                        vec3 shockDir = normalize(pos - uShockwaveCenter);
                        force += shockDir * shockStrength * 500.0;
                    }
                }

                vel += force * uDeltaTime;
                vel *= (1.0 - uDamping);

                float maxVel = 800.0;
                if (length(vel) > maxVel) {
                    vel = normalize(vel) * maxVel;
                }

                gl_FragColor = vec4(vel, 1.0);
            }
        `;

        positionVariable = gpuCompute.addVariable("texturePosition", posShader, dtPosition);
        velocityVariable = gpuCompute.addVariable("textureVelocity", velShader, dtVelocity);

        gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
        gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);

        positionUniforms = positionVariable.material.uniforms;
        velocityUniforms = velocityVariable.material.uniforms;

        velocityUniforms.uTime = { value: 0.0 };
        velocityUniforms.uDeltaTime = { value: 0.016 };

        let pModeVal = 1;
        if (PHYSICS_MODE === 'lerp') pModeVal = 0;
        else if (PHYSICS_MODE === 'spring') pModeVal = 1;
        else if (PHYSICS_MODE === 'flocking') pModeVal = 2;
        else if (PHYSICS_MODE === 'fluid') pModeVal = 3;
        velocityUniforms.uPhysicsMode = { value: pModeVal };

        let mModeVal = 0;
        if (MOUSE_MODE === 'attract') mModeVal = 1;
        else if (MOUSE_MODE === 'repel') mModeVal = 2;
        else if (MOUSE_MODE === 'vortex') mModeVal = 3;
        velocityUniforms.uMouseMode = { value: mModeVal };
        velocityUniforms.uMouseInfluence = { value: MOUSE_INFLUENCE };
        velocityUniforms.uMouse3D = { value: new THREE.Vector3() };
        velocityUniforms.textureTarget = { value: targetTex };

        velocityUniforms.uStiffness = { value: STIFFNESS };
        velocityUniforms.uDamping = { value: DAMPING };
        velocityUniforms.uNoiseStrength = { value: NOISE_STRENGTH };

        velocityUniforms.uGravity = { value: new THREE.Vector3() };
        velocityUniforms.uShockwaveCenter = { value: new THREE.Vector3() };
        velocityUniforms.uShockwaveForce = { value: 0.0 };
        velocityUniforms.uShockwaveRadius = { value: 0.0 };

        const initError = gpuCompute.init();
        if (initError) {
            gpuCompute.dispose();
            controls.dispose();
            scene.remove(instancedMesh);
            instancedMesh.dispose();
            geometry.dispose();
            material.dispose();
            targetTex.dispose();
            bloomPass.dispose();
            bgCompositePass.dispose();
            composer.dispose();
            renderer.dispose();
            throw new Error(initError);
        }

        // ANIMATION LOOP
        const clock = new THREE.Clock();

        let frame = 0;
        function animate() {
            frame = requestAnimationFrame(animate);
            const delta = Math.min(clock.getDelta(), 0.05);
            const time = clock.elapsedTime * SPEED_MULT;
            material.uniforms.uTime.value = time;
            controls.update();
            const level = voiceLevel;
            const R = 55;
            const tilt = 0.12;
            const warm = 1;
            const TAU = Math.PI * 2;
            // SWARM LOGIC
            const count = COUNT; // Alias for user code compatibility
            for(let i=0; i<COUNT; i++) {
                 // USER CODE INJECTION START
                 const hs = Math.sin(i * 12.9898) * 43758.5453;
                 const h = hs - Math.floor(hs);
                 const hs2 = Math.sin(i * 78.233 + 1.7) * 12543.1234;
                 const h2 = hs2 - Math.floor(hs2);

                 const tt = i / count;
                 let x = 0;
                 let y = 0;
                 let z = 0;
                 let hue = 0.53;
                 let sat = 0.9;
                 let lit = 0.5;

                 if (tt < 0.10) {
                   const u = tt / 0.10;
                   const ph = Math.acos(1 - 2 * u);
                   const th = i * 2.39996;
                   const cr = R * 0.17 * (0.35 + 0.65 * h) * (1 + level * 0.6 + 0.08 * Math.sin(time * 3 + h * 6));
                   x = cr * Math.sin(ph) * Math.cos(th);
                   y = cr * Math.cos(ph);
                   z = cr * Math.sin(ph) * Math.sin(th);
                   hue = 0.52;
                   sat = Math.max(0.1, 0.55 - level * 0.35);
                   lit = Math.min(0.92, 0.6 + 0.25 * h + level * 0.2);
                 } else if (tt < 0.55) {
                   const k = (tt - 0.10) / 0.45;
                   const kn = k * 5;
                   const n = Math.floor(kn);
                   const wn = kn - n;
                   const segs = 6 + n * 4;
                   const sc = wn * segs;
                   const cell = Math.floor(sc);
                   const fr = sc - cell;
                   const dir = 1 - 2 * (n % 2);
                   const a = (cell + fr * 0.6) * TAU / segs + time * (0.25 + 0.12 * n) * dir * (1 + level * 2);
                   const rad = R * (0.45 + n * 0.27) * (1 + level * 0.04 * (n + 1) * Math.sin(time * 6 - n * 1.3)) + (h - 0.5) * R * 0.015;
                   x = Math.cos(a) * rad;
                   y = Math.sin(a) * rad;
                   z = (n - 2) * R * 0.07 + (h2 - 0.5) * R * 0.01;
                   hue = 0.54 - n * 0.012;
                   sat = 0.9;
                   lit = 0.38 + 0.15 * Math.sin(a * 2 - time * 3) + level * 0.2 + fr * 0.05;
                 } else if (tt < 0.70) {
                   const k = (tt - 0.55) / 0.15;
                   const km = k * 72;
                   const m = Math.floor(km);
                   const al = km - m;
                   const major = (m % 6 === 0) ? 1 : 0;
                   const pulse = Math.sin(m * 0.5 + time * 8);
                   const len = R * (0.05 + 0.07 * major) * (1 + level * 0.8 * pulse * pulse);
                   const a = m * TAU / 72 + time * 0.08;
                   const rad = R * 1.85 + al * len;
                   x = Math.cos(a) * rad;
                   y = Math.sin(a) * rad;
                   z = 0;
                   hue = 0.52 - major * 0.03;
                   sat = 0.85 - major * 0.3;
                   lit = 0.35 + major * 0.3 + level * 0.15;
                 } else if (tt < 0.88) {
                   const k = (tt - 0.70) / 0.18;
                   const layer = Math.floor(h * 3);
                   const a = k * TAU;
                   const wv = Math.sin(a * 7 + time * 9) * 0.5 + Math.sin(a * 13 - time * 13) * 0.3 + Math.sin(a * 3 + time * 5) * 0.2;
                   const wave = level * R * 0.2 * wv * (1 - layer * 0.25);
                   const rad = R * 1.3 + layer * R * 0.05 + wave + (h2 - 0.5) * R * 0.01;
                   x = Math.cos(a) * rad;
                   y = Math.sin(a) * rad;
                   z = layer * R * 0.02;
                   hue = 0.55 - level * 0.05;
                   sat = 0.9 - level * 0.4;
                   lit = Math.min(0.92, 0.45 + level * 0.4 + Math.abs(wv) * level * 0.2);
                 } else if (tt < 0.95) {
                   const sw = time * 1.1;
                   const trail = h2 * 1.2;
                   const a = sw - trail;
                   const rad = R * (0.3 + 1.15 * h);
                   x = Math.cos(a) * rad;
                   y = Math.sin(a) * rad;
                   z = (h - 0.5) * R * 0.02;
                   hue = 0.5;
                   sat = 0.8;
                   lit = 0.12 + 0.5 * (1 - trail / 1.2) * (0.6 + level * 0.4);
                 } else {
                   const hh = h + time * (0.15 + level * 0.5);
                   const life = hh - Math.floor(hh);
                   const a = i * 2.3;
                   const rad = R * (0.2 + life * 2.0);
                   x = Math.cos(a) * rad;
                   y = Math.sin(a) * rad;
                   z = (h2 - 0.5) * R * 0.4 * life;
                   hue = 0.5;
                   sat = 0.7;
                   lit = Math.min(0.9, 0.1 + 0.7 * (1 - life) * (0.4 + level));
                 }

                 const sway = Math.sin(time * 0.25) * 0.25;
                 const cs = Math.cos(sway);
                 const sn = Math.sin(sway);
                 const x2 = x * cs + z * sn;
                 const z2 = -x * sn + z * cs;
                 const ct = Math.cos(tilt);
                 const st = Math.sin(tilt);
                 target.set(x2, y * ct - z2 * st, y * st + z2 * ct);

                 color.setHSL(hue - warm * 0.44, Math.min(1, Math.max(0, sat)), Math.min(0.95, Math.max(0.02, lit)));

                 // USER CODE INJECTION END

                 // UPDATE
                 targets[i].copy(target);
                 positions[i].lerp(targets[i], 0.1);

                 dummy.position.set(0, 0, 0);
                 if ('ink' === 'vector') {
                     const lookDirection = targets[i].clone().sub(positions[i]).normalize().multiplyScalar(2);
                     if (targets[i].distanceToSquared(positions[i]) > 0.1) {
                         dummy.lookAt(lookDirection);
                     }
                 } else if ('ink' === 'plasma' || 'ink' === 'ink' || 'ink' === 'paint') {
                     dummy.lookAt(camera.position); // Billboard
                 } else {
                     dummy.rotation.set(0, 0, 0);
                 }

                 dummy.updateMatrix();
                 instancedMesh.setMatrixAt(i, dummy.matrix);
                 instancedMesh.setColorAt(i, color); // Fix: Use 'color' which user modifies
            }
            instancedMesh.instanceColor.needsUpdate = true;
            if(instancedMesh.geometry.attributes.instanceScale) instancedMesh.geometry.attributes.instanceScale.needsUpdate = true;
            if(instancedMesh.geometry.attributes.instanceOpacity) instancedMesh.geometry.attributes.instanceOpacity.needsUpdate = true;

            updateGPGPUTargets();

            if (velocityUniforms) {
                velocityUniforms.uTime.value = time;
                velocityUniforms.uDeltaTime.value = delta;


            }

            gpuCompute.compute();

            const posTexture = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
            if (material.uniforms && material.uniforms.texturePosition) {
                material.uniforms.texturePosition.value = posTexture;
                material.uniforms.gpgpuEnabled.value = 1.0;
            }

            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.instanceColor.needsUpdate = true;

            composer.render(delta);
        }
        function resize() {
            const width = Math.max(1, host.clientWidth);
            const height = Math.max(1, host.clientHeight);
            camera.aspect = width / height;
            camera.position.z = 200 / Math.min(camera.aspect, 1);
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
            composer.setSize(width, height);
        }
        host.appendChild(renderer.domElement);
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();
        animate();

        return {
            setLevel(level) {
                voiceLevel = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
            },
            dispose() {
                cancelAnimationFrame(frame);
                observer.disconnect();
                controls.dispose();
                gpuCompute.dispose();
                scene.remove(instancedMesh);
                instancedMesh.dispose();
                geometry.dispose();
                material.dispose();
                targetTex.dispose();
                bloomPass.dispose();
                bgCompositePass.dispose();
                composer.dispose();
                renderer.dispose();
                renderer.domElement.remove();
            }
        };
}
