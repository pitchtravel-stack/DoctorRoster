/**
 * ตารางเวรแพทย์นอกเวลาราชการ — Backend API (Google Apps Script)
 * หน้าเว็บอยู่บน GitHub Pages / เรียก API นี้ด้วย fetch (POST, text/plain)
 * เข้าใช้ด้วย Gmail + OTP (session 4 ชั่วโมง)
 *
 * วิธีติดตั้ง: ดู README.md
 */
const APP_VERSION = 'v1.1.1';
const SESSION_HOURS = 4;
const OTP_MINUTES = 10;
const OTP_MAX_TRY = 5;
const MAIL_SENDER_NAME = 'ตารางเวรแพทย์ รพ.ร้องกวาง';

// ===== ตั้งค่าครั้งแรก: แก้อีเมลผู้ดูแลระบบ แล้วกด Run ฟังก์ชัน setup() 1 ครั้ง =====
const FIRST_ADMIN_EMAIL = 'pitch.travel@gmail.com';
const FIRST_ADMIN_NAME = 'ผู้ดูแลระบบ';

const SH = { USERS: 'Users', SETTINGS: 'Settings', MONTHS: 'Months', LOG: 'Log' };

const DEFAULT_SETTINGS = {
  hospital: 'โรงพยาบาลร้องกวาง',
  title: 'ตารางเวรแพทย์นอกเวลาราชการ',
  shiftsVer: 2,
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
  // MM-DD = ทุกปี, YYYY-MM-DD (ค.ศ.) = เฉพาะปี
  holidays: [
    '01-01|วันขึ้นปีใหม่', '04-06|วันจักรี', '04-13|สงกรานต์', '04-14|สงกรานต์', '04-15|สงกรานต์',
    '05-01|วันแรงงาน', '05-04|วันฉัตรมงคล', '06-03|วันเฉลิมฯ พระราชินี', '07-28|วันเฉลิมฯ ร.10',
    '08-12|วันแม่แห่งชาติ', '10-13|วันนวมินทรมหาราช', '10-23|วันปิยมหาราช', '12-05|วันพ่อแห่งชาติ',
    '12-10|วันรัฐธรรมนูญ', '12-31|วันสิ้นปี', '2026-12-07|ชดเชยวันพ่อแห่งชาติ'
  ]
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mk = (name, head) => {
    let s = ss.getSheetByName(name);
    if (!s) { s = ss.insertSheet(name); s.appendRow(head); s.setFrozenRows(1); }
    return s;
  };
  const u = mk(SH.USERS, ['email', 'name', 'role', 'active']);
  mk(SH.SETTINGS, ['key', 'value']);
  mk(SH.MONTHS, ['month', 'data', 'updatedBy', 'updatedAt']).getRange('A:A').setNumberFormat('@'); // กัน Sheets แปลง 2569-12 เป็นวันที่
  mk(SH.LOG, ['time', 'email', 'action', 'detail']);
  if (u.getLastRow() < 2) u.appendRow([FIRST_ADMIN_EMAIL.toLowerCase(), FIRST_ADMIN_NAME, 'admin', true]);
  if (!getSetting_('settings')) setSetting_('settings', DEFAULT_SETTINGS);
  return 'setup done';
}

// ===================== HTTP =====================
function doGet() {
  return json_({ ok: true, app: 'duty-roster-api', version: APP_VERSION });
}

