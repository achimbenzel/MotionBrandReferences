import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { PanelLeft } from 'lucide-react';
import MobileBar from './components/MobileBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import UploadModal from './components/UploadModal.jsx';
import NewPlanModal from './components/NewPlanModal.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { StorageProvider } from './components/StorageMeter.jsx';
// The two landing pages load eagerly (shown first); everything else is split
// into its own chunk so, e.g., the Brand Tester isn't downloaded just to browse
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
const InboxPage = lazy(() => import('./pages/InboxPage.jsx'));
const StoryboardsPage = lazy(() => import('./pages/StoryboardsPage.jsx'));
const StoryboardEditor = lazy(() => import('./pages/StoryboardEditor.jsx'));
const MockupsPage = lazy(() => import('./pages/MockupsPage.jsx'));
const MockupOpen = lazy(() => import('./pages/MockupOpen.jsx'));
import { TABS, isWorkPath, WORK_HOME } from './lib/types.js';
import { useMediaQuery, DESKTOP } from './lib/useMedia.js';

function Shell() {
  const [modalType, setModalType] = useState(null); // null = closed
  const [newPlan, setNewPlan] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1'; } catch { return false; }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const workMode = isWorkPath(location.pathname);
  const isDesktop = useMediaQuery(DESKTOP);
  const [drawer, setDrawer] = useState(false); // phone / tablet: sidebar slid in

  // The drawer closes on navigation and when switching to the desktop layout;
  // while open, the page behind it doesn't scroll and Esc closes it.
  useEffect(() => { setDrawer(false); }, [location.pathname, isDesktop]);
  useEffect(() => {
    if (!drawer) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [drawer]);

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

  // "New plan" opens a dialog to name it and pick a template.
  const createPlan = useCallback(() => setNewPlan(true), []);
  const planCreated = useCallback((plan) => {
    setNewPlan(false);
    setReloadKey((k) => k + 1);
    navigate(`/plan/${plan.id}`);
  }, [navigate]);

  const onAdd = (key) => { setDrawer(false); (workMode ? createPlan : openModal)(key); };
  const openSearch = () => { setDrawer(false); setPaletteOpen(true); };
  const wide = location.pathname === '/board'; // the board uses the full desktop width

  return (
    <StorageProvider refreshKey={reloadKey}>
    <div className="app" data-sidebar={collapsed ? 'collapsed' : 'open'} data-drawer={drawer ? 'open' : 'closed'}>
      <Sidebar
        onAdd={onAdd}
        onSearch={openSearch}
        onToggle={isDesktop ? () => setCollapsed((c) => !c) : () => setDrawer(false)}
        drawer={!isDesktop}
        open={drawer}
      />
      {!isDesktop && <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <button className="sb-reopen icon-btn" onClick={() => setCollapsed(false)} title="Open sidebar" aria-label="Open sidebar">
        <PanelLeft size={17} />
      </button>
      <MobileBar onMenu={() => setDrawer(true)} onSearch={openSearch} onAdd={onAdd} />
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
                <Route path="/storyboards" element={<StoryboardsPage />} />
                <Route path="/storyboards/:planId/:blockId" element={<StoryboardEditor />} />
                <Route path="/mockups" element={<MockupsPage />} />
                <Route path="/mockups/:id" element={<MockupOpen />} />
                <Route path="/inbox" element={<InboxPage />} />
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
      {newPlan && <NewPlanModal onClose={() => setNewPlan(false)} onCreated={planCreated} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
    </StorageProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
