/* สร้างไฟล์ Word ตารางเวร — ใช้ได้ทั้งในเบราว์เซอร์ (window.docx) และ Node (ทดสอบ) */
(function (root) {
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const DEFAULT_FONT = 'Sarabun';

  /**
   * @param D      ไลบรารี docx
   * @param o      { settings, month:{month,days,holidays,note} }
   * @returns      docx.Document
   */
  function buildRosterDoc(D, o) {
    const st = o.settings, m = o.month;
    const FONT = st.font || DEFAULT_FONT;
    const shifts = st.shifts.filter(s => s.active !== false);
    const [by, mm] = m.month.split('-').map(Number);
    const nDays = new Date(by - 543, mm, 0).getDate();
    const hol = new Set((m.holidays || []).map(Number));

    const DATE_W = 800;
    const total = 10200;
    const colW = Math.floor((total - DATE_W) / shifts.length);
    const HEAD = 'DCE6F1', HOL = 'FDECEC';
    const border = { style: D.BorderStyle.SINGLE, size: 4, color: '000000' };
    const borders = { top: border, bottom: border, left: border, right: border };

    const txt = (t, opt = {}) => new D.Paragraph({
      alignment: opt.align || D.AlignmentType.CENTER,
      spacing: { before: 0, after: opt.after || 0, line: 240 },
      children: [new D.TextRun({
        text: t || '', bold: !!opt.bold, color: opt.color,
        font: { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT },
        size: (opt.size || 12) * 2, sizeComplexScript: (opt.size || 12) * 2, boldComplexScript: !!opt.bold
      })]
    });
    const cell = (t, opt = {}) => new D.TableCell({
      children: [txt(t, opt)],
      columnSpan: opt.colSpan, rowSpan: opt.rowSpan,
      verticalAlign: D.VerticalAlign.CENTER, borders,
      width: { size: opt.w || colW, type: D.WidthType.DXA },
      shading: opt.fill ? { fill: opt.fill, type: D.ShadingType.CLEAR, color: 'auto' } : undefined
    });

    // ----- header: group / sub / label(rate) / time -----
    const groups = runs(shifts, s => s.group);
    const r1 = [cell('วันที่', { bold: true, rowSpan: 4, fill: HEAD, w: DATE_W })];
    const r2 = [];
    groups.forEach(g => {
      const hasSub = g.items.some(s => s.sub);
      if (hasSub) {
        r1.push(cell(g.key, { bold: true, colSpan: g.items.length, fill: HEAD, w: colW * g.items.length }));
        runs(g.items, s => s.sub).forEach(sg => r2.push(cell(sg.key, { bold: true, colSpan: sg.items.length, fill: HEAD, w: colW * sg.items.length })));
      } else {
        r1.push(cell(g.key, { bold: true, colSpan: g.items.length, rowSpan: 2, fill: HEAD, w: colW * g.items.length }));
      }
    });
    const rate = n => Number(n || 0).toLocaleString('en-US');
    const r3 = shifts.map(s => cell((s.label ? s.label + ' ' : '') + '(' + rate(s.rate) + ')', { bold: true, size: 11, fill: HEAD }));
    const r4 = shifts.map(s => cell(s.time, { size: 11, fill: HEAD }));
    const rows = [r1, r2, r3, r4].map(c => new D.TableRow({ children: c, tableHeader: true }));

    for (let d = 1; d <= nDays; d++) {
      const h = hol.has(d), fill = h ? HOL : undefined;
      const day = (m.days && m.days[d]) || {};
      rows.push(new D.TableRow({
        height: { value: 330, rule: D.HeightRule.ATLEAST },
        children: [cell(String(d), { w: DATE_W, bold: h, color: h ? 'C00000' : undefined, fill })]
          .concat(shifts.map(s => cell(day[s.key] || '', { fill })))
      }));
    }

    const table = new D.Table({
      rows, width: { size: DATE_W + colW * shifts.length, type: D.WidthType.DXA },
      columnWidths: [DATE_W].concat(shifts.map(() => colW)),
      layout: D.TableLayoutType.FIXED, alignment: D.AlignmentType.CENTER,
      margins: { left: 50, right: 50, top: 0, bottom: 0 }
    });

    const note = 'หมายเหตุ  วันที่ตัวเลขสีแดง = วันหยุดราชการ/วันหยุดนักขัตฤกษ์' + (m.note ? '     ' + m.note : '');
    return new D.Document({
      styles: { default: { document: { run: { font: FONT, size: 24 } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 850, bottom: 680, left: 850, right: 850 } } },
        children: [
          txt(st.title + ' ' + st.hospital, { size: 16, bold: true }),
          txt('ประจำเดือน ' + TH_MONTHS[mm - 1] + ' ' + by, { size: 15, bold: true, after: 120 }),
          table,
          txt('', { size: 6 }),
          txt(note, { align: D.AlignmentType.LEFT })
        ]
      }]
    });
  }

  function runs(arr, keyFn) {
    const out = [];
    arr.forEach(x => {
      const k = keyFn(x) || '';
      if (out.length && out[out.length - 1].key === k) out[out.length - 1].items.push(x);
      else out.push({ key: k, items: [x] });
    });
    return out;
  }

  const api = { buildRosterDoc, TH_MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordExport = api;
})(this);
