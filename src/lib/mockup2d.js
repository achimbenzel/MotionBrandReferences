// The 2D mockups: a browser window and social posts / profiles in the look of
// Instagram and X. Each type lists its texts, numbers and switches (with
// defaults) and its picture slots. These are independent look-alikes drawn by
// this app for presentations — nothing is posted anywhere.
import { AppWindow, Instagram, Twitter, Smartphone, CircleUser, Youtube, Linkedin } from 'lucide-react';

const IG_ASPECTS = { '1:1': 1, '4:5': 4 / 5, '1.91:1': 1.91 };
const PAGE_ASPECTS = { '16:10': 16 / 10, '16:9': 16 / 9, '4:3': 4 / 3, '3:2': 3 / 2 };

export const TYPES_2D = {
  browser: {
    label: 'Browser window', icon: AppWindow, frame: '16:9', themes: ['light', 'dark'],
    fields: [
      { key: 'url', label: 'Address', type: 'text', def: 'yourproduct.com' },
      { key: 'title', label: 'Tab title', type: 'text', def: 'Your product' },
      { key: 'page', label: 'Page shape', type: 'select', def: '16:10', choices: Object.keys(PAGE_ASPECTS).map((k) => [k, k]) },
      { key: 'tabs', label: 'Other tabs', type: 'flag', def: true },
    ],
    slots: [
      { key: 'screen', label: 'Page', ratio: (d) => PAGE_ASPECTS[d.text.page] || 1.6 },
      { key: 'favicon', label: 'Tab icon', ratio: () => 1, small: true },
    ],
  },
  'ig-post': {
    label: 'Instagram post', icon: Instagram, frame: '4:5', themes: ['light', 'dark'],
    fields: [
      { key: 'username', label: 'Username', type: 'text', def: 'yourbrand' },
      { key: 'location', label: 'Location', type: 'text', def: '' },
      { key: 'aspect', label: 'Picture', type: 'select', def: '4:5', choices: [['1:1', 'Square'], ['4:5', 'Portrait'], ['1.91:1', 'Landscape']] },
      { key: 'caption', label: 'Caption', type: 'textarea', def: 'Something new is coming ✨' },
      { key: 'likes', label: 'Likes', type: 'number', def: 1284 },
      { key: 'comments', label: 'Comments', type: 'number', def: 36 },
      { key: 'time', label: 'Time', type: 'text', def: '2 hours ago' },
      { key: 'verified', label: 'Verified', type: 'flag', def: true },
      { key: 'liked', label: 'Liked', type: 'flag', def: false },
      { key: 'saved', label: 'Saved', type: 'flag', def: false },
      { key: 'carousel', label: 'Carousel dots', type: 'flag', def: false },
      { key: 'sponsored', label: 'Sponsored', type: 'flag', def: false },
    ],
    slots: [
      { key: 'media', label: 'Picture', ratio: (d) => IG_ASPECTS[d.text.aspect] || 0.8 },
      { key: 'avatar', label: 'Profile picture', ratio: () => 1, round: true, small: true },
    ],
  },
  'ig-story': {
    label: 'Instagram story', icon: Instagram, frame: '9:16', themes: ['dark'],
    fields: [
      { key: 'username', label: 'Username', type: 'text', def: 'yourbrand' },
      { key: 'time', label: 'Time', type: 'text', def: '3h' },
      { key: 'segments', label: 'Story parts', type: 'number', def: 3, min: 1, max: 8 },
      { key: 'current', label: 'This is part', type: 'number', def: 1, min: 1, max: 8 },
      { key: 'verified', label: 'Verified', type: 'flag', def: true },
      { key: 'reply', label: 'Reply bar', type: 'flag', def: true },
    ],
    slots: [
      { key: 'media', label: 'Story (9:16)', ratio: () => 9 / 16 },
      { key: 'avatar', label: 'Profile picture', ratio: () => 1, round: true, small: true },
    ],
  },
  'ig-profile': {
    label: 'Instagram profile', icon: Instagram, frame: 'auto', themes: ['light', 'dark'],
    fields: [
      { key: 'username', label: 'Username', type: 'text', def: 'yourbrand' },
      { key: 'name', label: 'Name', type: 'text', def: 'Your Brand' },
      { key: 'category', label: 'Category', type: 'text', def: 'Design studio' },
      { key: 'bio', label: 'Bio', type: 'textarea', def: 'Brands that move.\nNew collection out now ↓' },
      { key: 'link', label: 'Link', type: 'text', def: 'yourbrand.com' },
      { key: 'posts', label: 'Posts', type: 'number', def: 128 },
      { key: 'followers', label: 'Followers', type: 'number', def: 12400 },
      { key: 'following', label: 'Following', type: 'number', def: 310 },
      { key: 'grid', label: 'Grid', type: 'select', def: '3:4', choices: [['3:4', 'Portrait (3:4)'], ['1:1', 'Square']] },
      { key: 'verified', label: 'Verified', type: 'flag', def: true },
      { key: 'highlights', label: 'Highlights', type: 'flag', def: true },
      { key: 'h0', label: 'Highlight 1', type: 'text', def: 'New', when: 'highlights' },
      { key: 'h1', label: 'Highlight 2', type: 'text', def: 'Work', when: 'highlights' },
      { key: 'h2', label: 'Highlight 3', type: 'text', def: 'Studio', when: 'highlights' },
      { key: 'h3', label: 'Highlight 4', type: 'text', def: 'Press', when: 'highlights' },
    ],
    slots: [
      { key: 'avatar', label: 'Profile picture', ratio: () => 1, round: true, small: true },
      ...[0, 1, 2, 3].map((i) => ({ key: `hl-${i}`, label: `Highlight ${i + 1}`, ratio: () => 1, round: true, small: true, when: 'highlights' })),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ key: `grid-${i}`, label: `Post ${i + 1}`, ratio: (d) => (d.text.grid === '1:1' ? 1 : 3 / 4) })),
    ],
  },
  'x-post': {
    label: 'X post', icon: Twitter, frame: '1:1', themes: ['light', 'dim', 'dark'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', def: 'Your Brand' },
      { key: 'handle', label: 'Handle', type: 'text', def: 'yourbrand' },
      { key: 'time', label: 'Time', type: 'text', def: '2h' },
      { key: 'text', label: 'Post', type: 'textarea', def: 'Meet the new look. Designed to move. 🚀' },
      { key: 'replies', label: 'Replies', type: 'number', def: 48 },
      { key: 'reposts', label: 'Reposts', type: 'number', def: 212 },
      { key: 'likes', label: 'Likes', type: 'number', def: 1840 },
      { key: 'views', label: 'Views', type: 'number', def: 96400 },
      { key: 'verified', label: 'Verified', type: 'flag', def: true },
    ],
    slots: [
      { key: 'avatar', label: 'Profile picture', ratio: () => 1, round: true, small: true },
      ...[0, 1, 2, 3].map((i) => ({ key: `media-${i}`, label: `Picture ${i + 1}`, ratio: (d, n) => xMediaRatio(n, i) })),
    ],
  },
  'x-profile': {
    label: 'X profile', icon: Twitter, frame: 'auto', themes: ['light', 'dim', 'dark'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', def: 'Your Brand' },
      { key: 'handle', label: 'Handle', type: 'text', def: 'yourbrand' },
      { key: 'bio', label: 'Bio', type: 'textarea', def: 'Brands that move. Design, motion and launch films.' },
      { key: 'location', label: 'Location', type: 'text', def: 'Berlin' },
      { key: 'website', label: 'Website', type: 'text', def: 'yourbrand.com' },
      { key: 'joined', label: 'Joined', type: 'text', def: 'Joined March 2019' },
      { key: 'following', label: 'Following', type: 'number', def: 312 },
      { key: 'followers', label: 'Followers', type: 'number', def: 18200 },
      { key: 'verified', label: 'Verified', type: 'flag', def: true },
    ],
    slots: [
      { key: 'banner', label: 'Header picture (3:1)', ratio: () => 3 },
      { key: 'avatar', label: 'Profile picture', ratio: () => 1, round: true, small: true },
    ],
  },
  'app-icon': {
    label: 'App icon', icon: Smartphone, frame: 'auto', themes: ['light', 'dark'],
    fields: [
      { key: 'name', label: 'App name', type: 'text', def: 'Your App' },
      { key: 'layout', label: 'Show', type: 'select', def: 'home', choices: [['home', 'On the home screen'], ['sizes', 'At every size']] },
      { key: 'time', label: 'Time', type: 'text', def: '9:41', when: 'layout=home' },
      { key: 'badge', label: 'Notification badge', type: 'number', def: 0, min: 0, max: 99, when: 'layout=home' },
      { key: 'dock', label: 'Also in the dock', type: 'flag', def: true, when: 'layout=home' },
    ],
    slots: [
      { key: 'icon', label: 'App icon (square)', ratio: () => 1 },
      { key: 'wallpaper', label: 'Wallpaper', ratio: () => 390 / 844, when: 'layout=home' },
    ],
  },
  avatars: {
    label: 'Profile pictures', icon: CircleUser, frame: 'auto', themes: ['light', 'dark'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', def: 'Your Brand' },
      { key: 'handle', label: 'Handle', type: 'text', def: 'yourbrand' },
      { key: 'fill', label: 'Behind the logo', type: 'select', def: 'white', choices: [['white', 'White'], ['black', 'Black'], ['brand', 'Colour below'], ['none', 'Nothing']] },
      { key: 'color', label: 'Colour', type: 'color', def: '#2EC5D3', when: 'fill=brand' },
      { key: 'squares', label: 'Rounded squares too', type: 'flag', def: true },
      { key: 'ring', label: 'Story ring', type: 'flag', def: false },
    ],
    slots: [{ key: 'avatar', label: 'Logo / picture (square)', ratio: () => 1 }],
  },
  'yt-channel': {
    label: 'YouTube channel', icon: Youtube, frame: 'auto', themes: ['light', 'dark'],
    fields: [
      { key: 'name', label: 'Channel name', type: 'text', def: 'Your Brand' },
      { key: 'handle', label: 'Handle', type: 'text', def: 'yourbrand' },
      { key: 'about', label: 'Description', type: 'textarea', def: 'Brands that move — design, motion and launch films.' },
      { key: 'subs', label: 'Subscribers', type: 'number', def: 48200 },
      { key: 'videos', label: 'Videos', type: 'number', def: 126 },
      { key: 'verified', label: 'Verified', type: 'flag', def: true },
      ...[0, 1, 2, 3].map((i) => ({ key: `t${i}`, label: `Video ${i + 1} title`, type: 'text', def: ['Our new brand, explained', 'Behind the scenes: the launch film', 'Designing the logo in 60 seconds', 'Brand motion toolkit — walkthrough'][i] })),
    ],
    slots: [
      { key: 'banner', label: 'Channel banner', ratio: () => 6.2 },
      { key: 'avatar', label: 'Profile picture', ratio: () => 1, round: true, small: true },
      ...[0, 1, 2, 3].map((i) => ({ key: `video-${i}`, label: `Video ${i + 1} thumbnail`, ratio: () => 16 / 9 })),
    ],
  },
  'li-page': {
    label: 'LinkedIn page', icon: Linkedin, frame: 'auto', themes: ['light', 'dark'],
    fields: [
      { key: 'name', label: 'Company', type: 'text', def: 'Your Brand' },
      { key: 'tagline', label: 'Tagline', type: 'text', def: 'Brands that move' },
      { key: 'industry', label: 'Industry', type: 'text', def: 'Design Services' },
      { key: 'location', label: 'Location', type: 'text', def: 'Berlin, Germany' },
      { key: 'followers', label: 'Followers', type: 'number', def: 8400 },
      { key: 'size', label: 'Company size', type: 'text', def: '11-50 employees' },
      { key: 'post', label: 'Post', type: 'textarea', def: 'Meet our new identity — designed to move with us. ✨' },
      { key: 'reactions', label: 'Reactions', type: 'number', def: 312 },
      { key: 'comments', label: 'Comments', type: 'number', def: 24 },
      { key: 'showPost', label: 'Show a post', type: 'flag', def: true },
    ],
    slots: [
      { key: 'banner', label: 'Cover (≈ 6:1)', ratio: () => 5.9 },
      { key: 'logo', label: 'Logo (square)', ratio: () => 1, small: true },
      { key: 'post', label: 'Post picture', ratio: () => 1.91, when: 'showPost' },
    ],
  },
};

