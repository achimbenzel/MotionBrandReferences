// The built-in devices and their finishes, the picture formats — plain data,
// so pages can list them without loading three.js.
import { Smartphone, Tablet, Laptop, AppWindow, Box, Watch, Monitor, Tv } from 'lucide-react';

export const FRAMES = { '16:9': 16 / 9, '4:5': 4 / 5, '1:1': 1, '9:16': 9 / 16, '3:2': 3 / 2 };
/** Pixel size of a frame format with `long` px on its long side. */
export const exportSize = (frame, long) => {
  const a = FRAMES[frame] || 16 / 9;
  return a >= 1 ? [long, Math.round(long / a)] : [Math.round(long * a), long];
};
export const DEVICE_ICON = { iphone: Smartphone, android: Smartphone, ipad: Tablet, macbook: Laptop, imac: Monitor, watch: Watch, tv: Tv, browser: AppWindow, custom: Box };
// The format a new mockup of a device starts in.
export const START_FRAME = { iphone: '4:5', android: '4:5', ipad: '4:5', watch: '1:1' };

export const DEVICES = {
  iphone: {
    label: 'iPhone',
    finishes: [
      { key: 'black', label: 'Black', frame: '#3b3b3e', back: '#26262a' },
      { key: 'natural', label: 'Natural', frame: '#b9b2a7', back: '#cbc5ba' },
      { key: 'silver', label: 'Silver', frame: '#d5d6d8', back: '#ebebec' },
      { key: 'blue', label: 'Deep blue', frame: '#3a465a', back: '#46546a' },
      { key: 'orange', label: 'Orange', frame: '#d9773a', back: '#e3884d' },
    ],
    rotates: true, lies: true,
  },
  ipad: {
    label: 'iPad',
    finishes: [
      { key: 'spacegray', label: 'Space grey', frame: '#45464a', back: '#4d4e53' },
      { key: 'silver', label: 'Silver', frame: '#cfd0d3', back: '#dcdde0' },
    ],
    rotates: true, lies: true,
  },
  macbook: {
    label: 'MacBook',
    finishes: [
      { key: 'spaceblack', label: 'Space black', frame: '#2c2d30', back: '#2c2d30' },
      { key: 'silver', label: 'Silver', frame: '#c9cacc', back: '#c9cacc' },
    ],
    lid: true,
  },
  android: {
    label: 'Android phone',
    finishes: [
      { key: 'obsidian', label: 'Obsidian', frame: '#2b2c2f', back: '#1f2023' },
      { key: 'porcelain', label: 'Porcelain', frame: '#d9d6cf', back: '#ece9e2' },
      { key: 'mint', label: 'Mint', frame: '#a9c8b8', back: '#bfd8ca' },
    ],
    rotates: true, lies: true,
  },
  watch: {
    label: 'Apple Watch',
    finishes: [
      { key: 'jetblack', label: 'Jet black', frame: '#1d1d1f', back: '#2b2b2e', band: '#1c1c1e' },
      { key: 'silver', label: 'Silver', frame: '#d3d4d6', back: '#dcdcde', band: '#c9ccd6' },
      { key: 'rosegold', label: 'Rose gold', frame: '#e3c2b4', back: '#e8cfc4', band: '#e9b8b0' },
    ],
  },
  imac: {
    label: 'iMac',
    finishes: [
      { key: 'blue', label: 'Blue', frame: '#4a7aa6', back: '#a8c4dc' },
      { key: 'green', label: 'Green', frame: '#4f8a6a', back: '#b3d3be' },
      { key: 'pink', label: 'Pink', frame: '#d36c7a', back: '#f2c2c6' },
      { key: 'silver', label: 'Silver', frame: '#b9bbbe', back: '#dfe0e2' },
      { key: 'purple', label: 'Purple', frame: '#7a68a8', back: '#cbc2e0' },
    ],
  },
  tv: {
    label: 'TV',
    finishes: [
      { key: 'black', label: 'Black', frame: '#1a1a1c', back: '#2a2a2d' },
      { key: 'silver', label: 'Silver', frame: '#8e9094', back: '#b5b7ba' },
    ],
  },
  browser: {
    label: 'Browser window',
    finishes: [
      { key: 'light', label: 'Light', frame: '#f4f4f6', back: '#e6e6ea' },
      { key: 'dark', label: 'Dark', frame: '#2a2a2f', back: '#1f1f23' },
    ],
    url: true,
  },
};
export const finishOf = (device, key) => {
  const list = DEVICES[device]?.finishes || [];
  return list.find((f) => f.key === key) || list[0];
};
