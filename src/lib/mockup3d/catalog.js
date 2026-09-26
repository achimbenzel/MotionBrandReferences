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

// Devices that used to be built in: scenes made with them still open (as a
// plain stand-in screen) until one of your own 3D models takes their place.
export const DEVICES = {
  iphone: { label: 'iPhone (old built-in)' },
  android: { label: 'Android phone (old built-in)' },
  ipad: { label: 'iPad (old built-in)' },
  macbook: { label: 'MacBook (old built-in)' },
  watch: { label: 'Apple Watch (old built-in)' },
  imac: { label: 'iMac (old built-in)' },
  tv: { label: 'TV (old built-in)' },
  browser: { label: 'Browser window (old 3D)' },
};
