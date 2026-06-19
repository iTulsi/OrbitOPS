import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';

const TEXTURES = {
    day: '/orbitops-earth/earth_atmos_2048.jpg',
    night: '/orbitops-earth/earth_lights_2048.png',
    normal: '/orbitops-earth/earth_normal_2048.jpg',
    specular: '/orbitops-earth/earth_specular_2048.jpg',
    clouds: '/orbitops-earth/earth_clouds_1024.png',
};

const EARTH_VERTEX_SHADER = `
    varying vec2 vUv;
    varying vec3 vWorldNormal;

    void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const EARTH_FRAGMENT_SHADER = `
    uniform sampler2D uDayMap;
    uniform sampler2D uNightMap;
    uniform vec3 uSunDirection;

    varying vec2 vUv;
    varying vec3 vWorldNormal;

    void main() {
        vec3 normalDirection = normalize(vWorldNormal);
        float sunlight = dot(normalDirection, normalize(uSunDirection));
        float dayAmount = smoothstep(-0.16, 0.24, sunlight);

        vec3 dayColor = texture2D(uDayMap, vUv).rgb;
        vec3 nightColor = texture2D(uNightMap, vUv).rgb * 1.45;
        dayColor *= 0.34 + max(sunlight, 0.0) * 0.86;

        vec3 finalColor = mix(nightColor, dayColor, dayAmount);
        finalColor = pow(finalColor, vec3(0.92));
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const ATMOSPHERE_VERTEX_SHADER = `
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const ATMOSPHERE_FRAGMENT_SHADER = `
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 3.0);
        vec3 atmosphereColor = vec3(0.11, 0.58, 1.0);
        gl_FragColor = vec4(atmosphereColor, fresnel * 0.62);
    }
