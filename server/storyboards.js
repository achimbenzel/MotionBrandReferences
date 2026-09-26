/**
 * Built-in storyboard templates: empty panels in the typical order of a
 * launch video, a social cut and a logo sting, each with a section, a
 * suggested duration and a line on what the shot should do.
 * [section, seconds, what we see]
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
    key: 'social', label: 'Social cut · 15 s · 9:16', aspect: '9:16', target: 15,
    description: 'Hook in the first second, the product, two features, proof and a call to action — upright.',
    shots: [
      ['hook', 1.5, 'Hook in the first second — big type or a bold move'],
      ['reveal', 3, 'Product reveal'],
      ['features', 2.5, 'Feature 1'],
      ['features', 2.5, 'Feature 2'],
      ['proof', 2, 'Proof — a number or a quote'],
      ['cta', 2, 'Call to action'],
      ['outro', 1.5, 'Logo'],
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

export const storyboardTemplate = (key) => STORYBOARD_TEMPLATES.find((t) => t.key === key) || null;

/** What the "New storyboard" dialog shows about each template. */
export const templateInfo = (t) => ({
  key: t.key, label: t.label, description: t.description, aspect: t.aspect, target: t.target,
  shots: t.shots.length, sections: [...new Set(t.shots.map((s) => s[0]).filter(Boolean))],
});
