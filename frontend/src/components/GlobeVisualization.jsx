import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';

const EARTH_RADIUS = 5;

function Earth() {
    const earthRef = useRef();

    useFrame(({ clock }) => {
        if (earthRef.current) {
            earthRef.current.rotation.y = clock.getElapsedTime() * 0.05;
        }
    });

    return (
        <group ref={earthRef}>
            {/* Core Sphere (Black/Dark Blue) */}
            <mesh>
                <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
                <meshPhongMaterial
                    color="#050510"
                    emissive="#000000"
                    specular="#111111"
                    shininess={5}
                />
            </mesh>

            {/* Wireframe Overlay (Holo-grid) */}
            <mesh>
                <sphereGeometry args={[EARTH_RADIUS + 0.02, 32, 32]} />
                <meshBasicMaterial
                    color="#1e1e3f"
                    wireframe
                    transparent
                    opacity={0.15}
                />
            </mesh>

            {/* Atmosphere Glow */}
            <mesh scale={[1.1, 1.1, 1.1]}>
                <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
                <meshBasicMaterial
                    color="#0044ff"
                    transparent
                    opacity={0.05}
                    side={THREE.BackSide}
                />
            </mesh>
        </group>
    );
}

function DebrisSwarm({ data }) {
    const meshRef = useRef();
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // Convert lat/lon/alt to Cartesian
    const particles = useMemo(() => {
        if (!data || data.length === 0) return [];

        return data.map(obj => {
            // Simple spherical conversion
            // alt is in km, Earth radius ~6371km. 
            // Scale: 1 unit = 1000km approx for visual clarity? 
            // Actually let's just scale strictly relative to radius 5.
            // Real Earth R = 6371. LEO is 200-2000km.

            const r = EARTH_RADIUS + (obj.alt / 6371) * EARTH_RADIUS * 2; // Exaggerate height for visuals
            const lat = obj.lat * (Math.PI / 180);
            const lon = -obj.lon * (Math.PI / 180);

            const x = r * Math.cos(lat) * Math.cos(lon);
            const y = r * Math.sin(lat);
            const z = r * Math.cos(lat) * Math.sin(lon);

            return { position: [x, y, z], type: obj.type };
        });
    }, [data]);

    useFrame(() => {
        if (meshRef.current && particles.length > 0) {
            particles.forEach((particle, i) => {
                dummy.position.set(...particle.position);

                // Scale based on type
                const s = particle.type === 'DEBRIS' ? 0.035 : 0.06;
                dummy.scale.set(s, s, s);

                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);

                // Set per-instance color: debris = soft purple, satellite = neon cyan
                const col = particle.type === 'DEBRIS' ? '#b687ff' : '#00f0ff';
                meshRef.current.setColorAt(i, new THREE.Color(col));
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    });

    if (particles.length === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[null, null, particles.length]} castShadow>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial emissive={'#001122'} roughness={0.2} metalness={0.6} />
        </instancedMesh>
    );
}

const GlobeVisualization = () => {
    const [debrisData, setDebrisData] = useState([]);

    useEffect(() => {
        // Poll for positions (in a real app, use websockets or 1s intervals)
        const fetchData = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/debris');
                const json = await res.json();
                setDebrisData(json.objects || []);
            } catch (e) {
                // Fallback mock data if API fails (for demo visuals)
                console.warn("API fail, using mock data");
                const mock = Array.from({ length: 500 }).map((_, i) => ({
                    lat: (Math.random() - 0.5) * 180,
                    lon: (Math.random() - 0.5) * 360,
                    alt: 500 + Math.random() * 1000,
                    type: Math.random() > 0.8 ? 'DEBRIS' : 'SATELLITE'
                }));
                setDebrisData(mock);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000); // 5s refresh
        return () => clearInterval(interval);
    }, []);

    return (
        <Canvas camera={{ position: [0, 0, 12], fov: 45 }}>
            <ambientLight intensity={0.6} />
            <pointLight position={[10, 10, 10]} intensity={1} color="#44aaff" />
            <pointLight position={[-10, -10, -10]} intensity={0.4} color="#b687ff" />

            <Stars radius={120} depth={60} count={4000} factor={6} saturation={0} fade speed={0.6} />

            <Earth />

            {/* Glowing orbital ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[6.6, 0.01, 8, 200]} />
                <meshBasicMaterial color="#00f0ff" transparent opacity={0.06} toneMapped={false} />
            </mesh>

            {/* Satellites / Debris */}
            <DebrisSwarm data={debrisData} />

            <OrbitControls
                enablePan={false}
                enableZoom={true}
                minDistance={7}
                maxDistance={20}
                autoRotate={false}
            />
        </Canvas>
    );
};

export default GlobeVisualization;
