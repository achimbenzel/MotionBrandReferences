import {
  ClipboardList, ScrollText, Clapperboard, MonitorPlay, PackageCheck, Images, StickyNote, ListChecks, Paperclip,
  FileText, Link2, Library, Palette, Heading, Minus, Table,
} from 'lucide-react';

// Name and icon of every block type (the "Add block" menu lists them in this order).
export const BLOCK_META = {
  briefing: { label: 'Briefing', icon: ClipboardList },
  script: { label: 'Script', icon: ScrollText },
  storyboard: { label: 'Storyboard', icon: Clapperboard },
  review: { label: 'Review', icon: MonitorPlay },
  deliverables: { label: 'Deliverables', icon: PackageCheck },
  moodboard: { label: 'Moodboard', icon: Images },
  text: { label: 'Text', icon: StickyNote },
  todos: { label: 'To-dos', icon: ListChecks },
  files: { label: 'Files', icon: Paperclip },
  pdf: { label: 'PDF', icon: FileText },
  links: { label: 'Links', icon: Link2 },
  refs: { label: 'References', icon: Library },
  palette: { label: 'Palette', icon: Palette },
  heading: { label: 'Heading', icon: Heading },
  divider: { label: 'Divider', icon: Minus },
  table: { label: 'Table', icon: Table },
};
export const blockMeta = (type) => BLOCK_META[type] || BLOCK_META.text;
