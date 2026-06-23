/**
 * วาว Print Center — ระบบรายรับ-รายจ่าย
 * Google Apps Script Backend (Code.gs)
 *
 * วิธีติดตั้ง:
 * 1. ไปที่ https://sheets.google.com แล้วสร้าง Google Sheet ใหม่ ตั้งชื่อ "วาว Print Center - บัญชี"
 * 2. เปิดเมนู ส่วนขยาย (Extensions) > Apps Script
 * 3. ลบโค้ดเดิมทั้งหมด แล้ววางไฟล์นี้ลงไปแทน
 * 4. กดรัน (Run) ฟังก์ชัน setup() หนึ่งครั้ง เพื่อสร้างชีตและหัวตารางอัตโนมัติ
 *    (จะมีหน้าต่างขอสิทธิ์ ให้กด Allow / อนุญาตทั้งหมด)
 * 5. กด Deploy > New deployment > เลือกประเภท "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    กด Deploy แล้วคัดลอก URL ที่ได้ (จะลงท้ายด้วย /exec)
 * 6. นำ URL ไปใส่ในไฟล์ config.js ของหน้าเว็บ (ตัวแปร API_URL)
 */

// ===================== CONFIG =====================
const SHEET_INCOME = 'รายรับ';
const SHEET_EXPENSE = 'รายจ่าย';
const SHEET_ITEMS_INCOME = 'รายการ_รายรับ';
const SHEET_ITEMS_EXPENSE = 'รายการ_รายจ่าย';

const DEFAULT_INCOME_ITEMS = ['ถ่ายเอกสาร', 'ปริ้นงาน', 'เคลือบเอกสาร', 'ปริ้นรูป'];
const DEFAULT_EXPENSE_ITEMS = ['ค่าหมึกพิมพ์', 'ค่ากระดาษ', 'ค่าไฟฟ้า', 'ค่าเช่าร้าน'];

// ===================== SETUP (รันครั้งแรกครั้งเดียว) =====================
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ชีตรายรับ
  let incomeSheet = ss.getSheetByName(SHEET_INCOME);
  if (!incomeSheet) incomeSheet = ss.insertSheet(SHEET_INCOME);
  incomeSheet.clear();
  incomeSheet.getRange(1, 1, 1, 7).setValues([
    ['ID', 'วันที่', 'เวลา', 'รายการ', 'จำนวนแผ่น', 'ราคา', 'บันทึกจากเครื่อง']
  ]);
  incomeSheet.setFrozenRows(1);
  formatHeader_(incomeSheet, 7);

  // ชีตรายจ่าย
  let expenseSheet = ss.getSheetByName(SHEET_EXPENSE);
  if (!expenseSheet) expenseSheet = ss.insertSheet(SHEET_EXPENSE);
  expenseSheet.clear();
  expenseSheet.getRange(1, 1, 1, 6).setValues([
    ['ID', 'วันที่', 'เวลา', 'รายการ', 'ราคา', 'บันทึกจากเครื่อง']
  ]);
  expenseSheet.setFrozenRows(1);
  formatHeader_(expenseSheet, 6);

  // ชีตเก็บตัวเลือกรายการ (รายรับ)
  let itemsIncomeSheet = ss.getSheetByName(SHEET_ITEMS_INCOME);
  if (!itemsIncomeSheet) itemsIncomeSheet = ss.insertSheet(SHEET_ITEMS_INCOME);
  itemsIncomeSheet.clear();
  itemsIncomeSheet.getRange(1, 1, 1, 1).setValues([['รายการ']]);
  DEFAULT_INCOME_ITEMS.forEach((item, i) => {
    itemsIncomeSheet.getRange(i + 2, 1).setValue(item);
  });
  formatHeader_(itemsIncomeSheet, 1);

  // ชีตเก็บตัวเลือกรายการ (รายจ่าย)
  let itemsExpenseSheet = ss.getSheetByName(SHEET_ITEMS_EXPENSE);
  if (!itemsExpenseSheet) itemsExpenseSheet = ss.insertSheet(SHEET_ITEMS_EXPENSE);
  itemsExpenseSheet.clear();
  itemsExpenseSheet.getRange(1, 1, 1, 1).setValues([['รายการ']]);
  DEFAULT_EXPENSE_ITEMS.forEach((item, i) => {
    itemsExpenseSheet.getRange(i + 2, 1).setValue(item);
  });
  formatHeader_(itemsExpenseSheet, 1);

  // ลบชีตเริ่มต้น "Sheet1" ถ้ายังไม่ได้ใช้
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet) ss.deleteSheet(defaultSheet);

  SpreadsheetApp.flush();
  Logger.log('ตั้งค่าระบบเรียบร้อยแล้ว พร้อมใช้งาน');
}

function formatHeader_(sheet, numCols) {
  const range = sheet.getRange(1, 1, 1, numCols);
  range.setFontWeight('bold');
  range.setBackground('#1A3358');
  range.setFontColor('#FFFFFF');
  sheet.autoResizeColumns(1, numCols);
}

