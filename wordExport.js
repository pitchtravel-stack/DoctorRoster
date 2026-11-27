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
    // แบบฟอร์ม Word: ตัด OPD นอกเวลา และเรียงเวร ER เป็น ดึก-เช้า-บ่าย
    const shifts = st.shifts.filter(s => s.active !== false && s.key !== 'OPD' && !/^OPD/.test(s.group || ''));
    const en = shifts.findIndex(s => s.key === 'EN'), em = shifts.findIndex(s => s.key === 'EM');
    if (en > -1 && em > -1 && en > em) shifts.splice(em, 0, shifts.splice(en, 1)[0]);
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
      // เวรดึก 00.30-08.30 ของวันที่ d = คนที่ต่อจากเวรบ่ายของวันที่ d-1 (ในหน้าเว็บบันทึกไว้ที่วัน d-1)
      // วันที่ 1 ใช้ข้อมูลวันสุดท้ายของเดือนก่อน (o.firstNight) หรือช่องที่กรอกเอง (days[0])
      const prev = d === 1 ? Object.assign({}, (m.days && m.days[0]) || {}, o.firstNight || {}) : ((m.days && m.days[d - 1]) || {});
      const val = s => isNight(s) ? (prev[s.key] || '') : (day[s.key] || '');
      rows.push(new D.TableRow({
        height: { value: 330, rule: D.HeightRule.ATLEAST },
        children: [cell(String(d), { w: DATE_W, bold: h, color: h ? 'C00000' : undefined, fill })]
          .concat(shifts.map(s => cell(val(s), { fill })))
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


  /** ตารางเวรในเวลา (A–S) — A4 แนวนอน */
  function buildDayDoc(D, o) {
    const st = o.settings, m = o.month, FONT = st.font || DEFAULT_FONT;
    const rooms = (st.rooms || []).filter(r => r.active !== false);
    const [by, mm] = m.month.split('-').map(Number);
    const nDays = new Date(by - 543, mm, 0).getDate();
    const hol = new Set((m.holidays || []).map(Number));
    const TH_D = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const leave = m.leave || {};
    const TOTAL = 15800, DATE_W = 620, LV_W = 1100;
    const colW = Math.floor((TOTAL - DATE_W - LV_W) / (rooms.length * 2));
    const HEAD = 'DCE6F1', HOLF = 'EEEEEE';
    const border = { style: D.BorderStyle.SINGLE, size: 4, color: '000000' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const SZ = rooms.length > 8 ? 9 : 10;
    const txt = (t, opt = {}) => new D.Paragraph({
      alignment: opt.align || D.AlignmentType.CENTER, spacing: { before: 0, after: opt.after || 0, line: 228 },
      children: [new D.TextRun({ text: t || '', bold: !!opt.bold, color: opt.color, font: { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT },
        size: (opt.size || SZ) * 2, sizeComplexScript: (opt.size || SZ) * 2, boldComplexScript: !!opt.bold })]
    });
    const cell = (t, opt = {}) => new D.TableCell({
      children: [txt(t, opt)], columnSpan: opt.colSpan, rowSpan: opt.rowSpan, verticalAlign: D.VerticalAlign.CENTER, borders,
      width: { size: opt.w || colW, type: D.WidthType.DXA },
      shading: opt.fill ? { fill: opt.fill, type: D.ShadingType.CLEAR, color: 'auto' } : undefined
    });
    const r1 = [cell('วันที่', { bold: true, rowSpan: 3, fill: HEAD, w: DATE_W })]
      .concat(rooms.map(r => cell(r.name + (r.room && r.room !== r.name ? ' · ' + r.room : ''), { bold: true, colSpan: 2, fill: HEAD, w: colW * 2 })))
      .concat([cell('ลา', { bold: true, rowSpan: 3, fill: HEAD, w: LV_W })]);
    const r2 = rooms.map(r => cell(r.duty, { colSpan: 2, fill: HEAD, w: colW * 2, size: SZ - 1 }));
    const r3 = [].concat(...rooms.map(() => [cell('8.30-12.00', { fill: HEAD, size: SZ - 1 }), cell('12.00-16.30', { fill: HEAD, size: SZ - 1 })]));
    const rows = [r1, r2, r3].map(c => new D.TableRow({ children: c, tableHeader: true }));
    for (let d = 1; d <= nDays; d++) {
      const w = new Date(by - 543, mm - 1, d).getDay(), h = hol.has(d);
      const dc = cell(d + ' ' + TH_D[w], { w: DATE_W, bold: h, color: h ? 'C00000' : undefined, fill: h ? HOLF : undefined });
      const lv = Object.keys(leave).filter(n => (leave[n] || []).map(Number).includes(d)).join(', ');
      let cells;
      if (h) cells = [dc, cell('วันหยุดราชการ', { colSpan: rooms.length * 2, w: colW * rooms.length * 2, fill: HOLF, color: '666666' }), cell(lv, { w: LV_W, fill: HOLF })];
      else {
        const day = (m.dayDays && m.dayDays[d]) || {};
        cells = [dc].concat(...rooms.map(r => [cell(day[r.k + '_M'] || ''), cell(day[r.k + '_A'] || '')])).concat([cell(lv, { w: LV_W, color: 'B91C1C' })]);
      }
      rows.push(new D.TableRow({ height: { value: 280, rule: D.HeightRule.ATLEAST }, children: cells }));
    }
    const table = new D.Table({
      rows, width: { size: DATE_W + LV_W + colW * rooms.length * 2, type: D.WidthType.DXA },
      columnWidths: [DATE_W].concat(Array(rooms.length * 2).fill(colW), [LV_W]),
      layout: D.TableLayoutType.FIXED, alignment: D.AlignmentType.CENTER, margins: { left: 30, right: 30, top: 0, bottom: 0 }
    });
    return new D.Document({
      styles: { default: { document: { run: { font: FONT, size: SZ * 2 } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838, orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 500, bottom: 400, left: 500, right: 500 } } },
        children: [
          txt('ตารางปฏิบัติงานแพทย์ในเวลาราชการ ' + st.hospital + '  ประจำเดือน ' + TH_MONTHS[mm - 1] + ' ' + by, { size: 15, bold: true, after: 80 }),
          table,
          txt(m.note ? 'หมายเหตุ  ' + m.note : '', { align: D.AlignmentType.LEFT, size: 11 })
        ]
      }]
    });
  }

  const isNight = s => /^0?0[.:]?30/.test(String(s.time || '').trim());

  function runs(arr, keyFn) {
    const out = [];
    arr.forEach(x => {
      const k = keyFn(x) || '';
      if (out.length && out[out.length - 1].key === k) out[out.length - 1].items.push(x);
      else out.push({ key: k, items: [x] });
    });
    return out;
  }

  const api = { buildRosterDoc, buildDayDoc, isNight, TH_MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordExport = api;
})(this);
