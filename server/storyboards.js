/**
 * Built-in storyboard templates: empty panels in the typical order of a
 * launch video (30, 45 or 60 s) and a logo sting, each with a section, a
 * suggested duration and a line on what the shot should do.
 * [section, seconds, what we see]. Your own templates (saved from a
 * storyboard) live in db.storyboardTemplates, with their shots as objects.
 */
export const STORYBOARD_TEMPLATES = [
  {
    key: 'launch', label: 'Launch video · 30 s', aspect: '16:9', target: 30,
    description: 'Hook → problem → product reveal → features → proof → call to action → logo outro.',
    shots: [
      ['hook', 2, 'Hook — a striking first image that stops the scroll'],
      ['hook', 2, 'Hook — the question or the tension'],
      ['problem', 3, 'The problem, shown rather than told'],
      ['problem', 2, 'Why it hurts'],
      ['reveal', 4, 'Product reveal — the hero shot'],
      ['features', 3, 'Feature 1'],
      ['features', 3, 'Feature 2'],
      ['features', 3, 'Feature 3'],
      ['proof', 3, 'Social proof — logos, numbers or a quote'],
      ['cta', 3, 'Call to action'],
      ['outro', 2, 'Logo outro'],
    ],
  },
  {
    key: 'launch45', label: 'Launch video · 45 s', aspect: '16:9', target: 45,
    description: 'The 30 s story with room to breathe: the product in context, a demo and a customer moment.',
    shots: [
      ['hook', 2, 'Hook — a striking first image that stops the scroll'],
      ['hook', 2, 'Hook — the question or the tension'],
      ['problem', 3, 'The problem, shown rather than told'],
      ['problem', 3, 'Why it hurts — the everyday frustration'],
      ['reveal', 4, 'Product reveal — the hero shot'],
      ['reveal', 2, 'The product in context'],
      ['features', 4, 'Feature 1 — what it does'],
      ['features', 4, 'Feature 2'],
      ['features', 4, 'Feature 3'],
      ['features', 3, 'How it works — the one-line demo'],
      ['proof', 4, 'Social proof — logos, numbers or a quote'],
      ['proof', 3, 'A customer moment'],
      ['cta', 4, 'Call to action'],
      ['outro', 3, 'Logo outro'],
    ],
  },
  {
    key: 'launch60', label: 'Launch video · 60 s', aspect: '16:9', target: 60,
    description: 'The full story: a longer hook and problem, four features with a demo, two proofs and where to get it.',
    shots: [
      ['hook', 2, 'Hook — a striking first image that stops the scroll'],
      ['hook', 2, 'Hook — the question or the tension'],
      ['hook', 2, 'Hook — the promise in one line'],
      ['problem', 3, 'The problem, shown rather than told'],
      ['problem', 3, 'Why it hurts — the everyday frustration'],
      ['problem', 3, 'What it costs — time, money, nerves'],
      ['reveal', 4, 'Product reveal — the hero shot'],
      ['reveal', 2, 'Name and claim on screen'],
      ['reveal', 3, 'The product in context'],
      ['features', 4, 'Feature 1 — what it does'],
      ['features', 4, 'Feature 2'],
      ['features', 4, 'Feature 3'],
      ['features', 4, 'Feature 4'],
      ['features', 3, 'How it works — the one-line demo'],
      ['proof', 4, 'Social proof — logos, numbers or a quote'],
      ['proof', 4, 'A customer moment'],
      ['cta', 4, 'Call to action'],
      ['cta', 2, 'Where to get it — URL, store badges'],
      ['outro', 3, 'Logo outro'],
    ],
  },
  {
    key: 'sting', label: 'Logo sting · 5 s', aspect: '16:9', target: 5,
    description: 'Build-up, logo reveal, hold.',
    shots: [
      ['', 1.5, 'Build-up — shapes or particles gather'],
      ['outro', 2, 'Logo reveal'],
      ['outro', 1.5, 'Hold on the logo (and the claim)'],
    ],
  },
];

export const builtinStoryboardTemplate = (key) => STORYBOARD_TEMPLATES.find((t) => t.key === key) || null;
/** A built-in template or one of yours (db.storyboardTemplates). */
export const storyboardTemplate = (key, own = []) => builtinStoryboardTemplate(key) || own.find((t) => t.key === key) || null;

// The text a template keeps of a shot (no pictures, no status, no voice-over recordings).
export const TEMPLATE_SHOT_FIELDS = ['visual', 'vo', 'onscreen', 'sfx', 'notes', 'size', 'camera', 'transition'];
/** A template's shots as shot fields: { section, duration, visual, … } (built-ins are [section, seconds, visual]). */
export const templateShots = (t) => t.shots.map((s) => (Array.isArray(s) ? { section: s[0], duration: s[1], visual: s[2] } : { ...s }));

/** What the "New storyboard" dialog shows about each template. */
export const templateInfo = (t) => {
  const shots = templateShots(t);
  return {
    key: t.key, label: t.label, description: t.description, aspect: t.aspect, target: t.target, own: !builtinStoryboardTemplate(t.key),
    shots: shots.length, sections: [...new Set(shots.map((s) => s.section).filter(Boolean))],
  };
};
