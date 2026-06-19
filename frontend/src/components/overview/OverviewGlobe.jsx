import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

const EARTH_RADIUS = 1.66;
const MAX_OBJECTS = 3500;

function getNumber(...values) {
    const value = values.find(
        candidate =>
            candidate !== null &&
            candidate !== undefined &&
            Number.isFinite(Number(candidate))
    );

    return value === undefined ? null : Number(value);
}

function getRisk(object) {
    return String(
        object?.risk_level ??
        object?.risk ??
        object?.severity ??
        'LOW'
    ).toUpperCase();
}

function EarthSystem() {
    const systemRef = useRef();

    useFrame((_, delta) => {
        if (!systemRef.current) return;
        systemRef.current.rotation.y += delta * 0.028;
    });

    return (
        <group ref={systemRef} rotation={[0.06, -0.3, -0.035]}>
            <mesh>
                <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
                <meshStandardMaterial
                    color="#11161b"
                    emissive="#030506"
                    emissiveIntensity={0.44}
                    roughness={0.76}
                    metalness={0.2}
                />
            </mesh>

            <mesh scale={1.0025}>
                <sphereGeometry args={[EARTH_RADIUS, 42, 42]} />
                <meshBasicMaterial
                    color="#a8b2bc"
                    wireframe
                    transparent
                    opacity={0.045}
                    depthWrite={false}
                />
            </mesh>

            <mesh scale={1.035}>
                <sphereGeometry args={[EARTH_RADIUS, 72, 72]} />
                <meshBasicMaterial
                    color="#90a4b7"
                    side={THREE.BackSide}
                    transparent
                    opacity={0.06}
                    depthWrite={false}
                />
            </mesh>

            <OrbitRing
                radius={2.04}
                rotation={[0.62, 0.1, 0.3]}
                opacity={0.14}
            />

            <OrbitRing
                radius={2.38}
                rotation={[-0.46, 0.22, -0.3]}
                opacity={0.11}
            />

            <OrbitRing
                radius={2.72}
                rotation={[0.2, -0.35, 0.52]}
                opacity={0.09}
            />
        </group>
    );
}

function OrbitRing({ radius, rotation, opacity }) {
    return (
        <mesh rotation={rotation}>
            <torusGeometry args={[radius, 0.004, 8, 220]} />
            <meshBasicMaterial
                color="#cbd1d7"
                transparent
                opacity={opacity}
                depthWrite={false}
                toneMapped={false}
            />
        </mesh>
    );
}

function LiveObjects({ data, onSelect }) {
    const meshRef = useRef();

    const points = useMemo(() => {
        return (data ?? [])
            .map((object, index) => {
                const latitude = getNumber(
                    object?.lat,
                    object?.latitude
                );

                const longitude = getNumber(
                    object?.lon,
                    object?.lng,
                    object?.longitude
                );

                const altitude = getNumber(
                    object?.alt,
                    object?.altitude,
                    object?.altitude_km
                );

                if (
                    latitude === null ||
                    longitude === null ||
                    altitude === null
                ) {
                    return null;
                }

                const orbitalHeight = THREE.MathUtils.clamp(
                    altitude / 6371,
                    0.018,
                    0.42
                );

                const radius =
                    EARTH_RADIUS +
                    orbitalHeight * EARTH_RADIUS * 1.7 +
                    0.05;

                const latitudeRadians =
                    THREE.MathUtils.degToRad(latitude);

                const longitudeRadians =
                    THREE.MathUtils.degToRad(-longitude);

                const x =
                    radius *
                    Math.cos(latitudeRadians) *
                    Math.cos(longitudeRadians);

                const y =
                    radius *
                    Math.sin(latitudeRadians);

                const z =
                    radius *
                    Math.cos(latitudeRadians) *
                    Math.sin(longitudeRadians);

                return {
                    id:
                        object?.id ??
                        object?.norad_id ??
                        object?.catalog_number ??
                        index,
                    object,
                    risk: getRisk(object),
                    position: [x, y, z]
                };
            })
            .filter(Boolean)
            .slice(0, MAX_OBJECTS);
    }, [data]);

    useEffect(() => {
        const mesh = meshRef.current;

        if (!mesh || points.length === 0) return;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        points.forEach((point, index) => {
            dummy.position.set(...point.position);

            const dangerous =
                point.risk === 'HIGH' ||
                point.risk === 'CRITICAL';

            const scale = dangerous ? 0.033 : 0.019;

            dummy.scale.setScalar(scale);
            dummy.updateMatrix();

            mesh.setMatrixAt(index, dummy.matrix);

            color.set(dangerous ? '#ff4338' : '#dce1e5');
            mesh.setColorAt(index, color);
        });

        mesh.instanceMatrix.needsUpdate = true;

        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    }, [points]);

    if (points.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[null, null, points.length]}
            frustumCulled={false}
            onPointerOver={() => {
                document.body.style.cursor = 'crosshair';
            }}
            onPointerOut={() => {
                document.body.style.cursor = '';
            }}
            onClick={event => {
                event.stopPropagation();

                if (
                    Number.isInteger(event.instanceId) &&
                    points[event.instanceId]
                ) {
                    onSelect?.(points[event.instanceId].object);
                }
            }}
        >
            <sphereGeometry args={[1, 8, 8]} />

            <meshBasicMaterial
                vertexColors
                transparent
                opacity={0.94}
                toneMapped={false}
            />
        </instancedMesh>
    );
}

function GlobeScene({ data, onSelect }) {
    return (
        <>
            <color attach="background" args={['#020202']} />

            <ambientLight intensity={0.18} />

            <directionalLight
                position={[-5, 3, 5]}
                intensity={3.5}
                color="#e9f0f5"
            />

            <pointLight
                position={[4, -2, 3]}
                intensity={2.1}
                color="#405468"
            />

            <pointLight
                position={[-4, -3, -3]}
                intensity={1}
                color="#ff352c"
            />

            <Stars
                radius={85}
                depth={45}
                count={2300}
                factor={2.2}
                saturation={0}
                fade
                speed={0.15}
            />

            <EarthSystem />
            <LiveObjects data={data} onSelect={onSelect} />

            <OrbitControls
                enablePan={false}
                enableZoom={false}
                enableDamping
                dampingFactor={0.06}
                autoRotate
                autoRotateSpeed={0.18}
            />
        </>
    );
}

export default function OverviewGlobe({ data, onSelect }) {
    return (
        <Canvas
            camera={{
                position: [0, 0, 5.8],
                fov: 38,
                near: 0.1,
                far: 100
            }}
            dpr={[1, 1.65]}
            gl={{
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance'
            }}
            onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.08;
            }}
        >
            <GlobeScene data={data} onSelect={onSelect} />
        </Canvas>
    );
}