// ===================== WEB APP ENTRY POINTS =====================
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;

    switch (action) {
      case 'getItems':
        result = getItems_(e.parameter.type);
        break;
      case 'getEntries':
        result = getEntries_(e.parameter.type, e.parameter.from, e.parameter.to);
        break;
      case 'getSummary':
        result = getSummary_(e.parameter.from, e.parameter.to);
        break;
      default:
        result = { success: false, error: 'ไม่รู้จัก action: ' + action };
    }
    return jsonOutput_(result);
  } catch (err) {
    return jsonOutput_({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    switch (action) {
      case 'addEntry':
        result = addEntry_(body);
        break;
      case 'addItem':
        result = addItem_(body);
        break;
      case 'deleteEntry':
        result = deleteEntry_(body);
        break;
      default:
        result = { success: false, error: 'ไม่รู้จัก action: ' + action };
    }
    return jsonOutput_(result);
  } catch (err) {
    return jsonOutput_({ success: false, error: err.message });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================== ITEMS (ดรอปดาวน์) =====================
function getItems_(type) {
  const sheet = getItemSheet_(type);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, items: [], itemUnits: {} };
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const items = [];
  const itemUnits = {};
  values.forEach(r => {
    const name = r[0];
    const unit = r[1] || 'แผ่น';
    if (name !== '') {
      items.push(name);
      itemUnits[name] = unit;
    }
  });
  return { success: true, items: items, itemUnits: itemUnits };
}

function addItem_(body) {
  const type = body.type;
  const name = (body.name || '').trim();
  const unit = (body.unit || 'แผ่น').trim();
  if (!name) return { success: false, error: 'ชื่อรายการห้ามว่าง' };

  const sheet = getItemSheet_(type);
  const lastRow = sheet.getLastRow();
  const existing = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => r[0])
    : [];

  if (existing.indexOf(name) === -1) {
    sheet.appendRow([name, unit]);
  }
  const updated = getItems_(type);
  return { success: true, items: updated.items, itemUnits: updated.itemUnits };
}

function getItemSheet_(type) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return type === 'expense'
    ? ss.getSheetByName(SHEET_ITEMS_EXPENSE)
    : ss.getSheetByName(SHEET_ITEMS_INCOME);
}

// ===================== ENTRIES (บันทึกรายรับ/รายจ่าย) =====================
function addEntry_(body) {
  const type = body.type; // 'income' | 'expense'
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(now, tz, 'HH:mm');
  const id = Utilities.getUuid();
  const deviceName = body.device || 'ไม่ระบุเครื่อง';

  if (type === 'income') {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INCOME);
    const items = body.items || []; // [{name, qty, price}]
    items.forEach(item => {
      sheet.appendRow([
        id, dateStr, timeStr, item.name, item.qty || 0, item.price || 0, deviceName
      ]);
    });
  } else if (type === 'expense') {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSE);
    const items = body.items || []; // [{name, price}]
    items.forEach(item => {
      sheet.appendRow([
        id, dateStr, timeStr, item.name, item.price || 0, deviceName
      ]);
    });
  } else {
    return { success: false, error: 'ไม่รู้จักประเภท: ' + type };
  }

  return { success: true, id: id, date: dateStr, time: timeStr };
}

function deleteEntry_(body) {
  const type = body.type;
  const id = body.id;
  const sheet = type === 'expense'
    ? SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSE)
    : SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INCOME);

  const data = sheet.getDataRange().getValues();
  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) rowsToDelete.push(i + 1);
  }
  // ลบจากแถวล่างขึ้นบนเพื่อไม่ให้ index เคลื่อน
  rowsToDelete.sort((a, b) => b - a).forEach(rowNum => sheet.deleteRow(rowNum));

  return { success: true, deletedRows: rowsToDelete.length };
}

function getEntries_(type, from, to) {
  const sheet = type === 'expense'
    ? SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSE)
    : SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INCOME);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, entries: [] };

  const numCols = type === 'expense' ? 6 : 7;
  const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  const filtered = data.filter(row => {
    const d = row[1];
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  const entries = filtered.map(row => {
    if (type === 'expense') {
      return { id: row[0], date: row[1], time: row[2], name: row[3], price: row[4], device: row[5] };
    }
    return { id: row[0], date: row[1], time: row[2], name: row[3], qty: row[4], price: row[5], device: row[6] };
  });

  return { success: true, entries: entries };
}

// ===================== SUMMARY =====================
function getSummary_(from, to) {
  const income = getEntries_('income', from, to).entries;
  const expense = getEntries_('expense', from, to).entries;

  const incomeTotal = income.reduce((sum, e) => sum + Number(e.price || 0), 0);
  const expenseTotal = expense.reduce((sum, e) => sum + Number(e.price || 0), 0);

  // สรุปย่อยตามรายการ (รายรับ) — ดึง unit จาก Items Sheet
  const itemUnits = getItems_('income').itemUnits;
  const incomeByItem = {};
  income.forEach(e => {
    if (!incomeByItem[e.name]) incomeByItem[e.name] = { qty: 0, total: 0, unit: itemUnits[e.name] || 'แผ่น' };
    incomeByItem[e.name].qty += Number(e.qty || 0);
    incomeByItem[e.name].total += Number(e.price || 0);
  });

  // สรุปย่อยตามรายการ (รายจ่าย)
  const expenseByItem = {};
  expense.forEach(e => {
    if (!expenseByItem[e.name]) expenseByItem[e.name] = { total: 0 };
    expenseByItem[e.name].total += Number(e.price || 0);
  });

  return {
    success: true,
    from: from,
    to: to,
    income: income,
    expense: expense,
    incomeTotal: incomeTotal,
    expenseTotal: expenseTotal,
    profit: incomeTotal - expenseTotal,
    incomeByItem: incomeByItem,
    expenseByItem: expenseByItem
  };
}
