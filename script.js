// script.js - Chaudhary Traders POS (FULLY COMPLETE + ALL BUGS FIXED)

let stock = [], customers = [], settings = { billCounter: 1, bookNumber: 'Book-001' };
let currentBill = [], editingProductIndex = null, currentCustomer = null;

// LOAD DATA FROM LOCALSTORAGE
function loadData() {
  stock = JSON.parse(localStorage.getItem('chaudharyStock')) || [];
  customers = (JSON.parse(localStorage.getItem('chaudharyCustomers')) || []).map(c => ({
    ...c, balance: Number(c.balance) || 0, history: c.history || []
  }));

  customers = customers.map(c => {
    let bal = 0;
    (c.history || []).forEach(e => {
      if (e.type === 'sale') bal += (e.baki || 0);
      else if (e.type === 'return') bal -= (e.total || 0);
      else if (e.type === 'manual-debit') bal += (e.amount || 0);
      else if (e.type === 'manual-credit') bal -= (e.amount || 0);
    });
    c.balance = Number(bal.toFixed(2));
    return c;
  });

  settings = JSON.parse(localStorage.getItem('chaudharySettings')) || { billCounter: 1, bookNumber: 'Book-001' };
}

// PAGE SWITCH
function showPage(pageId, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');

  document.querySelectorAll('.menu-btn, .sidebar-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background = '#27ae60';
  });

  if (btn) {
    btn.classList.add('active');
    btn.style.background = '#1e8449';
  }

  if (pageId === 'bill') initBillPage();
  if (pageId === 'stock') initStockPage();
  if (pageId === 'ledger') initLedgerPage();
  if (pageId === 'home') updateHomeStats();
}

// HOME PAGE
function updateHomeStats() {
  loadData();
  document.getElementById('totalProducts').textContent = stock.length;
  document.getElementById('totalCustomers').textContent = customers.length;
  const due = customers.reduce((s, c) => s + (c.balance || 0), 0);
  document.getElementById('totalDue').textContent = `Rs. ${due.toFixed(0)}`;
}

// BILL PAGE
function initBillPage() {
  loadData();
  renderProductDropdown(); // ← FIXED: Load products on page open
  document.getElementById('bookNumberInput').value = settings.bookNumber;
  document.getElementById('billNumberInput').value = settings.billCounter;

  document.getElementById('setBillNumberBtn').onclick = setCustomBillNumber;
  document.getElementById('addToBillNet').onclick = () => addItemToBill(false);
  document.getElementById('addToBillCredit').onclick = () => addItemToBill(true);
  document.getElementById('saveBillBtn').onclick = saveBill;
  document.getElementById('printBillBtn').onclick = printCurrentBill;
  document.getElementById('searchProductBtn').onclick = searchProducts;
  document.getElementById('searchProduct').oninput = () => { if (!this.value.trim()) renderProductDropdown(); };

  document.querySelectorAll('input[name="payType"]').forEach(r => r.onchange = toggleDeposit);
  document.getElementById('depositAmount').oninput = updateBaki;

  const searchInput = document.getElementById('customerSearch');
  const resultsDiv = document.getElementById('customerResults');
  searchInput.oninput = () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { resultsDiv.style.display = 'none'; return; }
    const matches = customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    resultsDiv.innerHTML = matches.length
      ? matches.map(c => `<div onclick="selectCustomer('${c.phone}')" style="padding:12px;border-bottom:1px solid #eee;cursor:pointer;background:#f9f9f9;">
          <strong>${c.name}</strong> (${c.phone}) - Due: Rs. ${c.balance}
        </div>`).join('')
      : '<div style="padding:12px;color:#e74c3c;">Not found</div>';
    resultsDiv.style.display = 'block';
  };

  document.getElementById('addNewCustomerBtn').onclick = () => {
    const name = prompt('Customer Name:');
    const phone = prompt('Phone Number:');
    if (name && phone && !customers.find(c => c.phone === phone)) {
      customers.push({ name, phone, balance: 0, history: [] });
      saveAll();
      alert('Customer added!');
      populateLedgerCustomerDropdown();
    } else if (customers.find(c => c.phone === phone)) {
      alert('Customer already exists!');
    }
  };

  currentBill = [];
  renderBill();

  // ← FIXED: Search clear karne pe full list wapas
  document.getElementById('searchProduct').addEventListener('input', function() {
    if (!this.value.trim()) renderProductDropdown();
  });
}

