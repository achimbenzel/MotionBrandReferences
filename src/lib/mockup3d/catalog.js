// The built-in devices and their finishes — plain data, so pages can list
// them without loading three.js.
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
