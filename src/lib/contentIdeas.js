// Ideas for the library: hook and call-to-action formulas (in German and in
// English — [ ] marks what to fill in) and hashtag sets to start from.

export const IDEA_LANGS = [{ key: 'de', label: 'DE' }, { key: 'en', label: 'EN' }];

export const IDEAS = {
  hook: {
    de: [
      'Warte auf den letzten Frame',
      'So habe ich [das] in [X] Stunden animiert',
      'POV: Der Kunde will [X]',
      'Hör auf, [X] in After Effects so zu machen',
      '3 Dinge, die dir keiner über [X] sagt',
      'Vorher / nachher: [X]',
      'Dafür habe ich [X] gebraucht — und das ist der Grund',
      'Du animierst [X] falsch',
      'Der Trick hinter [X]',
      'Von der Skizze zum fertigen Clip in [X] Sekunden',
      'Ich habe [X] nachgebaut — wie nah bin ich dran?',
      'Bewerte diese Logo-Animation von 1 bis 10',
      'Die eine Easing-Kurve, die ich für alles nutze',
    ],
    en: [
      'Wait for the last frame',
      'How I animated [this] in [X] hours',
      'POV: the client asks for [X]',
      'Stop doing [X] like this in After Effects',
      '3 things nobody tells you about [X]',
      'Before / after: [X]',
      'This took me [X] — here’s why',
      'You’re animating [X] wrong',
      'The trick behind [X]',
      'From sketch to final in [X] seconds',
      'I recreated [X] — how close did I get?',
      'Rate this logo animation from 1 to 10',
      'The one easing curve I use for everything',
    ],
  },
  cta: {
    de: [
      'Speicher dir das für dein nächstes Projekt',
      'Folg mir für mehr Breakdowns',
      'Kommentiere „[WORT]“ und ich schick dir die Projektdatei',
      'Schick das einem Motion Designer, der das braucht',
      'Was ist besser — 1 oder 2?',
      'Die ganze Case Study — Link in der Bio',
      'Teil 2 kommt morgen — folg mir, um ihn nicht zu verpassen',
    ],
    en: [
      'Save this for your next project',
      'Follow for more breakdowns',
      'Comment “[WORD]” and I’ll send you the project file',
      'Send this to a motion designer who needs it',
      'Which one is better — 1 or 2?',
      'The full case study — link in bio',
      'Part 2 tomorrow — follow so you don’t miss it',
    ],
  },
  hashtags: [
    { name: 'Motion core', text: '#motiondesign #motiongraphics #aftereffects #animation #mograph' },
    { name: 'Logo animation', text: '#logoanimation #logodesign #branding #brandidentity' },
    { name: '3D', text: '#3dmotion #cinema4d #blender3d #3danimation' },
    { name: 'Type', text: '#kinetictypography #typography #typeinmotion #typematters' },
    { name: 'Client work', text: '#brandmotion #motionbranding #designstudio #creativestudio' },
  ],
};

export const SNIPPET_KINDS = {
  hook: { label: 'Hooks', one: 'Hook' },
  hashtags: { label: 'Hashtag sets', one: 'Hashtag set' },
  cta: { label: 'Calls to action', one: 'Call to action' },
};

/** The first [placeholder] in a text → [start, end] (to select it), or null. */
export const placeholderIn = (s) => {
  const a = String(s || '').indexOf('[');
  const b = a >= 0 ? s.indexOf(']', a) : -1;
  return a >= 0 && b > a ? [a, b + 1] : null;
};
