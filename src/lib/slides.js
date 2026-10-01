// Presentations: the kinds of slides a deck is made of — what each one holds
// (the editor's fields and the server's clean-up both come from here) — and
// the decks to start from. Plain data and functions, used by the app and the
// server alike.
//
// Text fields take two marks: *word* is shown in the deck's accent colour, and
// a line break is kept. Pictures are { file: 'images/…' } inside the deck's
// folder, or null (an empty frame in the accent colour, to fill in later).

export const DECK_KINDS = [
  { key: 'proposal', label: 'Project proposal' },
  { key: 'identity', label: 'Brand identity' },
  { key: 'case', label: 'Case study' },
  { key: 'other', label: 'Presentation' },
];

export const THEMES = {
  dark: { label: 'Dark', bg: '#0a0a0f', band: '#0b0b10', surface: '#0d0e13', line: 'rgba(255, 255, 255, 0.06)', text: '#f0eee8', soft: '#e8e4dc', muted: '#777b87', faint: '#5a5d68' },
  light: { label: 'Light', bg: '#f3f1ec', band: '#ebe8e1', surface: '#ffffff', line: 'rgba(10, 10, 15, 0.08)', text: '#0a0a0f', soft: '#1c1c22', muted: '#62656f', faint: '#8c8f99' },
};
export const DEFAULT_ACCENT = '#007588';

const f = (key, kind, label, more = {}) => ({ key, kind, label, ...more });
const TITLE = f('title', 'textarea', 'Title', { rows: 2, max: 300 });
const TEXT = f('text', 'textarea', 'Text', { rows: 4 });
const IMAGE = f('image', 'image', 'Picture');
const ITEM = [f('title', 'textarea', 'Title', { rows: 2, max: 300 }), f('text', 'textarea', 'Text', { rows: 3 })];

/**
 * Each kind of slide: its name, a line about it, whether it shows the deck's
 * header and footer (`chrome`), and its fields — text (one line), textarea,
 * image, toggle, select (options), color, list (of fields, up to `max`) and
 * table (columns and rows of cells).
 */