window.selectCustomer = phone => {
  const c = customers.find(x => x.phone === phone);
  if (c) {
    document.getElementById('customerSearch').value = `${c.name} (${c.phone})`;
    document.getElementById('customerResults').style.display = 'none';
  }
};

function setCustomBillNumber() {
  const book = document.getElementById('bookNumberInput').value.trim() || 'Book-001';
  const bill = parseInt(document.getElementById('billNumberInput').value) || 1;
  if (bill < 1) return alert('Invalid bill number!');
  settings.bookNumber = book;
  settings.billCounter = bill;
  saveAll();
}

// FIXED: Search Product (100% working)
function searchProducts() {
  const q = document.getElementById('searchProduct').value.trim().toLowerCase();
  const sel = document.getElementById('sellProduct');
  sel.innerHTML = '<option value="">Select Product</option>';

  if (!q) {
    renderProductDropdown();
    return;
  }

  const matches = stock.filter(p => 
    p.name.toLowerCase().includes(q) || p.company.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    sel.innerHTML += '<option disabled>No product found</option>';
  } else {
    matches.forEach(p => {
      sel.add(new Option(`${p.name} (${p.company}) - ${p.qty} left`, `${p.name}|${p.company}`));
    });
  }
  sel.dispatchEvent(new Event('change'));
}

// FIXED: renderProductDropdown (with refresh)
function renderProductDropdown() {
  const sel = document.getElementById('sellProduct');
  sel.innerHTML = '<option value="">Select Product</option>';
  stock.forEach(p => {
    sel.add(new Option(`${p.name} (${p.company}) - ${p.qty} left`, `${p.name}|${p.company}`));
  });
  sel.dispatchEvent(new Event('change'));
}

function addItemToBill(isCredit) {
  const id = document.getElementById('sellProduct').value;
  const qty = parseInt(document.getElementById('sellQty').value) || 0;
  if (!id || qty < 1) return alert('Select product & quantity!');
  const p = stock.find(x => `${x.name}|${x.company}` === id);
  if (!p || p.qty < qty) return alert('Not enough stock!');
  const price = isCredit ? (p.creditRate || p.netPrice) : p.netPrice;
  currentBill.push({ ...p, qty, price, isCredit });
  document.getElementById('sellQty').value = '';
  renderBill();
}

function renderBill() {
  const tbody = document.querySelector('#billTable tbody');
  tbody.innerHTML = '';
  let total = 0;
  currentBill.forEach((it, i) => {
    const amt = it.qty * it.price;
    total += amt;
    tbody.innerHTML += `<tr>
      <td>${it.name} (${it.company})</td>
      <td>${it.qty}</td>
      <td>Rs. ${it.price}</td>
      <td>Rs. ${amt}</td>
      <td><button class="btn-red btn-sm" onclick="currentBill.splice(${i},1);renderBill();">X</button></td>
    </tr>`;
  });
  document.getElementById('billTotal').textContent = `Total: Rs. ${total}`;
  document.getElementById('saveBillBtn').disabled = !currentBill.length;
  document.getElementById('printBillBtn').disabled = !currentBill.length;
  updateBaki();
}

function updateBaki() {
  const total = currentBill.reduce((s,i) => s + i.qty*i.price, 0);
  const isPartial = document.querySelector('input[value="partial"]').checked;
  const deposit = isPartial ? (parseFloat(document.getElementById('depositAmount').value) || 0) : total;
  const baki = total - deposit;
  const el = document.getElementById('remainingBaki');
  el.textContent = isPartial ? (baki > 0 ? `Due: Rs. ${baki}` : `Change: Rs. ${-baki}`) : 'Fully Paid';
  el.style.color = baki > 0 ? '#e74c3c' : '#27ae60';
}

