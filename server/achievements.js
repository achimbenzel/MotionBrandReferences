// Achievements: the numbers they unlock from, the unlocking itself, the
// Special Quests pack and more quest ideas the editor offers.

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * The numbers achievements unlock from — all yours to keep up to date
 * (nothing is counted from the app): followers per platform, the biggest
 * deal, revenue, clients, client projects, posts.
 */
export function achievementMetrics(db) {
  const { numbers: n, followers: f } = db.achievementStats;
  return {
    deal: n.deal, revenue: n.revenue, clients: n.clients, projects: n.projects, posts: n.posts,
    'followers:instagram': f.instagram, 'followers:tiktok': f.tiktok, 'followers:x': f.x, 'followers:youtube': f.youtube,
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

// ---- Special Quests (a pack to start with) and more quest ideas -------------------------
const quest = (title, description, symbol, rarity, order, achievedAt = '') => ({
  group: 'Special Quests', title, description, rarity, icon: { type: 'symbol', symbol }, order, achievedAt,
});

/** The Special Quests pack: a quest and its dream version each (the business trip already reached). */
export const SPECIAL_QUESTS = [
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