export const SLIDE_TYPES = {
  cover: {
    label: 'Cover', hint: 'The title, your logo and contact, and who it’s for', chrome: false,
    fields: [TITLE, f('image', 'image', 'Background picture'), f('showContact', 'toggle', 'Show your contact details')],
  },
  intro: { label: 'Introduction', hint: 'A big hello, a line about you, a portrait', fields: [TITLE, TEXT, IMAGE] },
  works: {
    label: 'Works', hint: 'Pictures of earlier work — the last card can ask a question',
    fields: [TITLE, f('items', 'list', 'Works', { max: 4, of: [IMAGE, f('caption', 'text', 'Caption')], add: 'Add a work' }), f('closing', 'textarea', 'Last card (instead of a picture)', { rows: 2 })],
  },
  textImage: {
    label: 'Text & picture', hint: 'A statement with text, and a picture beside it',
    fields: [TITLE, TEXT, IMAGE, f('flip', 'toggle', 'Picture on the left')],
  },
  cards: {
    label: 'Cards', hint: 'Three to six points side by side — how you work, the goals …',
    fields: [TITLE, f('style', 'select', 'Look', { options: [{ key: 'big', label: 'Big, numbered' }, { key: 'compact', label: 'Compact' }] }),
      f('items', 'list', 'Cards', { max: 6, of: ITEM, add: 'Add a card' })],
  },
  phases: { label: 'Phases', hint: 'The steps of the project, in columns', fields: [TITLE, f('items', 'list', 'Phases', { max: 6, of: ITEM, add: 'Add a phase' })] },
  caseCover: {
    label: 'Case study', hint: 'A past project: what it is, a picture, the key facts',
    fields: [TITLE, TEXT, IMAGE, f('facts', 'list', 'Facts', { max: 5, of: [f('label', 'text', 'Label'), f('value', 'text', 'Value')], add: 'Add a fact' })],
  },
  caseGallery: {
    label: 'Case pictures', hint: 'A headline and text with three pictures',
    fields: [TITLE, TEXT, f('images', 'list', 'Pictures', { max: 3, of: [IMAGE], add: 'Add a picture' }), f('flip', 'toggle', 'Pictures on the left')],
  },
  quote: {
    label: 'Testimonial', hint: 'What a client said, with their photo',
    fields: [f('label', 'text', 'Label'), f('quote', 'textarea', 'Quote', { rows: 5 }), f('name', 'text', 'Name'), f('role', 'text', 'Role · company'), IMAGE],
  },
  pricing: {
    label: 'Pricing', hint: 'Packages or add-ons with a price, a line and what’s included',
    fields: [TITLE, f('priceLabel', 'text', 'Above each price'),
      f('items', 'list', 'Packages', { max: 6, add: 'Add a package', of: [f('name', 'text', 'Name'), f('price', 'text', 'Price'), f('text', 'textarea', 'Text', { rows: 2 }), f('bullets', 'textarea', 'Included (one per line)', { rows: 4 }), f('featured', 'toggle', 'Recommended')] }),
      f('note', 'text', 'Small print')],
  },
  table: { label: 'Comparison', hint: 'A table — packages side by side (✓ and — become marks)', fields: [TITLE, f('table', 'table', 'Table')] },
  palette: {
    label: 'Colours', hint: 'The colour palette, with HEX, RGB and CMYK',
    fields: [TITLE, f('colors', 'list', 'Colours', { max: 8, add: 'Add a colour', of: [f('name', 'text', 'Name'), f('hex', 'color', 'Colour'), f('text', 'text', 'Use')] })],
  },
  type: {
    label: 'Typography', hint: 'The typefaces and what they’re for',
    fields: [TITLE, f('fonts', 'list', 'Typefaces', { max: 3, add: 'Add a typeface', of: [f('name', 'text', 'Name'), f('role', 'text', 'Used for'), f('family', 'text', 'Font (as installed)'), f('weights', 'text', 'Weights'), f('sample', 'text', 'Sample line')] })],
  },
  logo: {
    label: 'Logo', hint: 'The logo on its backgrounds',
    fields: [TITLE, TEXT, f('panels', 'list', 'Versions', { max: 3, add: 'Add a version', of: [IMAGE, f('bg', 'select', 'Background', { options: [{ key: 'surface', label: 'Card' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }, { key: 'accent', label: 'Accent colour' }] })] })],
  },
  image: {
    label: 'Big picture', hint: 'One picture over the whole slide', chrome: false,
    fields: [IMAGE, f('caption', 'text', 'Caption'), f('fit', 'select', 'Picture', { options: [{ key: 'cover', label: 'Fill the slide' }, { key: 'contain', label: 'Show all of it' }] })],
  },
  section: { label: 'Chapter', hint: 'A big number and title between parts', fields: [f('number', 'text', 'Number'), TITLE, f('text', 'textarea', 'Text', { rows: 2 })] },
  closing: { label: 'Closing', hint: 'Thank you — and how to reach you', fields: [TITLE, TEXT, f('showContact', 'toggle', 'Show your contact details')] },
};
export const SLIDE_TYPE_KEYS = Object.keys(SLIDE_TYPES);
export const showsChrome = (type) => SLIDE_TYPES[type]?.chrome !== false;

