import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Presentation as DeckIcon } from 'lucide-react';
import { api } from '../../lib/api.js';
import { fmtDate } from '../../lib/format.js';
import { DECK_KINDS } from '../../lib/slides.js';
import { SlideView } from './Slide.jsx';
import NewPresentation from './NewPresentation.jsx';
import '@fontsource/dm-sans/800.css';
import '@fontsource/jetbrains-mono/600.css';
import '../../styles/presentation.css';

const kindLabel = (k) => DECK_KINDS.find((x) => x.key === k)?.label || 'Presentation';

/** A client's presentations (on the client's page): each by its cover; a new one starts for this client. */
export default function ClientDecks({ client }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null); // { presentations, defaults }
  const [clients, setClients] = useState([]);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let alive = true;
    api.listPresentations().then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData({ presentations: [], defaults: null }); });
    return () => { alive = false; };
  }, [client.id]);
  const open = () => { api.listClients().then(setClients).catch(() => setClients([client])); setCreating(true); };
  const decks = (data?.presentations || []).filter((p) => p.clientId === client.id);
  return (
    <section className="client-card-sec">
      <div className="client-sec-head"><h2><DeckIcon size={15} /> Presentations <span className="count">{decks.length}</span></h2>
        <button type="button" className="btn btn-sm" onClick={open}><Plus size={14} /> New presentation</button></div>
      {data == null ? null : decks.length ? (
        <div className="client-decks">
          {decks.map((p) => (
            <button key={p.id} type="button" className="client-deck" onClick={() => navigate(`/presentations/${p.id}`)}>
              <SlideView deck={p} slide={p.slides[0]} index={0} total={p.slides.length} />
              <span className="client-deck-meta"><b>{p.title || 'Untitled presentation'}</b>
                <small>{[kindLabel(p.kind), `${p.slides.length} slide${p.slides.length === 1 ? '' : 's'}`, fmtDate(p.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })].join(' · ')}</small></span>
            </button>
          ))}
        </div>
      ) : <p className="client-empty">No presentations for {client.name} yet — a proposal starts with their name on the cover and in the text.</p>}
      {creating && (
        <NewPresentation defaults={data?.defaults} clients={clients.length ? clients : [client]} clientId={client.id} onClose={() => setCreating(false)}
          onMade={(p) => navigate(`/presentations/${p.id}`)} />
      )}
    </section>
  );
}
