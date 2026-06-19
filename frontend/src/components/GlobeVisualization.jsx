import React, {
    Suspense,
    forwardRef,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Stars, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { fetchLiveObjects } from '../services/liveTrackingApi';

const EARTH_RADIUS = 3.18;
const EARTH_KM = 6371;
const FAST_POLL_INTERVAL_MS = 1_250;
const LIVE_POLL_INTERVAL_MS = 30_000;
const PREVIEW_OBJECT_LIMIT = 700;
const FULL_OBJECT_LIMIT = 2500;
const FRAME_CACHE_KEY = 'orbitops.live-frame.v3';
const FRAME_CACHE_OBJECT_LIMIT = 1200;
const HOME_CAMERA_POSITION = new THREE.Vector3(0, 0.2, 14);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);
const EARTH_FIT_RADIUS = EARTH_RADIUS * 1.12;
const ORBIT_FIT_RADIUS = 5.72;
const MIN_CAMERA_DISTANCE = 5.8;
const MAX_CAMERA_DISTANCE = 30;

const TEXTURES = {
    day: '/orbitops-earth/earth_atmos_2048.jpg',
    night: '/orbitops-earth/earth_lights_2048.png',
    normal: '/orbitops-earth/earth_normal_2048.jpg',
    specular: '/orbitops-earth/earth_specular_2048.jpg',
    clouds: '/orbitops-earth/earth_clouds_1024.png',
};


function readCachedFrame() {
    if (typeof window === 'undefined') return null;

    try {
        const cached = JSON.parse(window.localStorage.getItem(FRAME_CACHE_KEY));
        if (!cached || !Array.isArray(cached.objects) || !cached.objects.length) {
            return null;
        }
        return cached;
    } catch {
        return null;
    }
}

function writeCachedFrame(payload, objects) {
    if (typeof window === 'undefined' || !objects.length) return;

    try {
        window.localStorage.setItem(
            FRAME_CACHE_KEY,
            JSON.stringify({
                objects: objects.slice(0, FRAME_CACHE_OBJECT_LIMIT),
                savedAt: new Date().toISOString(),
                source: payload?.source_name || payload?.source || 'CelesTrak',
                sourceStatus: payload?.source_status || 'cached',
                updatedAt:
                    payload?.positions_generated_at || new Date().toISOString(),
                fetchedAt: payload?.last_successful_fetch || null,
                propagator: payload?.propagator || 'SGP4',
            })
        );
    } catch {
        // Storage can be disabled or full; live rendering must continue normally.
    }
}

function isWarmingPayload(payload, objects) {
    const sourceStatus = String(payload?.source_status || '').toLowerCase();
    return (
        objects.length === 0 &&
        ['warming', 'starting', 'loading', 'connecting'].includes(sourceStatus)
    );
}

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
        float dayAmount = smoothstep(-0.18, 0.24, sunlight);

        vec3 dayColor = texture2D(uDayMap, vUv).rgb;
        vec3 nightColor = texture2D(uNightMap, vUv).rgb * 1.55;

        float diffuseLight = 0.34 + max(sunlight, 0.0) * 0.82;
        dayColor *= diffuseLight;

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
        float fresnel = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 3.2);
        vec3 atmosphereColor = vec3(0.18, 0.55, 1.0);
        gl_FragColor = vec4(atmosphereColor, fresnel * 0.5);
    }