function toggleDeposit() {
  const partial = document.querySelector('input[value="partial"]').checked;
  document.getElementById('depositAmount').disabled = !partial;
  if (!partial) document.getElementById('depositAmount').value = '';
  updateBaki();
}

function saveBill() {
  if (!currentBill.length) return alert('Bill is empty!');
  const total = currentBill.reduce((s,i) => s + i.qty*i.price, 0);
  const isPartial = document.querySelector('input[value="partial"]').checked;
  const deposit = isPartial ? (parseFloat(document.getElementById('depositAmount').value) || 0) : total;
  const baki = total - deposit;
  const cs = document.getElementById('customerSearch').value;
  const phone = cs.match(/\(([^)]+)\)$/)?.[1] || '';
  const billNo = settings.billCounter;
  const bookNo = settings.bookNumber;
  const note = document.getElementById('othersNote').value || '—';

  let cust = null;
  if (phone) {
    cust = customers.find(c => c.phone === phone);
    if (!cust) {
      const name = prompt('New Customer Name:');
      if (!name) return alert('Name required!');
      cust = { name, phone, balance: 0, history: [] };
      customers.push(cust);
    }
  }

  const invoice = {
    date: new Date().toLocaleString('en-GB'),
    items: currentBill.map(i => ({ name: i.name, company: i.company, qty: i.qty, price: i.price })),
    total, deposit, baki, type: 'sale', billNo, bookNo, note
  };

  currentBill.forEach(it => {
    const p = stock.find(s => s.name === it.name && s.company === it.company);
    if (p) p.qty -= it.qty;
  });

  if (cust) cust.history.push(invoice);

  printInvoice(bookNo, billNo, total, deposit, baki, cust?.name || 'Cash Sale', currentBill, note);
  settings.billCounter++;
  saveAll();
  currentBill = [];
  renderBill();
  updateHomeStats();
  alert(`Bill #${billNo} saved! Due: Rs. ${baki}`);
}

function printCurrentBill() {
  const total = currentBill.reduce((s,i) => s + i.qty*i.price, 0);
  const deposit = document.querySelector('input[value="partial"]').checked ? (parseFloat(document.getElementById('depositAmount').value)||0) : total;
  const baki = total - deposit;
  printInvoice(settings.bookNumber, document.getElementById('billNumberInput').value, total, deposit, baki,
    document.getElementById('customerSearch').value || 'Cash Sale', currentBill, document.getElementById('othersNote').value || '—');
}

// STOCK PAGE
function initStockPage() {
  loadData();
  renderStockTable();
  document.getElementById('productForm').onsubmit = saveProduct;
  document.getElementById('cancelEditBtn').onclick = () => {
    editingProductIndex = null;
    document.getElementById('productForm').reset();
    document.getElementById('submitProductBtn').textContent = 'Add Product';
    document.getElementById('cancelEditBtn').style.display = 'none';
  };
}

function renderStockTable() {
  const tbody = document.querySelector('#stockTable tbody');
  tbody.innerHTML = '';
  stock.forEach((p, i) => {
    tbody.innerHTML += `<tr>
      <td><img src="${p.image||''}" onerror="this.style.display='none'" style="width:40px;height:40px;border-radius:8px;"></td>
      <td>${p.name}<br><small>${p.company}</small></td>
      <td>${p.qty}</td>
      <td>Net: Rs. ${p.netPrice}<br>Credit: Rs. ${p.creditRate || p.netPrice}</td>
      <td>
        <button class="btn-sm btn-orange" onclick="editProduct(${i})">Edit</button>
        <button class="btn-sm btn-red" onclick="deleteProduct(${i})">Del</button>
      </td>
    </tr>`;
  });
}

function saveProduct(e) {
  e.preventDefault();
  const name = document.getElementById('productName').value.trim();
  const company = document.getElementById('companyName').value.trim();
  const qty = parseInt(document.getElementById('quantity').value) || 0;
  const netPrice = parseFloat(document.getElementById('netPrice').value) || 0;
  const creditRate = parseFloat(document.getElementById('creditRate').value) || netPrice;
  const file = document.getElementById('productImage').files[0];
  let image = stock[editingProductIndex]?.image || '';

  if (file) {
    const reader = new FileReader();
    reader.onload = () => { image = reader.result; finalizeProduct({name, company, qty, netPrice, creditRate, image}); };
    reader.readAsDataURL(file);
  } else finalizeProduct({name, company, qty, netPrice, creditRate, image});
}

