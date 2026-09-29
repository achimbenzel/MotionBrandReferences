import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useToast } from '../Toast.jsx';

/**
 * "Make a post" from something in the app — a project, a storyboard, a
 * reference ({ kind, … } as the server takes it), or pictures made here
 * (a mockup rendered in full size): the post opens in Content.
 * → [make(from | { files, fields }), busy]
 */
export default function useMakePost() {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const make = useCallback(async (from, { before } = {}) => {
    setBusy(true);
    try {
      await before?.();
      let item;
      if (from.files) {
        const files = await (typeof from.files === 'function' ? from.files() : from.files); // rendered first: no empty post if that fails
        item = await api.createContent({ ...from.fields });
        if (files?.length) await api.addContentMedia(item.id, files);
      } else {
        item = await api.createContentFrom(from);
      }
      window.dispatchEvent(new CustomEvent('content:changed'));
      toast('Post made — it’s in Content', 'ok');
      navigate(`/content/${item.id}`);
      return item;
    } catch (e) {
      toast(`Could not make a post: ${e.message}`, 'error');
      return null;
    } finally { setBusy(false); }
  }, [navigate, toast]);
  return [make, busy];
}
