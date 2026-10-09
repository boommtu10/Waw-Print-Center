/**
 * วาว Print Center — Main App Logic
 */

// ===================== STATE =====================
const state = {
  currentPage: 'income',
  incomeItems: [],
  incomeItemUnits: {}, // { ชื่อรายการ: 'แผ่น'|'คน' }
  expenseItems: [],
  incomeRows: [],   // [{rowId, name, qty, unit, price}]
  expenseRows: [],  // [{rowId, name, price}]
  transferRows: [], // [{rowId, amount, qty, fee}]
  summaryRange: 'day',
  lastSummary: null,
  transferSummaryRange: 'day',
  lastTransferSummary: null,
  deviceName: getOrCreateDeviceName_(),
};

let rowIdCounter = 0;
function nextRowId_() {
  rowIdCounter += 1;
  return 'row-' + rowIdCounter;
}

function getOrCreateDeviceName_() {
  // ไม่ใช้ localStorage (ไม่รองรับใน artifact) — ระบุชนิดเครื่องจาก user agent ต่อ session
  const ua = navigator.userAgent || '';
  let kind = 'อุปกรณ์ไม่ทราบชนิด';
  if (/Android/i.test(ua)) kind = 'มือถือ Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) kind = 'iPhone/iPad';
  else if (/Windows/i.test(ua)) kind = 'คอมพิวเตอร์ Windows';
  else if (/Macintosh/i.test(ua)) kind = 'คอมพิวเตอร์ Mac';
  else if (/Linux/i.test(ua)) kind = 'คอมพิวเตอร์ Linux';
  return kind;
}

// ===================== DOM REFS =====================
const $ = (id) => document.getElementById(id);

const els = {
  syncDot: $('syncDot'),
  syncLabel: $('syncLabel'),
  refreshBtn: $('refreshBtn'),
  toast: $('toast'),
  loadingOverlay: $('loadingOverlay'),

  incomeEntryList: $('incomeEntryList'),
  addIncomeRowBtn: $('addIncomeRowBtn'),
  incomeTotal: $('incomeTotal'),
  saveIncomeBtn: $('saveIncomeBtn'),
  manageIncomeItemsBtn: $('manageIncomeItemsBtn'),

  expenseEntryList: $('expenseEntryList'),
  addExpenseRowBtn: $('addExpenseRowBtn'),
  expenseTotal: $('expenseTotal'),
  saveExpenseBtn: $('saveExpenseBtn'),
  manageExpenseItemsBtn: $('manageExpenseItemsBtn'),

  transferEntryList: $('transferEntryList'),
  addTransferRowBtn: $('addTransferRowBtn'),
  transferAmountEntryTotal: $('transferAmountEntryTotal'),
  transferFeeEntryTotal: $('transferFeeEntryTotal'),
  transferCashEntryTotal: $('transferCashEntryTotal'),
  saveTransferBtn: $('saveTransferBtn'),

  transferFilterTabs: $('transferFilterTabs'),
  transferFilterInputsDay: $('transferFilterInputsDay'),
  transferFilterInputsMonth: $('transferFilterInputsMonth'),
  transferFilterInputsYear: $('transferFilterInputsYear'),
  transferFilterInputsCustom: $('transferFilterInputsCustom'),
  transferFilterDaySingle: $('transferFilterDaySingle'),
  transferFilterMonth: $('transferFilterMonth'),
  transferFilterYear: $('transferFilterYear'),
  transferFilterFrom: $('transferFilterFrom'),
  transferFilterTo: $('transferFilterTo'),
  transferApplyFilterBtn: $('transferApplyFilterBtn'),
  transferAmountSummaryTotal: $('transferAmountSummaryTotal'),
  transferFeeSummaryTotal: $('transferFeeSummaryTotal'),
  transferCashSummaryTotal: $('transferCashSummaryTotal'),
  transferDetailList: $('transferDetailList'),

  summaryFilterTabs: $('summaryFilterTabs'),
  filterInputsDay: $('filterInputsDay'),
  filterInputsMonth: $('filterInputsMonth'),
  filterInputsYear: $('filterInputsYear'),
  filterInputsCustom: $('filterInputsCustom'),
  filterDaySingle: $('filterDaySingle'),
  filterMonth: $('filterMonth'),
  filterYear: $('filterYear'),
  filterFrom: $('filterFrom'),
  filterTo: $('filterTo'),
  applyFilterBtn: $('applyFilterBtn'),
  summaryIncomeTotal: $('summaryIncomeTotal'),
  summaryExpenseTotal: $('summaryExpenseTotal'),
  summaryProfitTotal: $('summaryProfitTotal'),
  summaryProfitCard: $('summaryProfitCard'),
  summaryIncomeByItem: $('summaryIncomeByItem'),
  summaryExpenseByItem: $('summaryExpenseByItem'),
  exportExcelBtn: $('exportExcelBtn'),

  itemModalOverlay: $('itemModalOverlay'),
  itemModalTitle: $('itemModalTitle'),
  itemModalCloseBtn: $('itemModalCloseBtn'),
  newItemInput: $('newItemInput'),
  addNewItemBtn: $('addNewItemBtn'),
  existingItemList: $('existingItemList'),

  bottomNav: document.querySelector('.bottom-nav'),
};

let activeModalType = 'income';

// ===================== API LAYER =====================
// - ทุกคำขอมี timeout และ retry อัตโนมัติ (เครือข่ายบ้าน/ISP ที่ไม่เสถียรจะไม่ทำให้ต้องกด F5 ซ้ำ ๆ)
// - คำขอบันทึก (addEntry) แนบ requestId เดียวกันทุกครั้งที่ retry ฝั่ง Code.gs จะกันบันทึกซ้ำให้
const API_TIMEOUT_MS = 12000;   // รอแต่ละรอบ (บวกเพิ่มรอบละ 4 วินาที)
const API_TRIES = 3;

function sleep_(ms) { return new Promise(r => setTimeout(r, ms)); }