function doPost(e) {
  let req = {};
  try {
    req = JSON.parse(e.postData.contents || '{}');
    const pub = { requestOtp, verifyOtp, ping: () => ({ version: APP_VERSION }) };
    if (pub[req.action]) return json_({ ok: true, data: pub[req.action](req) });

    const user = auth_(req.token);
    const priv = {
      me: () => user,
      logout: () => { CacheService.getScriptCache().remove('s_' + req.token); return true; },
      init: () => ({ settings: getSettings_(), months: listMonths_(), user }),
      getMonth: () => getMonth_(req.month),
      saveMonth: () => { need_(user, ['admin', 'editor']); return saveMonth_(req.data, req.baseUpdatedAt, user); },
      deleteMonth: () => { need_(user, ['admin']); return deleteMonth_(req.month, user); },
      saveSettings: () => { need_(user, ['admin']); setSetting_('settings', req.settings); log_(user.email, 'saveSettings', ''); return getSettings_(); },
      listUsers: () => { need_(user, ['admin']); return listUsers_(); },
      saveUsers: () => { need_(user, ['admin']); return saveUsers_(req.users, user); }
    };
    if (!priv[req.action]) throw new Error('ไม่รู้จักคำสั่ง ' + req.action);
    return json_({ ok: true, data: priv[req.action]() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err), code: err.code || '' });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ===================== AUTH (Gmail + OTP) =====================
function requestOtp(req) {
  const email = String(req.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  const user = findUser_(email);
  if (!user) throw new Error('อีเมลนี้ยังไม่มีสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  const cache = CacheService.getScriptCache();
  if (cache.get('cd_' + email)) throw new Error('ขอรหัสได้อีกครั้งใน 60 วินาที');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp_' + email, JSON.stringify({ code, tries: 0 }), OTP_MINUTES * 60);
  cache.put('cd_' + email, '1', 60);
  MailApp.sendEmail({
    to: email,
    name: MAIL_SENDER_NAME,
    subject: 'รหัส OTP เข้าระบบตารางเวรแพทย์: ' + code,
    htmlBody: '<div style="font-family:sans-serif;font-size:15px">รหัสเข้าระบบตารางเวรแพทย์ของคุณคือ' +
      '<div style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#1d4ed8;margin:12px 0">' + code + '</div>' +
      'รหัสใช้ได้ ' + OTP_MINUTES + ' นาที — หากไม่ได้ขอรหัสนี้ ไม่ต้องดำเนินการใด ๆ</div>'
  });
  log_(email, 'requestOtp', '');
  return { sent: true, minutes: OTP_MINUTES };
}

function verifyOtp(req) {
  const email = String(req.email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const raw = cache.get('otp_' + email);
  if (!raw) throw new Error('รหัสหมดอายุ กรุณาขอรหัสใหม่');
  const o = JSON.parse(raw);
  if (o.tries >= OTP_MAX_TRY) { cache.remove('otp_' + email); throw new Error('ใส่รหัสผิดเกินกำหนด กรุณาขอรหัสใหม่'); }
  if (String(req.code).trim() !== o.code) {
    o.tries++; cache.put('otp_' + email, JSON.stringify(o), OTP_MINUTES * 60);
    throw new Error('รหัสไม่ถูกต้อง (เหลือ ' + (OTP_MAX_TRY - o.tries) + ' ครั้ง)');
  }
  cache.remove('otp_' + email);
  const user = findUser_(email);
  if (!user) throw new Error('ไม่มีสิทธิ์ใช้งาน');
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  cache.put('s_' + token, JSON.stringify(user), SESSION_HOURS * 3600);
  log_(email, 'login', '');
  return { token, user, expiresAt: Date.now() + SESSION_HOURS * 3600 * 1000 };
}

function auth_(token) {
  const raw = token && CacheService.getScriptCache().get('s_' + token);
  if (!raw) { const e = new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); e.code = 'AUTH'; throw e; }
  return JSON.parse(raw);
}

function need_(user, roles) {
  if (roles.indexOf(user.role) < 0) throw new Error('สิทธิ์ของคุณไม่สามารถทำรายการนี้ได้');
}

function findUser_(email) {
  return listUsers_().find(u => u.email === email && u.active) || null;
}

function listUsers_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.USERS);
  const v = s.getDataRange().getValues().slice(1);
  return v.filter(r => r[0]).map(r => ({
    email: String(r[0]).trim().toLowerCase(), name: String(r[1] || ''), role: String(r[2] || 'viewer'),
    active: r[3] === true || String(r[3]).toUpperCase() === 'TRUE'
  }));
}

function saveUsers_(users, by) {
  if (!users.some(u => u.role === 'admin' && u.active)) throw new Error('ต้องมีผู้ดูแลระบบ (admin) อย่างน้อย 1 คน');
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.USERS);
  const rows = users.filter(u => u.email).map(u => [String(u.email).trim().toLowerCase(), u.name || '', u.role || 'viewer', !!u.active]);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 4).clearContent();
  if (rows.length) s.getRange(2, 1, rows.length, 4).setValues(rows);
  log_(by.email, 'saveUsers', rows.length + ' users');
  return listUsers_();
}

