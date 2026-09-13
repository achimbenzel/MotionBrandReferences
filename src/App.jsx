import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { PanelLeft } from 'lucide-react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import UploadModal from './components/UploadModal.jsx';
import CommandPalette from './components/CommandPalette.jsx';
// The two landing pages load eagerly (shown first); everything else is split
// into its own chunk so, e.g., the Logo Tester isn't downloaded just to browse
// the Reference grid.
import GridPage from './pages/GridPage.jsx';
import WorkDashboard from './pages/WorkDashboard.jsx';
const ProjectDetail = lazy(() => import('./pages/ProjectDetail.jsx'));
const GalleryDetail = lazy(() => import('./pages/GalleryDetail.jsx'));
const PlansPage = lazy(() => import('./pages/PlansPage.jsx'));
const PlanDetail = lazy(() => import('./pages/PlanDetail.jsx'));
const LogoTester = lazy(() => import('./pages/LogoTester.jsx'));
const TodoBoard = lazy(() => import('./pages/TodoBoard.jsx'));
const SoftwarePage = lazy(() => import('./pages/SoftwarePage.jsx'));
const SoftwareDetail = lazy(() => import('./pages/SoftwareDetail.jsx'));
const TrashPage = lazy(() => import('./pages/TrashPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
import { TABS, isWorkPath, WORK_HOME } from './lib/types.js';
import { api } from './lib/api.js';

function Shell() {
  const [modalType, setModalType] = useState(null); // null = closed
  const [reloadKey, setReloadKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1'; } catch { return false; }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const workMode = isWorkPath(location.pathname);

  const openModal = useCallback((type) => setModalType(type || 'branding'), []);
  const closeModal = useCallback(() => setModalType(null), []);

  // ⌘/Ctrl-K toggles the command palette anywhere in the app.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const handleCreated = useCallback((project) => {
    setModalType(null);
    setReloadKey((k) => k + 1);
    if (project?.id) { toast('Project added'); navigate(`/project/${project.id}`); }
    else if (project?.type) { toast('Images added'); navigate(`/${project.type}`); }
  }, [navigate, toast]);

  const createPlan = useCallback(async () => {
    try {
      const plan = await api.createPlan('Untitled plan');
      setReloadKey((k) => k + 1);
      navigate(`/plan/${plan.id}`);
    } catch (e) { toast(`Could not create plan: ${e.message}`, 'error'); }
  }, [navigate, toast]);

  const onAdd = workMode ? createPlan : openModal;
  const wide = location.pathname === '/board'; // the board uses the full desktop width

  return (
    <div className="app" data-sidebar={collapsed ? 'collapsed' : 'open'}>
      <Sidebar onAdd={onAdd} onSearch={() => setPaletteOpen(true)} onToggle={() => setCollapsed((c) => !c)} storageKey={reloadKey} />
      <button className="sb-reopen icon-btn" onClick={() => setCollapsed(false)} title="Open sidebar" aria-label="Open sidebar">
        <PanelLeft size={17} />
      </button>
      <Header onAdd={onAdd} onSearch={() => setPaletteOpen(true)} storageKey={reloadKey} />
      <main className="main">
        <div className={`main-inner${wide ? ' wide' : ''}`}>
          <ErrorBoundary>
            <Suspense fallback={<div className="spinner" />}>
              <Routes>
                <Route path="/" element={<Navigate to={WORK_HOME} replace />} />
                {TABS.map((t) => (
                  <Route key={t.key} path={`/${t.key}`} element={<GridPage type={t.key} reloadKey={reloadKey} onAdd={openModal} />} />
                ))}
                <Route path="/gallery/:id" element={<GalleryDetail />} />
                <Route path="/project/:id" element={<ProjectDetail />} />
                <Route path="/work" element={<WorkDashboard reloadKey={reloadKey} onNewPlan={createPlan} />} />
                <Route path="/plan" element={<PlansPage reloadKey={reloadKey} onNewPlan={createPlan} />} />
                <Route path="/plan/:id" element={<PlanDetail />} />
                <Route path="/software" element={<SoftwarePage reloadKey={reloadKey} />} />
                <Route path="/software/:id" element={<SoftwareDetail />} />
                <Route path="/board" element={<TodoBoard />} />
                <Route path="/logo-tester" element={<LogoTester />} />
                <Route path="/trash" element={<TrashPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to={WORK_HOME} replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {modalType && (
        <UploadModal initialType={modalType} onClose={closeModal} onCreated={handleCreated} />
      )}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