function newRequestId_() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function requestJson_(url, opts, tries) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS + i * 4000);
    try {
      const res = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
      if (!res.ok) throw new Error('เครือข่ายขัดข้อง (' + res.status + ')');
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch (_) { throw new Error('เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ'); } // เช่น Apps Script ส่งหน้า HTML/login กลับมา
      clearTimeout(timer);
      if (!data.success) {
        const e = new Error(data.error || 'เกิดข้อผิดพลาด');
        e.fatal = true; // error ทางธุรกิจ ไม่ต้อง retry
        throw e;
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.fatal) throw err;
      if (err.name === 'AbortError') lastErr = new Error('เชื่อมต่อช้าเกินไป (หมดเวลา)');
      else if (err instanceof TypeError) lastErr = new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
      else lastErr = err;
      if (i < tries - 1) {
        setSyncStatus('syncing', 'ลองเชื่อมต่อใหม่ (' + (i + 2) + '/' + tries + ')…');
        await sleep_(600 * (i + 1));
      }
    }
  }
  throw lastErr;
}

function apiGet(params) {
  const url = new URL(CONFIG.API_URL);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  return requestJson_(url.toString(), { method: 'GET' }, API_TRIES);
}

function apiPost(body) {
  if (body.action === 'addEntry' && !body.requestId) body.requestId = newRequestId_();
  return requestJson_(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // หลีกเลี่ยง CORS preflight กับ Apps Script
    body: JSON.stringify(body),
  }, API_TRIES);
}

// ===================== LOCAL CACHE (เปิดแอปแล้วเห็นข้อมูลทันที) =====================
const LS_KEYS = { items: 'waow.items.v1', summary: 'waow.summary.v1', transfer: 'waow.transfer.v1' };

function lsGet_(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (_) { return null; }
}
function lsSet_(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) { /* เต็ม/ถูกปิด — ข้ามได้ */ }
}

function saveItemsCache_() {
  lsSet_(LS_KEYS.items, {
    incomeItems: state.incomeItems,
    incomeItemUnits: state.incomeItemUnits,
    expenseItems: state.expenseItems,
  });
}

// ใส่รายการสินค้าเข้า state แล้ววาดแถวใหม่ (ข้ามถ้าไม่มีอะไรเปลี่ยน เพื่อไม่ให้ช่องที่กำลังพิมพ์หลุดโฟกัส)
function applyItems_(d) {
  const incomeItems = d.incomeItems || [];
  const incomeItemUnits = d.incomeItemUnits || {};
  const expenseItems = d.expenseItems || [];
  const sig = JSON.stringify([incomeItems, incomeItemUnits, expenseItems]);
  if (state._itemsSig === sig) return;
  state._itemsSig = sig;

  state.incomeItems = incomeItems;
  state.incomeItemUnits = incomeItemUnits;
  state.expenseItems = expenseItems;

  // แถวที่เลือกรายการไว้แต่ไม่มีในรายการแล้ว (หรือยังว่างเพราะโหลดไม่ทัน) ให้ตั้งเป็นรายการแรก
  state.incomeRows.forEach(r => {
    if (incomeItems.indexOf(r.name) === -1) {
      r.name = incomeItems[0] || '';
      r.unit = incomeItemUnits[r.name] || r.unit || 'แผ่น';
    }
  });
  state.expenseRows.forEach(r => {
    if (expenseItems.indexOf(r.name) === -1) r.name = expenseItems[0] || '';
  });
  renderIncomeRows();
  renderExpenseRows();
}

// ===================== UI HELPERS =====================
function showToast(message, type) {
  els.toast.textContent = message;
  els.toast.className = 'toast is-visible' + (type ? ' is-' + type : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.classList.remove('is-visible');
  }, 2600);
}

function setLoading(isLoading) {
  els.loadingOverlay.classList.toggle('is-hidden', !isLoading);
}

function setSyncStatus(status, label) {
  els.syncDot.className = 'sync-dot' + (status === 'synced' ? ' is-synced' : status === 'error' ? ' is-error' : '');
  els.syncLabel.textContent = label;
}

function formatBaht(n) {
  const num = Number(n) || 0;
  return '฿' + num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isConfigured() {
  return CONFIG.API_URL && CONFIG.API_URL.indexOf('YOUR_DEPLOYMENT_ID_HERE') === -1;
}

// ===================== PAGE NAVIGATION =====================
function switchPage(pageName) {
  state.currentPage = pageName;
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('is-hidden', p.dataset.page !== pageName);
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.page === pageName);
  });
}

els.bottomNav.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  switchPage(btn.dataset.page);
});

// ===================== ENTRY ROWS: รายรับ =====================
function addIncomeRow(prefill) {
  const row = {
    rowId: nextRowId_(),
    name: (prefill && prefill.name) || (state.incomeItems[0] || ''),
    qty: (prefill && prefill.qty) || '',
    unit: (prefill && prefill.unit) || state.incomeItemUnits[(prefill && prefill.name) || state.incomeItems[0]] || 'แผ่น',
    price: (prefill && prefill.price) || '',
  };
  state.incomeRows.push(row);
  renderIncomeRows();
}

function removeIncomeRow(rowId) {
  state.incomeRows = state.incomeRows.filter(r => r.rowId !== rowId);
  if (state.incomeRows.length === 0) addIncomeRow();
  else renderIncomeRows();
}

