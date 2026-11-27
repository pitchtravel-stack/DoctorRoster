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
      go(location.hash.slice(1) || 'day');
    });
  }

  // ===================== NAV =====================
  const TITLES = { pool: 'แพทย์ประจำเดือน', day: 'เวรในเวลา (A–S)', roster: 'เวรนอกเวลา (T–Z)', summary: 'สรุปค่าตอบแทน', settings: 'ตั้งค่า', users: 'ผู้ใช้งาน', help: 'วิธีใช้' };
  function go(p) {
    if (!TITLES[p] || (['settings', 'users'].includes(p) && !can('admin'))) p = 'day';
    S.page = p; location.hash = p;
    document.querySelectorAll('.page').forEach(x => x.classList.add('hidden'));
    $('p-' + p).classList.remove('hidden');
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.p === p));
    $('ptitle').textContent = TITLES[p];
    closeSide();
    document.querySelector('.top .mon').classList.toggle('hidden', !['pool', 'day', 'roster'].includes(p));
    if (p === 'pool') drawPool();
    if (p === 'day') drawDay();
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
    let pool = null;
    if (!d) pool = await prevPool(k);
    S.cur = d || { month: k, days: {}, holidays: autoHolidays(k), note: '', isNew: true };
    normMonth(S.cur, pool);
    S.dirty = false;
    renderAll();
  }
  async function prevPool(k) {
    const prev = S.months.map(x => x.month).filter(x => x < k).sort().pop();
    if (!prev) return null;
    try { const pm = await api('getMonth', { month: prev }); if (pm && pm.pool && pm.pool.length) return pm.pool.map(p => ({ name: p.name, on: p.on !== false })); } catch (e) { }
    return null;
  }
  function normMonth(m, pool) {
    m.days = m.days || {}; m.dayDays = m.dayDays || {}; m.leave = m.leave || {};
    if (!m.pool || !m.pool.length) m.pool = pool || S.settings.doctors.map(n => ({ name: n, on: true }));
    const seen = new Set(m.pool.map(p => p.name));
    [m.days, m.dayDays].forEach(o => Object.values(o).forEach(r => Object.values(r).forEach(n => { if (n && !seen.has(n)) { seen.add(n); m.pool.push({ name: n, on: true }); } })));
    Object.keys(m.leave).forEach(n => { if (!seen.has(n)) { seen.add(n); m.pool.push({ name: n, on: true }); } });
  }
  function renderAll() { renderGrid(); drawPool(); drawDay(); setStatus(); }
  const poolNames = () => S.cur.pool.filter(p => p.on && p.name).map(p => p.name);
  const onLeave = (n, d) => !!n && (S.cur.leave[n] || []).includes(Number(d));

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
    const docs = poolNames();
    let h = headHtml(shifts, '<th rowspan="4">วันที่</th>') + '<tbody>';
    for (let d = 1; d <= nDays(k); d++) {
      const day = S.cur.days[d] || {};
      h += `<tr class="${hol.has(d) ? 'hol' : ''}" data-d="${d}"><td class="d" title="คลิกเพื่อสลับวันหยุด">${d}<small>${TH_D[wday(k, d)]}</small></td>`;
      shifts.forEach(s => {
        const v = day[s.key] || '';
        const list = v && !docs.includes(v) ? docs.concat([v]) : docs;
        h += `<td><select data-k="${s.key}" ${editable ? '' : 'disabled class="ro"'}><option value=""></option>${list.map(n => `<option value="${esc(n)}"${n === v ? ' selected' : ''}>${esc(n)}${onLeave(n, d) ? ' (ลา)' : ''}</option>`).join('')}</select></td>`;
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
    if (onLeave(sel.value, d)) toast(`⚠ ${sel.value} ลาวันที่ ${d}`);
    markDirty(); checkConflicts();
  });
  $('grid').addEventListener('click', e => {
    const td = e.target.closest('td.d'); if (!td || !can('admin', 'editor')) return;
    const d = Number(td.parentElement.dataset.d);
    const set = new Set(S.cur.holidays.map(Number));
    set.has(d) ? set.delete(d) : set.add(d);
    S.cur.holidays = [...set].sort((a, b) => a - b);
    td.parentElement.classList.toggle('hol', set.has(d)); markDirty(); drawDay();
  });
  $('mNote').oninput = () => { S.cur.note = $('mNote').value; markDirty(); };

  function checkConflicts() {
    const shifts = activeShifts(); let n = 0;
    $('grid').querySelectorAll('tbody tr').forEach(tr => {
      const day = S.cur.days[tr.dataset.d] || {}, seen = {};
      shifts.forEach(s => { const v = day[s.key]; if (v) { const t = s.key && (s.time + '|' + v); seen[t] = (seen[t] || 0) + 1; } });
      tr.querySelectorAll('select').forEach(sel => {
        const s = shifts.find(x => x.key === sel.dataset.k), v = day[s.key];
        const lv = onLeave(v, tr.dataset.d), bad = v && !lv && seen[s.time + '|' + v] > 1;
        sel.parentElement.classList.toggle('cf', !!bad); sel.parentElement.classList.toggle('lv', lv); if (bad || lv) n++;
      });
    });
    return n;
  }

  $('btnSave').onclick = () => run(async () => {
    if ((checkConflicts() + checkDay()) && !confirm('มีช่องที่ต้องตรวจสอบ (สีแดง = จัดเวรตรงวันลา, สีส้ม = ชื่อซ้ำในช่วงเวลาเดียวกัน) ยืนยันบันทึกหรือไม่?')) return;
    const c = S.cur;
    const data = { month: c.month, days: c.days, dayDays: c.dayDays, leave: c.leave, pool: c.pool, holidays: c.holidays, note: c.note || '' };
    const r = await api('saveMonth', { data, baseUpdatedAt: c.updatedAt || 0 });
    S.cur = r; normMonth(S.cur); S.dirty = false;
    if (!S.months.find(m => m.month === r.month)) { S.months.push({ month: r.month }); fillMonthSelects(); }
    renderAll(); toast('บันทึกตารางเวร ' + label(r.month) + ' แล้ว');
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
  $('btnImport').onclick = $('btnImport2').onclick = () => { $('fileCsv').value = ''; $('fileCsv').click(); };
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
    const rooms = activeRooms(), lvIdx = colIdx(S.settings.leaveCsvCol || 'AA');
    const max = nDays(S.cur.month), days = {}, dayDays = {}, leave = {}, filledDay = new Set();
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
      rooms.forEach(rm => [['M', rm.colM], ['A', rm.colA]].forEach(([h, c]) => {
        const v = c ? String(r[colIdx(c)] || '').trim() : '';
        if (v) (dayDays[d] = dayDays[d] || {})[rm.k + '_' + h] = v;
      }));
      String(r[lvIdx] || '').split(/[,/、\s]+/).map(x => x.trim()).filter(Boolean).forEach(n => (leave[n] = leave[n] || []).push(d));
    }
    if (!found) return toast('ไม่พบแถววันที่ในคอลัมน์ A ของไฟล์');
    if ((Object.keys(S.cur.days).length || Object.keys(S.cur.dayDays).length) && !confirm('นำเข้าข้อมูลทับตาราง ' + label(S.cur.month) + ' ที่มีอยู่?')) return;
    S.cur.days = days; S.cur.dayDays = dayDays; S.cur.leave = leave;
    // วันที่มีเวรช่วงเช้า 8.30 = วันหยุด
    const hol = new Set(autoHolidays(S.cur.month)); filledDay.forEach(d => hol.add(d));
    S.cur.holidays = [...hol].sort((a, b) => a - b);
    const noteCell = rows.flat().find(c => /^\s*ANC\s*:/.test(c || ''));
    if (noteCell && !S.cur.note) S.cur.note = noteCell.trim().replace(/\s*:\s*/, ' : ');
    const before = new Set(S.cur.pool.map(p => p.name));
    normMonth(S.cur);
    const newNames = S.cur.pool.map(p => p.name).filter(n => !before.has(n));
    S.cur.pool.forEach(p => { if (!p.on && [days, dayDays].some(o => Object.values(o).some(r => Object.values(r).includes(p.name)))) p.on = true; });
    addMaster(newNames);
    renderAll(); markDirty();
    toast(`นำเข้า ${found} วันแล้ว${newNames.length ? ' · เพิ่มแพทย์ใหม่: ' + newNames.join(', ') : ''} — ตรวจสอบแล้วกดบันทึก`, 5000);
  }

  // ===================== MASTER DOCTORS =====================
  function addMaster(list) {
    const nw = (list || []).filter(n => n && !S.settings.doctors.includes(n));
    if (!nw.length) return;
    S.settings.doctors = S.settings.doctors.concat(nw);
    if (can('admin')) api('saveSettings', { settings: S.settings }).catch(() => { });
  }

  // ===================== POOL (แพทย์ประจำเดือน) =====================
  function drawPool() {
    if (!S.cur) return;
    const ed = can('admin', 'editor');
    $('poolMonth').textContent = label(S.cur.month);
    $('tPool').innerHTML = '<tr><th style="width:40px">#</th><th style="width:70px">ขึ้นเวร</th><th>ชื่อในตาราง</th><th>วันลาเดือนนี้</th><th style="width:170px"></th></tr>' +
      S.cur.pool.map((p, i) => {
        const lv = (S.cur.leave[p.name] || []).slice().sort((a, b) => a - b);
        return `<tr class="${p.on ? '' : 'off'}"><td>${i + 1}</td><td><input type="checkbox" class="tog" data-i="${i}" data-f="on" ${p.on ? 'checked' : ''} ${ed ? '' : 'disabled'}></td>
        <td><input type="text" data-i="${i}" data-f="name" value="${esc(p.name)}" ${ed ? '' : 'disabled'}></td>
        <td>${lv.length ? lv.map(d => `<span class="chip">${d}</span>`).join('') : '<span class="hint">–</span>'}</td>
        <td>${ed ? `<button class="btn sm" data-lv="${i}">วันลา</button> <button class="btn sm ghost" data-up="${i}">↑</button> <button class="btn sm ghost" data-dn="${i}">↓</button>` : ''}</td></tr>`;
      }).join('');
  }
  $('tPool').onchange = e => {
    const t = e.target, i = t.dataset.i; if (i == null) return; const p = S.cur.pool[i];
    if (t.dataset.f === 'on') { p.on = t.checked; markDirty(); drawPool(); renderGrid(); drawDay(); }
    if (t.dataset.f === 'name') {
      const old = p.name, nw = t.value.trim();
      if (!nw || nw === old) { t.value = old; return; }
      if (S.cur.pool.some(x => x !== p && x.name === nw)) { toast('มีชื่อนี้อยู่แล้ว'); t.value = old; return; }
      if (confirm(`เปลี่ยนชื่อ "${old}" เป็น "${nw}" ในตารางเวรเดือนนี้ทั้งหมดด้วยหรือไม่?`)) {
        [S.cur.days, S.cur.dayDays].forEach(o => Object.values(o).forEach(r => Object.keys(r).forEach(k => { if (r[k] === old) r[k] = nw; })));
        if (S.cur.leave[old]) { S.cur.leave[nw] = S.cur.leave[old]; delete S.cur.leave[old]; }
      }
      p.name = nw; addMaster([nw]); markDirty(); renderAll();
    }
  };
  $('tPool').onclick = e => {
    const t = e.target.dataset;
    if (t.lv != null) return leaveModal(S.cur.pool[+t.lv].name);
    const mv = (i, d) => { const j = i + d; if (j < 0 || j >= S.cur.pool.length) return; [S.cur.pool[i], S.cur.pool[j]] = [S.cur.pool[j], S.cur.pool[i]]; markDirty(); renderAll(); };
    if (t.up != null) mv(+t.up, -1); if (t.dn != null) mv(+t.dn, 1);
  };
  $('poolAdd').onclick = () => {
    const n = (prompt('ชื่อแพทย์ (ชื่อที่ใช้ในตาราง)') || '').trim(); if (!n) return;
    const ex = S.cur.pool.find(p => p.name === n);
    if (ex) ex.on = true; else S.cur.pool.push({ name: n, on: true });
    addMaster([n]); markDirty(); renderAll(); toast('เพิ่ม ' + n + ' แล้ว');
  };
  $('poolPrev').onclick = () => run(async () => {
    const pool = await prevPool(S.cur.month);
    if (!pool) return toast('ไม่พบข้อมูลเดือนก่อนหน้า');
    const cur = new Map(S.cur.pool.map(p => [p.name, p]));
    S.cur.pool = pool.concat(S.cur.pool.filter(p => !pool.some(x => x.name === p.name)));
    S.cur.pool.forEach(p => { if (cur.has(p.name) && !pool.some(x => x.name === p.name)) p.on = cur.get(p.name).on; });
    markDirty(); renderAll(); toast('ดึงรายชื่อและลำดับจากเดือนก่อนแล้ว');
  });

  function modal(html) { const m = document.createElement('div'); m.className = 'mask'; m.innerHTML = '<div class="modal">' + html + '</div>'; document.body.appendChild(m); return m; }
  function leaveModal(name) {
    const k = S.cur.month, sel = new Set(S.cur.leave[name] || []), hol = new Set(S.cur.holidays.map(Number));
    const m = modal('');
    const draw = () => {
      let h = ''; TH_D.forEach(x => h += `<div class="h">${x}</div>`); for (let i = 0; i < wday(k, 1); i++) h += '<div></div>';
      for (let d = 1; d <= nDays(k); d++) h += `<button data-d="${d}" class="${hol.has(d) ? 'hd' : ''} ${sel.has(d) ? 'on' : ''}">${d}</button>`;
      m.firstChild.innerHTML = `<h3>วันลา — ${esc(name)}</h3><div class="hint">${label(k)} · คลิกวันที่เพื่อเลือก/ยกเลิก (ตัวแดง = วันหยุด)</div><div class="cal">${h}</div>
      <div class="hint">เลือกแล้ว ${sel.size} วัน</div><div class="mrow"><button class="btn ghost" data-x>ยกเลิก</button><button class="btn pri" data-ok>ตกลง</button></div>`;
    };
    draw();
    m.onclick = e => {
      const b = e.target;
      if (b.dataset.d) { const d = +b.dataset.d; sel.has(d) ? sel.delete(d) : sel.add(d); draw(); }
      else if (b.dataset.ok != null) { if (sel.size) S.cur.leave[name] = [...sel].sort((a, b) => a - b); else delete S.cur.leave[name]; m.remove(); markDirty(); renderAll(); }
      else if (b.dataset.x != null || b === m) m.remove();
    };
  }
  function leaveDayModal(d) {
    const m = modal(`<h3>ผู้ลา — วันที่ ${d} ${label(S.cur.month)}</h3><div style="margin:12px 0;display:grid;grid-template-columns:1fr 1fr;gap:6px">${poolNames().map(n => `<label><input type="checkbox" value="${esc(n)}" ${onLeave(n, d) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
      <div class="mrow"><button class="btn ghost" data-x>ยกเลิก</button><button class="btn pri" data-ok>ตกลง</button></div>`);
    m.onclick = e => {
      const b = e.target;
      if (b.dataset.ok != null) {
        m.querySelectorAll('input').forEach(c => { const a = new Set(S.cur.leave[c.value] || []); c.checked ? a.add(d) : a.delete(d); if (a.size) S.cur.leave[c.value] = [...a].sort((x, y) => x - y); else delete S.cur.leave[c.value]; });
        m.remove(); markDirty(); renderAll();
      } else if (b.dataset.x != null || b === m) m.remove();
    };
  }

  // ===================== DAY GRID (เวรในเวลา A–S) =====================
  const activeRooms = () => (S.settings.rooms || []).filter(r => r.active !== false);
  const workDays = () => { const a = [], hol = new Set(S.cur.holidays.map(Number)); for (let d = 1; d <= nDays(S.cur.month); d++) if (!hol.has(d)) a.push(d); return a; };
  const weekNo = d => { let w = 1; for (let i = 2; i <= d; i++) if (wday(S.cur.month, i) === 1) w++; return w; };
  let dayView = 'all';
  document.querySelector('#p-day .tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#p-day .tabs button').forEach(x => x.classList.toggle('on', x === b)); dayView = b.dataset.v; drawDay(); };
  $('showHol').onchange = () => drawDay();

  function drawDay() {
    if (!S.cur) return;
    const k = S.cur.month, N = poolNames(), rooms = activeRooms(), hol = new Set(S.cur.holidays.map(Number)), ed = can('admin', 'editor');
    const nw = weekNo(nDays(k));
    document.querySelectorAll('#p-day .tabs button').forEach(b => { const n = +String(b.dataset.v).slice(1); if (n) b.classList.toggle('hidden', n > nw); });
    let h = '<thead><tr><th class="sd" rowspan="3">วันที่</th>' + rooms.map(r => `<th colspan="2" class="room" data-room="${r.k}" ${ed ? 'title="คลิกเพื่อใส่คนเดียวทั้งเดือน"' : ''}>${esc(r.name)}<br><span style="font-weight:400;font-size:11.5px">${esc(r.room)}</span></th>`).join('') + '<th rowspan="3">ลา</th>' + (ed ? '<th rowspan="3"></th>' : '') + '</tr>';
    h += '<tr>' + rooms.map(r => `<th colspan="2">${esc(r.duty)}</th>`).join('') + '</tr>';
    h += '<tr>' + rooms.map(() => '<th>เช้า<br>8.30-12.00</th><th>บ่าย<br>12.00-16.30</th>').join('') + '</tr></thead><tbody>';
    for (let d = 1; d <= nDays(k); d++) {
      if (dayView !== 'all' && 'w' + weekNo(d) !== dayView) continue;
      const w = wday(k, d), ws = (w === 1 || d === 1) ? ' wk-start' : '';
      if (hol.has(d)) {
        if (!$('showHol').checked) continue;
        h += `<tr class="hol${ws}"><td class="sd">${d}<small>${TH_D[w]}</small></td><td colspan="${rooms.length * 2}">วันหยุด — ดูเวรที่หน้า "เวรนอกเวลา"</td><td></td>${ed ? '<td></td>' : ''}</tr>`; continue;
      }
      const o = S.cur.dayDays[d] || {};
      const lv = Object.keys(S.cur.leave).filter(n => onLeave(n, d));
      h += `<tr data-d="${d}" class="${ws}"><td class="sd" ${ed ? 'title="คัดลอกแถว"' : ''}>${d}<small>${TH_D[w]}</small></td>`;
      rooms.forEach(r => ['M', 'A'].forEach(hf => {
        const key = r.k + '_' + hf, v = o[key] || '', list = v && !N.includes(v) ? N.concat([v]) : N;
        h += `<td class="${hf === 'A' ? 'half2' : ''}"><select data-k="${key}" ${ed ? '' : 'disabled class="ro"'}><option value=""></option>${list.map(n => `<option value="${esc(n)}"${n === v ? ' selected' : ''}>${esc(n)}${onLeave(n, d) ? ' (ลา)' : ''}</option>`).join('')}</select></td>`;
      }));
      h += `<td class="leave" ${ed ? 'title="คลิกเพื่อแก้ผู้ลา"' : ''}>${lv.map(n => `<span class="chip">${esc(n)}</span>`).join('') || (ed ? '<span class="hint">+</span>' : '')}</td>${ed ? `<td class="act"><button class="btn sm ghost" data-menu="${d}">⋯</button></td>` : ''}</tr>`;
    }
    $('dgrid').innerHTML = h + '</tbody>';
    checkDay();
  }
  function checkDay() {
    let n = 0;
    $('dgrid').querySelectorAll('tbody tr[data-d]').forEach(tr => {
      const d = +tr.dataset.d, o = S.cur.dayDays[d] || {}, cnt = {};
      Object.entries(o).forEach(([k, v]) => { if (v) { const t = k.slice(-1) + '|' + v; cnt[t] = (cnt[t] || 0) + 1; } });
      tr.querySelectorAll('select').forEach(s => {
        const v = o[s.dataset.k], td = s.parentElement, lv = onLeave(v, d), cf = !!v && !lv && cnt[s.dataset.k.slice(-1) + '|' + v] > 1;
        td.classList.toggle('lv', lv); td.classList.toggle('cf', cf); if (lv || cf) n++;
      });
    });
    return n;
  }
  $('dgrid').addEventListener('change', e => {
    const s = e.target.closest('select'); if (!s) return; const d = s.closest('tr').dataset.d;
    S.cur.dayDays[d] = S.cur.dayDays[d] || {};
    if (s.value) { S.cur.dayDays[d][s.dataset.k] = s.value; if (onLeave(s.value, d)) toast(`⚠ ${s.value} ลาวันที่ ${d}`); } else delete S.cur.dayDays[d][s.dataset.k];
    markDirty(); checkDay();
  });
  $('dgrid').addEventListener('click', e => {
    if (!can('admin', 'editor')) return;
    const th = e.target.closest('th.room'); if (th) return fillRoom(th.dataset.room);
    const tr = e.target.closest('tr[data-d]'); if (!tr) return;
    if (e.target.closest('td.leave')) return leaveDayModal(+tr.dataset.d);
    const b = e.target.closest('[data-menu]') || e.target.closest('td.sd'); if (b) rowMenu(+tr.dataset.d, b);
  });
  function rowMenu(d, anchor) {
    document.querySelectorAll('.menu').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 'menu'; const r = anchor.getBoundingClientRect();
    m.style.left = Math.min(r.left, innerWidth - 240) + 'px'; m.style.top = (r.bottom + scrollY + 4) + 'px';
    const wn = TH_D[wday(S.cur.month, d)];
    m.innerHTML = `<button data-a="next">คัดลอกไปวันทำการถัดไป</button><button data-a="week">คัดลอกไปทุกวันที่เหลือในสัปดาห์</button><button data-a="same">คัดลอกไปทุกวัน${wn}ที่เหลือในเดือน</button><button data-a="clear" style="color:#b91c1c">ล้างแถวนี้</button>`;
    document.body.appendChild(m);
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return;
      const src = Object.assign({}, S.cur.dayDays[d] || {}), rest = workDays().filter(x => x > d); let tg = [];
      if (a === 'next') tg = rest.slice(0, 1); if (a === 'week') tg = rest.filter(x => weekNo(x) === weekNo(d)); if (a === 'same') tg = rest.filter(x => wday(S.cur.month, x) === wday(S.cur.month, d));
      if (a === 'clear') { S.cur.dayDays[d] = {}; toast('ล้างวันที่ ' + d); }
      else { tg.forEach(x => S.cur.dayDays[x] = Object.assign({}, src)); toast(tg.length ? `คัดลอกไปวันที่ ${tg.join(', ')}` : 'ไม่มีวันทำการถัดไป'); }
      m.remove(); markDirty(); drawDay();
    };
    setTimeout(() => document.addEventListener('click', function f(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', f); } }), 0);
  }
  function fillRoom(rk) {
    const r = activeRooms().find(x => x.k === rk), N = poolNames();
    const m = modal(`<h3>ใส่คนเดียวทั้งเดือน — ${esc(r.name)} ${esc(r.room)}</h3><div class="hint">ใส่ทุกวันทำการ (ข้ามวันหยุดและวันที่แพทย์คนนั้นลา)</div>
      <div style="display:grid;grid-template-columns:110px 1fr;gap:10px;align-items:center;margin:14px 0">
      <label>แพทย์</label><select id="fN" class="msel">${N.map(n => `<option>${esc(n)}</option>`).join('')}</select>
      <label>ช่วงเวลา</label><select id="fH" class="msel"><option value="MA">เช้า + บ่าย</option><option value="M">เช้า</option><option value="A">บ่าย</option></select>
      <label>เฉพาะวัน</label><div>${[1, 2, 3, 4, 5].map(w => `<label style="margin-right:8px"><input type="checkbox" class="fW" value="${w}" checked>${TH_D[w]}</label>`).join('')}</div>
      <label>ช่องที่มีชื่อแล้ว</label><select id="fO" class="msel"><option value="0">ไม่ทับ</option><option value="1">ทับ</option></select></div>
      <div class="mrow"><button class="btn ghost" data-x>ยกเลิก</button><button class="btn pri" data-ok>ใส่ชื่อ</button></div>`);
    m.onclick = e => {
      const b = e.target;
      if (b.dataset.ok != null) {
        const n = $('fN').value, hs = $('fH').value.split(''), ov = $('fO').value === '1', ws = [...m.querySelectorAll('.fW:checked')].map(x => +x.value); let c = 0, sk = 0;
        workDays().filter(d => ws.includes(wday(S.cur.month, d))).forEach(d => {
          if (onLeave(n, d)) { sk++; return; }
          S.cur.dayDays[d] = S.cur.dayDays[d] || {};
          hs.forEach(h => { const k = rk + '_' + h; if (ov || !S.cur.dayDays[d][k]) { S.cur.dayDays[d][k] = n; c++; } });
        });
        m.remove(); markDirty(); drawDay(); toast(`ใส่ ${n} ${c} ช่อง${sk ? ` (ข้ามวันลา ${sk} วัน)` : ''}`);
      } else if (b.dataset.x != null || b === m) m.remove();
    };
  }
  $('btnPattern').onclick = () => {
    if (!confirm('คัดลอกรูปแบบของสัปดาห์แรก (จ.–ศ.) ไปยังช่องที่ยังว่างทั้งเดือน ตามวันในสัปดาห์? (ข้ามวันลา)')) return;
    const tpl = {}; workDays().filter(d => weekNo(d) === 1).forEach(d => tpl[wday(S.cur.month, d)] = S.cur.dayDays[d] || {});
    if (!Object.keys(tpl).length) { const wk2 = workDays().filter(d => weekNo(d) === 2); wk2.forEach(d => tpl[wday(S.cur.month, d)] = S.cur.dayDays[d] || {}); }
    let c = 0;
    workDays().forEach(d => { const t = tpl[wday(S.cur.month, d)]; if (!t || t === S.cur.dayDays[d]) return; S.cur.dayDays[d] = S.cur.dayDays[d] || {}; Object.entries(t).forEach(([k, n]) => { if (!S.cur.dayDays[d][k] && !onLeave(n, d)) { S.cur.dayDays[d][k] = n; c++; } }); });
    markDirty(); drawDay(); toast('เติม ' + c + ' ช่องที่ว่าง');
  };
  $('btnDayClear').onclick = () => { if (!confirm('ล้างตารางเวรในเวลาทั้งเดือน ' + label(S.cur.month) + '? (ยังไม่บันทึกจนกว่าจะกดบันทึก)')) return; S.cur.dayDays = {}; markDirty(); drawDay(); };
  $('btnDayWord').onclick = () => run(async () => {
    if (!window.docx) throw new Error('โหลดไลบรารี Word ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต');
    const doc = WordExport.buildDayDoc(window.docx, { settings: S.settings, month: S.cur });
    const blob = await window.docx.Packer.toBlob(doc);
    const [y, m] = S.cur.month.split('-');
    download(blob, `ตารางปฏิบัติงานแพทย์ในเวลาราชการ_${TH_M[m - 1]}_${y}.docx`);
    if (S.dirty) toast('ดาวน์โหลดแล้ว — อย่าลืมกดบันทึกตาราง', 3500);
  });

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
    ['gen', 'doc', 'sh', 'rm', 'hol'].forEach(t => $('st-' + t).classList.toggle('hidden', t !== b.dataset.t));
  };
  function renderSettings() {
    draft = JSON.parse(JSON.stringify(S.settings));
    $('setHosp').value = draft.hospital; $('setTitle').value = draft.title; $('setFont').value = draft.font || 'Sarabun';
    $('setHol').value = (draft.holidays || []).join('\n');
    $('setLvCol').value = draft.leaveCsvCol || 'AA';
    drawDocs(); drawShifts(); drawRooms();
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

  const RM_F = [['name', 'ชื่อย่อ'], ['room', 'ห้อง/ตำแหน่ง'], ['duty', 'หน้าที่'], ['colM', 'CSV เช้า'], ['colA', 'CSV บ่าย']];
  function drawRooms() {
    $('tRm').innerHTML = '<tr><th>#</th>' + RM_F.map(f => `<th>${f[1]}</th>`).join('') + '<th>ใช้งาน</th><th style="width:120px"></th></tr>' +
      draft.rooms.map((r, i) => `<tr><td>${i + 1}</td>${RM_F.map(([f]) => `<td><input data-i="${i}" data-f="${f}" value="${esc(r[f])}" ${/^col/.test(f) ? 'style="width:70px"' : ''}></td>`).join('')}
      <td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="active" ${r.active !== false ? 'checked' : ''}></td>
      <td><button class="btn ghost" data-up="${i}">↑</button> <button class="btn ghost" data-dn="${i}">↓</button> <button class="x" data-del="${i}">×</button></td></tr>`).join('');
  }
  $('tRm').oninput = e => { const t = e.target, i = t.dataset.i, f = t.dataset.f; if (i == null) return; draft.rooms[i][f] = f === 'active' ? t.checked : /^col/.test(f) ? t.value.trim().toUpperCase() : t.value; };
  $('tRm').onclick = e => {
    const t = e.target.dataset;
    if (t.up != null) mv(draft.rooms, +t.up, -1); else if (t.dn != null) mv(draft.rooms, +t.dn, 1);
    else if (t.del != null) { if (!confirm('ลบห้องนี้? ข้อมูลเวรของห้องนี้ในเดือนที่บันทึกไว้จะไม่แสดง (แนะนำให้ปิด "ใช้งาน" แทน)')) return; draft.rooms.splice(+t.del, 1); }
    else return;
    drawRooms();
  };
  $('addRm').onclick = () => { draft.rooms.push({ k: 'R' + Date.now().toString(36), name: '', room: '', duty: '', colM: '', colA: '', active: true }); drawRooms(); };

  $('btnSaveSet').onclick = () => run(async () => {
    draft.leaveCsvCol = $('setLvCol').value.trim().toUpperCase() || 'AA';
    draft.hospital = $('setHosp').value.trim(); draft.title = $('setTitle').value.trim(); draft.font = $('setFont').value.trim() || 'Sarabun';
    draft.holidays = $('setHol').value.split('\n').map(s => s.trim()).filter(Boolean);
    draft.doctors = [...new Set(draft.doctors.filter(Boolean))];
    const r = await api('saveSettings', { settings: draft });
    S.settings = normSettings(r); renderAll(); toast('บันทึกการตั้งค่าแล้ว');
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
    let shifts = (s.shifts && s.shifts.length) ? s.shifts.map(x => Object.assign({}, x)) : d.shifts;
    if ((s.shiftsVer || 1) < 2 && s.shifts && s.shifts.length) shifts = migrateShifts(shifts);
    return { shiftsVer: 2, hospital: s.hospital || d.hospital, title: s.title || d.title, font: s.font || 'Sarabun', doctors: s.doctors || d.doctors, shifts, rooms: (s.rooms && s.rooms.length) ? s.rooms : d.rooms, leaveCsvCol: s.leaveCsvCol || 'AA', holidays: s.holidays || d.holidays };
  }
  // v1.1.1: เรียงเวร ER เป็น ดึก-เช้า-บ่าย ตามแบบฟอร์มเดิม และตัด OPD นอกเวลา
  function migrateShifts(sh) {
    const en = sh.findIndex(x => x.key === 'EN'), em = sh.findIndex(x => x.key === 'EM');
    if (en > -1 && em > -1 && en > em) { const [x] = sh.splice(en, 1); sh.splice(em, 0, x); }
    const op = sh.findIndex(x => x.key === 'OPD');
    if (op > -1) { const [x] = sh.splice(op, 1); x.active = false; sh.push(x); }
    return sh;
  }
  function DEFAULT_SETTINGS() {
    return {
      hospital: 'โรงพยาบาลร้องกวาง', title: 'ตารางเวรแพทย์นอกเวลาราชการ', font: 'Sarabun',
      doctors: ['พสิษฐ์', 'ตรีรัตน์', 'ภาณุวัฒน์', 'ชนาพร', 'นภัสสร', 'อาทิตย์', 'พิม', 'ชนกนันท์', 'วิทวัส', 'อาทิตยา', 'อธิศีล', 'ไผ่ตรง'],
      shifts: [
        { key: 'WM', group: 'แพทย์วอร์ด', sub: 'IPD/LR', label: 'เช้า', time: '8.30-16.30', rate: 1200, csvCol: 'T', active: true },
        { key: 'WA', group: 'แพทย์วอร์ด', sub: 'IPD/LR', label: 'บ่าย', time: '16.30-00.30', rate: 1200, csvCol: 'U', active: true },
        { key: 'WN', group: 'แพทย์วอร์ด', sub: 'IPD/LR', label: 'ดึก', time: '00.30-08.30', rate: 1200, csvCol: 'Z', active: true },
        { key: 'EN', group: 'แพทย์เวร', sub: 'ER', label: 'ดึก', time: '00.30-08.30', rate: 1200, csvCol: 'Y', active: true },
        { key: 'EM', group: 'แพทย์เวร', sub: 'ER', label: 'เช้า', time: '8.30-16.30', rate: 2200, csvCol: 'W', active: true },
        { key: 'EA', group: 'แพทย์เวร', sub: 'ER', label: 'บ่าย', time: '16.30-00.30', rate: 2200, csvCol: 'X', active: true },
        { key: 'OPD', group: 'OPD นอกเวลา', sub: '', label: '', time: '8.30-16.30', rate: 2200, csvCol: 'V', active: false }
      ],
      rooms: DEFAULT_ROOMS(), leaveCsvCol: 'AA',
      holidays: ['01-01|วันขึ้นปีใหม่', '04-06|วันจักรี', '04-13|สงกรานต์', '04-14|สงกรานต์', '04-15|สงกรานต์', '05-01|วันแรงงาน', '05-04|วันฉัตรมงคล', '06-03|วันเฉลิมฯ พระราชินี', '07-28|วันเฉลิมฯ ร.10', '08-12|วันแม่แห่งชาติ', '10-13|วันนวมินทรมหาราช', '10-23|วันปิยมหาราช', '12-05|วันพ่อแห่งชาติ', '12-10|วันรัฐธรรมนูญ', '12-31|วันสิ้นปี', '2026-12-07|ชดเชยวันพ่อแห่งชาติ']
    };
  }
  function DEFAULT_ROOMS() {
    return [
      { k: 'ER', name: 'ER', room: 'ห้องอุบัติเหตุฉุกเฉิน', duty: 'ER/MC/1st Autopsy', colM: 'B', colA: 'C', active: true },
      { k: 'NCD1', name: 'NCD1', room: 'ห้องตรวจโรค 1', duty: 'NCD/HD/CAPD', colM: 'D', colA: 'E', active: true },
      { k: 'NCD2', name: 'NCD2', room: 'ห้องตรวจโรค 2', duty: 'NCD/ARV/TB/ConWard', colM: 'F', colA: 'G', active: true },
      { k: 'ARI', name: 'ARI', room: 'ARI', duty: 'ARI/OPD1', colM: 'H', colA: 'I', active: true },
      { k: 'OPD1', name: 'OPD1', room: 'ห้องตรวจโรค 4', duty: 'OPD1', colM: 'J', colA: 'K', active: true },
      { k: 'OPD2', name: 'OPD1', room: 'ห้องตรวจโรค 4', duty: 'OPD1 / AUDIT (บ่าย on call)', colM: 'L', colA: 'M', active: true },
      { k: 'OPD3', name: 'OPD1', room: 'ห้องตรวจโรค 5', duty: 'OPD1', colM: 'N', colA: 'O', active: true },
      { k: 'LR', name: 'LR/ER', room: 'วอร์ด (เสริม)', duty: 'LR/IPD/ER/OPD/2nd Autopsy', colM: 'P', colA: 'Q', active: true },
      { k: 'IPD', name: 'IPD', room: 'วอร์ด', duty: 'IPD', colM: 'R', colA: 'S', active: true }
    ];
  }
  const DEMO_SEED = {"month": "2569-12", "days": {"1": {"EA": "นภัสสร", "EN": "นภัสสร"}, "2": {"EA": "วิทวัส", "EN": "วิทวัส"}, "3": {"EA": "อาทิตยา", "EN": "อาทิตยา"}, "4": {"EA": "อธิศีล", "EN": "อธิศีล"}, "5": {"WM": "นภัสสร", "WA": "นภัสสร", "EM": "วิทวัส", "EA": "วิทวัส", "EN": "นภัสสร"}, "6": {"WM": "ชนกนันท์", "WA": "ชนกนันท์", "EM": "อาทิตยา", "EA": "อาทิตยา", "EN": "ชนกนันท์"}, "7": {"WM": "ชนกนันท์", "WA": "ชนกนันท์", "EM": "ไผ่ตรง", "EA": "ไผ่ตรง", "EN": "ชนกนันท์"}, "8": {"EA": "วิทวัส", "EN": "วิทวัส"}, "9": {"EA": "นภัสสร", "EN": "นภัสสร"}, "10": {"WM": "ชนกนันท์", "WA": "ชนกนันท์", "EM": "ไผ่ตรง", "EA": "ไผ่ตรง", "EN": "ชนกนันท์"}, "11": {"EA": "อาทิตยา", "EN": "อาทิตยา"}, "12": {"WM": "อธิศีล", "WA": "อธิศีล", "EM": "พสิษฐ์", "EA": "พสิษฐ์", "EN": "อธิศีล"}, "13": {"WM": "อธิศีล", "WA": "อธิศีล", "EM": "นภัสสร", "EA": "นภัสสร", "EN": "อธิศีล"}, "14": {"EA": "วิทวัส", "EN": "วิทวัส"}, "15": {"EA": "ชนกนันท์", "EN": "ชนกนันท์"}, "16": {"WM": "อธิศีล", "WA": "อธิศีล", "EM": "พสิษฐ์", "EA": "พสิษฐ์", "EN": "อธิศีล"}, "17": {"EA": "อาทิตยา", "EN": "อาทิตยา"}, "18": {"EA": "ชนกนันท์", "EN": "ชนกนันท์"}, "19": {"WM": "วิทวัส", "WA": "วิทวัส", "EM": "นภัสสร", "EA": "นภัสสร", "EN": "วิทวัส"}, "20": {"WM": "วิทวัส", "WA": "วิทวัส", "EM": "อธิศีล", "EA": "อธิศีล", "EN": "วิทวัส"}, "21": {"EA": "อาทิตยา", "EN": "อาทิตยา"}, "22": {"EA": "นภัสสร", "EN": "นภัสสร"}, "23": {"EA": "ชนกนันท์", "EN": "ชนกนันท์"}, "24": {"EA": "วิทวัส", "EN": "วิทวัส"}, "25": {"EA": "อธิศีล", "EN": "อธิศีล"}, "26": {"WM": "อาทิตยา", "WA": "อาทิตยา", "EM": "พสิษฐ์", "EA": "พสิษฐ์", "EN": "อาทิตยา"}, "27": {"WM": "อาทิตยา", "WA": "อาทิตยา", "EM": "ชนกนันท์", "EA": "ชนกนันท์", "EN": "อาทิตยา"}, "28": {"EA": "นภัสสร", "EN": "นภัสสร"}, "29": {"EA": "วิทวัส", "EN": "วิทวัส"}, "30": {"EA": "อธิศีล", "EN": "อธิศีล"}, "31": {"WM": "อาทิตยา", "WA": "อาทิตยา", "WN": "อาทิตยา", "EM": "ชนกนันท์", "EA": "ชนกนันท์", "EN": "ชนกนันท์"}}, "holidays": [5, 6, 7, 10, 12, 13, 16, 19, 20, 26, 27, 31], "note": "ANC : ชนกนันท์", "dayDays": {"1": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อาทิตย์", "OPD2_A": "อาทิตย์", "OPD3_M": "พิม", "OPD3_A": "พิม", "LR_M": "ชนกนันท์", "LR_A": "ชนกนันท์", "IPD_M": "นภัสสร", "IPD_A": "นภัสสร"}, "2": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อาทิตย์", "OPD2_A": "อาทิตย์", "OPD3_M": "พิม", "OPD3_A": "พิม", "LR_M": "ชนกนันท์", "LR_A": "ชนกนันท์", "IPD_M": "นภัสสร", "IPD_A": "นภัสสร"}, "3": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อาทิตย์", "OPD2_A": "อาทิตย์", "OPD3_M": "พิม", "OPD3_A": "พิม", "IPD_M": "นภัสสร", "IPD_A": "นภัสสร"}, "4": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อาทิตย์", "OPD2_A": "อาทิตย์", "OPD3_M": "พิม", "OPD3_A": "พิม", "IPD_M": "นภัสสร", "IPD_A": "นภัสสร"}, "8": {"ER_M": "นภัสสร", "ER_A": "นภัสสร", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "อาทิตยา", "OPD1_A": "อาทิตยา", "OPD3_M": "วิทวัส", "OPD3_A": "วิทวัส", "LR_M": "อธิศีล", "LR_A": "อธิศีล", "IPD_M": "ชนกนันท์", "IPD_A": "ชนกนันท์"}, "9": {"ER_M": "อธิศีล", "ER_A": "อธิศีล", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "อาทิตยา", "OPD1_A": "อาทิตยา", "OPD2_M": "นภัสสร", "OPD2_A": "นภัสสร", "OPD3_M": "วิทวัส", "OPD3_A": "วิทวัส", "IPD_M": "ชนกนันท์", "IPD_A": "ชนกนันท์"}, "11": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "อาทิตยา", "OPD1_A": "อาทิตยา", "OPD2_M": "นภัสสร", "OPD2_A": "นภัสสร", "OPD3_M": "วิทวัส", "OPD3_A": "วิทวัส", "LR_M": "อธิศีล", "LR_A": "อธิศีล", "IPD_M": "ชนกนันท์", "IPD_A": "ชนกนันท์"}, "14": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "วิทวัส", "OPD1_A": "วิทวัส", "OPD2_M": "ชนกนันท์", "OPD2_A": "ชนกนันท์", "OPD3_M": "นภัสสร", "OPD3_A": "นภัสสร", "LR_M": "อาทิตยา", "LR_A": "อาทิตยา", "IPD_M": "อธิศีล", "IPD_A": "อธิศีล"}, "15": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "วิทวัส", "OPD1_A": "วิทวัส", "OPD2_M": "ชนกนันท์", "OPD2_A": "ชนกนันท์", "OPD3_M": "นภัสสร", "OPD3_A": "นภัสสร", "LR_M": "อาทิตยา", "LR_A": "อาทิตยา", "IPD_M": "อธิศีล", "IPD_A": "อธิศีล"}, "17": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "วิทวัส", "OPD1_A": "วิทวัส", "OPD2_M": "ชนกนันท์", "OPD2_A": "ชนกนันท์", "OPD3_M": "นภัสสร", "OPD3_A": "นภัสสร", "LR_M": "อาทิตยา", "LR_A": "อาทิตยา", "IPD_M": "อธิศีล", "IPD_A": "อธิศีล"}, "18": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "OPD1_M": "วิทวัส", "OPD1_A": "วิทวัส", "OPD2_M": "ชนกนันท์", "OPD2_A": "ชนกนันท์", "OPD3_M": "นภัสสร", "OPD3_A": "นภัสสร", "LR_M": "อาทิตยา", "LR_A": "อาทิตยา", "IPD_M": "อธิศีล", "IPD_A": "อธิศีล"}, "21": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อธิศีล", "OPD2_A": "อธิศีล", "OPD3_M": "อาทิตยา", "OPD3_A": "อาทิตยา", "IPD_M": "วิทวัส", "IPD_A": "วิทวัส"}, "22": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อธิศีล", "OPD2_A": "อธิศีล", "OPD3_M": "อาทิตยา", "OPD3_A": "อาทิตยา", "IPD_M": "วิทวัส", "IPD_A": "วิทวัส"}, "23": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อธิศีล", "OPD2_A": "อธิศีล", "OPD3_M": "อาทิตยา", "OPD3_A": "อาทิตยา", "LR_M": "ชนกนันท์", "LR_A": "ชนกนันท์", "IPD_M": "วิทวัส", "IPD_A": "วิทวัส"}, "24": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อธิศีล", "OPD2_A": "อธิศีล", "OPD3_M": "อาทิตยา", "OPD3_A": "อาทิตยา", "LR_M": "ชนกนันท์", "LR_A": "ชนกนันท์", "IPD_M": "วิทวัส", "IPD_A": "วิทวัส"}, "25": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "นภัสสร", "OPD1_A": "นภัสสร", "OPD2_M": "อธิศีล", "OPD2_A": "อธิศีล", "OPD3_M": "อาทิตยา", "OPD3_A": "อาทิตยา", "LR_M": "ชนกนันท์", "LR_A": "ชนกนันท์", "IPD_M": "วิทวัส", "IPD_A": "วิทวัส"}, "28": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "อธิศีล", "OPD1_A": "อธิศีล", "OPD2_M": "วิทวัส", "OPD2_A": "วิทวัส", "OPD3_M": "ชนกนันท์", "OPD3_A": "ชนกนันท์", "LR_M": "นภัสสร", "LR_A": "นภัสสร", "IPD_M": "อาทิตยา", "IPD_A": "อาทิตยา"}, "29": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_A": "ชนาพร", "OPD1_M": "อธิศีล", "OPD1_A": "อธิศีล", "OPD2_M": "วิทวัส", "OPD2_A": "วิทวัส", "OPD3_M": "ชนกนันท์", "OPD3_A": "ชนกนันท์", "LR_M": "นภัสสร", "LR_A": "นภัสสร", "IPD_M": "อาทิตยา", "IPD_A": "อาทิตยา"}, "30": {"ER_M": "พสิษฐ์", "ER_A": "พสิษฐ์", "NCD1_M": "ตรีรัตน์", "NCD1_A": "ตรีรัตน์", "NCD2_M": "ภาณุวัฒน์", "NCD2_A": "ภาณุวัฒน์", "ARI_M": "ชนาพร", "OPD1_M": "อธิศีล", "OPD1_A": "อธิศีล", "OPD2_M": "วิทวัส", "OPD2_A": "วิทวัส", "OPD3_M": "ชนกนันท์", "OPD3_A": "ชนกนันท์", "LR_M": "นภัสสร", "LR_A": "นภัสสร", "IPD_M": "อาทิตยา", "IPD_A": "อาทิตยา"}}, "leave": {"นภัสสร": [2], "ชนกนันท์": [3, 4, 21, 22, 24, 25], "พสิษฐ์": [5, 6, 7, 8, 9, 19]}};

  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', () => { const p = location.hash.slice(1); if (p && p !== S.page && S.auth && S.settings) go(p); });
  boot();
})();