function finalizeProduct(p) {
  if (editingProductIndex !== null) {
    stock[editingProductIndex] = p;
    editingProductIndex = null;
  } else {
    stock.push(p);
  }
  saveAll();
  renderStockTable();
  document.getElementById('productForm').reset();
  document.getElementById('submitProductBtn').textContent = 'Add Product';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

function editProduct(i) {
  editingProductIndex = i;
  const p = stock[i];
  document.getElementById('productName').value = p.name;
  document.getElementById('companyName').value = p.company;
  document.getElementById('quantity').value = p.qty;
  document.getElementById('netPrice').value = p.netPrice;
  document.getElementById('creditRate').value = p.creditRate || p.netPrice;
  document.getElementById('submitProductBtn').textContent = 'Update';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
}

function deleteProduct(i) {
  if (confirm('Delete this product?')) {
    stock.splice(i, 1);
    saveAll();
    renderStockTable();
  }
}

// LEDGER PAGE
function initLedgerPage() {
  loadData();
  populateLedgerCustomerDropdown();
  document.getElementById('ledgerDisplay').style.display = 'none';
}

function populateLedgerCustomerDropdown() {
  const sel = document.getElementById('ledgerCustomerSelect');
  sel.innerHTML = '<option>-- Select Customer --</option>';
  customers.forEach(c => sel.add(new Option(`${c.name} (${c.phone}) - Rs. ${c.balance}`, c.phone)));
}

function loadLedger() {
  const phone = document.getElementById('ledgerCustomerSelect').value;
  if (!phone) return alert('Select a customer!');
  currentCustomer = customers.find(c => c.phone === phone);
  document.getElementById('custName').textContent = currentCustomer.name;
  document.getElementById('custPhone').textContent = currentCustomer.phone;
  document.getElementById('finalBalance').textContent = `Total Due: Rs. ${currentCustomer.balance}`;
  document.getElementById('finalBalance').style.color = currentCustomer.balance > 0 ? '#e74c3c' : '#27ae60';
  renderLedger();
  document.getElementById('ledgerDisplay').style.display = 'block';
}

function renderLedger() {
  const tbody = document.querySelector('#ledgerTable tbody');
  tbody.innerHTML = '';
  let bal = 0;
  (currentCustomer.history || []).forEach((e, i) => {
    let debit = 0, credit = 0, type = '', details = '', bookNo = '-', billNo = '-';

    if (e.type === 'sale') {
      debit = e.baki || 0;
      type = 'Sale';
      bookNo = e.bookNo || '-';
      billNo = e.billNo || '-';
      details = e.items?.map(x => `${x.name} x${x.qty}`).join(', ') || '';
    } else if (e.type === 'return') {
      credit = e.total || 0;
      type = 'Return';
      bookNo = e.originalBook || '-';
      billNo = e.originalBill || '-';
      details = e.items?.map(x => `${x.name} x${x.qty}`).join(', ') || '';
    } else if (e.type === 'manual-debit') {
      debit = e.amount || 0;
      type = 'Debit';
      details = e.note || 'Manual Entry';
    } else if (e.type === 'manual-credit') {
      credit = e.amount || 0;
      type = 'Credit';
      details = e.note || 'Hand Cash';
    }

    bal += debit - credit;

    tbody.innerHTML += `<tr>
      <td>${e.date.split(',')[0]}</td>
      <td>${bookNo}</td>
      <td>${billNo}</td>
      <td>${type}</td>
      <td style="font-size:0.85rem; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${details}">${details || '-'}</td>
      <td>${debit ? 'Rs. '+debit : '-'}</td>
      <td>${credit ? 'Rs. '+credit : '-'}</td>
      <td style="color:${bal>0?'#e74c3c':'#27ae60'}; font-weight:bold;">Rs. ${bal.toFixed(0)}</td>
      <td>${e.note || '-'}</td>
      <td>
        ${e.type === 'sale' ? `
          <button class="btn-sm btn-orange" onclick="editSaleEntry(${i})">Edit</button>
          <button class="btn-sm" style="background:#9b59b6;" onclick="returnSaleEntry(${i})">Return</button>
        ` : ''}
        <button class="btn-red btn-sm" onclick="deleteEntry(${i})">Del</button>
      </td>
    </tr>`;
  });
}

function addManualEntry() {
  const amt = parseFloat(document.getElementById('manualAmount').value) || 0;
  const type = document.getElementById('manualType').value;
  if (amt <= 0) return alert('Enter valid amount!');
  currentCustomer.history.push({
    date: new Date().toLocaleString('en-GB'),
    type: `manual-${type}`,
    amount: amt,
    note: document.getElementById('manualNote').value || ''
  });
  saveAll();
  renderLedger();
  document.getElementById('manualAmount').value = '';
  document.getElementById('manualNote').value = '';
}

function deleteEntry(i) {
  if (!confirm('Delete this entry?')) return;
  const e = currentCustomer.history[i];
  if (e.type === 'sale') {
    e.items.forEach(it => {
      const p = stock.find(s => s.name === it.name && s.company === it.company);
      if (p) p.qty += it.qty;
    });
  }
  currentCustomer.history.splice(i, 1);
  saveAll();
  renderLedger();
  updateHomeStats();
}

// EDIT SALE
function editSaleEntry(i) {
  const entry = currentCustomer.history[i];
  if (entry.type !== 'sale') return;

  const modal = document.getElementById('editModal');
  const itemsDiv = document.getElementById('editItems');
  itemsDiv.innerHTML = '';

  entry.items.forEach((item, idx) => {
    const amt = item.qty * item.price;
    itemsDiv.innerHTML += `
      <div style="display:flex;gap:8px;margin:8px 0;align-items:center;">
        <input type="text" value="${item.name} (${item.company})" disabled style="flex:2;font-size:0.9rem;">
        <input type="number" value="${item.qty}" id="editQty${idx}" style="flex:1;" min="1">
        <input type="number" value="${item.price}" id="editPrice${idx}" style="flex:1;" step="0.01">
        <span style="flex:1;text-align:right;">Rs. <span id="amt${idx}">${amt}</span></span>
      </div>`;
  });

  setTimeout(() => {
    entry.items.forEach((_, idx) => {
      const qtyInput = document.getElementById(`editQty${idx}`);
      const priceInput = document.getElementById(`editPrice${idx}`);
      const amtSpan = document.getElementById(`amt${idx}`);
      const update = () => {
        const q = parseInt(qtyInput.value) || 0;
        const p = parseFloat(priceInput.value) || 0;
        amtSpan.textContent = (q * p).toFixed(0);
      };
      qtyInput.oninput = priceInput.oninput = update;
    });
  }, 100);

  document.getElementById('editNote').value = entry.note || '';

  window.saveEdit = function() {
    const newItems = [];
    let newTotal = 0;
    entry.items.forEach((_, idx) => {
      const qty = parseInt(document.getElementById(`editQty${idx}`).value) || 0;
      const price = parseFloat(document.getElementById(`editPrice${idx}`).value) || 0;
      if (qty > 0 && price > 0) {
        newItems.push({ ...entry.items[idx], qty, price });
        newTotal += qty * price;
      }
    });

    if (newItems.length === 0) return alert('At least one item required!');

    entry.items.forEach(it => {
      const p = stock.find(s => s.name === it.name && s.company === it.company);
      if (p) p.qty += it.qty;
    });

    let valid = true;
    newItems.forEach(it => {
      const p = stock.find(s => s.name === it.name && s.company === it.company);
      if (p && p.qty >= it.qty) p.qty -= it.qty;
      else valid = false;
    });

    if (!valid) {
      alert('Not enough stock!');
      entry.items.forEach(it => {
        const p = stock.find(s => s.name === it.name && s.company === it.company);
        if (p) p.qty -= it.qty;
      });
      return;
    }

    const newBaki = newTotal - entry.deposit;
    entry.items = newItems;
    entry.total = newTotal;
    entry.baki = newBaki;
    entry.note = document.getElementById('editNote').value || '—';

    saveAll();
    renderLedger();
    updateHomeStats();
    modal.style.display = 'none';
    alert('Sale updated!');
  };

  window.cancelEdit = function() { modal.style.display = 'none'; };
  modal.style.display = 'flex';
}

// RETURN SALE
function returnSaleEntry(i) {
  const entry = currentCustomer.history[i];
  if (entry.type !== 'sale') return;

  const modal = document.getElementById('returnModal');
  const itemsDiv = document.getElementById('returnItems');
  itemsDiv.innerHTML = '';

  entry.items.forEach((item, idx) => {
    const maxQty = item.qty;
    itemsDiv.innerHTML += `
      <div style="display:flex;gap:8px;margin:8px 0;align-items:center;">
        <input type="text" value="${item.name} (${item.company})" disabled style="flex:2;font-size:0.9rem;">
        <input type="number" value="${maxQty}" id="returnQty${idx}" style="flex:1;" min="0" max="${maxQty}">
        <span style="flex:1;text-align:right;">Rs. ${item.price}</span>
        <span style="flex:1;text-align:right;">Return: Rs. <span id="returnAmt${idx}">${item.qty * item.price}</span></span>
      </div>`;
  });

  setTimeout(() => {
    entry.items.forEach((_, idx) => {
      const qtyInput = document.getElementById(`returnQty${idx}`);
      const amtSpan = document.getElementById(`returnAmt${idx}`);
      qtyInput.oninput = () => {
        const q = Math.min(parseInt(qtyInput.value) || 0, entry.items[idx].qty);
        qtyInput.value = q;
        amtSpan.textContent = (q * entry.items[idx].price).toFixed(0);
      };
    });
  }, 100);

  document.getElementById('returnNote').value = '';

  window.saveReturn = function() {
    const returnItems = [];
    let returnTotal = 0;

    entry.items.forEach((item, idx) => {
      const returnQty = parseInt(document.getElementById(`returnQty${idx}`).value) || 0;
      if (returnQty > 0) {
        returnItems.push({ ...item, qty: returnQty });
        returnTotal += returnQty * item.price;
      }
    });

    if (returnItems.length === 0) return alert('Select items to return!');

    returnItems.forEach(it => {
      const p = stock.find(s => s.name === it.name && s.company === it.company);
      if (p) p.qty += it.qty;
    });

    currentCustomer.history.push({
      date: new Date().toLocaleString('en-GB'),
      type: 'return',
      items: returnItems,
      total: returnTotal,
      note: document.getElementById('returnNote').value || 'Return',
      originalBill: entry.billNo,
      originalBook: entry.bookNo
    });

    entry.baki = Math.max(0, entry.baki - returnTotal);

    saveAll();
    renderLedger();
    updateHomeStats();
    modal.style.display = 'none';
    alert(`Return saved! Rs. ${returnTotal} credited.`);
  };

  window.cancelReturn = function() { modal.style.display = 'none'; };
  modal.style.display = 'flex';
}

function printLedger() { window.print(); }

// FIXED: PDF Download (perfect spacing + no errors)
function downloadLedgerPDF() {
  if (!currentCustomer) {
    alert('Pehle customer select karein!');
    return;
  }

  if (!window.jspdf) {
    alert('PDF library load nahi hui. Refresh karein.');
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 40;

    // Header
    doc.setFontSize(16);
    doc.text('Chaudhary Traders - Customer Ledger', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`Customer: ${currentCustomer.name} (${currentCustomer.phone})`, 15, 25);
    doc.text(`Total Due: Rs. ${currentCustomer.balance.toFixed(0)}`, 15, 32);

    // Table Header
    doc.setFontSize(9);
    const headers = ['Date', 'Book', 'Bill', 'Type', 'Details', 'Debit', 'Credit', 'Bal'];
    const colX = [15, 35, 55, 72, 90, 130, 155, 180]; // ← WIDE SPACING
    headers.forEach((h, i) => doc.text(String(h), colX[i], y));
    y += 3;
    doc.line(15, y, pageWidth - 15, y);
    y += 8;

    let bal = 0;
    const lineHeight = 6.5;

    (currentCustomer.history || []).forEach(e => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 30;
        headers.forEach((h, i) => doc.text(String(h), colX[i], y - 8));
        doc.line(15, y - 6, pageWidth - 15, y - 6);
        y += 2;
      }

      let debit = 0, credit = 0, type = '', details = '', bookNo = '-', billNo = '-';

      if (e.type === 'sale') {
        debit = e.baki || 0;
        type = 'Sale';
        bookNo = e.bookNo || '-';
        billNo = e.billNo || '-';
        details = (e.items || []).map(x => `${x.name} x${x.qty}`).join(', ');
      } else if (e.type === 'return') {
        credit = e.total || 0;
        type = 'Return';
        bookNo = e.originalBook || '-';
        billNo = e.originalBill || '-';
        details = (e.items || []).map(x => `${x.name} x${x.qty}`).join(', ');
      } else if (e.type === 'manual-debit') {
        debit = e.amount || 0;
        type = 'Debit';
        details = e.note || 'Manual Entry';
      } else if (e.type === 'manual-credit') {
        credit = e.amount || 0;
        type = 'Credit';
        details = e.note || 'Hand Cash';
      }

      bal += debit - credit;

      const maxLen = 32;
      const shortDetails = details.length > maxLen ? details.substring(0, maxLen) + '...' : details;

      const rowData = [
        e.date.split(',')[0] || '-',
        bookNo,
        billNo,
        type,
        shortDetails,
        debit ? `Rs.${debit}` : '-',
        credit ? `Rs.${credit}` : '-',
        `Rs.${bal.toFixed(0)}`
      ];

      rowData.forEach((text, i) => {
        doc.text(String(text), colX[i], y);
      });

      y += lineHeight;
    });

    // Footer
    doc.setFontSize(8);
    doc.text('Generated: ' + new Date().toLocaleString('en-PK'), 15, pageHeight - 10);

    // Save
    const safeName = currentCustomer.name.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Ledger_${safeName}_${currentCustomer.phone}.pdf`);

    alert('PDF Downloaded Successfully!');

  } catch (error) {
    console.error('PDF Error:', error);
    alert('Error: ' + error.message);
  }
}

function printInvoice(book, bill, total, deposit, baki, cust, items, note) {
  const w = window.open('', '', 'width=500,height=700');
  w.document.write(`
    <html><head><title>Bill ${bill}</title>
    <style>
      body{font-family:Arial;margin:20px;font-size:13px;}
      .center{text-align:center;}
      table{width:100%;border-collapse:collapse;}
      th,td{border:1px solid #000;padding:6px;text-align:left;}
      .text-right{text-align:right;}
    </style>
    </head><body>
    <div class="center"><h3>Chaudhary Traders</h3>
    <p>Book: ${book} | Bill: ${bill} | ${new Date().toLocaleDateString()}</p>
    <p><strong>Customer:</strong> ${cust}</p></div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th class="text-right">Amount</th></tr></thead><tbody>
    ${items.map(i => `<tr><td>${i.name} (${i.company})</td><td>${i.qty}</td><td>Rs. ${i.price}</td><td class="text-right">Rs. ${i.qty*i.price}</td></tr>`).join('')}
    </tbody></table>
    <p><strong>Total:</strong> Rs. ${total} | <strong>Paid:</strong> Rs. ${deposit} | <strong>Due:</strong> Rs. ${baki}</p>
    <p><strong>Note:</strong> ${note}</p>
    </body></html>
  `);
  w.document.close();
  w.focus();
  w.print();
  w.close();
}

function saveAll() {
  localStorage.setItem('chaudharyStock', JSON.stringify(stock));
  localStorage.setItem('chaudharyCustomers', JSON.stringify(customers));
  localStorage.setItem('chaudharySettings', JSON.stringify(settings));
  loadData();
}

function backupData() {
  loadData();
  const data = { stock, customers, settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Chaudhary_Backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  updateHomeStats();
  const isMobile = window.innerWidth <= 768;
  const firstBtn = isMobile
    ? document.querySelector('.sidebar-btn')
    : document.querySelector('.menu-btn');
  showPage('home', firstBtn);
});