/** Empty data for a new slide of `type` (lists start with a few items to fill). */
export function blankData(type) {
  const t = SLIDE_TYPES[type];
  const one = (fd) => (fd.kind === 'toggle' ? false : fd.kind === 'image' ? null : fd.kind === 'select' ? fd.options[0].key
    : fd.kind === 'color' ? DEFAULT_ACCENT : fd.kind === 'table' ? { columns: ['', 'Option A', 'Option B'], rows: [['', '✓', '✓']], highlight: 0 }
      : fd.kind === 'list' ? Array.from({ length: Math.min(3, fd.max) }, () => Object.fromEntries(fd.of.map((x) => [x.key, one(x)]))) : '');
  return Object.fromEntries((t?.fields || []).map((fd) => [fd.key, one(fd)]));
}
/** A slide's own title, for lists and the outline: its title (marks removed) or its kind. */
export const slideName = (s) => plain(s?.data?.title || s?.data?.quote || s?.data?.caption || '').split('\n')[0].slice(0, 60) || SLIDE_TYPES[s?.type]?.label || 'Slide';
/** Text without its marks. */
export const plain = (v) => String(v || '').replace(/\*([^*\n]+)\*/g, '$1');
/** Text with *accent* marks → [{ text, accent }] per line: [[…], […]]. */
export function accentLines(v) {
  return String(v || '').split('\n').map((line) => {
    const out = [];
    const re = /\*([^*\n]+)\*/g;
    let at = 0; let m;
    while ((m = re.exec(line))) {
      if (m.index > at) out.push({ text: line.slice(at, m.index), accent: false });
      out.push({ text: m[1], accent: true });
      at = m.index + m[0].length;
    }
    if (at < line.length) out.push({ text: line.slice(at), accent: false });
    return out;
  });
}

// ---- Decks to start from ---------------------------------------------------------
const s = (type, section, data) => ({ type, section, data: { ...blankData(type), ...data } });
const items = (list) => list.map(([title, text]) => ({ title, text }));
const lorem = 'What this means for the project — a sentence or two.';

