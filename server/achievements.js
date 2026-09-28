// Achievements: the numbers they unlock from, the unlocking itself, and a
// starter set (revenue, followers, clients, content, special quests).

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * What the app knows (+ what you did before using it): the biggest single
 * deal (an invoice), revenue paid, clients, delivered client projects,
 * posted content — and the followers you keep up to date yourself.
 */
export function achievementMetrics(db) {
  const st = db.achievementStats;
  const invoices = (db.clients || []).flatMap((c) => c.invoices || []);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((n, i) => n + (i.amount || 0), 0);
  const delivered = (db.plans || []).filter((p) => p.clientId && (p.status === 'delivered' || p.status === 'archived')).length;
  return {
    deal: Math.max(st.earlier.deal, ...invoices.map((i) => i.amount || 0), 0),
    revenue: Math.round((st.earlier.revenue + paid) * 100) / 100,
    clients: st.earlier.clients + (db.clients || []).length,
    projects: st.earlier.projects + delivered,
    posts: st.earlier.posts + (db.content || []).filter((c) => c.status === 'posted').length,
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

// ---- The starter set -------------------------------------------------------------------
const K = (n) => (n >= 1000 ? `${n / 1000}K` : String(n));
const de = (n) => n.toLocaleString('de-DE');
const TIERS = ['stone', 'bronze', 'silver', 'gold', 'emerald', 'diamond', 'mythic', 'mythic'];
const tiers = (group, metric, steps, make) => steps.map(([n, date], i) => ({
  group, metric, target: n, rarity: TIERS[i], icon: { type: 'text', text: K(n) }, achievedAt: date || '', order: i, ...make(n),
}));
const quest = (title, description, symbol, rarity, order, achievedAt = '') => ({
  group: 'Special Quests', title, description, rarity, icon: { type: 'symbol', symbol }, order, achievedAt,
});

export const STARTER_ACHIEVEMENTS = [
  ...tiers('Umsatz', 'deal', [[500, '2024-10-21'], [1000, '2025-08-05'], [3000], [5000], [10000], [25000], [50000], [100000]],
    (n) => ({ title: `Der ${de(n)}€-Deal`, description: `Deal über ${de(n)}€ abgeschlossen.` })),
  ...tiers('Instagram', 'followers:instagram', [[100, '2023-08-30'], [500, '2023-10-06'], [1000, '2024-01-10'], [2000, '2024-02-21'], [5000], [10000], [100000], [500000]],
    (n) => ({ title: `${K(n)} Follower erreicht`, description: `${de(n)} Follower auf Instagram erreicht.` })),
  ...tiers('Kundenstamm', 'projects', [[1, '2023-08-13'], [5, '2023-10-25'], [25, '2024-02-09'], [50, '2024-10-03'], [100], [200], [300], [500]],
    (n) => (n === 1 ? { title: 'Der erste Kunde', description: 'Den ersten Kunden betreut.' }
      : { title: `${n} Kunden betreut`, description: `${n} Kundenprojekte erfolgreich abgeschlossen.` })),
  ...tiers('Content', 'posts', [[1], [10], [50], [100], [250], [500]],
    (n) => (n === 1 ? { title: 'Der erste Post', description: 'Den ersten geplanten Post veröffentlicht.' }
      : { title: `${n} Posts veröffentlicht`, description: `${n} Posts aus dem Content-Plan veröffentlicht.` })),
  quest('Album Cover Design', 'Album Cover für Musiker/Band mit Bekanntheitsgrad.', 'image', 'quest', 0),
  quest('Album Cover Design', 'Album Cover für Musiker/Band, die ich selber gerne höre.', 'image', 'dream', 1),
  quest('Visualizer Design', 'Visualizer oder Bühnenvisualizer für Musiker/Band mit Bekanntheitsgrad.', 'monitor', 'quest', 2),
  quest('Visualizer Design', 'Visualizer oder Bühnenvisualizer für Musiker/Band, die ich selber gerne höre.', 'monitor', 'dream', 3),
  quest('Bekannte Persönlichkeit', 'Gearbeitet für eine Person mit Bekanntheitsgrad.', 'user-star', 'quest', 4),
  quest('Bekannte Persönlichkeit', 'Gearbeitet für eine Person, für die ich gerne arbeiten möchte.', 'user-star', 'dream', 5),
  quest('Bekannte Marke', 'Gearbeitet für eine Marke mit Bekanntheitsgrad.', 'building', 'quest', 6),
  quest('Bekannte Marke', 'Gearbeitet für eine Marke, für die ich gerne arbeiten möchte.', 'building', 'dream', 7),
  quest('Dienstreise', 'Dienstreise mit Hotel und Übernachtung.', 'car', 'quest', 8, '2025-07-17'),
  quest('Dienstreise', 'Dienstreise mit Hotel und Übernachtung im Ausland.', 'plane', 'dream', 9),
  quest('Game Assets erstellen', 'Assets für ein Game erstellt, das veröffentlicht wurde.', 'gamepad', 'quest', 10),
  quest('Game Assets erstellen', 'Assets für ein Game erstellt, das veröffentlicht wurde — und auf die ich richtig stolz bin.', 'gamepad', 'dream', 11),
];

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
