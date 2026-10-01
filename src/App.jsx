import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import MobileBar from './components/MobileBar.jsx';
import Sidebar from './components/Sidebar.jsx';
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
const TimeTracker = lazy(() => import('./pages/TimeTracker.jsx'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage.jsx'));
const ClientsPage = lazy(() => import('./pages/ClientsPage.jsx'));
const ClientDetail = lazy(() => import('./pages/ClientDetail.jsx'));
const NotesPage = lazy(() => import('./pages/NotesPage.jsx'));
const NoteDetail = lazy(() => import('./pages/NoteDetail.jsx'));
const ContentPage = lazy(() => import('./pages/ContentPage.jsx'));
const ContentDetail = lazy(() => import('./pages/ContentDetail.jsx'));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage.jsx'));
// Dialogs that open now and then load when first opened. (The picture-size
// prompt stays: it has to be there before the first upload asks for it.)
const UploadModal = lazy(() => import('./components/UploadModal.jsx'));
const NewPlanModal = lazy(() => import('./components/NewPlanModal.jsx'));
const CommandPalette = lazy(() => import('./components/CommandPalette.jsx'));
import { TABS, isWorkPath, WORK_HOME } from './lib/types.js';
import { useMediaQuery, DESKTOP } from './lib/useMedia.js';
import ImageUploadPrompt from './components/ImageUploadPrompt.jsx';
import ConflictPrompt from './components/ConflictPrompt.jsx';
import { getBoolPref, setBoolPref } from './lib/prefs.js';
import { api } from './lib/api.js';
import { setFormats } from './lib/format.js';

function Shell() {
  const [modalType, setModalType] = useState(null); // null = closed
  const [newPlan, setNewPlan] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => getBoolPref('sidebarCollapsed'));
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const workMode = isWorkPath(location.pathname);
  const isDesktop = useMediaQuery(DESKTOP);
  const [drawer, setDrawer] = useState(false); // phone / tablet: sidebar slid in

  // The drawer closes on navigation and when switching to the desktop layout;
  // while open, the page behind it doesn't scroll and Esc closes it.
  useEffect(() => { setDrawer(false); }, [location.pathname, isDesktop]);
  // Dates and numbers in the format chosen in the settings; everything shows it again when it changes.
  const [, setFormatsSeen] = useState(0);
  useEffect(() => {
    api.getSettings().then((st) => setFormats(st?.formats)).catch(() => {});
    const changed = () => setFormatsSeen((n) => n + 1);
    window.addEventListener('confinium:formats', changed);
    return () => window.removeEventListener('confinium:formats', changed);
  }, []);
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
    setBoolPref('sidebarCollapsed', collapsed);
  }, [collapsed]);

  const handleCreated = useCallback((project) => {
    setModalType(null);
    setReloadKey((k) => k + 1);
    if (project?.id) { toast('Reference added'); navigate(`/project/${project.id}`); }
    else if (project?.type) { toast('Images added'); navigate(`/${project.type}`); }
  }, [navigate, toast]);

  // "New project" opens a dialog to name it, pick its client and a template
  // (from a client's page with that client set: { clientId }).
  const createPlan = useCallback((opts) => setNewPlan({ clientId: typeof opts?.clientId === 'string' ? opts.clientId : '' }), []);
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
        rail={isDesktop && collapsed}
      />
      {!isDesktop && <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />}
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
                <Route path="/time" element={<TimeTracker />} />
                <Route path="/expenses" element={<ExpensesPage reloadKey={reloadKey} />} />
                <Route path="/clients" element={<ClientsPage reloadKey={reloadKey} />} />
                <Route path="/clients/:id" element={<ClientDetail onNewPlan={createPlan} />} />
                <Route path="/notes" element={<NotesPage reloadKey={reloadKey} />} />
                <Route path="/notes/:id" element={<NoteDetail />} />
                <Route path="/content" element={<ContentPage reloadKey={reloadKey} />} />
                <Route path="/content/:id" element={<ContentDetail />} />
                <Route path="/achievements" element={<AchievementsPage reloadKey={reloadKey} />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/trash" element={<TrashPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to={WORK_HOME} replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <ErrorBoundary>
        {modalType && (
          <Suspense fallback={null}><UploadModal initialType={modalType} onClose={closeModal} onCreated={handleCreated} /></Suspense>
        )}
        {newPlan && <Suspense fallback={null}><NewPlanModal clientId={newPlan.clientId} onClose={() => setNewPlan(false)} onCreated={planCreated} /></Suspense>}
        {paletteOpen && <Suspense fallback={null}><CommandPalette onClose={() => setPaletteOpen(false)} /></Suspense>}
      </ErrorBoundary>
      <ImageUploadPrompt />
      <ConflictPrompt />
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
