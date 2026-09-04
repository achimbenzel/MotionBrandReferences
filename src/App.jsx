import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider, useToast } from './components/Toast.jsx';
import Header from './components/Header.jsx';
import UploadModal from './components/UploadModal.jsx';
import GridPage from './pages/GridPage.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';

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
    toast('Project added');
    navigate(`/project/${project.id}`);
  }, [navigate, toast]);

  return (
    <div className="app">
      <Header onAdd={openModal} />
      <Routes>
        <Route path="/" element={<Navigate to="/branding" replace />} />
        <Route path="/branding" element={<GridPage type="branding" reloadKey={reloadKey} onAdd={openModal} />} />
        <Route path="/motion" element={<GridPage type="motion" reloadKey={reloadKey} onAdd={openModal} />} />
        <Route path="/color" element={<GridPage type="color" reloadKey={reloadKey} onAdd={openModal} />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
        <Route path="*" element={<Navigate to="/branding" replace />} />
      </Routes>

      {modalType && (
        <UploadModal
          initialType={modalType}
          onClose={closeModal}
          onCreated={handleCreated}
        />
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