`;

function normaliseType(value) {
    const type = String(value || 'SATELLITE').toUpperCase().replace(/[ -]/g, '_');

    if (type.includes('ROCKET')) return 'ROCKET_BODY';
    if (type.includes('DEBRIS')) return 'DEBRIS';
    return 'SATELLITE';
}

function normaliseRisk(object) {
    return String(
        object?.risk_level ??
        object?.riskLevel ??
        object?.risk ??
        object?.severity ??
        ''
    ).toUpperCase();
}

function objectPosition(object) {
    const latitude = Number(object?.lat ?? object?.latitude);
    const longitude = Number(object?.lon ?? object?.lng ?? object?.longitude);
    const altitude = Number(
        object?.altitude_km ??
        object?.altitude ??
        object?.alt ??
        0
    );

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(altitude)
    ) {
        return null;
    }

    const visualAltitude = THREE.MathUtils.clamp(altitude, 0, 4200);
    const radius =
        EARTH_RADIUS +
        (visualAltitude / EARTH_KM) * EARTH_RADIUS * 1.22;

    const latRadians = THREE.MathUtils.degToRad(latitude);
    const lonRadians = THREE.MathUtils.degToRad(-longitude);

    return new THREE.Vector3(
        radius * Math.cos(latRadians) * Math.cos(lonRadians),
        radius * Math.sin(latRadians),
        radius * Math.cos(latRadians) * Math.sin(lonRadians)
    );
}

function objectColor(type) {
    if (type === 'DEBRIS') return '#7f8b99';
    if (type === 'ROCKET_BODY') return '#d6a84a';
    return '#edf6ff';
}

function Earth() {
    const cloudsRef = useRef(null);
    const [dayMap, nightMap, normalMap, specularMap, cloudMap] = useTexture([
        TEXTURES.day,
        TEXTURES.night,
        TEXTURES.normal,
        TEXTURES.specular,
        TEXTURES.clouds,
    ]);

    useMemo(() => {
        dayMap.colorSpace = THREE.SRGBColorSpace;
        nightMap.colorSpace = THREE.SRGBColorSpace;
        cloudMap.colorSpace = THREE.SRGBColorSpace;

        dayMap.anisotropy = 8;
        nightMap.anisotropy = 8;
        normalMap.anisotropy = 8;
        specularMap.anisotropy = 8;
        cloudMap.anisotropy = 8;
    }, [cloudMap, dayMap, nightMap, normalMap, specularMap]);

    const earthUniforms = useMemo(
        () => ({
            uDayMap: { value: dayMap },
            uNightMap: { value: nightMap },
            uSunDirection: {
                value: new THREE.Vector3(-3.5, 1.8, 4.5).normalize(),
            },
        }),
        [dayMap, nightMap]
    );

    useFrame((_, delta) => {
        if (cloudsRef.current) {
            cloudsRef.current.rotation.y += delta * 0.006;
        }
    });

    return (
        <group rotation={[0.08, -0.55, -0.08]}>
            <mesh castShadow receiveShadow>
                <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
                <shaderMaterial
                    uniforms={earthUniforms}
                    vertexShader={EARTH_VERTEX_SHADER}
                    fragmentShader={EARTH_FRAGMENT_SHADER}
                />
            </mesh>

            <mesh scale={1.0025}>
                <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
                <meshPhongMaterial
                    normalMap={normalMap}
                    normalScale={new THREE.Vector2(0.55, 0.55)}
                    specularMap={specularMap}
                    specular={new THREE.Color('#5c7c94')}
                    shininess={14}
                    transparent
                    opacity={0.12}
                    depthWrite={false}
                />
            </mesh>

            <mesh ref={cloudsRef} scale={1.012}>
                <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
                <meshPhongMaterial
                    map={cloudMap}
                    alphaMap={cloudMap}
                    color="#ffffff"
                    transparent
                    opacity={0.4}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>

            <mesh scale={1.048}>
                <sphereGeometry args={[EARTH_RADIUS, 128, 128]} />
                <shaderMaterial
                    vertexShader={ATMOSPHERE_VERTEX_SHADER}
                    fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
                    side={THREE.BackSide}
                    transparent
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </group>
    );
}

function OrbitBands() {
    const bands = useMemo(
        () => [
            { radius: 4.08, rotation: [Math.PI / 2.7, 0.2, 0.18], opacity: 0.24 },
            { radius: 4.52, rotation: [Math.PI / 2, 0.4, -0.42], opacity: 0.18 },
            { radius: 5.02, rotation: [Math.PI / 1.9, -0.2, 0.76], opacity: 0.13 },
            { radius: 5.48, rotation: [Math.PI / 2.2, 0.7, 0.08], opacity: 0.1 },
        ],
        []
    );

    return bands.map((band, index) => (
        <mesh key={band.radius} rotation={band.rotation}>
            <torusGeometry args={[band.radius, 0.008, 6, 256]} />
            <meshBasicMaterial
                color={index === 0 ? '#6f8d9e' : '#4f6978'}
                transparent
                opacity={band.opacity}
                depthWrite={false}
            />
        </mesh>
    ));
}

function ObjectPointLayer({ points, type, onSelect }) {
    const meshRef = useRef(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useLayoutEffect(() => {
        if (!meshRef.current) return;

        const baseScale =
            points.length > 1200
                ? 0.018
                : points.length > 500
                  ? 0.022
                  : 0.027;
        const typeScale = type === 'SATELLITE' ? 1 : 0.82;

        points.forEach((point, index) => {
            dummy.position.copy(point.position);
            dummy.scale.setScalar(baseScale * typeScale);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(index, dummy.matrix);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [dummy, points, type]);

    if (!points.length) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[null, null, points.length]}
            onClick={(event) => {
                event.stopPropagation();
                const point = points[event.instanceId];
                if (point) onSelect?.(point.object);
            }}
            onPointerOver={() => {
                document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
                document.body.style.cursor = '';
            }}
        >
            <sphereGeometry args={[1, 7, 7]} />
            <meshBasicMaterial
                color={objectColor(type)}
                transparent
                opacity={type === 'DEBRIS' ? 0.78 : 0.95}
                toneMapped={false}
            />
        </instancedMesh>
    );
}

function ObjectPoints({ objects, selectedObject, onSelect }) {
    const groupedPoints = useMemo(() => {
        const groups = {
            SATELLITE: [],
            DEBRIS: [],
            ROCKET_BODY: [],
        };

        objects.slice(0, 2500).forEach((object) => {
            const position = objectPosition(object);
            if (!position) return;

            const type = normaliseType(object?.type);
            groups[type].push({ object, position });
        });

        return groups;
    }, [objects]);

    const selectedPosition = useMemo(
        () => (selectedObject ? objectPosition(selectedObject) : null),
        [selectedObject]
    );

    return (
        <>
            {Object.entries(groupedPoints).map(([type, points]) => (
                <ObjectPointLayer
                    key={type}
                    type={type}
                    points={points}
                    onSelect={onSelect}
                />
            ))}

            {selectedPosition && <SelectedMarker position={selectedPosition} />}
        </>
    );
}

function SelectedMarker({ position }) {
    const markerRef = useRef(null);

    useFrame(({ clock }) => {
        if (!markerRef.current) return;
        const pulse = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.22;
        markerRef.current.scale.setScalar(pulse);
    });

    return (
        <group position={position}>
            <mesh ref={markerRef}>
                <sphereGeometry args={[0.09, 16, 16]} />
                <meshBasicMaterial color="#56d6ff" toneMapped={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.18, 0.012, 8, 64]} />
                <meshBasicMaterial
                    color="#56d6ff"
                    transparent
                    opacity={0.78}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}

function ObjectLabels({ objects, onSelect }) {
    const labelledObjects = useMemo(() => {
        const riskWeight = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2 };

        return [...objects]
            .filter((object) => objectPosition(object))
            .sort(
                (a, b) =>
                    (riskWeight[normaliseRisk(b)] || 0) -
                    (riskWeight[normaliseRisk(a)] || 0)
            )
            .slice(0, 5);
    }, [objects]);

    return labelledObjects.map((object) => {
        const position = objectPosition(object);
        const name = object?.name || `NORAD ${object?.norad_id || object?.id || '—'}`;
        const norad = object?.norad_id || object?.norad || object?.id || '—';

        return (
            <Html
                key={object?.id || object?.norad_id || name}
                position={position}
                center
                distanceFactor={8.5}
                zIndexRange={[20, 0]}
                style={{ pointerEvents: 'none' }}
            >
                <button
                    type="button"
                    onClick={() => onSelect?.(object)}
                    className="pointer-events-auto min-w-max border-l border-cyan-200/50 bg-black/55 px-2.5 py-1.5 text-left font-mono shadow-[0_0_22px_rgba(0,0,0,0.65)] backdrop-blur-md"
                >
                    <span className="block text-[10px] tracking-[0.1em] text-slate-100">
                        {name.length > 22 ? `${name.slice(0, 22)}…` : name}
                    </span>
                    <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-slate-500">
                        NORAD {norad}
                    </span>
                </button>
            </Html>
        );
    });
}

function RotatingWorld({
    objects,
    selectedObject,
    onSelect,
    isRotating,
    showLabels,
    showOrbitBands,
}) {
    const worldRef = useRef(null);

    useFrame((_, delta) => {
        if (worldRef.current && isRotating) {
            worldRef.current.rotation.y += delta * 0.028;
        }
    });

    return (
        <group ref={worldRef}>
            <Earth />
            {showOrbitBands && <OrbitBands />}
            <ObjectPoints
                objects={objects}
                selectedObject={selectedObject}
                onSelect={onSelect}
            />
            {showLabels && <ObjectLabels objects={objects} onSelect={onSelect} />}
        </group>
    );
}

function CameraRig({ controlRef }) {
    const controlsRef = useRef(null);
    const animationRef = useRef(null);
    const initialFitRef = useRef(false);
    const { camera, size } = useThree();

    const getFitDistance = (radius, padding = 1.12) => {
        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const aspect = Math.max(size.width / Math.max(size.height, 1), 0.1);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
        const limitingFov = Math.max(Math.min(verticalFov, horizontalFov), 0.18);

        return THREE.MathUtils.clamp(
            (radius / Math.sin(limitingFov / 2)) * padding,
            MIN_CAMERA_DISTANCE,
            MAX_CAMERA_DISTANCE
        );
    };

    const animateToDistance = (distance, duration = 0.72) => {
        const controls = controlsRef.current;
        if (!controls) return;

        const currentOffset = camera.position.clone().sub(controls.target);
        const direction =
            currentOffset.lengthSq() > 0.0001
                ? currentOffset.normalize()
                : HOME_CAMERA_POSITION.clone().normalize();

        animationRef.current = {
            cameraStart: camera.position.clone(),
            cameraEnd: HOME_TARGET.clone().add(direction.multiplyScalar(distance)),
            targetStart: controls.target.clone(),
            targetEnd: HOME_TARGET.clone(),
            elapsed: 0,
            duration,
        };
    };

    useImperativeHandle(
        controlRef,
        () => ({
            zoomIn() {
                const controls = controlsRef.current;
                if (!controls) return;

                const offset = camera.position.clone().sub(controls.target);
                const nextDistance = THREE.MathUtils.clamp(
                    offset.length() * 0.82,
                    MIN_CAMERA_DISTANCE,
                    MAX_CAMERA_DISTANCE
                );

                camera.position.copy(
                    controls.target
                        .clone()
                        .add(offset.normalize().multiplyScalar(nextDistance))
                );
                controls.update();
            },
            zoomOut() {
                const controls = controlsRef.current;
                if (!controls) return;

                const offset = camera.position.clone().sub(controls.target);
                const nextDistance = THREE.MathUtils.clamp(
                    offset.length() * 1.22,
                    MIN_CAMERA_DISTANCE,
                    MAX_CAMERA_DISTANCE
                );

                camera.position.copy(
                    controls.target
                        .clone()
                        .add(offset.normalize().multiplyScalar(nextDistance))
                );
                controls.update();
            },
            resetView() {
                animateToDistance(getFitDistance(EARTH_FIT_RADIUS, 1.1));
            },
            fitAll() {
                animateToDistance(getFitDistance(ORBIT_FIT_RADIUS, 1.08));
            },
        }),
        [camera, size.height, size.width]
    );

    useFrame((_, delta) => {
        const controls = controlsRef.current;
        if (!controls) return;

        if (!initialFitRef.current) {
            initialFitRef.current = true;
            animateToDistance(getFitDistance(EARTH_FIT_RADIUS, 1.12), 0.01);
        }

        const animation = animationRef.current;
        if (!animation) return;

        animation.elapsed += delta;
        const rawProgress = Math.min(animation.elapsed / animation.duration, 1);
        const progress = 1 - Math.pow(1 - rawProgress, 3);

        camera.position.lerpVectors(
            animation.cameraStart,
            animation.cameraEnd,
            progress
        );
        controls.target.lerpVectors(
            animation.targetStart,
            animation.targetEnd,
            progress
        );
        controls.update();

        if (rawProgress >= 1) {
            animationRef.current = null;
        }
    });

    return (
        <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.065}
            rotateSpeed={0.48}
            zoomSpeed={0.8}
            enablePan={false}
            enableZoom
            minDistance={MIN_CAMERA_DISTANCE}
            maxDistance={MAX_CAMERA_DISTANCE}
            minPolarAngle={0.16}
            maxPolarAngle={Math.PI - 0.16}
        />
    );
}

const GlobeVisualization = forwardRef(function GlobeVisualization(
    {
        enabledTypes,
        elevatedRiskOnly,
        showLabels,
        showOrbitBands,
        isRotating,
        selectedObject,
        onSelectObject,
        onObjects,
        onTelemetry,
    },
    controlRef
) {
    const [cachedFrame] = useState(() => readCachedFrame());
    const [objects, setObjects] = useState(() => cachedFrame?.objects || []);
    const [loading, setLoading] = useState(() => !cachedFrame?.objects?.length);
    const [syncPhase, setSyncPhase] = useState(() =>
        cachedFrame?.objects?.length ? 'refreshing' : 'connecting'
    );
    const [error, setError] = useState('');
    const objectsRef = useRef(cachedFrame?.objects || []);

    useEffect(() => {
        let active = true;
        let currentController = null;
        let nextTimer = null;
        let fullFrameTimer = null;

        const schedule = (callback, delay) => {
            window.clearTimeout(nextTimer);
            nextTimer = window.setTimeout(callback, delay);
        };

        const publishTelemetry = (payload, liveObjects, warming) => {
            onTelemetry?.({
                status: warming
                    ? 'loading'
                    : payload?.source_status === 'stale'
                      ? 'stale'
                      : 'live',
                source: payload?.source_name || payload?.source || 'CelesTrak',
                sourceStatus: payload?.source_status,
                total:
                    payload?.total_available ??
                    payload?.count ??
                    liveObjects.length,
                updatedAt:
                    payload?.positions_generated_at ||
                    cachedFrame?.updatedAt ||
                    new Date().toISOString(),
                fetchedAt: payload?.last_successful_fetch,
                propagator: payload?.propagator || 'SGP4',
                dataMode: payload?.data_mode || (warming ? 'warming' : 'live-propagated'),
                usingCachedElements: payload?.using_cached_elements,
            });
        };

        const load = async (limit = PREVIEW_OBJECT_LIMIT) => {
            currentController?.abort();
            currentController = new AbortController();

            if (objectsRef.current.length) {
                setSyncPhase(limit >= FULL_OBJECT_LIMIT ? 'expanding' : 'refreshing');
            } else {
                setSyncPhase('connecting');
            }

            try {
                const payload = await fetchLiveObjects({
                    limit,
                    signal: currentController.signal,
                    timeoutMs: limit >= FULL_OBJECT_LIMIT ? 12_000 : 7_000,
                });

                if (!active) return;

                const liveObjects = Array.isArray(payload?.objects)
                    ? payload.objects
                    : [];
                const warming = isWarmingPayload(payload, liveObjects);

                if (liveObjects.length) {
                    objectsRef.current = liveObjects;
                    setObjects(liveObjects);
                    onObjects?.(liveObjects);
                    writeCachedFrame(payload, liveObjects);
                    setLoading(false);
                    setError('');
                } else if (!objectsRef.current.length) {
                    setLoading(true);
                }

                publishTelemetry(payload, liveObjects, warming);

                if (warming) {
                    setSyncPhase('connecting');
                    schedule(() => load(PREVIEW_OBJECT_LIMIT), FAST_POLL_INTERVAL_MS);
                    return;
                }

                if (liveObjects.length && limit < FULL_OBJECT_LIMIT) {
                    setSyncPhase('expanding');
                    window.clearTimeout(fullFrameTimer);
                    fullFrameTimer = window.setTimeout(
                        () => load(FULL_OBJECT_LIMIT),
                        180
                    );
                    return;
                }

                setSyncPhase('live');
                schedule(() => load(FULL_OBJECT_LIMIT), LIVE_POLL_INTERVAL_MS);
            } catch (requestError) {
                if (!active || requestError?.name === 'AbortError') return;

                const message =
                    requestError?.message ||
                    'Unable to reach the OrbitOPS live tracking API.';

                setError(message);
                setLoading(false);
                setSyncPhase(objectsRef.current.length ? 'degraded' : 'connecting');
                onTelemetry?.({
                    status: objectsRef.current.length ? 'stale' : 'offline',
                    source: 'CelesTrak',
                    total: objectsRef.current.length,
                    propagator: 'SGP4',
                    error: message,
                });

                schedule(
                    () => load(objectsRef.current.length ? FULL_OBJECT_LIMIT : PREVIEW_OBJECT_LIMIT),
                    objectsRef.current.length ? 8_000 : 2_500
                );
            }
        };

        if (objectsRef.current.length) {
            onObjects?.(objectsRef.current);
            onTelemetry?.({
                status: 'stale',
                source: cachedFrame?.source || 'CelesTrak',
                sourceStatus: cachedFrame?.sourceStatus || 'cached-browser-frame',
                total: objectsRef.current.length,
                updatedAt: cachedFrame?.updatedAt || cachedFrame?.savedAt,
                fetchedAt: cachedFrame?.fetchedAt,
                propagator: cachedFrame?.propagator || 'SGP4',
                dataMode: 'cached-browser-frame',
                usingCachedElements: true,
            });
        }

        load(PREVIEW_OBJECT_LIMIT);

        return () => {
            active = false;
            currentController?.abort();
            window.clearTimeout(nextTimer);
            window.clearTimeout(fullFrameTimer);
        };
    }, [cachedFrame, onObjects, onTelemetry]);

    const visibleObjects = useMemo(
        () =>
            objects.filter((object) => {
                const type = normaliseType(object?.type);
                if (!enabledTypes?.[type]) return false;

                if (!elevatedRiskOnly) return true;
                return ['CRITICAL', 'HIGH', 'MEDIUM'].includes(
                    normaliseRisk(object)
                );
            }),
        [elevatedRiskOnly, enabledTypes, objects]
    );

    const syncLabel =
        syncPhase === 'expanding'
            ? 'LOADING FULL OBJECT CATALOG'
            : syncPhase === 'refreshing'
              ? 'REFRESHING ORBITAL POSITIONS'
              : 'CONNECTING LIVE TELEMETRY';

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#03070b]">
            <Canvas
                dpr={[1, 1.7]}
                camera={{
                    position: HOME_CAMERA_POSITION.toArray(),
                    fov: 41,
                    near: 0.1,
                    far: 220,
                }}
                gl={{
                    antialias: true,
                    alpha: true,
                    powerPreference: 'high-performance',
                }}
                onCreated={({ gl }) => {
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.08;
                    gl.setClearColor('#03070b', 1);
                }}
            >
                <ambientLight intensity={0.22} />
                <directionalLight
                    position={[-6, 3.5, 7]}
                    intensity={2.35}
                    color="#dbeafe"
                />
                <pointLight
                    position={[7, -4, -5]}
                    intensity={0.42}
                    color="#4ea5ff"
                />

                <Stars
                    radius={110}
                    depth={55}
                    count={2800}
                    factor={3.4}
                    saturation={0}
                    fade
                    speed={0.18}
                />

                <Suspense fallback={null}>
                    <RotatingWorld
                        objects={visibleObjects}
                        selectedObject={selectedObject}
                        onSelect={onSelectObject}
                        isRotating={isRotating}
                        showLabels={showLabels}
                        showOrbitBands={showOrbitBands}
                    />
                </Suspense>

                <CameraRig controlRef={controlRef} />
            </Canvas>

            <div
                className="pointer-events-none absolute inset-0 opacity-[0.1]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)',
                    backgroundSize: '56px 56px',
                    maskImage:
                        'radial-gradient(circle at center, transparent 20%, black 100%)',
                }}
            />

            {(loading || ['connecting', 'refreshing', 'expanding'].includes(syncPhase)) && (
                <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2">
                    <div className="flex items-center gap-3 border border-cyan-300/15 bg-[#050a10]/85 px-4 py-2.5 shadow-[0_14px_45px_rgba(0,0,0,0.35)] backdrop-blur-md">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                        <div>
                            <p className="font-mono text-[9px] tracking-[0.2em] text-slate-200">
                                {syncLabel}
                            </p>
                            {loading && !objects.length && (
                                <p className="mt-1 font-mono text-[7px] tracking-[0.12em] text-slate-500">
                                    EARTH CONTROLS REMAIN AVAILABLE WHILE DATA WARMS UP
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div
                    className={`absolute bottom-5 left-1/2 z-20 w-[min(92%,560px)] -translate-x-1/2 border px-4 py-3 text-center font-mono text-[10px] leading-5 backdrop-blur-xl ${
                        objects.length
                            ? 'border-amber-400/25 bg-amber-950/75 text-amber-100'
                            : 'border-rose-400/25 bg-rose-950/85 text-rose-100'
                    }`}
                >
                    {objects.length
                        ? `${error}. Displaying the last real orbital frame while reconnecting.`
                        : `${error}. OrbitOPS will retry automatically.`}
                </div>
            )}
        </div>
    );
});

useTexture.preload(TEXTURES.day);
useTexture.preload(TEXTURES.night);
useTexture.preload(TEXTURES.normal);
useTexture.preload(TEXTURES.specular);
useTexture.preload(TEXTURES.clouds);

export default GlobeVisualization;