// X shows 1–4 pictures: one wide, two side by side, three (one tall + two), four in a grid.
export function xMediaRatio(count, i) {
  if (count <= 1) return 16 / 9;
  if (count === 2) return 8 / 9;
  if (count === 3) return i === 0 ? 8 / 9 : 16 / 9;
  return 16 / 9;
}

/** Is a field / slot shown? `when` = 'flag' (a switch is on) or 'key=value' (a choice is made). */
export function shown(d, x) {
  if (!x.when) return true;
  const t = TYPES_2D[d.type] || TYPES_2D.browser;
  const [key, want] = x.when.split('=');
  const f = t.fields.find((y) => y.key === key);
  if (!f) return true;
  const v = fieldValue(d, f);
  return want === undefined ? !!v : String(v) === want;
}

/** The value of a field (the saved one, or its default). */
export function fieldValue(d, f) {
  if (f.type === 'number') return d.nums?.[f.key] ?? f.def;
  if (f.type === 'flag') return d.flags?.[f.key] ?? f.def;
  return d.text?.[f.key] ?? f.def;
}
/** All fields with their values, as { key: value }. */
export function values(d) {
  const t = TYPES_2D[d.type] || TYPES_2D.browser;
  return Object.fromEntries(t.fields.map((f) => [f.key, fieldValue(d, f)]));
}
/** The text / number / switch maps for a fresh mockup of a type. */
export function defaults2D(type) {
  const t = TYPES_2D[type] || TYPES_2D.browser;
  const text = {}; const nums = {}; const flags = {};
  for (const f of t.fields) {
    if (f.type === 'number') nums[f.key] = f.def;
    else if (f.type === 'flag') flags[f.key] = f.def;
    else text[f.key] = f.def;
  }
  return { type, theme: t.themes[0], text, nums, flags, slots: {}, padding: 0.08, shadow: true, scale: 1 };
}

// 1284 → "1,284"; 12400 → "12.4K"; 1_250_000 → "1.3M"
export const full = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
export function compact(n) {
  const v = Math.round(Number(n) || 0);
  const k = (x, d) => x.toFixed(d).replace(/\.0$/, '');
  if (v >= 1e6) return `${k(v / 1e6, v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e4) return `${k(v / 1e3, v >= 1e5 ? 0 : 1)}K`;
  return full(v);
}