// ===================== DATA =====================
function getSetting_(key) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.SETTINGS);
  const v = s.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === key) return JSON.parse(v[i][1]);
  return null;
}

function setSetting_(key, val) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.SETTINGS);
  const v = s.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === key) { s.getRange(i + 1, 2).setValue(JSON.stringify(val)); return; }
  s.appendRow([key, JSON.stringify(val)]);
}

function getSettings_() { return getSetting_('settings') || DEFAULT_SETTINGS; }

// Sheets อาจแปลง "2569-12" เป็นวันที่ → อ่านกลับเป็น key เดิมเสมอ
function keyOf_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM');
  return String(v || '').trim().replace(/^'/, '');
}

// คืนแถวล่าสุดของเดือนนั้น (+ รายการแถวซ้ำ)
function monthRow_(month) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.MONTHS);
  const v = s.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < v.length; i++) if (keyOf_(v[i][0]) === month) rows.push(i + 1);
  if (!rows.length) return { s, row: 0, dups: [] };
  const last = rows[rows.length - 1];
  return { s, row: last, v: v[last - 1], dups: rows.slice(0, -1) };
}

function listMonths_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.MONTHS);
  const map = {};
  s.getDataRange().getValues().slice(1).filter(r => r[0]).forEach(r => {
    const k = keyOf_(r[0]);
    map[k] = { month: k, updatedBy: r[2], updatedAt: r[3] ? new Date(r[3]).getTime() : 0 };
  });
  return Object.keys(map).sort().map(k => map[k]);
}

function getMonth_(month) {
  const m = monthRow_(String(month));
  if (!m.row) return null;
  const d = JSON.parse(m.v[1]);
  d.updatedBy = m.v[2]; d.updatedAt = m.v[3] ? new Date(m.v[3]).getTime() : 0;
  return d;
}

function saveMonth_(data, baseUpdatedAt, user) {
  if (!data || !/^\d{4}-\d{2}$/.test(data.month)) throw new Error('ข้อมูลเดือนไม่ถูกต้อง');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const m = monthRow_(data.month);
    if (m.row && baseUpdatedAt && m.v[3] && new Date(m.v[3]).getTime() !== Number(baseUpdatedAt)) {
      throw new Error('มีผู้อื่นแก้ไขเดือนนี้ไปก่อนแล้ว (' + m.v[2] + ') กรุณาโหลดข้อมูลใหม่');
    }
    const clean = { month: data.month, days: data.days || {}, dayDays: data.dayDays || {}, leave: data.leave || {}, pool: data.pool || [], holidays: data.holidays || [], note: data.note || '' };
    const now = new Date();
    const row = ["'" + data.month, JSON.stringify(clean), user.email, now];
    if (m.row) {
      m.s.getRange(m.row, 1, 1, 4).setValues([row]);
      m.dups.slice().reverse().forEach(r => m.s.deleteRow(r)); // ลบแถวซ้ำเก่า
    } else m.s.appendRow(row);
    log_(user.email, 'saveMonth', data.month);
    clean.updatedBy = user.email; clean.updatedAt = now.getTime();
    return clean;
  } finally { lock.releaseLock(); }
}

function deleteMonth_(month, user) {
  const m = monthRow_(String(month));
  if (m.row) m.dups.concat([m.row]).sort((a, b) => b - a).forEach(r => m.s.deleteRow(r));
  log_(user.email, 'deleteMonth', month);
  return true;
}

function log_(email, action, detail) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.LOG).appendRow([new Date(), email, action, detail]);
  } catch (e) { }
}
