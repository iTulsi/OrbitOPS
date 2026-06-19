import { lazy, Suspense, useEffect, useState } from 'react';
import {
    BrowserRouter as Router,
    Navigate,
    Route,
    Routes
} from 'react-router-dom';
import './command-center.css';

import Layout from './components/Layout';


import { orbitApi } from './services/api';
import { orbitSocket as socket } from './services/socket';

import OrbitMotionStage from './components/OrbitMotionStage';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Home = lazy(() => import('./pages/Home'));
const Visualization = lazy(() => import('./pages/Visualization'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Reports = lazy(() => import('./pages/Reports'));
const Satellites = lazy(() => import('./pages/Satellites'));
const Launches = lazy(() => import('./pages/Launches'));

function RouteLoader() {
    return (
        <div
            className="route-loading-shell"
            role="status"
            aria-live="polite"
        >
            <span
                className="route-loading-indicator"
                aria-hidden="true"
            />
            <span>Loading mission module…</span>
        </div>
    );
}

function AppPage({ children, connected }) {
    return (
        <Layout connected={connected}>
            {children}
        </Layout>
    );
}

function App() {
    const [orbitData, setOrbitData] = useState({
        objects: [],
        stats: {},
        last_updated: 0,
        source: 'celestrak'
    });

    const [connected, setConnected] = useState(false);

    useEffect(() => {
        let cancelled = false;

        orbitApi
            .debris()
            .then((data) => {
                if (cancelled || !data) return;

                setOrbitData({
                    objects: data.objects ?? [],
                    stats: data.stats ?? {},
                    last_updated:
                        data.last_updated ??
                        data.updated_at ??
                        Date.now() / 1000,
                    source: data.source ?? 'celestrak'
                });
            })
            .catch((error) => {
                console.error('Initial orbital-data load failed:', error);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const handleConnect = () => {
            console.log('Connected to OrbitOPS real-time stream');
            setConnected(true);
        };

        const handleOrbitalData = (data) => {
            if (!data) return;

            setOrbitData((current) => ({
                objects: data.objects ?? current.objects,
                stats: data.stats ?? current.stats,
                last_updated:
                    data.last_updated ??
                    data.updated_at ??
                    Date.now() / 1000,
                source: data.source ?? current.source
            }));
        };

        const handleDisconnect = () => {
            console.log('Disconnected from OrbitOPS stream');
            setConnected(false);
        };

        socket.on('connect', handleConnect);
        socket.on('orbital_data', handleOrbitalData);
        socket.on('disconnect', handleDisconnect);

        setConnected(socket.connected);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('orbital_data', handleOrbitalData);
            socket.off('disconnect', handleDisconnect);
        };
    }, []);

    const handleRefresh = async () => {
        try {
            const data = await orbitApi.debris();

            setOrbitData((current) => ({
                objects: data.objects ?? current.objects,
                stats: data.stats ?? current.stats,
                last_updated:
                    data.last_updated ??
                    data.updated_at ??
                    Date.now() / 1000,
                source: data.source ?? current.source
            }));
        } catch (error) {
            console.error('Manual orbital-data refresh failed:', error);
        }
    };

    return (
        <Router>
            <OrbitMotionStage>
            <Suspense fallback={<RouteLoader />}>
                <Routes>
                <Route
                    path="/"
                    element={
                        <Home
                            connected={connected}
                            stats={orbitData.stats}
                            lastUpdated={orbitData.last_updated}
                        />
                    }
                />

                <Route
                    path="/overview"
                    element={
                        <AppPage connected={connected}>
                            <div className="relative z-10 min-h-full w-full">
                                <Dashboard
                                    data={orbitData.objects}
                                    stats={orbitData.stats}
                                    onRefresh={handleRefresh}
                                    lastUpdated={orbitData.last_updated}
                                    source={orbitData.source}
                                    connected={connected}
                                />
                            </div>
                        </AppPage>
                    }
                />

                <Route
                    path="/live-tracking"
                    element={
                        <AppPage connected={connected}>
                            <Visualization
                                data={orbitData.objects}
                                connected={connected}
                                lastUpdated={orbitData.last_updated}
                                source={orbitData.source}
                            />
                        </AppPage>
                    }
                />

                <Route
                    path="/conjunctions"
                    element={
                        <AppPage connected={connected}>
                            <Alerts />
                        </AppPage>
                    }
                />

                <Route
                    path="/analytics"
                    element={
                        <AppPage connected={connected}>
                            <Launches />
                        </AppPage>
                    }
                />

                <Route
                    path="/object-catalog"
                    element={
                        <AppPage connected={connected}>
                            <Satellites />
                        </AppPage>
                    }
                />

                <Route
                    path="/ai-briefing"
                    element={<Navigate to="/reports" replace />}
                />

                <Route
                    path="/reports"
                    element={
                        <AppPage connected={connected}>
                            <Reports />
                        </AppPage>
                    }
                />

                {/* Compatibility redirects for the existing application URLs */}
                <Route
                    path="/dashboard"
                    element={<Navigate to="/overview" replace />}
                />
                <Route
                    path="/visualization"
                    element={<Navigate to="/live-tracking" replace />}
                />
                <Route
                    path="/alerts"
                    element={<Navigate to="/conjunctions" replace />}
                />
                <Route
                    path="/satellites"
                    element={<Navigate to="/object-catalog" replace />}
                />
                <Route
                    path="/launches"
                    element={<Navigate to="/analytics" replace />}
                />

                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
            </OrbitMotionStage>
        </Router>
    );
}

export default App;
