import { useRef, useState } from 'react';
import { Palette, Plus, Tag, Maximize2, Wand2, Download, Contrast } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import ColorCard from '../components/ColorCard.jsx';
import ColorBuilder from '../components/ColorBuilder.jsx';
import ContrastChecker from '../components/ContrastChecker.jsx';
import TagInput from '../components/TagInput.jsx';
import Lightbox from '../components/Lightbox.jsx';
import NotesField from '../components/NotesField.jsx';
import DetailLayout from '../components/DetailLayout.jsx';
import Menu from '../components/Menu.jsx';
import { extractPalette } from '../lib/imaging.js';
import { expandColor, paletteToCss, paletteToJson, paletteToTailwind } from '../lib/color.js';

export default function ColorDetail({ project, setProject }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef(null);
  const colors = project.colors || [];

  const persist = async (nextColors) => {
    try {
      const updated = await api.update(project.id, { colors: nextColors });
      setProject(updated);
      return true;
    } catch (e) {
      toast(`Could not save: ${e.message}`, 'error');
      return false;
    }
  };

  const addColor = (c) => {
    persist([...colors, { id: Math.random().toString(36).slice(2, 8), ...c }]);
    setAdding(false);
  };
  const removeColor = (id) => persist(colors.filter((c) => c.id !== id));

  // Extract dominant colours from an image and add the new ones (dedup by hex).
  const extractFrom = async (src) => {
    setExtracting(true);
    try {
      const rgbs = await extractPalette(src, 6);
      const have = new Set(colors.map((c) => (c.hex || '').toUpperCase()));
      const added = [];
      for (const rgb of rgbs) {
        const c = expandColor('rgb', rgb);
        if (c && !have.has(c.hex.toUpperCase())) { have.add(c.hex.toUpperCase()); added.push({ id: Math.random().toString(36).slice(2, 8), name: 'Color', ...c }); }
      }
      if (!added.length) { toast('No new colours found'); return; }
      if (await persist([...colors, ...added])) toast(`Added ${added.length} colour${added.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast(`Could not read image: ${e.message}`, 'error');
    } finally {
      setExtracting(false);
    }
  };
  const onExtractClick = () => {
    if (project.example) extractFrom(fileUrl(project, project.example));
    else fileRef.current?.click();
  };

  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copied`); }
    catch { toast('Clipboard unavailable (needs HTTPS or localhost)', 'error'); }
  };

  const saveTags = async (tags) => {
    try {
      const updated = await api.update(project.id, { tags });
      setProject(updated);
    } catch (e) {
      toast(`Could not save tags: ${e.message}`, 'error');
    }
  };

  return (
    <DetailLayout
      side={(
        <>
          <div className="section">
            <div className="section-head"><h2><Tag size={16} /> Tags</h2></div>
            <TagInput tags={project.tags || []} onChange={saveTags} placeholder="Add a tag…" />
          </div>

          <NotesField project={project} setProject={setProject} />
        </>
      )}
    >
      {project.example && (
        <figure className="media-frame" onClick={() => setLightbox(true)} title="Click to view fullscreen">
          <img src={fileUrl(project, project.example)} alt="example" />
          <button className="media-fs icon-btn"><Maximize2 size={16} /></button>
        </figure>
      )}

      <div className="section" style={{ marginTop: project.example ? 0 : 8 }}>
        <div className="section-head">
          <h2><Palette size={16} /> Palette <span className="count">{colors.length}</span></h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={onExtractClick} disabled={extracting}>
              <Wand2 size={15} /> {extracting ? 'Extracting…' : 'Extract from image'}
            </button>
            {colors.length > 0 && (
              <Menu align="right"
                trigger={<button className="btn btn-sm"><Download size={15} /> Export</button>}
                items={[
                  { label: 'Copy as CSS variables', onClick: () => copy(paletteToCss(colors), 'CSS') },
                  { label: 'Copy as JSON', onClick: () => copy(paletteToJson(colors), 'JSON') },
                  { label: 'Copy as Tailwind', onClick: () => copy(paletteToTailwind(colors), 'Tailwind config') },
                ]} />
            )}
            <button className="btn btn-sm" onClick={() => setAdding((v) => !v)}>
              <Plus size={15} /> {adding ? 'Close' : 'Add color'}
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="visually-hidden-input"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) extractFrom(f); }} />

        {adding && (
          <div style={{ marginBottom: 18 }}>
            <ColorBuilder onAdd={addColor} />
          </div>
        )}

        {colors.length === 0 ? (
          <div className="panel" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 28 }}>
            No colors yet. Add one in any format — hex, rgb, cmyk or pantone — and all types show up automatically.
          </div>
        ) : (
          <div className="color-grid">
            {colors.map((c) => (
              <ColorCard key={c.id} color={c} onRemove={() => removeColor(c.id)} />
            ))}
          </div>
        )}
        <div className="hint" style={{ marginTop: 12 }}>
          CMYK is a standard approximation; Pantone is a nearest-match suggestion (labelled “approx.”). Click any value to copy.
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2><Contrast size={16} /> Contrast</h2></div>
        <ContrastChecker
          initialFg={colors[0]?.hex || '#111114'}
          initialBg={colors[1]?.hex || '#FFFFFF'}
        />
      </div>


      {lightbox && project.example && (
        <Lightbox
          items={[{ src: fileUrl(project, project.example), caption: project.title }]}
          index={0}
          onIndex={() => {}}
          onClose={() => setLightbox(false)}
        />
      )}
    </DetailLayout>
  );
}
