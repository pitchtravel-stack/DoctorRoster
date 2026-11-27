/* ตารางเวรแพทย์นอกเวลาราชการ — Frontend (GitHub Pages) */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const VERSION = CFG.APP_VERSION || 'v1.0.0';
  const DEMO = !CFG.API_URL;
  const AUTH_KEY = 'roster_auth_v1';
  const TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_D = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const ROLE_TH = { admin: 'ผู้ดูแลระบบ', editor: 'ผู้จัดตารางเวร', viewer: 'ผู้ดูตารางเวร' };

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('th-TH');

  const S = { auth: null, settings: null, months: [], cur: null, dirty: false, page: 'roster' };

  // ===================== API =====================
  async function api(action, payload = {}) {
    if (DEMO) return demoApi(action, payload);
    const body = JSON.stringify(Object.assign({ action, token: S.auth && S.auth.token }, payload));
    const res = await fetch(CFG.API_URL, { method: 'POST', body, redirect: 'follow' });
    const j = await res.json();
    if (!j.ok) {
      if (j.code === 'AUTH') { logout(true); }
      throw new Error(j.error || 'เกิดข้อผิดพลาด');
    }
    return j.data;
  }

  // ----- โหมดทดลอง: เก็บใน localStorage -----
  const DEMO_KEY = 'roster_demo_v1';
  function demoDb() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch (e) { }
    if (!db) {
      db = { settings: DEFAULT_SETTINGS(), months: {}, users: [{ email: 'demo@gmail.com', name: 'ผู้ทดลองใช้', role: 'admin', active: true }] };
      const seed = JSON.parse(JSON.stringify(DEMO_SEED));
      seed.updatedAt = Date.now(); seed.updatedBy = 'demo@gmail.com';
      db.months[seed.month] = seed;
    }
    return db;
  }
  function demoSave(db) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { } }
  async function demoApi(action, p) {
    const db = demoDb();
    const user = db.users[0];
    switch (action) {
      case 'init': return { settings: db.settings, user, months: Object.values(db.months).map(m => ({ month: m.month, updatedAt: m.updatedAt, updatedBy: m.updatedBy })) };
      case 'getMonth': return db.months[p.month] || null;
      case 'saveMonth': { const d = Object.assign({}, p.data, { updatedAt: Date.now(), updatedBy: user.email }); db.months[d.month] = d; demoSave(db); return d; }
      case 'saveSettings': db.settings = p.settings; demoSave(db); return db.settings;
      case 'listUsers': return db.users;
      case 'saveUsers': db.users = p.users; demoSave(db); return db.users;
      case 'logout': return true;
    }
    return null;
  }

  // ===================== UI helpers =====================
  let toastT;
  function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
  function busy(on) { $('busy').classList.toggle('hidden', !on); }
  async function run(fn) { busy(true); try { return await fn(); } catch (e) { toast('⚠ ' + e.message, 4000); } finally { busy(false); } }
  const can = (...roles) => S.auth && roles.includes(S.auth.user.role);

  // ===================== LOGIN =====================
  function showLogin() {
    $('app').classList.add('hidden'); $('login').classList.remove('hidden');
    $('stepEmail').classList.remove('hidden'); $('stepOtp').classList.add('hidden');
    $('lver').textContent = VERSION; $('lmsg').textContent = '';
    $('email').value = localStorage.getItem('roster_last_email') || '';
  }
  function lmsg(t, cls) { const m = $('lmsg'); m.textContent = t; m.className = 'msg ' + (cls || ''); }

  $('btnOtp').onclick = async () => {
    const email = $('email').value.trim().toLowerCase();
    if (!email) return lmsg('กรุณากรอกอีเมล', 'err');
    $('btnOtp').disabled = true; lmsg('กำลังส่งรหัส…');
    try {
      await api('requestOtp', { email });
      localStorage.setItem('roster_last_email', email);
      $('otpTo').textContent = email;
      $('stepEmail').classList.add('hidden'); $('stepOtp').classList.remove('hidden');
      lmsg('ส่งรหัสแล้ว กรุณาตรวจสอบกล่องจดหมาย (และโฟลเดอร์สแปม)', 'ok'); $('otp').value = ''; $('otp').focus();
    } catch (e) { lmsg(e.message, 'err'); } finally { $('btnOtp').disabled = false; }
  };
  $('btnVerify').onclick = async () => {
    const code = $('otp').value.trim();
    if (!/^\d{6}$/.test(code)) return lmsg('กรุณากรอกรหัส 6 หลัก', 'err');
    $('btnVerify').disabled = true; lmsg('กำลังตรวจสอบ…');
    try {
      const r = await api('verifyOtp', { email: $('otpTo').textContent, code });
      S.auth = r; localStorage.setItem(AUTH_KEY, JSON.stringify(r));
      await start();
    } catch (e) { lmsg(e.message, 'err'); } finally { $('btnVerify').disabled = false; }
  };
  $('otp').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnVerify').click(); });
  $('email').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnOtp').click(); });
  $('btnBack').onclick = () => { $('stepOtp').classList.add('hidden'); $('stepEmail').classList.remove('hidden'); lmsg(''); };

  function logout(expired) {
    if (!expired && S.auth && !DEMO) api('logout').catch(() => { });
    localStorage.removeItem(AUTH_KEY); S.auth = null; S.dirty = false;
    showLogin(); if (expired) lmsg('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'err');
  }
  $('btnLogout').onclick = () => { if (S.dirty && !confirm('ยังไม่ได้บันทึกตาราง ต้องการออกจากระบบหรือไม่?')) return; logout(); };

  // ===================== START =====================
  async function boot() {
    $('sver').textContent = 'เวอร์ชัน ' + VERSION;
    if (DEMO) { S.auth = { token: 'demo', user: { email: 'demo@gmail.com', name: 'ผู้ทดลองใช้', role: 'admin' } }; $('demoTag').classList.remove('hidden'); return start(); }
    try { S.auth = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { }
    if (!S.auth || !S.auth.token || S.auth.expiresAt < Date.now()) { localStorage.removeItem(AUTH_KEY); S.auth = null; return showLogin(); }
    start();
  }

  async function start() {
    await run(async () => {
      const r = await api('init');
      S.settings = normSettings(r.settings); S.months = r.months || []; S.auth.user = r.user || S.auth.user;
      $('login').classList.add('hidden'); $('app').classList.remove('hidden');
      $('whoName').textContent = S.auth.user.name || S.auth.user.email;
      $('whoRole').textContent = ROLE_TH[S.auth.user.role] || S.auth.user.role;
      document.querySelectorAll('[data-role]').forEach(a => a.classList.toggle('hidden', !can(a.dataset.role)));
      document.querySelectorAll('.ed').forEach(b => b.classList.toggle('hidden', !can('admin', 'editor')));
      fillMonthSelects();
      await loadMonth($('mSel').value);
      go(location.hash.slice(1) || 'roster');
    });
  }

  // ===================== NAV =====================
  const TITLES = { roster: 'ตารางเวรรายเดือน', summary: 'สรุปค่าตอบแทน', settings: 'ตั้งค่า', users: 'ผู้ใช้งาน', help: 'วิธีใช้' };
  function go(p) {
    if (!TITLES[p] || (['settings', 'users'].includes(p) && !can('admin'))) p = 'roster';
    S.page = p; location.hash = p;
    document.querySelectorAll('.page').forEach(x => x.classList.add('hidden'));
    $('p-' + p).classList.remove('hidden');
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.p === p));
    $('ptitle').textContent = TITLES[p];
    closeSide();
    if (p === 'summary') { $('sMon').value = $('mSel').value; renderSummary(); }
    if (p === 'settings') renderSettings();
    if (p === 'users') loadUsers();
  }
  $('nav').onclick = e => { const a = e.target.closest('a'); if (a) go(a.dataset.p); };
  $('burger').onclick = () => { $('side').classList.add('open'); $('ovl').classList.add('open'); };
  $('ovl').onclick = closeSide;
  function closeSide() { $('side').classList.remove('open'); $('ovl').classList.remove('open'); }

  // ===================== MONTH =====================
  const ymNow = () => { const d = new Date(); return { y: d.getFullYear() + 543, m: d.getMonth() + 1 }; };
  const key = (y, m) => y + '-' + String(m).padStart(2, '0');
  const label = k => { const [y, m] = k.split('-').map(Number); return TH_M[m - 1] + ' ' + y; };
  const nDays = k => { const [y, m] = k.split('-').map(Number); return new Date(y - 543, m, 0).getDate(); };
  const wday = (k, d) => { const [y, m] = k.split('-').map(Number); return new Date(y - 543, m - 1, d).getDay(); };

  function fillMonthSelects() {
    const n = ymNow(), set = new Set(S.months.map(x => x.month));
    for (let i = -6; i <= 12; i++) { const t = new Date(n.y - 543, n.m - 1 + i, 1); set.add(key(t.getFullYear() + 543, t.getMonth() + 1)); }
    const arr = [...set].sort();
    const saved = new Set(S.months.map(x => x.month));
    const opts = arr.map(k => `<option value="${k}">${label(k)}${saved.has(k) ? ' ✓' : ''}</option>`).join('');
    $('mSel').innerHTML = opts; $('sMon').innerHTML = opts;
    const nx = new Date(n.y - 543, n.m, 1); // เดือนถัดไป
    const def = key(nx.getFullYear() + 543, nx.getMonth() + 1);
    $('mSel').value = (S.cur && S.cur.month) || def;
  }

  function autoHolidays(k) {
    const [y, m] = k.split('-').map(Number), ad = y - 543, mm = String(m).padStart(2, '0');
    const list = (S.settings.holidays || []).map(s => s.split('|')[0].trim());
    const out = [];
    for (let d = 1; d <= nDays(k); d++) {
      const dd = String(d).padStart(2, '0');
      const w = wday(k, d);
      if (w === 0 || w === 6 || list.includes(mm + '-' + dd) || list.includes(ad + '-' + mm + '-' + dd)) out.push(d);
    }
    return out;
  }

  async function loadMonth(k) {
    const d = await api('getMonth', { month: k });
    S.cur = d || { month: k, days: {}, holidays: autoHolidays(k), note: '', isNew: true };
    S.cur.days = S.cur.days || {};
    S.dirty = false;
    renderGrid();
  }

  async function switchMonth(k) {
    if (S.dirty && !confirm('ยังไม่ได้บันทึกการแก้ไขเดือน ' + label(S.cur.month) + ' ต้องการเปลี่ยนเดือนหรือไม่?')) { $('mSel').value = S.cur.month; return; }
    await run(() => loadMonth(k));
  }
  $('mSel').onchange = () => switchMonth($('mSel').value);
  $('mPrev').onclick = () => { const i = $('mSel').selectedIndex; if (i > 0) { $('mSel').selectedIndex = i - 1; switchMonth($('mSel').value); } };
  $('mNext').onclick = () => { const i = $('mSel').selectedIndex; if (i < $('mSel').options.length - 1) { $('mSel').selectedIndex = i + 1; switchMonth($('mSel').value); } };

  function setStatus() {
    const st = $('mStatus');
    if (S.dirty) { st.textContent = '● ยังไม่บันทึก'; st.className = 'status dirty'; return; }
    st.className = 'status';
    st.textContent = S.cur.isNew ? 'ยังไม่มีข้อมูลเดือนนี้ (ตารางใหม่)' :
      'บันทึกล่าสุด ' + (S.cur.updatedAt ? new Date(S.cur.updatedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '') + (S.cur.updatedBy ? ' โดย ' + S.cur.updatedBy : '');
  }
  function markDirty() { S.dirty = true; setStatus(); }

  // ===================== GRID =====================
  const activeShifts = () => S.settings.shifts.filter(s => s.active !== false);
  function groupRuns(arr, f) { const o = []; arr.forEach(x => { const k = f(x) || ''; if (o.length && o[o.length - 1].key === k) o[o.length - 1].items.push(x); else o.push({ key: k, items: [x] }); }); return o; }

  function headHtml(shifts, lead) {
    let r1 = lead, r2 = '';
    groupRuns(shifts, s => s.group).forEach(g => {
      if (g.items.some(s => s.sub)) {
        r1 += `<th colspan="${g.items.length}">${esc(g.key)}</th>`;
        groupRuns(g.items, s => s.sub).forEach(sg => r2 += `<th colspan="${sg.items.length}">${esc(sg.key)}</th>`);
      } else r1 += `<th colspan="${g.items.length}" rowspan="2">${esc(g.key)}</th>`;
    });
    const r3 = shifts.map(s => `<th>${esc(s.label ? s.label + ' ' : '')}(${fmt(s.rate)})</th>`).join('');
    const r4 = shifts.map(s => `<th>${esc(s.time)}</th>`).join('');
    return `<thead><tr>${r1}</tr><tr>${r2}</tr><tr>${r3}</tr><tr>${r4}</tr></thead>`;
  }

  function renderGrid() {
    const k = S.cur.month, shifts = activeShifts(), hol = new Set(S.cur.holidays.map(Number));
    const editable = can('admin', 'editor');
    const docs = S.settings.doctors;
    let h = headHtml(shifts, '<th rowspan="4">วันที่</th>') + '<tbody>';
    for (let d = 1; d <= nDays(k); d++) {
      const day = S.cur.days[d] || {};
      h += `<tr class="${hol.has(d) ? 'hol' : ''}" data-d="${d}"><td class="d" title="คลิกเพื่อสลับวันหยุด">${d}<small>${TH_D[wday(k, d)]}</small></td>`;
      shifts.forEach(s => {
        const v = day[s.key] || '';
        const list = v && !docs.includes(v) ? docs.concat([v]) : docs;
        h += `<td><select data-k="${s.key}" ${editable ? '' : 'disabled class="ro"'}><option value=""></option>${list.map(n => `<option${n === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></td>`;
      });
      h += '</tr>';
    }
    $('grid').innerHTML = h + '</tbody>';
    $('mNote').value = S.cur.note || ''; $('mNote').disabled = !editable;
    checkConflicts(); setStatus();
  }

  $('grid').addEventListener('change', e => {
    const sel = e.target.closest('select'); if (!sel) return;
    const d = sel.closest('tr').dataset.d;
    S.cur.days[d] = S.cur.days[d] || {};
    if (sel.value) S.cur.days[d][sel.dataset.k] = sel.value; else delete S.cur.days[d][sel.dataset.k];
    markDirty(); checkConflicts();
  });
  $('grid').addEventListener('click', e => {
    const td = e.target.closest('td.d'); if (!td || !can('admin', 'editor')) return;
    const d = Number(td.parentElement.dataset.d);
    const set = new Set(S.cur.holidays.map(Number));
    set.has(d) ? set.delete(d) : set.add(d);
    S.cur.holidays = [...set].sort((a, b) => a - b);
    td.parentElement.classList.toggle('hol', set.has(d)); markDirty();
  });
  $('mNote').oninput = () => { S.cur.note = $('mNote').value; markDirty(); };

  function checkConflicts() {
    const shifts = activeShifts(); let n = 0;
    $('grid').querySelectorAll('tbody tr').forEach(tr => {
      const day = S.cur.days[tr.dataset.d] || {}, seen = {};
      shifts.forEach(s => { const v = day[s.key]; if (v) { const t = s.key && (s.time + '|' + v); seen[t] = (seen[t] || 0) + 1; } });
      tr.querySelectorAll('select').forEach(sel => {
        const s = shifts.find(x => x.key === sel.dataset.k), v = day[s.key];
        const bad = v && seen[s.time + '|' + v] > 1; sel.parentElement.classList.toggle('cf', !!bad); if (bad) n++;
      });
    });
    return n;
  }

  $('btnSave').onclick = () => run(async () => {
    if (checkConflicts() && !confirm('มีแพทย์ชื่อซ้ำในช่วงเวลาเดียวกัน (ช่องสีส้ม) ยืนยันบันทึกหรือไม่?')) return;
    const data = { month: S.cur.month, days: S.cur.days, holidays: S.cur.holidays, note: S.cur.note || '' };
    const r = await api('saveMonth', { data, baseUpdatedAt: S.cur.updatedAt || 0 });
    S.cur = r; S.cur.days = S.cur.days || {}; S.dirty = false;
    if (!S.months.find(m => m.month === r.month)) { S.months.push({ month: r.month }); fillMonthSelects(); }
    setStatus(); toast('บันทึกตารางเวร ' + label(r.month) + ' แล้ว');
  });

  $('btnClear').onclick = () => { if (!confirm('ล้างชื่อแพทย์ทั้งหมดในเดือน ' + label(S.cur.month) + '? (ยังไม่บันทึกจนกว่าจะกดบันทึก)')) return; S.cur.days = {}; renderGrid(); markDirty(); };
  $('btnHolAuto').onclick = () => { if (!confirm('ตั้งวันหยุดใหม่ตามเสาร์-อาทิตย์และรายการวันหยุดในตั้งค่า?')) return; S.cur.holidays = autoHolidays(S.cur.month); renderGrid(); markDirty(); };

  // ===================== WORD =====================
  $('btnWord').onclick = () => run(async () => {
    if (!window.docx) throw new Error('โหลดไลบรารี Word ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต');
    const doc = WordExport.buildRosterDoc(window.docx, { settings: S.settings, month: S.cur });
    const blob = await window.docx.Packer.toBlob(doc);
    const [y, m] = S.cur.month.split('-');
    download(blob, `ตารางเวรแพทย์นอกเวลาราชการ_${TH_M[m - 1]}_${y}.docx`);
    if (S.dirty) toast('ดาวน์โหลดแล้ว — อย่าลืมกดบันทึกตาราง', 3500);
  });
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ===================== CSV IMPORT =====================
  $('btnImport').onclick = () => { $('fileCsv').value = ''; $('fileCsv').click(); };
  $('fileCsv').onchange = async () => {
    const f = $('fileCsv').files[0]; if (!f) return;
    let text = await f.text();
    if (text.includes('�')) { // ไม่ใช่ UTF-8 → ลอง windows-874 (ไทย)
      const buf = await f.arrayBuffer(); text = new TextDecoder('windows-874').decode(buf);
    }
    importCsv(parseCsv(text.replace(/^﻿/, '')));
  };

  function parseCsv(t) {
    const R = []; let r = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); R.push(r); r = []; f = ''; }
      else f += c;
    }
    if (f || r.length) { r.push(f); R.push(r); }
    return R;
  }
  const colIdx = L => String(L || '').toUpperCase().split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;

  function importCsv(rows) {
    const shifts = activeShifts().filter(s => s.csvCol);
    if (!shifts.length) return toast('ยังไม่ได้กำหนด "คอลัมน์ CSV" ในตั้งค่าประเภทเวร');
    // ตรวจเดือนจากหัวไฟล์ เช่น "... เดือน ธันวาคม 2569"
    const head = rows.slice(0, 5).flat().join(' ');
    const mm = head.match(new RegExp('(' + TH_M.join('|') + ')\\s*(25\\d\\d)'));
    if (mm) {
      const fk = key(Number(mm[2]), TH_M.indexOf(mm[1]) + 1);
      if (fk !== S.cur.month) {
        if (!confirm(`ไฟล์นี้เป็นตารางเดือน ${label(fk)} แต่หน้าจอเปิดเดือน ${label(S.cur.month)} อยู่\n\nตกลง = นำเข้าเป็นเดือน ${label(fk)}\nยกเลิก = ไม่นำเข้า`)) return;
        if (S.dirty && !confirm('เดือนปัจจุบันยังไม่ได้บันทึก ต้องการทิ้งการแก้ไข?')) return;
        return run(async () => { if (![...$('mSel').options].some(o => o.value === fk)) $('mSel').add(new Option(label(fk), fk)); $('mSel').value = fk; await loadMonth(fk); importCsv(rows); });
      }
    }
    const max = nDays(S.cur.month), days = {}, filledDay = new Set();
    let started = false, prev = 0, found = 0;
    for (const r of rows) {
      const a = String(r[0] || '').trim();
      if (!/^\d{1,2}$/.test(a)) { if (started && prev >= 28) break; continue; }
      const d = Number(a);
      if (!started) { if (d !== 1) continue; started = true; }
      else if (d <= prev) break; // ขึ้นเดือนถัดไป
      prev = d; if (d > max) break;
      found++;
      shifts.forEach(s => {
        const v = String(r[colIdx(s.csvCol)] || '').trim();
        if (v) { (days[d] = days[d] || {})[s.key] = v; if (/^8\.?30/.test(s.time) ) filledDay.add(d); }
      });
    }
    if (!found) return toast('ไม่พบแถววันที่ในคอลัมน์ A ของไฟล์');
    if (Object.keys(S.cur.days).length && !confirm('นำเข้าข้อมูลทับตาราง ' + label(S.cur.month) + ' ที่มีอยู่?')) return;
    S.cur.days = days;
    // วันที่มีเวรช่วงเช้า 8.30 = วันหยุด
    const hol = new Set(autoHolidays(S.cur.month)); filledDay.forEach(d => hol.add(d));
    S.cur.holidays = [...hol].sort((a, b) => a - b);
    const noteCell = rows.flat().find(c => /^\s*ANC\s*:/.test(c || ''));
    if (noteCell && !S.cur.note) S.cur.note = noteCell.trim().replace(/\s*:\s*/, ' : ');
    const names = new Set(); Object.values(days).forEach(o => Object.values(o).forEach(n => names.add(n)));
    const newNames = [...names].filter(n => !S.settings.doctors.includes(n));
    if (newNames.length) { S.settings.doctors = S.settings.doctors.concat(newNames); if (can('admin')) api('saveSettings', { settings: S.settings }).catch(() => { }); }
    renderGrid(); markDirty();
    toast(`นำเข้า ${found} วันแล้ว${newNames.length ? ' · เพิ่มแพทย์ใหม่: ' + newNames.join(', ') : ''} — ตรวจสอบแล้วกดบันทึก`, 5000);
  }

  // ===================== SUMMARY =====================
  $('sMon').onchange = () => renderSummary();
  $('sRange').onchange = () => renderSummary();
  let lastSum = null;
  async function renderSummary() {
    const k = $('sMon').value;
    const m = (S.cur && S.cur.month === k) ? S.cur : await run(() => api('getMonth', { month: k }));
    const shifts = activeShifts(), rg = $('sRange').value, last = nDays(k);
    const from = rg === 'h2' ? 16 : 1, to = rg === 'h1' ? 15 : last;
    const rows = {};
    if (m) for (let d = from; d <= to; d++) {
      const day = (m.days || {})[d] || {};
      shifts.forEach(s => { const n = day[s.key]; if (n) { rows[n] = rows[n] || {}; rows[n][s.key] = (rows[n][s.key] || 0) + 1; } });
    }
    const order = S.settings.doctors;
    const names = Object.keys(rows).sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    const tot = {}; let gCnt = 0, gAmt = 0;
    let h = headHtml(shifts, '<th rowspan="4">ลำดับ</th><th rowspan="4">แพทย์</th>').replace('</tr><tr>', '<th rowspan="4">รวมเวร</th><th rowspan="4">รวมเงิน (บาท)</th></tr><tr>') + '<tbody>';
    names.forEach((n, i) => {
      let c = 0, amt = 0;
      h += `<tr><td>${i + 1}</td><td class="n">${esc(n)}</td>`;
      shifts.forEach(s => { const v = rows[n][s.key] || 0; c += v; amt += v * Number(s.rate || 0); tot[s.key] = (tot[s.key] || 0) + v; h += `<td>${v || ''}</td>`; });
      gCnt += c; gAmt += amt;
      h += `<td><b>${c}</b></td><td class="m"><b>${fmt(amt)}</b></td></tr>`;
    });
    if (!names.length) h += `<tr><td colspan="${shifts.length + 4}" style="color:var(--mut);padding:20px">ยังไม่มีข้อมูลเวรในช่วงนี้</td></tr>`;
    h += `</tbody><tfoot><tr><td colspan="2">รวม</td>${shifts.map(s => `<td>${tot[s.key] || ''}</td>`).join('')}<td>${gCnt}</td><td class="m">${fmt(gAmt)}</td></tr></tfoot>`;
    $('sum').innerHTML = h;
    const rgTxt = rg === 'all' ? '' : ` (วันที่ ${from}–${to})`;
    $('sTitle').textContent = 'สรุปค่าตอบแทนเวรแพทย์นอกเวลาราชการ ' + label(k) + rgTxt;
    const hol = m ? (m.holidays || []).filter(d => d >= from && d <= to).length : 0;
    $('kpis').innerHTML = [['รวมค่าตอบแทน', fmt(gAmt) + ' ฿'], ['จำนวนเวรทั้งหมด', gCnt], ['แพทย์ที่ขึ้นเวร', names.length + ' คน'], ['วันหยุดในช่วงนี้', hol + ' วัน']]
      .map(([a, b]) => `<div class="kpi"><span>${a}</span><b>${b}</b></div>`).join('');
    lastSum = { k, rgTxt, shifts, names, rows };
  }
  $('btnSumCsv').onclick = () => {
    if (!lastSum) return;
    const { shifts, names, rows } = lastSum;
    const head = ['แพทย์'].concat(shifts.map(s => `${s.group} ${s.sub} ${s.label} (${s.rate})`.replace(/\s+/g, ' ').trim()), ['รวมเวร', 'รวมเงิน']);
    const lines = [head].concat(names.map(n => {
      let c = 0, a = 0; const cells = shifts.map(s => { const v = rows[n][s.key] || 0; c += v; a += v * s.rate; return v; });
      return [n].concat(cells, [c, a]);
    }));
    const csv = '﻿' + lines.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(new Blob([csv], { type: 'text/csv' }), `สรุปค่าตอบแทนเวร_${label(lastSum.k)}.csv`);
  };

  // ===================== SETTINGS =====================
  let draft = null;
  $('stabs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#stabs button').forEach(x => x.classList.toggle('on', x === b));
    ['gen', 'doc', 'sh', 'hol'].forEach(t => $('st-' + t).classList.toggle('hidden', t !== b.dataset.t));
  };
  function renderSettings() {
    draft = JSON.parse(JSON.stringify(S.settings));
    $('setHosp').value = draft.hospital; $('setTitle').value = draft.title; $('setFont').value = draft.font || 'Sarabun';
    $('setHol').value = (draft.holidays || []).join('\n');
    drawDocs(); drawShifts();
  }
  const mv = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  function drawDocs() {
    $('tDoc').innerHTML = '<tr><th style="width:50px">#</th><th>ชื่อในตาราง</th><th style="width:120px"></th></tr>' +
      draft.doctors.map((n, i) => `<tr><td>${i + 1}</td><td><input data-i="${i}" value="${esc(n)}"></td><td><button class="btn ghost" data-up="${i}">↑</button> <button class="btn ghost" data-dn="${i}">↓</button> <button class="x" data-del="${i}">×</button></td></tr>`).join('');
  }
  $('tDoc').oninput = e => { if (e.target.dataset.i != null) draft.doctors[e.target.dataset.i] = e.target.value.trim(); };
  $('tDoc').onclick = e => {
    const t = e.target.dataset;
    if (t.up != null) mv(draft.doctors, +t.up, -1); else if (t.dn != null) mv(draft.doctors, +t.dn, 1);
    else if (t.del != null) draft.doctors.splice(+t.del, 1); else return;
    drawDocs();
  };
  $('addDoc').onclick = () => { draft.doctors.push(''); drawDocs(); const ins = $('tDoc').querySelectorAll('input'); ins[ins.length - 1].focus(); };

  const SH_F = [['group', 'กลุ่ม'], ['sub', 'กลุ่มย่อย'], ['label', 'ช่วง'], ['time', 'เวลา'], ['rate', 'อัตรา (บาท)'], ['csvCol', 'คอลัมน์ CSV']];
  function drawShifts() {
    $('tSh').innerHTML = '<tr><th>#</th>' + SH_F.map(f => `<th>${f[1]}</th>`).join('') + '<th>ใช้งาน</th><th style="width:120px"></th></tr>' +
      draft.shifts.map((s, i) => `<tr><td>${i + 1}</td>${SH_F.map(([f]) => `<td><input data-i="${i}" data-f="${f}" value="${esc(s[f])}" ${f === 'rate' ? 'type="number" style="width:100px"' : ''}${f === 'csvCol' ? 'style="width:70px"' : ''}></td>`).join('')}
      <td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="active" ${s.active !== false ? 'checked' : ''}></td>
      <td><button class="btn ghost" data-up="${i}">↑</button> <button class="btn ghost" data-dn="${i}">↓</button> <button class="x" data-del="${i}">×</button></td></tr>`).join('');
  }
  $('tSh').oninput = e => {
    const t = e.target, i = t.dataset.i, f = t.dataset.f; if (i == null) return;
    draft.shifts[i][f] = f === 'active' ? t.checked : f === 'rate' ? Number(t.value) : f === 'csvCol' ? t.value.trim().toUpperCase() : t.value;
  };
  $('tSh').onclick = e => {
    const t = e.target.dataset;
    if (t.up != null) mv(draft.shifts, +t.up, -1); else if (t.dn != null) mv(draft.shifts, +t.dn, 1);
    else if (t.del != null) { if (!confirm('ลบประเภทเวรนี้? ข้อมูลเวรประเภทนี้ในเดือนที่บันทึกไว้จะไม่แสดง (แนะนำให้ปิด "ใช้งาน" แทน)')) return; draft.shifts.splice(+t.del, 1); }
    else return;
    drawShifts();
  };
  $('addSh').onclick = () => { draft.shifts.push({ key: 'S' + Date.now().toString(36), group: '', sub: '', label: '', time: '', rate: 0, csvCol: '', active: true }); drawShifts(); };

  $('btnSaveSet').onclick = () => run(async () => {
    draft.hospital = $('setHosp').value.trim(); draft.title = $('setTitle').value.trim(); draft.font = $('setFont').value.trim() || 'Sarabun';
    draft.holidays = $('setHol').value.split('\n').map(s => s.trim()).filter(Boolean);
    draft.doctors = [...new Set(draft.doctors.filter(Boolean))];
    const r = await api('saveSettings', { settings: draft });
    S.settings = normSettings(r); renderGrid(); toast('บันทึกการตั้งค่าแล้ว');
  });

  // ===================== USERS =====================
  let users = [];
  async function loadUsers() { await run(async () => { users = await api('listUsers'); drawUsers(); }); }
  function drawUsers() {
    $('tUsr').innerHTML = '<tr><th>อีเมล (Gmail)</th><th>ชื่อ</th><th style="width:150px">สิทธิ์</th><th>ใช้งาน</th><th></th></tr>' +
      users.map((u, i) => `<tr><td><input data-i="${i}" data-f="email" value="${esc(u.email)}"></td><td><input data-i="${i}" data-f="name" value="${esc(u.name)}"></td>
      <td><select data-i="${i}" data-f="role">${['admin', 'editor', 'viewer'].map(r => `<option value="${r}"${u.role === r ? ' selected' : ''}>${r} – ${ROLE_TH[r]}</option>`).join('')}</select></td>
      <td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="active" ${u.active ? 'checked' : ''}></td><td><button class="x" data-del="${i}">×</button></td></tr>`).join('');
  }
  const usrIn = e => { const t = e.target, i = t.dataset.i; if (i == null) return; users[i][t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value.trim(); };
  $('tUsr').oninput = usrIn; $('tUsr').onchange = usrIn;
  $('tUsr').onclick = e => { if (e.target.dataset.del != null) { users.splice(+e.target.dataset.del, 1); drawUsers(); } };
  $('addUsr').onclick = () => { users.push({ email: '', name: '', role: 'viewer', active: true }); drawUsers(); };
  $('btnSaveUsr').onclick = () => run(async () => {
    users = users.filter(u => u.email).map(u => Object.assign(u, { email: u.email.toLowerCase() }));
    users = await api('saveUsers', { users }); drawUsers(); toast('บันทึกผู้ใช้งานแล้ว');
  });

  // ===================== defaults =====================
  function normSettings(s) {
    const d = DEFAULT_SETTINGS(); s = s || {};
    return { hospital: s.hospital || d.hospital, title: s.title || d.title, font: s.font || 'Sarabun', doctors: s.doctors || d.doctors, shifts: (s.shifts && s.shifts.length) ? s.shifts : d.shifts, holidays: s.holidays || d.holidays };
  }
  function DEFAULT_SETTINGS() {
    return {
      hospital: 'โรงพยาบาลร้องกวาง', title: 'ตารางเวรแพทย์นอกเวลาราชการ', font: 'Sarabun',
      doctors: ['พสิษฐ์', 'ตรีรัตน์', 'ภาณุวัฒน์', 'ชนาพร', 'นภัสสร', 'อาทิตย์', 'พิม', 'ชนกนันท์', 'วิทวัส', 'อาทิตยา', 'อธิศีล', 'ไผ่ตรง'],
      shifts: [
        { key: 'WM', group: 'แพทย์วอร์ด', sub: 'IPD/LR', label: 'เช้า', time: '8.30-16.30', rate: 1200, csvCol: 'T', active: true },
        { key: 'WA', group: 'แพทย์วอร์ด', sub: 'IPD/LR', label: 'บ่าย', time: '16.30-00.30', rate: 1200, csvCol: 'U', active: true },
        { key: 'WN', group: 'แพทย์วอร์ด', sub: 'IPD/LR', label: 'ดึก', time: '00.30-08.30', rate: 1200, csvCol: 'Z', active: true },
        { key: 'OPD', group: 'OPD นอกเวลา', sub: '', label: '', time: '8.30-16.30', rate: 2200, csvCol: 'V', active: true },
        { key: 'EM', group: 'แพทย์เวร', sub: 'ER', label: 'เช้า', time: '8.30-16.30', rate: 2200, csvCol: 'W', active: true },
        { key: 'EA', group: 'แพทย์เวร', sub: 'ER', label: 'บ่าย', time: '16.30-00.30', rate: 2200, csvCol: 'X', active: true },
        { key: 'EN', group: 'แพทย์เวร', sub: 'ER', label: 'ดึก', time: '00.30-08.30', rate: 1200, csvCol: 'Y', active: true }
      ],
      holidays: ['01-01|วันขึ้นปีใหม่', '04-06|วันจักรี', '04-13|สงกรานต์', '04-14|สงกรานต์', '04-15|สงกรานต์', '05-01|วันแรงงาน', '05-04|วันฉัตรมงคล', '06-03|วันเฉลิมฯ พระราชินี', '07-28|วันเฉลิมฯ ร.10', '08-12|วันแม่แห่งชาติ', '10-13|วันนวมินทรมหาราช', '10-23|วันปิยมหาราช', '12-05|วันพ่อแห่งชาติ', '12-10|วันรัฐธรรมนูญ', '12-31|วันสิ้นปี', '2026-12-07|ชดเชยวันพ่อแห่งชาติ']
    };
  }
  const DEMO_SEED = {"month":"2569-12","days":{"1":{"EA":"นภัสสร","EN":"นภัสสร"},"2":{"EA":"วิทวัส","EN":"วิทวัส"},"3":{"EA":"อาทิตยา","EN":"อาทิตยา"},"4":{"EA":"อธิศีล","EN":"อธิศีล"},"5":{"WM":"นภัสสร","WA":"นภัสสร","EM":"วิทวัส","EA":"วิทวัส","EN":"นภัสสร"},"6":{"WM":"ชนกนันท์","WA":"ชนกนันท์","EM":"อาทิตยา","EA":"อาทิตยา","EN":"ชนกนันท์"},"7":{"WM":"ชนกนันท์","WA":"ชนกนันท์","EM":"ไผ่ตรง","EA":"ไผ่ตรง","EN":"ชนกนันท์"},"8":{"EA":"วิทวัส","EN":"วิทวัส"},"9":{"EA":"นภัสสร","EN":"นภัสสร"},"10":{"WM":"ชนกนันท์","WA":"ชนกนันท์","EM":"ไผ่ตรง","EA":"ไผ่ตรง","EN":"ชนกนันท์"},"11":{"EA":"อาทิตยา","EN":"อาทิตยา"},"12":{"WM":"อธิศีล","WA":"อธิศีล","EM":"พสิษฐ์","EA":"พสิษฐ์","EN":"อธิศีล"},"13":{"WM":"อธิศีล","WA":"อธิศีล","EM":"นภัสสร","EA":"นภัสสร","EN":"อธิศีล"},"14":{"EA":"วิทวัส","EN":"วิทวัส"},"15":{"EA":"ชนกนันท์","EN":"ชนกนันท์"},"16":{"WM":"อธิศีล","WA":"อธิศีล","EM":"พสิษฐ์","EA":"พสิษฐ์","EN":"อธิศีล"},"17":{"EA":"อาทิตยา","EN":"อาทิตยา"},"18":{"EA":"ชนกนันท์","EN":"ชนกนันท์"},"19":{"WM":"วิทวัส","WA":"วิทวัส","EM":"นภัสสร","EA":"นภัสสร","EN":"วิทวัส"},"20":{"WM":"วิทวัส","WA":"วิทวัส","EM":"อธิศีล","EA":"อธิศีล","EN":"วิทวัส"},"21":{"EA":"อาทิตยา","EN":"อาทิตยา"},"22":{"EA":"นภัสสร","EN":"นภัสสร"},"23":{"EA":"ชนกนันท์","EN":"ชนกนันท์"},"24":{"EA":"วิทวัส","EN":"วิทวัส"},"25":{"EA":"อธิศีล","EN":"อธิศีล"},"26":{"WM":"อาทิตยา","WA":"อาทิตยา","EM":"พสิษฐ์","EA":"พสิษฐ์","EN":"อาทิตยา"},"27":{"WM":"อาทิตยา","WA":"อาทิตยา","EM":"ชนกนันท์","EA":"ชนกนันท์","EN":"อาทิตยา"},"28":{"EA":"นภัสสร","EN":"นภัสสร"},"29":{"EA":"วิทวัส","EN":"วิทวัส"},"30":{"EA":"อธิศีล","EN":"อธิศีล"},"31":{"WM":"อาทิตยา","WA":"อาทิตยา","WN":"อาทิตยา","EM":"ชนกนันท์","EA":"ชนกนันท์","EN":"ชนกนันท์"}},"holidays":[5,6,7,10,12,13,16,19,20,26,27,31],"note":"ANC : ชนกนันท์"};

  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', () => { const p = location.hash.slice(1); if (p && p !== S.page && S.auth && S.settings) go(p); });
  boot();
})();
