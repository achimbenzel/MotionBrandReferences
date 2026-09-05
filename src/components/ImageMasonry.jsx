import { useState } from 'react';
import { MoreVertical, Trash2, FolderPlus, Plus } from 'lucide-react';
import { api, fileUrl } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import Menu from './Menu.jsx';
import Lightbox from './Lightbox.jsx';

/**
 * Pinterest-style masonry of image-gallery items (name-less). Click to view
 * fullscreen; the ⋯ menu deletes or adds the image to a gallery.
 */
export default function ImageMasonry({ projects, setProjects, galleries, onGalleriesChanged, onNewGallery }) {
  const toast = useToast();
  const [lightbox, setLightbox] = useState(-1);

  const items = projects.map((p) => ({ src: p.image ? fileUrl(p, p.image) : fileUrl(p, p.thumb) }));

  const remove = async (id) => {
    try { await api.remove(id); setProjects((prev) => prev.filter((p) => p.id !== id)); toast('Bild gelöscht'); }
    catch (e) { toast(`Löschen fehlgeschlagen: ${e.message}`, 'error'); }
  };

  const addToGallery = async (gallery, projectId) => {
    try {
      const ids = Array.from(new Set([...(gallery.projectIds || []), projectId]));
      await api.updateGallery(gallery.id, { projectIds: ids });
      toast(`Zu „${gallery.name}" hinzugefügt`);
      onGalleriesChanged?.();
    } catch (e) { toast(`Fehlgeschlagen: ${e.message}`, 'error'); }
  };

  if (!projects.length) return null;

  return (
    <>
      <div className="masonry">
        {projects.map((p, i) => {
          const src = p.image ? fileUrl(p, p.image) : fileUrl(p, p.thumb);
          const galleryItems = [
            ...(galleries || []).map((g) => ({ label: g.name, icon: <FolderPlus size={15} />, onClick: () => addToGallery(g, p.id) })),
            { label: 'Neue Galerie…', icon: <Plus size={15} />, onClick: () => onNewGallery?.(p.id) },
            { separator: true },
            { label: 'Löschen', icon: <Trash2 size={15} />, danger: true, onClick: () => remove(p.id) },
          ];
          return (
            <div className="masonry-item" key={p.id}>
              <img src={src} alt="" loading="lazy" onClick={() => setLightbox(i)} />
              <div className="masonry-menu" onClick={(e) => e.stopPropagation()}>
                <Menu align="right" trigger={<button className="icon-btn masonry-menu-btn"><MoreVertical size={15} /></button>} items={galleryItems} />
              </div>
            </div>
          );
        })}
      </div>

      {lightbox >= 0 && items.length > 0 && (
        <Lightbox items={items} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(-1)} />
      )}
    </>
  );
}