export const DECK_TEMPLATES = {
  proposal: {
    label: 'Project proposal', kind: 'proposal', deckLabel: 'PROJECT PROPOSAL',
    hint: 'Introduce yourself, show earlier work, how you work, the goals, case studies, pricing',
    slides: () => [
      s('cover', '', { title: 'Project *Proposal*\nBrand & Visual Identity', showContact: true }),
      s('intro', 'INTRODUCTION', { title: 'Hello,\nit’s *nice* to\nmeet you :)', text: 'I’m [Name], an independent designer for Branding, Motion, Graphic and 3D Projects.' }),
      s('works', 'MY WORKS', { title: 'My *works*…', items: [{ image: null, caption: '' }, { image: null, caption: '' }], closing: 'Your\nProject*?*' }),
      s('textImage', 'WHY WORK WITH ME', { title: 'Why work\nwith *me*?', text: 'What makes working together worthwhile — your approach, your experience, what clients value.' }),
      s('cards', 'HOW I WORK', { title: 'How *I* work…', style: 'big', items: items([
        ['Design begins\nwith *understanding*', 'Every project starts with a clear intention — understanding what truly matters. I analyse brands, contexts and audiences to build a solid foundation, so design becomes purposeful and sustainable.'],
        ['*Iterative* process,\nnot one-off solutions.', 'Good design rarely lands on the first attempt. Concepts are continuously tested, questioned and refined — producing solutions that don’t just look good, but perform and evolve over time.'],
        ['*Co-creation*\nat the core.', 'The strongest results are built through dialogue. I work closely with clients, integrating feedback early and keeping processes transparent. Design becomes a shared tool, not a black box.'],
      ]) }),
      s('cards', 'HOW I WORK', { title: 'Project *goals* for [Client]:', style: 'compact', items: items([
        ['Strengthen the Brand', lorem], ['Create a distinctive Logo', lorem], ['Build a cohesive System', lorem],
        ['Strengthen the Brand Visibility', lorem], ['Real World Application', lorem], ['Create a scalable Foundation', lorem],
      ]) }),
      s('phases', 'HOW I WORK', { title: '*Five* Phases:', items: items([
        ['Discover', 'Briefing, research, the brand and its audience.'], ['Define', 'Positioning, direction and the core idea.'],
        ['Design', 'Concept routes, logo, type and colour.'], ['Apply', 'The identity on real touchpoints.'], ['Deliver', 'Guidelines, files and handover.'],
      ]) }),
      s('caseCover', 'CASE STUDY 1', { title: 'Project name', text: 'What the client does and what the identity had to say — two or three sentences.',
        facts: [{ label: 'Client', value: 'Client name' }, { label: 'Year', value: String(new Date().getFullYear()) }, { label: 'Industry', value: 'Industry' }, { label: 'Scope', value: 'Brand Strategy - Brand Identity - Digital & Print' }] }),
      s('caseGallery', 'CASE STUDY 1', { title: 'A scalable\n*identity system*', text: 'The idea behind the design and how it runs through the system — the typeface, the forms, the details.', images: [{ image: null }, { image: null }, { image: null }] }),
      s('quote', 'CASE STUDY 1', { label: 'Testimonial 01', quote: '“What the client said about working together.”', name: 'Name', role: 'Owner - Company' }),
      s('pricing', 'PRICING', { title: 'Three Ways to start a *Project*:', priceLabel: 'Investment:', note: 'Pricing is paid in euros; other currencies must be converted.', items: [
        { name: 'Lite', price: '€ 1.000', text: 'For founders who need a strong, simple identity to launch with confidence.', bullets: 'Discovery call\nSingle concept route\nLogo & wordmark\nType & colour system\nMini guidelines (PDF)', featured: false },
        { name: 'Essential', price: '€ 3.000', text: 'A full identity system — the right fit for hospitality and product brands.', bullets: 'Everything in Lite\nThree concept routes\nSubmarks & iconography\nApplication suite (3 touchpoints)\nFull guidelines + asset library\n14-day implementation support', featured: true },
        { name: 'Professional', price: '€ 5.000+', text: 'Multi-channel brand worlds — for venues, ranges and complex rollouts.', bullets: 'Everything in Essential\nNaming or sub-brand support\nCustom typography exploration\nPackaging & signage direction\nPhotography & art direction\n30-day implementation support', featured: false },
      ] }),
      s('table', 'PRICING', { title: 'A clear *Side-by-Side*:', table: { highlight: 2, columns: ['Deliverable', 'Lite', 'Essential', 'Professional'], rows: [
        ['Strategy & positioning', '✓', '✓', '✓'], ['Concept routes', '1', '3', '3+'], ['Logo and or wordmark exploration', '1', '3', '3+'],
        ['Typography & color System', '✓', '✓', '✓'], ['Submarks & iconography', '—', '✓', '✓'], ['Social media design', '1 Social', '✓', '✓'],
        ['Business card design', '✓', '✓', '✓'], ['Animated logo design', '—', '—', '✓'], ['Brand applications (e.g. Poster, Menu, Packaging…)', '1', '3', '5+'],
        ['Brand guidelines', 'Mini', 'Full', 'Full + system docs'], ['Asset library', '—', 'Limited', 'Full'], ['Implementation & support window', '—', '14 days', '30 days'],
      ] } }),
      s('pricing', 'PRICING', { title: 'You may also be *interested* in:', priceLabel: 'starting from:', note: 'Pricing is paid in euros; other currencies must be converted.', items: [
        { name: 'Animated Logo Design', price: '€ 200+', text: 'Your logo animated with a transparent background.\nAs: .mp4, .mov & animated .gif', bullets: '', featured: false },
        { name: '3D Logo Design', price: '€ 100+', text: 'Your logo as a 3D logo.\nStill: .png, .obj & .fbx', bullets: '', featured: false },
        { name: 'Motion Design', price: '€ 300+', text: 'A motion design clip for your brand.\nAs: .mp4, .mov & animated .gif', bullets: '', featured: false },
      ] }),
      s('closing', 'CONTACT', { title: 'Let’s *start*.', text: 'Questions, ideas, a first call — I’m looking forward to hearing from you.', showContact: true }),
    ],
  },
  identity: {
    label: 'Brand identity', kind: 'identity', deckLabel: 'BRAND IDENTITY',
    hint: 'Present a finished identity: the idea, logo, colours, type and applications',
    slides: () => [
      s('cover', '', { title: 'Brand *Identity*\n[Client]', showContact: true }),
      s('textImage', 'THE BRIEF', { title: 'The *brief*', text: 'Where the brand stands, who it speaks to and what the new identity has to do.' }),
      s('cards', 'STRATEGY', { title: 'Brand *values*', style: 'big', items: items([['*Value* one', 'What it means and how the identity shows it.'], ['*Value* two', 'What it means and how the identity shows it.'], ['*Value* three', 'What it means and how the identity shows it.']]) }),
      s('caseGallery', 'DIRECTION', { title: '*Mood* &\ndirection', text: 'The world the brand lives in — pictures, textures and references that set the tone.', images: [{ image: null }, { image: null }, { image: null }] }),
      s('logo', 'LOGO', { title: 'The *logo*', text: 'The logo and its versions on the brand’s backgrounds.', panels: [{ image: null, bg: 'surface' }, { image: null, bg: 'light' }, { image: null, bg: 'accent' }] }),
      s('textImage', 'LOGO', { title: 'The idea\n*behind* it', text: 'Where the form comes from, how it’s built and what it stands for.', flip: true }),
      s('palette', 'COLOUR', { title: 'Colour *palette*', colors: [
        { name: 'Petrol', hex: '#007588', text: 'Accent' }, { name: 'Night', hex: '#0a0a0f', text: 'Background' }, { name: 'Paper', hex: '#f0eee8', text: 'Text & light' }, { name: 'Stone', hex: '#777b87', text: 'Secondary' },
      ] }),
      s('type', 'TYPOGRAPHY', { title: '*Typography*', fonts: [
        { name: 'DM Sans', role: 'Headlines & text', family: 'DM Sans', weights: 'Regular · Bold · ExtraBold', sample: 'The quick brown fox jumps over the lazy dog' },
        { name: 'JetBrains Mono', role: 'Labels & details', family: 'JetBrains Mono', weights: 'Medium · SemiBold', sample: 'PREPARED FOR · 01/16' },
      ] }),
      s('works', 'APPLICATIONS', { title: '*Applications*', items: [{ image: null, caption: 'Business cards' }, { image: null, caption: 'Social media' }, { image: null, caption: 'Packaging' }], closing: '' }),
      s('image', 'APPLICATIONS', { caption: '', fit: 'cover' }),
      s('phases', 'NEXT STEPS', { title: 'Next *steps*', items: items([['Feedback', 'Your thoughts on the identity.'], ['Refine', 'The last details, together.'], ['Guidelines', 'How to use it — all in one place.'], ['Handover', 'Every file, ready to use.']]) }),
      s('closing', 'CONTACT', { title: 'Thank *you*.', text: 'Looking forward to your feedback.', showContact: true }),
    ],
  },
  case: {
    label: 'Case study', kind: 'case', deckLabel: 'CASE STUDY',
    hint: 'One project told in pictures: the task, the idea, the result and a quote',
    slides: () => [
      s('cover', '', { title: 'Case *Study*\nProject name', showContact: true }),
      s('caseCover', 'THE PROJECT', { title: 'Project name', text: 'What the client does and what the project had to achieve.',
        facts: [{ label: 'Client', value: 'Client name' }, { label: 'Year', value: String(new Date().getFullYear()) }, { label: 'Industry', value: 'Industry' }, { label: 'Scope', value: 'Brand Identity' }] }),
      s('caseGallery', 'THE IDEA', { title: 'The *idea*', text: 'The thought behind the design.', images: [{ image: null }, { image: null }, { image: null }] }),
      s('caseGallery', 'THE RESULT', { title: 'The *result*', text: 'How it came together across the touchpoints.', images: [{ image: null }, { image: null }, { image: null }], flip: true }),
      s('quote', 'TESTIMONIAL', { label: 'Testimonial', quote: '“What the client said about working together.”', name: 'Name', role: 'Owner - Company' }),
      s('closing', 'CONTACT', { title: 'Your project *next*?', text: '', showContact: true }),
    ],
  },
  blank: {
    label: 'Blank', kind: 'other', deckLabel: 'PRESENTATION', hint: 'A cover to start from — add the slides you need',
    slides: () => [s('cover', '', { title: 'Presentation *title*', showContact: true })],
  },
};
