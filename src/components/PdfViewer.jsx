import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { loadPdfjs } from '../lib/imaging.js';

export default function PdfViewer({ url }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFs, setIsFs] = useState(false);
  const [aspect, setAspect] = useState(null); // first page's width / height — sizes the stage
  const swipeRef = useRef(null);

  // Wrap-around page navigation (last → first, first → last).
  const goPage = useCallback((d) => setPage((p) => (numPages ? ((p - 1 + d + numPages) % numPages) + 1 : 1)), [numPages]);

  useEffect(() => {
    let cancelled = false;
    let task = null;
    setLoading(true); setError(null); setPage(1);
    loadPdfjs().then((pdfjsLib) => {
      if (cancelled) return;
      task = pdfjsLib.getDocument(url);
      task.promise.then((pdf) => {
        if (cancelled) { pdf.destroy(); return; }
        pdfRef.current = pdf;
        pdf.getPage(1).then((p) => {
          if (cancelled) return;
          const v = p.getViewport({ scale: 1 });
          setAspect(v.width / v.height);
        }).catch(() => {}).finally(() => {
          if (cancelled) return;
          setNumPages(pdf.numPages);
          setLoading(false);
        });
      }).catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
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
      // Fit the page inside the stage (both width and height); the stage keeps
      // the first page's proportions, so the side arrows stay put. On narrow
      // stages the arrows float over the page instead of taking room beside it.
      const narrow = stage.clientWidth < 600;
      const availW = stage.clientWidth - (narrow ? 16 : (pdf.numPages > 1 ? 108 : 32));
      const availH = stage.clientHeight - (narrow ? 16 : 24);
      const cssScale = Math.min(availW / unscaled.width, availH / unscaled.height);
      const scale = Math.max(0.15, cssScale) * dpr;
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      const task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
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

  const toggleFs = () => {
    const el = stageRef.current;
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  useEffect(() => {
    const onFs = () => {
      setIsFs(!!document.fullscreenElement);
      setTimeout(() => { if (!loading && numPages) renderPage(page); }, 60);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [page, numPages, loading, renderPage]);

  // Touch: swipe the page left / right to turn it.
  const onPointerDown = (e) => { if (e.pointerType !== 'mouse') swipeRef.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const s0 = swipeRef.current; swipeRef.current = null;
    if (!s0 || numPages < 2) return;
    const dx = e.clientX - s0.x; const dy = e.clientY - s0.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goPage(dx < 0 ? 1 : -1);
  };

  // Arrow-key navigation (also wraps).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') goPage(1);
      if (e.key === 'ArrowLeft') goPage(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPage]);

  return (
    <div className="pdf-viewer">
      <div className={`pdf-stage ${isFs ? 'is-fs' : ''}`} ref={stageRef}
        style={aspect && !isFs ? { '--pdf-aspect': aspect } : undefined}
        onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipeRef.current = null; }}>
        {loading && <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} />}
        {error && <div className="center-msg">Couldn’t render PDF: {error}</div>}
        <canvas ref={canvasRef} style={{ display: loading || error ? 'none' : 'block' }} />

        <button className="pdf-fs icon-btn" onClick={toggleFs} title={isFs ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFs ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        {numPages > 1 && (
          <>
            <button className="stage-nav prev icon-btn" onClick={() => goPage(-1)} aria-label="Previous page"><ChevronLeft size={22} /></button>
            <button className="stage-nav next icon-btn" onClick={() => goPage(1)} aria-label="Next page"><ChevronRight size={22} /></button>
            <div className="stage-counter">{page} / {numPages}</div>
          </>
        )}
      </div>
    </div>
  );
}