function renderIncomeRows() {
  const labelsHtml = `
    <div class="entry-col-labels">
      <span>รายการ</span><span>จำนวน</span><span>หน่วย</span><span>ราคา</span><span></span>
    </div>`;

  const rowsHtml = state.incomeRows.map(row => `
    <div class="entry-row" data-row-id="${row.rowId}">
      <select class="entry-select" data-field="name" data-row-id="${row.rowId}">
        ${state.incomeItems.map(item => `<option value="${escapeHtml(item)}" ${item === row.name ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
      </select>
      <input class="entry-input entry-input--number" type="number" inputmode="numeric" min="0" placeholder="0" data-field="qty" data-row-id="${row.rowId}" value="${row.qty}">
      <select class="entry-select entry-select--unit" data-field="unit" data-row-id="${row.rowId}">
        <option value="แผ่น" ${row.unit === 'แผ่น' ? 'selected' : ''}>แผ่น</option>
        <option value="คน" ${row.unit === 'คน' ? 'selected' : ''}>คน</option>
      </select>
      <input class="entry-input entry-input--number" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" data-field="price" data-row-id="${row.rowId}" value="${row.price}">
      <button class="entry-row-remove" type="button" data-remove-row="${row.rowId}" aria-label="ลบแถวนี้">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `).join('');

  els.incomeEntryList.innerHTML = labelsHtml + rowsHtml;
  updateIncomeTotal();
}

function updateIncomeTotal() {
  const total = state.incomeRows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  els.incomeTotal.textContent = formatBaht(total);
}

els.incomeEntryList.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const rowId = e.target.dataset.rowId;
  if (!field || !rowId) return;
  const row = state.incomeRows.find(r => r.rowId === rowId);
  if (!row) return;
  row[field] = e.target.value;
  // เมื่อเปลี่ยนชื่อรายการ ให้ auto-set unit ตาม mapping
  if (field === 'name') {
    const autoUnit = state.incomeItemUnits[e.target.value];
    if (autoUnit) {
      row.unit = autoUnit;
      // อัปเดต dropdown unit ใน DOM
      const unitSel = e.target.closest('.entry-row').querySelector('[data-field="unit"]');
      if (unitSel) unitSel.value = autoUnit;
    }
  }
  if (field === 'price') updateIncomeTotal();
});

els.incomeEntryList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove-row]');
  if (removeBtn) removeIncomeRow(removeBtn.dataset.removeRow);
});

els.addIncomeRowBtn.addEventListener('click', () => addIncomeRow());

// ===================== ENTRY ROWS: รายจ่าย =====================
function addExpenseRow(prefill) {
  const row = {
    rowId: nextRowId_(),
    name: (prefill && prefill.name) || (state.expenseItems[0] || ''),
    price: (prefill && prefill.price) || '',
  };
  state.expenseRows.push(row);
  renderExpenseRows();
}

function removeExpenseRow(rowId) {
  state.expenseRows = state.expenseRows.filter(r => r.rowId !== rowId);
  if (state.expenseRows.length === 0) addExpenseRow();
  else renderExpenseRows();
}

function renderExpenseRows() {
  const labelsHtml = `
    <div class="entry-col-labels entry-col-labels--expense">
      <span>รายการ</span><span>ราคา</span><span></span>
    </div>`;

  const rowsHtml = state.expenseRows.map(row => `
    <div class="entry-row entry-row--expense" data-row-id="${row.rowId}">
      <select class="entry-select" data-field="name" data-row-id="${row.rowId}">
        ${state.expenseItems.map(item => `<option value="${escapeHtml(item)}" ${item === row.name ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
      </select>
      <input class="entry-input entry-input--number" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" data-field="price" data-row-id="${row.rowId}" value="${row.price}">
      <button class="entry-row-remove" type="button" data-remove-row="${row.rowId}" aria-label="ลบแถวนี้">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `).join('');

  els.expenseEntryList.innerHTML = labelsHtml + rowsHtml;
  updateExpenseTotal();
}

function updateExpenseTotal() {
  const total = state.expenseRows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  els.expenseTotal.textContent = formatBaht(total);
}

els.expenseEntryList.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const rowId = e.target.dataset.rowId;
  if (!field || !rowId) return;
  const row = state.expenseRows.find(r => r.rowId === rowId);
  if (!row) return;
  row[field] = e.target.value;
  if (field === 'price') updateExpenseTotal();
});

els.expenseEntryList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove-row]');
  if (removeBtn) removeExpenseRow(removeBtn.dataset.removeRow);
});

els.addExpenseRowBtn.addEventListener('click', () => addExpenseRow());

// ===================== ENTRY ROWS: บริการโอนเงิน =====================
function addTransferRow(prefill) {
  const row = {
    rowId: nextRowId_(),
    amount: (prefill && prefill.amount) || '',
    qty: (prefill && prefill.qty) || 1,
    fee: (prefill && prefill.fee) || '',
  };
  state.transferRows.push(row);
  renderTransferRows();
}

function removeTransferRow(rowId) {
  state.transferRows = state.transferRows.filter(r => r.rowId !== rowId);
  if (state.transferRows.length === 0) addTransferRow();
  else renderTransferRows();
}

function renderTransferRows() {
  const rowsHtml = state.transferRows.map(row => `
    <div class="entry-row entry-row--transfer" data-row-id="${row.rowId}">
      <input class="entry-input entry-input--number" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" data-field="amount" data-row-id="${row.rowId}" value="${row.amount}">
      <input class="entry-input entry-input--number" type="number" inputmode="numeric" min="0" placeholder="0" data-field="qty" data-row-id="${row.rowId}" value="${row.qty}">
      <span class="entry-static-label">รายการ</span>
      <input class="entry-input entry-input--number" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" data-field="fee" data-row-id="${row.rowId}" value="${row.fee}">
      <button class="entry-row-remove" type="button" data-remove-row="${row.rowId}" aria-label="ลบแถวนี้">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  `).join('');

  els.transferEntryList.innerHTML = rowsHtml;
  updateTransferEntryTotals();
}

function updateTransferEntryTotals() {
  const amountTotal = state.transferRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const feeTotal = state.transferRows.reduce((sum, r) => sum + (Number(r.fee) || 0), 0);
  els.transferAmountEntryTotal.textContent = formatBaht(amountTotal);
  els.transferFeeEntryTotal.textContent = formatBaht(feeTotal);
  els.transferCashEntryTotal.textContent = formatBaht(amountTotal + feeTotal);
}

els.transferEntryList.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const rowId = e.target.dataset.rowId;
  if (!field || !rowId) return;
  const row = state.transferRows.find(r => r.rowId === rowId);
  if (!row) return;
  row[field] = e.target.value;
  if (field === 'amount' || field === 'fee') updateTransferEntryTotals();
});

els.transferEntryList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove-row]');
  if (removeBtn) removeTransferRow(removeBtn.dataset.removeRow);
});

els.addTransferRowBtn.addEventListener('click', () => addTransferRow());

// ===================== SAVE: รายรับ =====================
els.saveIncomeBtn.addEventListener('click', async () => {
  if (!isConfigured()) return showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error');

  const validRows = state.incomeRows.filter(r => r.name && Number(r.price) > 0);
  if (validRows.length === 0) {
    showToast('กรุณากรอกราคาอย่างน้อย 1 รายการ', 'error');
    return;
  }

  els.saveIncomeBtn.disabled = true;
  setLoading(true);
  try {
    const items = validRows.map(r => ({ name: r.name, qty: Number(r.qty) || 0, price: Number(r.price) }));
    await apiPost({ action: 'addEntry', type: 'income', items, device: state.deviceName });
    showToast('บันทึกรายรับเรียบร้อย', 'success');
    state.incomeRows = [];
    addIncomeRow();
    setSyncStatus('synced', 'ซิงค์ล่าสุดเมื่อสักครู่');
    if (state.currentPage === 'summary') loadSummary();
  } catch (err) {
    showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    setSyncStatus('error', 'ซิงค์ล้มเหลว');
  } finally {
    els.saveIncomeBtn.disabled = false;
    setLoading(false);
  }
});