`;

function configureTexture(texture, { srgb = false } = {}) {
    if (!texture) return;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
}

function RealEarth() {
    const earthRef = useRef(null);
    const cloudsRef = useRef(null);
    const [dayMap, nightMap, normalMap, specularMap, cloudsMap] = useTexture([
        TEXTURES.day,
        TEXTURES.night,
        TEXTURES.normal,
        TEXTURES.specular,
        TEXTURES.clouds,
    ]);

    useMemo(() => {
        configureTexture(dayMap, { srgb: true });
        configureTexture(nightMap, { srgb: true });
        configureTexture(normalMap);
        configureTexture(specularMap);
        configureTexture(cloudsMap, { srgb: true });
    }, [cloudsMap, dayMap, nightMap, normalMap, specularMap]);

    const earthUniforms = useMemo(
        () => ({
            uDayMap: { value: dayMap },
            uNightMap: { value: nightMap },
            uSunDirection: { value: new THREE.Vector3(3.5, 1.2, 4.5).normalize() },
        }),
        [dayMap, nightMap]
    );

    useFrame((_, delta) => {
        if (earthRef.current) earthRef.current.rotation.y += delta * 0.025;
        if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.035;
    });

    return (
        <group rotation={[0.03, -0.32, -0.08]}>
            <mesh ref={earthRef}>
                <sphereGeometry args={[1, 72, 72]} />
                <shaderMaterial
                    vertexShader={EARTH_VERTEX_SHADER}
                    fragmentShader={EARTH_FRAGMENT_SHADER}
                    uniforms={earthUniforms}
                />
            </mesh>

            <mesh ref={cloudsRef} scale={1.008}>
                <sphereGeometry args={[1, 72, 72]} />
                <meshPhongMaterial
                    map={cloudsMap}
                    normalMap={normalMap}
                    specularMap={specularMap}
                    transparent
                    opacity={0.32}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                />
            </mesh>

            <mesh scale={1.075}>
                <sphereGeometry args={[1, 72, 72]} />
                <shaderMaterial
                    vertexShader={ATMOSPHERE_VERTEX_SHADER}
                    fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
                    transparent
                    depthWrite={false}
                    side={THREE.BackSide}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </group>
    );
}

function StarField() {
    const positions = useMemo(() => {
        const values = new Float32Array(150 * 3);
        for (let index = 0; index < 150; index += 1) {
            const radius = 5 + Math.random() * 5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            values[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
            values[index * 3 + 1] = radius * Math.cos(phi);
            values[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }
        return values;
    }, []);

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial size={0.018} color="#d8e6f4" transparent opacity={0.72} sizeAttenuation />
        </points>
    );
}

function OrbitGeometry({ altitudeKm, inclinationDeg, eccentricity }) {
    const markerRef = useRef(null);
    const orbitRadius = THREE.MathUtils.clamp(1.34 + altitudeKm / 22000, 1.34, 1.82);
    const clampedEccentricity = THREE.MathUtils.clamp(eccentricity, 0, 0.72);
    const minorRadius = orbitRadius * (1 - clampedEccentricity * 0.42);
    const inclination = THREE.MathUtils.degToRad(inclinationDeg);

    const points = useMemo(() => {
        const result = [];
        for (let index = 0; index <= 180; index += 1) {
            const angle = (index / 180) * Math.PI * 2;
            result.push(
                new THREE.Vector3(
                    Math.cos(angle) * orbitRadius,
                    0,
                    Math.sin(angle) * minorRadius
                )
            );
        }
        return result;
    }, [minorRadius, orbitRadius]);

    useFrame(({ clock }) => {
        if (!markerRef.current) return;
        const angle = clock.getElapsedTime() * 0.42;
        markerRef.current.position.set(
            Math.cos(angle) * orbitRadius,
            0,
            Math.sin(angle) * minorRadius
        );
    });

    return (
        <group rotation={[inclination, 0, -0.15]}>
            <Line
                points={points}
                color="#35e9ff"
                lineWidth={1.25}
                transparent
                opacity={0.86}
                depthWrite={false}
            />
            <mesh ref={markerRef}>
                <sphereGeometry args={[0.047, 20, 20]} />
                <meshBasicMaterial color="#72f4ff" toneMapped={false} />
                <pointLight color="#35e9ff" intensity={1.4} distance={0.8} />
            </mesh>
        </group>
    );
}

function Scene({ altitudeKm, inclinationDeg, eccentricity }) {
    return (
        <>
            <color attach="background" args={['#02050a']} />
            <fog attach="fog" args={['#02050a', 4.8, 10]} />
            <ambientLight intensity={0.15} />
            <directionalLight position={[4, 2, 5]} intensity={1.1} />
            <StarField />
            <RealEarth />
            <OrbitGeometry
                altitudeKm={altitudeKm}
                inclinationDeg={inclinationDeg}
                eccentricity={eccentricity}
            />
            <OrbitControls
                makeDefault
                enablePan={false}
                enableZoom={false}
                rotateSpeed={0.55}
                minPolarAngle={Math.PI * 0.29}
                maxPolarAngle={Math.PI * 0.71}
                target={[0, 0, 0]}
            />
        </>
    );
}

function LoadingPreview() {
    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#02050a]">
            <div className="flex items-center gap-2 font-mono text-[8px] tracking-[0.15em] text-cyan-300/70">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                LOADING EARTH TEXTURES
            </div>
        </div>
    );
}

export default function ObjectCatalogOrbitPreview({ object }) {
    const altitudeKm = Number(object?.current_altitude_km ?? object?.altitude_km) || 550;
    const inclinationDeg = Number(object?.inclination_deg) || 0;
    const eccentricity = Number(object?.eccentricity) || 0;
    const regime = object?.orbital_regime || 'UNKNOWN';

    return (
        <div className="relative h-[225px] overflow-hidden bg-[#02050a]">
            <Suspense fallback={<LoadingPreview />}>
                <Canvas
                    dpr={[1, 1.5]}
                    camera={{ position: [0, 0.12, 3.65], fov: 38, near: 0.1, far: 40 }}
                    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                >
                    <Scene
                        altitudeKm={altitudeKm}
                        inclinationDeg={inclinationDeg}
                        eccentricity={eccentricity}
                    />
                </Canvas>
            </Suspense>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-[#02050a] via-[#02050a]/65 to-transparent px-4 pb-3 pt-8 font-mono text-[8px] uppercase tracking-[0.12em]">
                <span className="text-slate-500">REGIME <span className="text-cyan-300">{regime}</span></span>
                <span className="text-slate-500">INC <span className="text-slate-300">{inclinationDeg.toFixed(1)}°</span></span>
            </div>

            <div className="pointer-events-none absolute right-3 top-3 border border-white/[0.08] bg-black/35 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-slate-500 backdrop-blur-sm">
                DRAG TO ROTATE
            </div>
        </div>
    );
}

useTexture.preload(TEXTURES.day);
useTexture.preload(TEXTURES.night);
useTexture.preload(TEXTURES.normal);
useTexture.preload(TEXTURES.specular);
useTexture.preload(TEXTURES.clouds);
