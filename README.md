# ตารางเวรแพทย์นอกเวลาราชการ — รพ.ร้องกวาง (v1.0.0)

หน้าเว็บอยู่บน **GitHub Pages** · ข้อมูลอยู่ใน **Google Sheet** · **Google Apps Script** เป็น API · เข้าใช้ด้วย **Gmail + OTP** (เซสชัน 4 ชั่วโมง)

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าเว็บ (sidebar: ตารางเวร / สรุปค่าตอบแทน / ตั้งค่า / ผู้ใช้งาน / วิธีใช้) |
| `app.js` | การทำงานของหน้าเว็บ |
| `wordExport.js` | สร้างไฟล์ Word ตารางเวร (ในเบราว์เซอร์) |
| `config.js` | **ใส่ URL ของ GAS** |
| `gas/Code.gs` | Backend — วางใน Apps Script (ไม่ต้องขึ้น GitHub ก็ได้) |

## ติดตั้ง
1. **Google Sheet** – สร้างชีตใหม่ เช่น "ตารางเวรแพทย์นอกเวลา" → ส่วนขยาย → Apps Script → วางโค้ด `gas/Code.gs`
2. แก้ `FIRST_ADMIN_EMAIL` ให้เป็นอีเมลผู้ดูแลระบบ → เลือกฟังก์ชัน `setup` → Run (อนุญาตสิทธิ์ Sheet + ส่งอีเมล) ระบบจะสร้างชีต Users / Settings / Months / Log
3. **Deploy** → New deployment → Web app → Execute as: **Me** · Who has access: **Anyone** → คัดลอก URL ที่ลงท้าย `/exec`
4. ใส่ URL ใน `config.js` (`API_URL`)
5. **GitHub** – อัปโหลด `index.html`, `app.js`, `wordExport.js`, `config.js` ขึ้น repo → Settings → Pages → Branch `main` / root
6. เข้าเว็บ → ใส่ Gmail ผู้ดูแล → รับ OTP ทางอีเมล → เมนู **ผู้ใช้งาน** เพิ่มอีเมลคนอื่น (admin / editor / viewer)

> ถ้า `API_URL` ว่าง เว็บทำงาน "โหมดทดลอง" (มีข้อมูล ธ.ค. 2569 ให้ลอง เก็บในเบราว์เซอร์ ไม่ต้อง login)
> แก้ `Code.gs` แล้วต้อง Deploy → Manage deployments → Edit → New version (URL เดิม)

## ใช้งานแต่ละเดือน
1. เลือกเดือน → ระบบสร้างตารางว่างพร้อมวันหยุด (เสาร์-อาทิตย์ + รายการวันหยุดในตั้งค่า) คลิกตัวเลขวันที่เพื่อสลับวันหยุด
2. เลือกชื่อแพทย์ในแต่ละช่อง หรือ **นำเข้า CSV จาก Excel** (Excel → Save As → CSV UTF-8) — อ่านคอลัมน์ A + T–Z ตามที่ตั้งไว้ ตรวจเดือนจากหัวไฟล์ให้อัตโนมัติ
3. **บันทึก** → **⬇ Word** ได้ไฟล์ตารางเวร A4 1 หน้า
4. **สรุปค่าตอบแทน** นับเวรรายคน × อัตรา (ทั้งเดือน / 1–15 / 16–สิ้นเดือน) พิมพ์หรือดาวน์โหลด CSV

## ปรับเวอร์ชัน
แก้เลขที่ `config.js` (`APP_VERSION`) และ `gas/Code.gs` (`APP_VERSION`) ทุกครั้งที่อัปเดต — เลขแสดงที่หน้า login และ sidebar