// ===================== SAVE: รายจ่าย =====================
els.saveExpenseBtn.addEventListener('click', async () => {
  if (!isConfigured()) return showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error');

  const validRows = state.expenseRows.filter(r => r.name && Number(r.price) > 0);
  if (validRows.length === 0) {
    showToast('กรุณากรอกราคาอย่างน้อย 1 รายการ', 'error');
    return;
  }

  els.saveExpenseBtn.disabled = true;
  setLoading(true);
  try {
    const items = validRows.map(r => ({ name: r.name, price: Number(r.price) }));
    await apiPost({ action: 'addEntry', type: 'expense', items, device: state.deviceName });
    showToast('บันทึกรายจ่ายเรียบร้อย', 'success');
    state.expenseRows = [];
    addExpenseRow();
    setSyncStatus('synced', 'ซิงค์ล่าสุดเมื่อสักครู่');
    if (state.currentPage === 'summary') loadSummary();
  } catch (err) {
    showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    setSyncStatus('error', 'ซิงค์ล้มเหลว');
  } finally {
    els.saveExpenseBtn.disabled = false;
    setLoading(false);
  }
});

// ===================== SAVE: บริการโอนเงิน =====================
els.saveTransferBtn.addEventListener('click', async () => {
  if (!isConfigured()) return showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error');

  const validRows = state.transferRows.filter(r => Number(r.amount) > 0);
  if (validRows.length === 0) {
    showToast('กรุณากรอกยอดโอนอย่างน้อย 1 รายการ', 'error');
    return;
  }

  els.saveTransferBtn.disabled = true;
  setLoading(true);
  try {
    const items = validRows.map(r => ({
      amount: Number(r.amount),
      qty: Number(r.qty) || 1,
      fee: Number(r.fee) || 0,
    }));
    await apiPost({ action: 'addEntry', type: 'transfer', items, device: state.deviceName });
    showToast('บันทึกรายการโอนเงินเรียบร้อย', 'success');
    state.transferRows = [];
    addTransferRow();
    setSyncStatus('synced', 'ซิงค์ล่าสุดเมื่อสักครู่');
    loadTransferSummary();
  } catch (err) {
    showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    setSyncStatus('error', 'ซิงค์ล้มเหลว');
  } finally {
    els.saveTransferBtn.disabled = false;
    setLoading(false);
  }
});

// ===================== MANAGE ITEMS MODAL =====================
function openItemModal(type) {
  activeModalType = type;
  els.itemModalTitle.textContent = type === 'income' ? 'จัดการตัวเลือกรายการ (รายรับ)' : 'จัดการตัวเลือกรายการ (รายจ่าย)';
  els.newItemInput.value = '';
  // แสดง/ซ่อน dropdown หน่วยในหน้าต่าง modal ตามประเภท
  const unitRow = document.getElementById('newItemUnitRow');
  if (unitRow) unitRow.style.display = type === 'income' ? '' : 'none';
  renderExistingItemList();
  els.itemModalOverlay.classList.remove('is-hidden');
  els.newItemInput.focus();
}

function closeItemModal() {
  els.itemModalOverlay.classList.add('is-hidden');
}

function renderExistingItemList() {
  const list = activeModalType === 'income' ? state.incomeItems : state.expenseItems;
  const unitMap = activeModalType === 'income' ? state.incomeItemUnits : {};
  els.existingItemList.innerHTML = list.length
    ? list.map(item => `<div class="modal-item-row">${escapeHtml(item)}${unitMap[item] ? `<span class="modal-item-unit">(${unitMap[item]})</span>` : ''}</div>`).join('')
    : '<p class="empty-hint">ยังไม่มีรายการ</p>';
}

els.manageIncomeItemsBtn.addEventListener('click', () => openItemModal('income'));
els.manageExpenseItemsBtn.addEventListener('click', () => openItemModal('expense'));
els.itemModalCloseBtn.addEventListener('click', closeItemModal);
els.itemModalOverlay.addEventListener('click', (e) => {
  if (e.target === els.itemModalOverlay) closeItemModal();
});

els.addNewItemBtn.addEventListener('click', async () => {
  const name = els.newItemInput.value.trim();
  const unitEl = document.getElementById('newItemUnitSelect');
  const unit = unitEl ? unitEl.value : 'แผ่น';
  if (!name) return showToast('กรุณากรอกชื่อรายการ', 'error');
  if (!isConfigured()) return showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error');

  setLoading(true);
  try {
    const data = await apiPost({ action: 'addItem', type: activeModalType, name, unit });
    if (activeModalType === 'income') {
      state.incomeItems = data.items;
      state.incomeItemUnits = data.itemUnits || state.incomeItemUnits;
      renderIncomeRows();
    } else {
      state.expenseItems = data.items;
      renderExpenseRows();
    }
    els.newItemInput.value = '';
    renderExistingItemList();
    state._itemsSig = null;
    saveItemsCache_();
    showToast('เพิ่มรายการเรียบร้อย', 'success');
  } catch (err) {
    showToast('เพิ่มรายการไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
});

// ===================== SUMMARY PAGE =====================
els.summaryFilterTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  state.summaryRange = tab.dataset.range;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('is-active', t === tab));
  els.filterInputsDay.classList.toggle('is-hidden', state.summaryRange !== 'day');
  els.filterInputsMonth.classList.toggle('is-hidden', state.summaryRange !== 'month');
  els.filterInputsYear.classList.toggle('is-hidden', state.summaryRange !== 'year');
  els.filterInputsCustom.classList.toggle('is-hidden', state.summaryRange !== 'custom');
});

