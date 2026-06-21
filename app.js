/**
 * วาว Print Center — Main App Logic
 */

// ===================== STATE =====================
const state = {
  currentPage: 'income',
  incomeItems: [],
  expenseItems: [],
  incomeRows: [],   // [{rowId, name, qty, price}]
  expenseRows: [],  // [{rowId, name, price}]
  summaryRange: 'day',
  lastSummary: null,
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

  summaryFilterTabs: $('summaryFilterTabs'),
  filterInputsDay: $('filterInputsDay'),
  filterInputsMonth: $('filterInputsMonth'),
  filterInputsCustom: $('filterInputsCustom'),
  filterDaySingle: $('filterDaySingle'),
  filterMonth: $('filterMonth'),
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
async function apiGet(params) {
  const url = new URL(CONFIG.API_URL);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error('เครือข่ายขัดข้อง (' + res.status + ')');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

async function apiPost(body) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // หลีกเลี่ยง CORS preflight กับ Apps Script
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('เครือข่ายขัดข้อง (' + res.status + ')');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
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
      <span>รายการ</span><span>จำนวนแผ่น</span><span>ราคา</span><span></span>
    </div>`;

  const rowsHtml = state.incomeRows.map(row => `
    <div class="entry-row" data-row-id="${row.rowId}">
      <select class="entry-select" data-field="name" data-row-id="${row.rowId}">
        ${state.incomeItems.map(item => `<option value="${escapeHtml(item)}" ${item === row.name ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
      </select>
      <input class="entry-input entry-input--number" type="number" inputmode="numeric" min="0" placeholder="0" data-field="qty" data-row-id="${row.rowId}" value="${row.qty}">
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

// ===================== MANAGE ITEMS MODAL =====================
function openItemModal(type) {
  activeModalType = type;
  els.itemModalTitle.textContent = type === 'income' ? 'จัดการตัวเลือกรายการ (รายรับ)' : 'จัดการตัวเลือกรายการ (รายจ่าย)';
  els.newItemInput.value = '';
  renderExistingItemList();
  els.itemModalOverlay.classList.remove('is-hidden');
  els.newItemInput.focus();
}

function closeItemModal() {
  els.itemModalOverlay.classList.add('is-hidden');
}

function renderExistingItemList() {
  const list = activeModalType === 'income' ? state.incomeItems : state.expenseItems;
  els.existingItemList.innerHTML = list.length
    ? list.map(item => `<div class="modal-item-row">${escapeHtml(item)}</div>`).join('')
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
  if (!name) return showToast('กรุณากรอกชื่อรายการ', 'error');
  if (!isConfigured()) return showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error');

  setLoading(true);
  try {
    const data = await apiPost({ action: 'addItem', type: activeModalType, name });
    if (activeModalType === 'income') {
      state.incomeItems = data.items;
      renderIncomeRows();
    } else {
      state.expenseItems = data.items;
      renderExpenseRows();
    }
    els.newItemInput.value = '';
    renderExistingItemList();
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

function formatDateLocal_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

els.applyFilterBtn.addEventListener('click', () => loadSummary());

async function loadSummary() {
  if (!isConfigured()) return showToast('ยังไม่ได้ตั้งค่า API_URL ใน config.js', 'error');

  const { from, to } = getDateRangeForSummary();
  setLoading(true);
  try {
    const data = await apiGet({ action: 'getSummary', from, to });
    state.lastSummary = data;
    renderSummary(data);
    setSyncStatus('synced', 'ข้อมูลล่าสุด');
  } catch (err) {
    showToast('โหลดสรุปไม่สำเร็จ: ' + err.message, 'error');
    setSyncStatus('error', 'ซิงค์ล้มเหลว');
  } finally {
    setLoading(false);
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
          <span class="summary-detail-name">${escapeHtml(name)}${v.qty ? `<span class="summary-detail-qty">(${v.qty} แผ่น)</span>` : ''}</span>
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

// ===================== EXPORT EXCEL =====================
els.exportExcelBtn.addEventListener('click', () => {
  if (!state.lastSummary) {
    showToast('กรุณากดแสดงสรุปก่อน', 'error');
    return;
  }
  try {
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
    ['กำไร/ขาดทุนสุทธิ', data.profit],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'สรุป');

  // ชีตรายรับ
  const incomeRows = [['วันที่', 'เวลา', 'รายการ', 'จำนวนแผ่น', 'ราคา']];
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

// ===================== REFRESH / INIT =====================
els.refreshBtn.addEventListener('click', () => loadAllData());

async function loadAllData() {
  if (!isConfigured()) {
    setSyncStatus('error', 'ยังไม่ได้ตั้งค่า API');
    showToast('กรุณาตั้งค่า API_URL ใน config.js ก่อนใช้งาน', 'error');
    return;
  }

  setSyncStatus('syncing', 'กำลังซิงค์ข้อมูล…');
  setLoading(true);
  try {
    const [incomeItemsRes, expenseItemsRes] = await Promise.all([
      apiGet({ action: 'getItems', type: 'income' }),
      apiGet({ action: 'getItems', type: 'expense' }),
    ]);
    state.incomeItems = incomeItemsRes.items;
    state.expenseItems = expenseItemsRes.items;

    if (state.incomeRows.length === 0) addIncomeRow();
    else renderIncomeRows();

    if (state.expenseRows.length === 0) addExpenseRow();
    else renderExpenseRows();

    // ตั้งวันที่เริ่มต้นของหน้าสรุปเป็นวันนี้
    const todayStr = formatDateLocal_(new Date());
    els.filterDaySingle.value = todayStr;
    const now = new Date();
    els.filterMonth.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    els.filterFrom.value = todayStr;
    els.filterTo.value = todayStr;

    await loadSummary();

    setSyncStatus('synced', 'ซิงค์ข้อมูลล่าสุดแล้ว');
  } catch (err) {
    setSyncStatus('error', 'เชื่อมต่อไม่สำเร็จ');
    showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // ไม่ critical หาก register ไม่สำเร็จ (เช่น เปิดผ่าน file://)
    });
  });
}

// ===================== INIT =====================
loadAllData();
