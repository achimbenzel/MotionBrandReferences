// Achievements: the numbers they unlock from, the unlocking itself, and
// quest ideas the editor offers (the achievements themselves are all yours).

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** What the app itself counts: the biggest invoice, paid invoices, clients, delivered client projects, posted content. */
export function appCounts(db) {
  const invoices = (db.clients || []).flatMap((c) => c.invoices || []);
  return {
    deal: Math.max(0, ...invoices.map((i) => i.amount || 0)),
    revenue: Math.round(invoices.filter((i) => i.status === 'paid').reduce((n, i) => n + (i.amount || 0), 0) * 100) / 100,
    clients: (db.clients || []).length,
    projects: (db.plans || []).filter((p) => p.clientId && (p.status === 'delivered' || p.status === 'archived')).length,
    posts: (db.content || []).filter((c) => c.status === 'posted').length,
  };
}

/**
 * The numbers achievements unlock from: what the app counts + what you did
 * before using it (the biggest deal is the bigger of the two), and the
 * followers you keep up to date yourself.
 */
export function achievementMetrics(db) {
  const st = db.achievementStats;
  const app = appCounts(db);
  return {
    deal: Math.max(st.earlier.deal, app.deal),
    revenue: Math.round((st.earlier.revenue + app.revenue) * 100) / 100,
    clients: st.earlier.clients + app.clients,
    projects: st.earlier.projects + app.projects,
    posts: st.earlier.posts + app.posts,
    'followers:instagram': st.followers.instagram,
    'followers:tiktok': st.followers.tiktok,
    'followers:x': st.followers.x,
    'followers:youtube': st.followers.youtube,
  };
}

/** Unlock (today) every achievement whose number is reached → the ids. Reached ones stay reached. */
export function unlockReached(db) {
  const m = achievementMetrics(db);
  const out = [];
  for (const a of db.achievements) {
    if (a.achievedAt || !a.metric || a.target == null || !(m[a.metric] >= a.target)) continue;
    a.achievedAt = today();
    a.updatedAt = Date.now();
    out.push(a.id);
  }
  return out;
}
export const dueToUnlock = (db) => {
  const m = achievementMetrics(db);
  return db.achievements.some((a) => !a.achievedAt && a.metric && a.target != null && m[a.metric] >= a.target);
};

// ---- Quest ideas ----------------------------------------------------------------------
const quest = (title, description, symbol, rarity, order) => ({
  group: 'Special Quests', title, description, rarity, icon: { type: 'symbol', symbol }, order,
});

/** More quests that fit the job — offered when adding one (the editor shows them). */
export const QUEST_IDEAS = [
  quest('Showreel veröffentlicht', 'Ein neues Showreel veröffentlicht.', 'film', 'quest', 20),
  quest('Stammkunde', 'Ein Kunde bucht mich zum dritten Mal.', 'handshake', 'quest', 21),
  quest('Weiterempfohlen', 'Ein neuer Kunde kam über eine Empfehlung.', 'heart', 'quest', 22),
  quest('Retainer', 'Ein fester Monatsauftrag (Retainer) mit einem Kunden.', 'coins', 'quest', 23),
  quest('Stundensatz erhöht', 'Den Stundensatz erhöht — und die Kunden sind geblieben.', 'zap', 'quest', 24),
  quest('Viraler Post', 'Ein Post mit über 100.000 Views.', 'flame', 'dream', 25),
  quest('Gefeatured', 'Auf Behance, Motionographer o. ä. gefeatured.', 'award', 'dream', 26),
  quest('Speaker', 'Einen Talk oder Workshop gehalten.', 'mic', 'dream', 27),
  quest('Eigenes Produkt', 'Ein eigenes Produkt veröffentlicht (Plugin, Template, Preset).', 'box', 'dream', 28),
  quest('Award', 'Einen Design- oder Motion-Award gewonnen.', 'trophy', 'dream', 29),
];