function getDateRangeForSummary() {
  const todayStr = formatDateLocal_(new Date());

  if (state.summaryRange === 'day') {
    const d = els.filterDaySingle.value || todayStr;
    return { from: d, to: d };
  }
  if (state.summaryRange === 'month') {
    const m = els.filterMonth.value; // yyyy-mm
    if (!m) {
      const now = new Date();
      const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      return monthToRange_(ym);
    }
    return monthToRange_(m);
  }
  if (state.summaryRange === 'year') {
    const y = els.filterYear.value || String(new Date().getFullYear());
    return yearToRange_(y);
  }
  // custom
  const from = els.filterFrom.value || todayStr;
  const to = els.filterTo.value || todayStr;
  return { from, to };
}

function monthToRange_(ym) {
  const [y, m] = ym.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function yearToRange_(y) {
  const yNum = Number(y);
  const from = `${yNum}-01-01`;
  const to = `${yNum}-12-31`;
  return { from, to };
}

function formatDateLocal_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

els.applyFilterBtn.addEventListener('click', () => loadSummary());

function summaryKey_(r) { return r.from + '|' + r.to; }

function applySummary_(data, range) {
  state.lastSummary = data;
  renderSummary(data);
  lsSet_(LS_KEYS.summary, { key: summaryKey_(range), data: data });
}

async function loadSummary(opts) {
  if (!isConfigured()) return showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error');

  const silent = !!(opts && opts.silent);
  const range = getDateRangeForSummary();
  if (!silent) setLoading(true);
  try {
    const data = await apiGet({ action: 'getSummary', from: range.from, to: range.to });
    applySummary_(data, range);
    setSyncStatus('synced', 'ข้อมูลล่าสุด');
  } catch (err) {
    showToast('โหลดสรุปไม่สำเร็จ: ' + err.message, 'error');
    setSyncStatus('error', 'ซิงค์ล้มเหลว');
  } finally {
    if (!silent) setLoading(false);
  }
}

function renderSummary(data) {
  els.summaryIncomeTotal.textContent = formatBaht(data.incomeTotal);
  els.summaryExpenseTotal.textContent = formatBaht(data.expenseTotal);
  els.summaryProfitTotal.textContent = formatBaht(data.profit);
  els.summaryProfitCard.classList.toggle('is-loss', data.profit < 0);

  const incomeEntries = Object.entries(data.incomeByItem || {});
  els.summaryIncomeByItem.innerHTML = incomeEntries.length
    ? incomeEntries.map(([name, v]) => `
        <div class="summary-detail-row">
          <span class="summary-detail-name">${escapeHtml(name)}${v.qty ? `<span class="summary-detail-qty">(${v.qty} ${v.unit || 'แผ่น'})</span>` : ''}</span>
          <span class="summary-detail-amount">${formatBaht(v.total)}</span>
        </div>`).join('')
    : '<p class="empty-hint">ยังไม่มีข้อมูลในช่วงที่เลือก</p>';

  const expenseEntries = Object.entries(data.expenseByItem || {});
  els.summaryExpenseByItem.innerHTML = expenseEntries.length
    ? expenseEntries.map(([name, v]) => `
        <div class="summary-detail-row">
          <span class="summary-detail-name">${escapeHtml(name)}</span>
          <span class="summary-detail-amount">${formatBaht(v.total)}</span>
        </div>`).join('')
    : '<p class="empty-hint">ยังไม่มีข้อมูลในช่วงที่เลือก</p>';
}

// ===================== สรุปยอด: บริการโอนเงิน (แยกจากหน้าสรุปหลัก ไม่รวมยอดกัน) =====================
els.transferFilterTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  state.transferSummaryRange = tab.dataset.range;
  els.transferFilterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('is-active', t === tab));
  els.transferFilterInputsDay.classList.toggle('is-hidden', state.transferSummaryRange !== 'day');
  els.transferFilterInputsMonth.classList.toggle('is-hidden', state.transferSummaryRange !== 'month');
  els.transferFilterInputsYear.classList.toggle('is-hidden', state.transferSummaryRange !== 'year');
  els.transferFilterInputsCustom.classList.toggle('is-hidden', state.transferSummaryRange !== 'custom');
});

function getDateRangeForTransferSummary() {
  const todayStr = formatDateLocal_(new Date());

  if (state.transferSummaryRange === 'day') {
    const d = els.transferFilterDaySingle.value || todayStr;
    return { from: d, to: d };
  }
  if (state.transferSummaryRange === 'month') {
    const m = els.transferFilterMonth.value; // yyyy-mm
    if (!m) {
      const now = new Date();
      const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      return monthToRange_(ym);
    }
    return monthToRange_(m);
  }
  if (state.transferSummaryRange === 'year') {
    const y = els.transferFilterYear.value || String(new Date().getFullYear());
    return yearToRange_(y);
  }
  const from = els.transferFilterFrom.value || todayStr;
  const to = els.transferFilterTo.value || todayStr;
  return { from, to };
}

els.transferApplyFilterBtn.addEventListener('click', () => loadTransferSummary());

function applyTransferSummary_(data, range) {
  state.lastTransferSummary = data;
  renderTransferSummary(data);
  lsSet_(LS_KEYS.transfer, { key: summaryKey_(range), data: data });
}

async function loadTransferSummary(opts) {
  if (!isConfigured()) return;

  const silent = !!(opts && opts.silent);
  const range = getDateRangeForTransferSummary();
  if (!silent) setLoading(true);
  try {
    const data = await apiGet({ action: 'getTransferSummary', from: range.from, to: range.to });
    applyTransferSummary_(data, range);
  } catch (err) {
    showToast('โหลดสรุปโอนเงินไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    if (!silent) setLoading(false);
  }
}

function renderTransferSummary(data) {
  els.transferAmountSummaryTotal.textContent = formatBaht(data.amountTotal);
  els.transferFeeSummaryTotal.textContent = formatBaht(data.feeTotal);
  els.transferCashSummaryTotal.textContent = formatBaht(data.cashTotal);

  const entries = data.entries || [];
  els.transferDetailList.innerHTML = entries.length
    ? entries.map(e => `
        <div class="summary-detail-row">
          <span class="summary-detail-name">${escapeHtml(e.date)} ${escapeHtml(e.time)}<span class="summary-detail-qty">(${e.qty} รายการ)</span></span>
          <span class="summary-detail-amount">ยอด ${formatBaht(e.amount)} · ค่าบริการ ${formatBaht(e.fee)}</span>
        </div>`).join('')
    : '<p class="empty-hint">ยังไม่มีข้อมูลในช่วงที่เลือก</p>';
}

// ===================== EXPORT EXCEL =====================
// โหลดไลบรารี xlsx เฉพาะตอนกด Export (เดิมโหลดทุกครั้งที่เปิดแอป ~900KB และบล็อกการเริ่มทำงาน)
function loadXlsx_() {
  if (window.XLSX) return Promise.resolve();
  if (loadXlsx_._p) return loadXlsx_._p;
  loadXlsx_._p = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    sc.onload = resolve;
    sc.onerror = () => { loadXlsx_._p = null; reject(new Error('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ ลองใหม่อีกครั้ง')); };
    document.head.appendChild(sc);
  });
  return loadXlsx_._p;
}

