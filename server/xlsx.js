/**
 * A small .xlsx (Office Open XML) writer — just what the time tracker's
 * export needs, no library: sheets with typed cells (text, numbers, dates,
 * times, formulas with their value), column widths, a frozen header row,
 * filter buttons, drop-down lists (data validation), a hidden list sheet and
 * a few styles. The workbook is zipped (deflate) in memory.
 */
import zlib from 'node:zlib';

// ---- zip -------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = []; const central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ---- cells -------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  // characters XML 1.0 doesn't allow
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // eslint-disable-line no-control-regex
export const colName = (i) => { let s = ''; let n = i + 1; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
/** A1:G9 → $A$1:$G$9 */
export const absRef = (ref) => ref.split(':').map((p) => p.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')).join(':');
/** Excel's day number of a yyyy-mm-dd date. */
export const excelDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
/** Excel's fraction of a day of an HH:MM time. */
export const excelTime = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return (h * 60 + m) / 1440; };

function cellXml(c, ref) {
  if (c == null || c === '') return '';
  const cell = typeof c === 'object' ? c : { v: c };
  const s = cell.s ? ` s="${cell.s}"` : '';
  if (cell.f) {
    const v = cell.v == null ? '' : typeof cell.v === 'number' ? `<v>${cell.v}</v>` : `<v>${esc(cell.v)}</v>`;
    return `<c r="${ref}"${s}${typeof cell.v === 'string' ? ' t="str"' : ''}><f>${esc(cell.f)}</f>${v}</c>`;
  }
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
  if (cell.v == null || cell.v === '') return s ? `<c r="${ref}"${s}/>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
}

function sheetXml(sh) {
  const rows = sh.rows.map((r, i) => {
    const cells = r.map((c, j) => cellXml(c, `${colName(j)}${i + 1}`)).join('');
    const ht = i === 0 && sh.headerHeight ? ` ht="${sh.headerHeight}" customHeight="1"` : '';
    return `<row r="${i + 1}"${ht}>${cells}</row>`;
  }).join('');
  const width = Math.max(1, ...sh.rows.map((r) => r.length), sh.cols?.length || 0);
  const dim = `A1:${colName(width - 1)}${Math.max(1, sh.rows.length)}`;
  const pane = sh.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '';
  const cols = sh.cols?.length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const filter = sh.autoFilter ? `<autoFilter ref="${sh.autoFilter}"/>` : '';
  const dv = sh.lists?.length ? `<dataValidations count="${sh.lists.length}">${sh.lists.map((l) => (
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${l.sqref}"><formula1>${esc(l.source)}</formula1></dataValidation>`
  )).join('')}</dataValidations>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `${sh.tab ? `<sheetPr><tabColor rgb="FF${sh.tab}"/></sheetPr>` : ''}<dimension ref="${dim}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${sh.tabSelected ? ' tabSelected="1"' : ''}${sh.grid === false ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="18" customHeight="1"/>'
    + `${cols}<sheetData>${rows}</sheetData>${filter}${dv}`
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToHeight="0"/>'
    + '</worksheet>';
}

/**
 * The workbook as a Buffer. `sheets`: [{ name, rows: [[cell]], cols: [width], freeze, autoFilter,
 * lists: [{ sqref, source }], hidden, tab, headerHeight }]; a cell is a value or { v, f, s }.
 * `stylesXml`: the workbook's styles (style ids are used as cell `s`).
 */
export function buildXlsx({ sheets, stylesXml, filterSheet = 0 }) {
  const book = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<bookViews><workbookView activeTab="0"/></bookViews><sheets>'
    + sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}"${sh.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')
    + '</sheets>'
    + (sheets[filterSheet]?.autoFilter ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${filterSheet}" hidden="1">${esc(`'${sheets[filterSheet].name.replace(/'/g, "''")}'!${absRef(sheets[filterSheet].autoFilter)}`)}</definedName></definedNames>` : '')
    + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:creator>Confinium</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Confinium</Application></Properties>';
  return zip([
    ['[Content_Types].xml', types], ['_rels/.rels', rootRels], ['docProps/core.xml', core], ['docProps/app.xml', app],
    ['xl/workbook.xml', book], ['xl/_rels/workbook.xml.rels', rels], ['xl/styles.xml', stylesXml],
    ...sheets.map((sh, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh)]),
  ]);
}
