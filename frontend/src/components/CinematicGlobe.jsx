import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

function OrbitalRing({
    radius,
    rotation,
    speed,
    opacity = 0.22,
    accent = false
}) {
    const ringRef = useRef();

    useFrame((_, delta) => {
        if (!ringRef.current) return;

        ringRef.current.rotation.y += delta * speed;
        ringRef.current.rotation.z += delta * speed * 0.16;
    });

    return (
        <group ref={ringRef} rotation={rotation}>
            <mesh>
                <torusGeometry args={[radius, accent ? 0.007 : 0.004, 10, 240]} />
                <meshBasicMaterial
                    color={accent ? '#ff4438' : '#8b929c'}
                    transparent
                    opacity={opacity}
                    toneMapped={false}
                />
            </mesh>

            <mesh position={[radius, 0, 0]}>
                <sphereGeometry args={[accent ? 0.035 : 0.022, 14, 14]} />
                <meshBasicMaterial
                    color={accent ? '#ff4438' : '#d4d8dd'}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}

function DebrisField() {
    const pointsRef = useRef();

    const positions = useMemo(() => {
        const count = 1750;
        const values = new Float32Array(count * 3);

        for (let index = 0; index < count; index += 1) {
            const radius = 2.05 + Math.random() * 2.05;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            values[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
            values[index * 3 + 1] =
                radius * Math.cos(phi) * (0.34 + Math.random() * 0.35);
            values[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }

        return values;
    }, []);

    useFrame((_, delta) => {
        if (!pointsRef.current) return;
        pointsRef.current.rotation.y += delta * 0.018;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    array={positions}
                    count={positions.length / 3}
                    itemSize={3}
                />
            </bufferGeometry>

            <pointsMaterial
                color="#a8afb7"
                size={0.012}
                sizeAttenuation
                transparent
                opacity={0.42}
                depthWrite={false}
            />
        </points>
    );
}

function Earth() {
    const earthRef = useRef();

    useFrame((_, delta) => {
        if (!earthRef.current) return;
        earthRef.current.rotation.y += delta * 0.035;
    });

    return (
        <group ref={earthRef} rotation={[0.08, -0.35, -0.04]}>
            <mesh>
                <sphereGeometry args={[1.78, 96, 96]} />
                <meshStandardMaterial
                    color="#11171e"
                    emissive="#03070b"
                    emissiveIntensity={0.35}
                    roughness={0.72}
                    metalness={0.24}
                />
            </mesh>

            <mesh scale={1.003}>
                <sphereGeometry args={[1.78, 42, 42]} />
                <meshBasicMaterial
                    color="#667382"
                    wireframe
                    transparent
                    opacity={0.055}
                    depthWrite={false}
                />
            </mesh>

            <mesh scale={1.045}>
                <sphereGeometry args={[1.78, 64, 64]} />
                <meshBasicMaterial
                    color="#7890a8"
                    transparent
                    opacity={0.055}
                    side={THREE.BackSide}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}

function Scene() {
    return (
        <>
            <color attach="background" args={['#000000']} />

            <ambientLight intensity={0.16} />

            <directionalLight
                position={[-6, 3, 5]}
                intensity={3.4}
                color="#dce8f4"
            />

            <pointLight
                position={[4, -1, 4]}
                intensity={2.2}
                color="#526a86"
            />

            <pointLight
                position={[-4, -2, -3]}
                intensity={1.3}
                color="#ff3c32"
            />

            <Stars
                radius={95}
                depth={55}
                count={3600}
                factor={2.4}
                saturation={0}
                fade
                speed={0.18}
            />

            <group position={[0.46, 0.18, 0]}>
                <Earth />
                <DebrisField />

                <OrbitalRing
                    radius={2.35}
                    rotation={[0.55, 0.14, 0.24]}
                    speed={0.045}
                    opacity={0.18}
                />

                <OrbitalRing
                    radius={2.75}
                    rotation={[-0.42, 0.28, -0.26]}
                    speed={-0.035}
                    opacity={0.16}
                />

                <OrbitalRing
                    radius={3.22}
                    rotation={[0.18, -0.38, 0.55]}
                    speed={0.028}
                    opacity={0.15}
                />

                <OrbitalRing
                    radius={2.95}
                    rotation={[-0.68, 0.22, 0.16]}
                    speed={0.052}
                    opacity={0.55}
                    accent
                />
            </group>
        </>
    );
}

export default function CinematicGlobe() {
    return (
        <Canvas
            camera={{
                position: [0, 0, 7.1],
                fov: 34,
                near: 0.1,
                far: 150
            }}
            dpr={[1, 1.7]}
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
            <Scene />
        </Canvas>
    );
}