els.exportExcelBtn.addEventListener('click', async () => {
  if (!state.lastSummary) {
    showToast('กรุณากดแสดงสรุปก่อน', 'error');
    return;
  }
  try {
    showToast('กำลังเตรียมไฟล์ Excel…');
    await loadXlsx_();
    exportSummaryToExcel(state.lastSummary);
    showToast('ดาวน์โหลดไฟล์ Excel แล้ว', 'success');
  } catch (err) {
    showToast('Export ไม่สำเร็จ: ' + err.message, 'error');
  }
});

// แปลงค่าวันที่ที่ได้จาก API (อาจเป็น Date object ที่กลายเป็น ISO string แบบ UTC
// ตอนส่งผ่าน JSON เช่น "2026-06-19T17:00:00.000Z") ให้กลับมาเป็นวันที่แบบไทย
// "yyyy-mm-dd" เหมือนที่เห็นในชีต ถ้าค่าที่ส่งมาเป็นข้อความรูปแบบนี้อยู่แล้ว
// (เช่น ถ้าฝั่ง Apps Script แก้ให้ส่งเป็น text มาตั้งแต่ต้น) ก็จะปล่อยผ่านตามเดิม
// ไม่ต้องแปลงซ้ำ
function formatDateForExport_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // แปลงไม่ได้ ใส่ค่าดิบกลับไปแทนที่จะพัง
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // ได้รูปแบบ yyyy-mm-dd
}

// แปลงค่าเวลาที่ได้จาก API (มักเป็น Date object ของวันที่ 1899-12-30 ตามมาตรฐาน
// time-only ของ Google Sheets) ให้กลับมาเป็นเวลาแบบไทย "h:mm" เหมือนที่เห็นในชีต
function formatTimeForExport_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: 'numeric', minute: '2-digit', hour12: false });
}

