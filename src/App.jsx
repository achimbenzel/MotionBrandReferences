import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Header from './components/Header.jsx';
import UploadModal from './components/UploadModal.jsx';
import GridPage from './pages/GridPage.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import GalleryDetail from './pages/GalleryDetail.jsx';
import { TABS } from './lib/types.js';

function Shell() {
  const [modalType, setModalType] = useState(null); // null = closed
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();
  const toast = useToast();

  const openModal = useCallback((type) => setModalType(type || 'branding'), []);
  const closeModal = useCallback(() => setModalType(null), []);

  const handleCreated = useCallback((project) => {
    setModalType(null);
    setReloadKey((k) => k + 1);
    if (project?.id) { toast('Project added'); navigate(`/project/${project.id}`); }
    else if (project?.type) { toast('Images added'); navigate(`/${project.type}`); }
  }, [navigate, toast]);

  return (
    <div className="app">
      <Header onAdd={openModal} storageKey={reloadKey} />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Navigate to="/branding" replace />} />
          {TABS.map((t) => (
            <Route key={t.key} path={`/${t.key}`} element={<GridPage type={t.key} reloadKey={reloadKey} onAdd={openModal} />} />
          ))}
          <Route path="/gallery/:id" element={<GalleryDetail />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="*" element={<Navigate to="/branding" replace />} />
        </Routes>
      </ErrorBoundary>

      {modalType && (
        <UploadModal initialType={modalType} onClose={closeModal} onCreated={handleCreated} />
      )}
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
