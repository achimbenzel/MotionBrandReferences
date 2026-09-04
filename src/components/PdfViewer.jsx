import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Self-hosted worker (bundled by Vite — no external CDN).
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfViewer({ url }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfRef = useRef(null);
  const renderTaskRef = useRef(null);
  const fsRef = useRef(false);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFs, setIsFs] = useState(false);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    const task = pdfjsLib.getDocument(url);
    task.promise.then((pdf) => {
      if (cancelled) { pdf.destroy(); return; }
      pdfRef.current = pdf;
      setNumPages(pdf.numPages);
      setLoading(false);
    }).catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [url]);

  const renderPage = useCallback(async (num) => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!pdf || !canvas || !stage) return;
    try {
      renderTaskRef.current?.cancel();
      const pdfPage = await pdf.getPage(num);
      const unscaled = pdfPage.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const availW = stage.clientWidth - 2;
      const availH = fsRef.current ? stage.clientHeight - 2 : Infinity;
      let cssScale = availW / unscaled.width;
      if (Number.isFinite(availH)) cssScale = Math.min(cssScale, availH / unscaled.height);
      const scale = Math.max(0.2, cssScale) * dpr;
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      const ctx = canvas.getContext('2d');
      const task = pdfPage.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') setError(e.message);
    }
  }, []);

  useEffect(() => { if (!loading && numPages) renderPage(page); }, [page, numPages, loading, renderPage]);

  useEffect(() => {
    const onResize = () => { if (!loading && numPages) renderPage(page); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [page, numPages, loading, renderPage]);

  // Fullscreen handling.
  const toggleFs = () => {
    const el = stageRef.current;
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  useEffect(() => {
    const onFs = () => {
      fsRef.current = !!document.fullscreenElement;
      setIsFs(fsRef.current);
      // Re-render at the new size after the transition settles.
      setTimeout(() => { if (!loading && numPages) renderPage(page); }, 60);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [page, numPages, loading, renderPage]);

  // Arrow-key navigation.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(p + 1, numPages));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(p - 1, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages]);

  return (
    <div className="pdf-viewer">
      <div className={`pdf-stage ${isFs ? 'is-fs' : ''}`} ref={stageRef}>
        {loading && <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} />}
        {error && <div className="center-msg">Couldn’t render PDF: {error}</div>}
        <canvas ref={canvasRef} style={{ display: loading || error ? 'none' : 'block' }} />

        <button className="pdf-fs icon-btn" onClick={toggleFs} title={isFs ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFs ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        {numPages > 1 && (
          <div className="pdf-controls overlay-bar">
            <button className="icon-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={18} /></button>
            <span className="page-num">{page} / {numPages}</span>
            <button className="icon-btn" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}><ChevronRight size={18} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