function exportSummaryToExcel(data) {
  const wb = XLSX.utils.book_new();

  // ชีตสรุป
  const summaryRows = [
    ['วาว Print Center — สรุปรายรับรายจ่าย'],
    ['ช่วงวันที่', data.from + ' ถึง ' + data.to],
    [],
    ['รายรับรวม', data.incomeTotal],
    ['รายจ่ายรวม', data.expenseTotal],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'สรุป');

  // ชีตรายรับ
  const incomeRows = [['วันที่', 'เวลา', 'รายการ', 'จำนวน', 'ราคา']];
  (data.income || []).forEach(e => incomeRows.push([
    formatDateForExport_(e.date),
    formatTimeForExport_(e.time),
    e.name, e.qty, e.price,
  ]));
  const incomeWs = XLSX.utils.aoa_to_sheet(incomeRows);
  XLSX.utils.book_append_sheet(wb, incomeWs, 'รายรับ');

  // ชีตรายจ่าย
  const expenseRows = [['วันที่', 'เวลา', 'รายการ', 'ราคา']];
  (data.expense || []).forEach(e => expenseRows.push([
    formatDateForExport_(e.date),
    formatTimeForExport_(e.time),
    e.name, e.price,
  ]));
  const expenseWs = XLSX.utils.aoa_to_sheet(expenseRows);
  XLSX.utils.book_append_sheet(wb, expenseWs, 'รายจ่าย');

  const filename = `วาว-print-center-${data.from}_${data.to}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ===================== UTIL =====================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===================== พิมพ์สลิป 57 mm (หน้าโอนเงิน + หน้าสรุป) =====================
// สร้าง HTML ของสลิปใน #printSlip → วัดความสูงจริง → ตั้งขนาดหน้า 57mm × ความยาวตามเนื้อหา → window.print()
const SLIP_LOGO_SRC = 'icons/logo-slip.png';
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function fmtNum_(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseYmd_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

function thDate_(ymd, withYear) {
  const p = parseYmd_(ymd);
  if (!p) return ymd || '';
  return p.d + ' ' + TH_MONTHS_SHORT[p.m - 1] + (withYear === false ? '' : ' ' + (p.y + 543));
}

function daysBetween_(from, to) {
  const a = parseYmd_(from), b = parseYmd_(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

// ดูจาก from/to ของข้อมูลที่แสดงอยู่จริง (ไม่ใช่แท็บที่เพิ่งกดเปลี่ยน) ว่าเป็นช่วงแบบไหน
function describeRange_(from, to) {
  const a = parseYmd_(from), b = parseYmd_(to);
  if (!a || !b) return { mode: 'custom', kind: 'ช่วงวันที่', text: (from || '') + ' – ' + (to || '') };
  if (from === to) return { mode: 'day', kind: 'รายวัน', text: thDate_(from) };
  const lastDay = new Date(a.y, a.m, 0).getDate();
  if (a.y === b.y && a.m === b.m && a.d === 1 && b.d === lastDay) {
    return { mode: 'month', kind: 'รายเดือน', text: TH_MONTHS_FULL[a.m - 1] + ' ' + (a.y + 543) };
  }
  if (a.y === b.y && a.m === 1 && a.d === 1 && b.m === 12 && b.d === 31) {
    return { mode: 'year', kind: 'รายปี', text: 'พ.ศ. ' + (a.y + 543) };
  }
  return { mode: 'custom', kind: 'ช่วงวันที่', text: thDate_(from) + ' – ' + thDate_(to) };
}

function slipHeaderHtml_(title, range) {
  return `
    <img class="slip-logo" src="${SLIP_LOGO_SRC}" alt="วาว Print Center">
    <div class="slip-title">${escapeHtml(title)}</div>
    <div class="slip-period"><b>${escapeHtml(range.kind)}</b> ${escapeHtml(range.text)}</div>
    <hr class="slip-hr">`;
}

function slipFooterHtml_() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  return `
    <hr class="slip-hr">
    <div class="slip-foot">พิมพ์เมื่อ ${escapeHtml(thDate_(formatDateLocal_(now)))} ${hh} น.</div>
    <div class="slip-foot slip-foot--brand">วาว Print Center</div>`;
}

function slipRow_(name, amountText, qtyText) {
  return `
    <div class="slip-row">
      <span class="slip-name">${escapeHtml(name)}${qtyText ? ` <span class="slip-qty">(${escapeHtml(qtyText)})</span>` : ''}</span>
      <span class="slip-amt">${escapeHtml(amountText)}</span>
    </div>`;
}

function buildSummarySlip_(d) {
  const range = describeRange_(d.from, d.to);
  const incomeEntries = Object.entries(d.incomeByItem || {});
  const expenseEntries = Object.entries(d.expenseByItem || {});

  let html = slipHeaderHtml_('สรุปรายรับ-รายจ่าย', range);

  html += '<div class="slip-section">รายรับ</div>';
  html += incomeEntries.length
    ? incomeEntries.map(([name, v]) => slipRow_(name, fmtNum_(v.total), v.qty ? v.qty + ' ' + (v.unit || 'แผ่น') : '')).join('')
    : '<div class="slip-empty">ไม่มีรายการ</div>';
  html += `<div class="slip-row slip-total"><span>รวมรายรับ</span><span class="slip-amt">${fmtNum_(d.incomeTotal)}</span></div>`;

  html += '<div class="slip-section">รายจ่าย</div>';
  html += expenseEntries.length
    ? expenseEntries.map(([name, v]) => slipRow_(name, fmtNum_(v.total), '')).join('')
    : '<div class="slip-empty">ไม่มีรายการ</div>';
  html += `<div class="slip-row slip-total"><span>รวมรายจ่าย</span><span class="slip-amt">${fmtNum_(d.expenseTotal)}</span></div>`;

  // กำไรสุทธิ: พิมพ์เฉพาะเมื่อการ์ด "กำไรสุทธิ" ถูกแสดงบนหน้าจอ (ถ้าซ่อนไว้ ก็ไม่พิมพ์)
  if (!els.summaryProfitCard.classList.contains('is-hidden')) {
    html += `<div class="slip-row slip-grand"><span>กำไรสุทธิ</span><span class="slip-amt">${fmtNum_(d.profit)}</span></div>`;
  }

  return html + slipFooterHtml_();
}

// จัดกลุ่มรายการโอน: รายวัน = ทีละรายการ | รายปี/ช่วงยาว = รายเดือน | อื่น ๆ = รายวัน
function groupTransfers_(entries, range, from, to) {
  if (range.mode === 'day') {
    return entries.map(e => ({
      label: (formatTimeForExport_(e.time) || '-') + ' น.',
      amount: Number(e.amount) || 0, fee: Number(e.fee) || 0, qty: Number(e.qty) || 0,
    }));
  }
  const byMonth = range.mode === 'year' || daysBetween_(from, to) > 62;
  const groups = new Map();
  entries.forEach(e => {
    const p = parseYmd_(e.date);
    if (!p) return;
    const key = byMonth ? p.y + '-' + String(p.m).padStart(2, '0') : e.date;
    if (!groups.has(key)) {
      groups.set(key, {
        label: byMonth ? TH_MONTHS_FULL[p.m - 1] + ' ' + (p.y + 543) : thDate_(e.date, false),
        amount: 0, fee: 0, qty: 0,
      });
    }
    const g = groups.get(key);
    g.amount += Number(e.amount) || 0;
    g.fee += Number(e.fee) || 0;
    g.qty += Number(e.qty) || 0;
  });
  return Array.from(groups.keys()).sort().map(k => groups.get(k));
}

function buildTransferSlip_(d) {
  const range = describeRange_(d.from, d.to);
  const entries = d.entries || [];

  let html = slipHeaderHtml_('สรุปบริการโอนเงิน', range);

  html += `<div class="slip-row"><span>จำนวนรายการ</span><span class="slip-amt">${(Number(d.qtyTotal) || 0).toLocaleString('en-US')}</span></div>`;
  html += `<div class="slip-row"><span>ยอดโอนรวม</span><span class="slip-amt">${fmtNum_(d.amountTotal)}</span></div>`;
  html += `<div class="slip-row"><span>ค่าบริการรวม</span><span class="slip-amt">${fmtNum_(d.feeTotal)}</span></div>`;
  html += `<div class="slip-row slip-grand"><span>รวมเงินสดที่รับ</span><span class="slip-amt">${fmtNum_(d.cashTotal)}</span></div>`;

  html += '<div class="slip-section">รายละเอียด</div>';
  const rows = groupTransfers_(entries, range, d.from, d.to);
  html += rows.length
    ? rows.map(r => `
        <div class="slip-entry">
          <div class="slip-row"><span class="slip-name">${escapeHtml(r.label)}</span><span class="slip-amt">โอน ${fmtNum_(r.amount)}</span></div>
          <div class="slip-sub">ค่าบริการ ${fmtNum_(r.fee)} · ${r.qty.toLocaleString('en-US')} รายการ</div>
        </div>`).join('')
    : '<div class="slip-empty">ไม่มีรายการ</div>';

  return html + slipFooterHtml_();
}

function waitSlipImages_(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(imgs.map(img => (img.complete && img.naturalWidth > 0) ? Promise.resolve() : new Promise(resolve => {
    img.onload = img.onerror = resolve;
    setTimeout(resolve, 4000); // ไม่รอเกิน 4 วินาที
  })));
}

async function printSlip_(html) {
  const slip = document.getElementById('printSlip');
  slip.innerHTML = html;
  await waitSlipImages_(slip);
  try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep_(1500)]); } catch (_) {}

  // ความยาวสลิป = ความสูงเนื้อหาจริง (px → mm) + เผื่อเล็กน้อย
  const heightMm = Math.ceil(slip.offsetHeight * 25.4 / 96) + 2;
  document.getElementById('slipPageStyle').textContent = '@page { size: 57mm ' + heightMm + 'mm; margin: 0; }';
  window.print();
}

function bindPrintButton_(btnId, getData, build, emptyMsg) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const data = getData();
    if (!data) return showToast(emptyMsg, 'error');
    btn.disabled = true;
    try {
      await printSlip_(build(data));
    } catch (err) {
      showToast('พิมพ์ไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

bindPrintButton_('printSummaryBtn', () => state.lastSummary, buildSummarySlip_, 'กรุณากดแสดงสรุปก่อนพิมพ์');
bindPrintButton_('printTransferBtn', () => state.lastTransferSummary, buildTransferSlip_, 'กรุณากดแสดงสรุปก่อนพิมพ์');

// ===================== REFRESH / INIT =====================
els.refreshBtn.addEventListener('click', () => loadAllData());

let lastSyncAt = 0;
let loadAllBusy = false;
let filtersInitialized = false;

function initDefaultFilters_() {
  if (filtersInitialized) return;
  filtersInitialized = true;
  const now = new Date();
  const todayStr = formatDateLocal_(now);
  const monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  els.filterDaySingle.value = todayStr;
  els.filterMonth.value = monthStr;
  els.filterYear.value = now.getFullYear();
  els.filterFrom.value = todayStr;
  els.filterTo.value = todayStr;

  els.transferFilterDaySingle.value = todayStr;
  els.transferFilterMonth.value = monthStr;
  els.transferFilterYear.value = now.getFullYear();
  els.transferFilterFrom.value = todayStr;
  els.transferFilterTo.value = todayStr;
}

function ensureEntryRows_() {
  if (state.incomeRows.length === 0) addIncomeRow(); else renderIncomeRows();
  if (state.expenseRows.length === 0) addExpenseRow(); else renderExpenseRows();
  if (state.transferRows.length === 0) addTransferRow(); else renderTransferRows();
}

// แสดงข้อมูลที่เก็บไว้จากครั้งก่อนทันที (ไม่ต้องรอเครือข่าย)
function paintFromCache_() {
  const cachedItems = lsGet_(LS_KEYS.items);
  if (cachedItems) applyItems_(cachedItems);
  ensureEntryRows_();

  const sr = getDateRangeForSummary();
  const cs = lsGet_(LS_KEYS.summary);
  if (cs && cs.key === summaryKey_(sr)) { state.lastSummary = cs.data; renderSummary(cs.data); }

  const tr = getDateRangeForTransferSummary();
  const ct = lsGet_(LS_KEYS.transfer);
  if (ct && ct.key === summaryKey_(tr)) { state.lastTransferSummary = ct.data; renderTransferSummary(ct.data); }

  return !!cachedItems;
}

async function loadAllData(opts) {
  if (!isConfigured()) {
    setSyncStatus('error', 'ยังไม่ได้ตั้งค่า API');
    showToast('กรุณาตั้งค่า API_URL ใน config.js ก่อนใช้งาน', 'error');
    return;
  }
  if (loadAllBusy) return;
  loadAllBusy = true;

  const background = !!(opts && opts.background);
  let hasCache = state.incomeItems.length > 0;
  if (!filtersInitialized) {
    initDefaultFilters_();
    hasCache = paintFromCache_();
  }

  setSyncStatus('syncing', hasCache ? 'กำลังอัปเดตข้อมูล…' : 'กำลังโหลดข้อมูล…');
  // ถ้ามีข้อมูลเก่าแสดงอยู่แล้ว ไม่ต้องบังหน้าจอ ใช้งานต่อได้เลยระหว่างซิงค์
  const showOverlay = !hasCache && !background;
  if (showOverlay) setLoading(true);

  try {
    const sr = getDateRangeForSummary();
    const tr = getDateRangeForTransferSummary();
    let init = null;

    // เรียกครั้งเดียวได้ทุกอย่าง (ต้องอัปเดต Code.gs ด้วย) — ถ้า Code.gs ยังเป็นรุ่นเก่า ให้ถอยกลับไปเรียกแบบเดิม
    try {
      init = await apiGet({ action: 'getInit', from: sr.from, to: sr.to, tfrom: tr.from, tto: tr.to });
    } catch (err) {
      if (!/ไม่รู้จัก action/.test(err.message)) throw err;
    }

    if (init) {
      applyItems_(init);
      saveItemsCache_();
      if (init.summary) applySummary_(init.summary, sr);
      if (init.transferSummary) applyTransferSummary_(init.transferSummary, tr);
    } else {
      const [inc, exp] = await Promise.all([
        apiGet({ action: 'getItems', type: 'income' }),
        apiGet({ action: 'getItems', type: 'expense' }),
      ]);
      applyItems_({ incomeItems: inc.items, incomeItemUnits: inc.itemUnits, expenseItems: exp.items });
      saveItemsCache_();
      setLoading(false);
      await Promise.all([loadSummary({ silent: true }), loadTransferSummary({ silent: true })]);
    }

    lastSyncAt = Date.now();
    setSyncStatus('synced', 'ซิงค์ข้อมูลล่าสุดแล้ว');
  } catch (err) {
    if (hasCache) {
      setSyncStatus('error', 'ออฟไลน์ — ใช้ข้อมูลเดิม (แตะ ⟳ เพื่อลองใหม่)');
    } else {
      setSyncStatus('error', 'เชื่อมต่อไม่สำเร็จ (แตะ ⟳ เพื่อลองใหม่)');
    }
    if (!background) showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    loadAllBusy = false;
    setLoading(false);
  }
}

// กลับมาเปิดแอปจากพื้นหลัง (นานเกิน 5 นาที) หรือเน็ตกลับมา → ซิงค์เงียบ ๆ ให้เอง
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastSyncAt > 5 * 60 * 1000) {
    loadAllData({ background: true });
  }
});
window.addEventListener('online', () => loadAllData({ background: true }));

// ===================== SERVICE WORKER =====================
function hasUnsavedInput_() {
  return state.incomeRows.some(r => r.price || r.qty) ||
         state.expenseRows.some(r => r.price) ||
         state.transferRows.some(r => r.amount || r.fee);
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // ไม่ critical หาก register ไม่สำเร็จ (เช่น เปิดผ่าน file://)
    });
  });
  // เมื่อ Service Worker เวอร์ชันใหม่เข้าควบคุม ให้รีโหลดเพื่อใช้โค้ดใหม่ (เฉพาะตอนไม่มีข้อมูลที่กรอกค้างอยู่)
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    if (hasUnsavedInput_()) return;
    reloaded = true;
    location.reload();
  });
}

// ===================== INIT =====================
loadAllData();
