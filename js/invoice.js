/**
 * Invoice creation and editing logic.
 */
const Invoice = (() => {
  // Current invoice state
  let selectedCustomer = null;
  let isGuest = false;
  let items = []; // [{product_id, product_name, quantity, price, subtotal, unit, item_type, note}]
  let editingInvoice = null; // temp_id if editing

  function reset() {
    selectedCustomer = null;
    isGuest = false;
    items = [];
    editingInvoice = null;
  }

  // === Render the invoice creation page ===
  function render(container, invoice) {
    reset();
    if (invoice) {
      editingInvoice = invoice.temp_id;
      selectedCustomer = invoice.customer_id ? { id: invoice.customer_id, name: invoice.customer_name } : null;
      isGuest = !invoice.customer_id;
      items = (invoice.details || []).map((d) => ({ ...d }));
    }

    container.innerHTML = `
      <!-- Customer selection -->
      <div class="card">
        <div class="card-title">Khach hang</div>
        <div id="customer-section">
          ${renderCustomerSection()}
        </div>
      </div>

      <!-- Add product -->
      <div class="card">
        <div class="card-title">Them san pham</div>
        <div class="form-group search-wrapper">
          <input type="text" class="form-input" id="product-search" placeholder="Tim san pham..." autocomplete="off">
          <div class="search-results" id="product-results"></div>
        </div>
        <div id="product-form" class="hidden">
          <div id="selected-product-name" style="font-weight:600;margin-bottom:8px;"></div>
          <div class="form-group">
            <label class="form-label">Chon gia</label>
            <div class="price-options" id="price-options"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Gia tuy chinh</label>
            <input type="number" class="form-input" id="custom-price" placeholder="Nhap gia..." inputmode="numeric">
          </div>
          <div class="form-group">
            <label class="form-label">So luong</label>
            <div class="qty-control">
              <button class="qty-btn" id="qty-minus">-</button>
              <input type="number" class="qty-input" id="qty-input" value="1" min="1" inputmode="numeric">
              <button class="qty-btn" id="qty-plus">+</button>
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="add-item-btn">Them vao don</button>
        </div>
        <div class="divider"></div>
        <div class="d-flex gap-8">
          <button class="btn btn-outline btn-sm" id="add-other-btn" style="flex:1;border-color:var(--amber);color:var(--amber);">Khac</button>
          <button class="btn btn-outline btn-sm" id="add-promo-btn" style="flex:1;border-color:var(--purple);color:var(--purple);">Khuyen mai</button>
        </div>
      </div>

      <!-- Item list -->
      <div class="card">
        <div class="card-title">Danh sach (<span id="item-count">0</span>)</div>
        <div id="item-list"></div>
        <div class="total-bar">
          <span class="total-label">Tong cong</span>
          <span class="total-amount" id="total-amount">0</span>
        </div>
      </div>

      <!-- Note -->
      <div class="card">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Ghi chu</label>
          <textarea class="note-input" id="invoice-note" rows="2" placeholder="Ghi chu cho don hang...">${invoice ? (invoice.note || '') : ''}</textarea>
        </div>
      </div>

      <!-- Save button -->
      <button class="btn btn-success btn-block mt-12" id="save-invoice-btn" style="margin-bottom:20px;">
        ${editingInvoice ? 'Cap nhat don' : 'Luu don hang'}
      </button>
    `;

    setupCustomerSearch();
    setupProductSearch();
    setupQuantityControls();
    setupAddItem();
    setupOtherItem();
    setupPromotion();
    setupSave();
    renderItems();

    // If editing with guest info
    if (invoice && isGuest) {
      const sec = document.getElementById('customer-section');
      sec.innerHTML = renderGuestForm(invoice.guest_name || '', invoice.guest_address || '');
    }
  }

  function renderCustomerSection() {
    if (selectedCustomer) {
      return `<div class="flex-between">
        <div>
          <div style="font-weight:600;">${selectedCustomer.name}</div>
          ${selectedCustomer.address ? `<div class="text-secondary" style="font-size:0.8rem;">${selectedCustomer.address}</div>` : ''}
        </div>
        <button class="btn btn-outline btn-xs" id="change-customer-btn">Doi</button>
      </div>`;
    }
    return `
      <div class="search-wrapper">
        <input type="text" class="form-input" id="customer-search" placeholder="Tim khach hang..." autocomplete="off">
        <div class="search-results" id="customer-results"></div>
      </div>
      <button class="btn btn-outline btn-sm btn-block mt-8" id="guest-btn">Khach la</button>
    `;
  }

  function renderGuestForm(name, address) {
    return `
      <div class="form-group">
        <label class="form-label">Ten khach la</label>
        <input type="text" class="form-input" id="guest-name" placeholder="Ten khach..." value="${name}">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Dia chi</label>
        <input type="text" class="form-input" id="guest-address" placeholder="Dia chi..." value="${address}">
      </div>
      <button class="btn btn-outline btn-xs mt-8" id="cancel-guest-btn">Chon khach co san</button>
    `;
  }

  // === Customer search ===
  function setupCustomerSearch() {
    const input = document.getElementById('customer-search');
    const results = document.getElementById('customer-results');
    const guestBtn = document.getElementById('guest-btn');
    const changeBtn = document.getElementById('change-customer-btn');

    if (input && results) {
      UI.autocomplete(input, results, DB.customers.search,
        (c) => ({
          html: c.name,
          sub: [c.address, c.phone].filter(Boolean).join(' - ')
        }),
        (c) => {
          selectedCustomer = c;
          isGuest = false;
          document.getElementById('customer-section').innerHTML = renderCustomerSection();
          setupCustomerSearch();
        }
      );
    }

    if (guestBtn) {
      guestBtn.onclick = () => {
        isGuest = true;
        selectedCustomer = null;
        document.getElementById('customer-section').innerHTML = renderGuestForm('', '');
        setupGuestCancel();
      };
    }

    if (changeBtn) {
      changeBtn.onclick = () => {
        selectedCustomer = null;
        isGuest = false;
        document.getElementById('customer-section').innerHTML = renderCustomerSection();
        setupCustomerSearch();
      };
    }
  }

  function setupGuestCancel() {
    const cancelBtn = document.getElementById('cancel-guest-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        isGuest = false;
        document.getElementById('customer-section').innerHTML = renderCustomerSection();
        setupCustomerSearch();
      };
    }
  }

  // === Product search & add ===
  let selectedProduct = null;
  let selectedPrice = null;

  function setupProductSearch() {
    const input = document.getElementById('product-search');
    const results = document.getElementById('product-results');

    UI.autocomplete(input, results, DB.products.search,
      (p) => ({
        html: p.name,
        sub: `${UI.formatCurrency(p.price)}/${p.unit}`
      }),
      (p) => {
        selectedProduct = p;
        selectedPrice = p.price;
        input.value = p.name;
        showProductForm(p);
      }
    );
  }

  function showProductForm(product) {
    const form = document.getElementById('product-form');
    form.classList.remove('hidden');
    document.getElementById('selected-product-name').textContent =
      `${product.name} (${product.unit})`;

    // Price options
    const priceDiv = document.getElementById('price-options');
    const prices = [{ price: product.price, note: 'Gia goc' }];
    if (product.extra_prices) {
      product.extra_prices.forEach((ep) => prices.push({ price: ep.price, note: ep.note || 'Gia khac' }));
    }

    priceDiv.innerHTML = prices.map((p, i) =>
      `<div class="price-chip ${i === 0 ? 'selected' : ''}" data-price="${p.price}">
        ${UI.formatCurrency(p.price)} ${p.note ? `<span class="text-secondary">(${p.note})</span>` : ''}
      </div>`
    ).join('');

    priceDiv.querySelectorAll('.price-chip').forEach((chip) => {
      chip.onclick = () => {
        priceDiv.querySelectorAll('.price-chip').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedPrice = parseInt(chip.dataset.price);
        document.getElementById('custom-price').value = '';
      };
    });

    document.getElementById('custom-price').value = '';
    document.getElementById('qty-input').value = '1';
  }

  function setupQuantityControls() {
    document.getElementById('qty-minus').onclick = () => {
      const input = document.getElementById('qty-input');
      const v = parseInt(input.value) || 1;
      if (v > 1) input.value = v - 1;
    };
    document.getElementById('qty-plus').onclick = () => {
      const input = document.getElementById('qty-input');
      const v = parseInt(input.value) || 0;
      input.value = v + 1;
    };
  }

  function setupAddItem() {
    document.getElementById('add-item-btn').onclick = () => {
      if (!selectedProduct) {
        UI.toast('Chon san pham truoc');
        return;
      }

      const customPrice = document.getElementById('custom-price').value;
      const price = customPrice ? parseInt(customPrice) : selectedPrice;
      const qty = parseInt(document.getElementById('qty-input').value) || 1;

      if (!price || price <= 0) {
        UI.toast('Gia khong hop le');
        return;
      }

      items.push({
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        unit: selectedProduct.unit,
        quantity: qty,
        price: price,
        subtotal: price * qty,
        item_type: 'product',
        note: ''
      });

      renderItems();
      // Reset product form
      selectedProduct = null;
      selectedPrice = null;
      document.getElementById('product-search').value = '';
      document.getElementById('product-form').classList.add('hidden');
      UI.toast('Da them');
    };
  }

  // === Add "Khác" (other) item ===
  function setupOtherItem() {
    document.getElementById('add-other-btn').onclick = () => {
      UI.showModal(`
        <div class="modal-title">Them muc khac</div>
        <div class="form-group">
          <label class="form-label">Ghi chu (doi tra, no, v.v.)</label>
          <input type="text" class="form-input" id="other-note" placeholder="Noi dung..." autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">So luong</label>
          <input type="number" class="form-input" id="other-qty" value="1" min="1" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Gia (+/- hoac so, VD: 50000, -30000)</label>
          <input type="text" class="form-input" id="other-price" value="0" inputmode="numeric">
        </div>
        <button class="btn btn-success btn-block mt-8" id="other-confirm">Them vao don</button>
      `);
      document.getElementById('other-note').focus();
      document.getElementById('other-confirm').onclick = () => {
        const note = document.getElementById('other-note').value.trim();
        if (!note) { UI.toast('Nhap ghi chu'); return; }
        const qty = parseInt(document.getElementById('other-qty').value) || 1;
        if (qty <= 0) { UI.toast('So luong khong hop le'); return; }
        let priceStr = document.getElementById('other-price').value.trim().replace(/,/g, '');
        let price = 0;
        if (priceStr.startsWith('+')) price = parseFloat(priceStr.slice(1)) || 0;
        else if (priceStr.startsWith('-')) price = -(parseFloat(priceStr.slice(1)) || 0);
        else price = parseFloat(priceStr) || 0;

        items.push({
          product_id: null,
          product_name: `[Khac] ${note}`,
          unit: '',
          quantity: qty,
          price: price,
          subtotal: price * qty,
          item_type: 'other',
          note: note
        });
        renderItems();
        UI.closeModal();
        UI.toast('Da them');
      };
    };
  }

  // === Add "Khuyến mại" (promotion) item ===
  function setupPromotion() {
    document.getElementById('add-promo-btn').onclick = () => {
      UI.showModal(`
        <div class="modal-title">Khuyen mai</div>
        <div class="form-group">
          <label class="form-label">So goi khuyen mai</label>
          <input type="number" class="form-input" id="promo-qty" value="1" min="1" inputmode="numeric" autofocus>
        </div>
        <button class="btn btn-success btn-block mt-8" id="promo-confirm">Xac nhan</button>
      `);
      document.getElementById('promo-qty').focus();
      document.getElementById('promo-confirm').onclick = () => {
        const qty = parseInt(document.getElementById('promo-qty').value) || 0;
        if (qty <= 0) { UI.toast('Nhap so luong hop le'); return; }
        items.push({
          product_id: null,
          product_name: `Khuyen mai ${qty} goi`,
          unit: '',
          quantity: qty,
          price: 0,
          subtotal: 0,
          item_type: 'other',
          note: `Khuyen mai ${qty} goi`
        });
        renderItems();
        UI.closeModal();
        UI.toast('Da them khuyen mai');
      };
    };
  }

  function renderItems() {
    const listEl = document.getElementById('item-list');
    const countEl = document.getElementById('item-count');
    const totalEl = document.getElementById('total-amount');

    countEl.textContent = items.length;

    if (items.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Chua co san pham nao</p></div>';
      totalEl.textContent = '0';
      return;
    }

    listEl.innerHTML = items.map((item, i) => {
      const isOther = item.item_type === 'other';
      let priceDisplay, subtotalDisplay;
      if (isOther) {
        if (item.price > 0) priceDisplay = '+' + UI.formatCurrency(item.price);
        else if (item.price < 0) priceDisplay = UI.formatCurrency(item.price);
        else priceDisplay = '0';
        subtotalDisplay = item.subtotal > 0 ? '+' + UI.formatCurrency(item.subtotal)
                        : item.subtotal < 0 ? UI.formatCurrency(item.subtotal) : '0';
      } else {
        priceDisplay = UI.formatCurrency(item.price);
        subtotalDisplay = UI.formatCurrency(item.subtotal);
      }
      const nameColor = isOther ? (item.price === 0 ? 'var(--purple)' : 'var(--amber)') : '';
      return `
      <div class="item-row">
        <div class="item-info">
          <div class="item-name" ${nameColor ? `style="color:${nameColor}"` : ''}>${item.product_name}</div>
          <div class="item-detail">${item.quantity} x ${priceDisplay}</div>
        </div>
        <div class="item-subtotal" ${isOther && item.price < 0 ? 'style="color:var(--red)"' : ''}>${subtotalDisplay}</div>
        <button class="item-delete" data-index="${i}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>`;
    }).join('');

    const total = items.reduce((s, it) => s + it.subtotal, 0);
    totalEl.textContent = UI.formatCurrency(total);

    // Delete handlers
    listEl.querySelectorAll('.item-delete').forEach((btn) => {
      btn.onclick = () => {
        items.splice(parseInt(btn.dataset.index), 1);
        renderItems();
      };
    });
  }

  // === Save invoice ===
  function setupSave() {
    document.getElementById('save-invoice-btn').onclick = async () => {
      // Validate
      if (!selectedCustomer && !isGuest) {
        UI.toast('Chon khach hang truoc');
        return;
      }
      if (isGuest) {
        const gn = document.getElementById('guest-name');
        if (!gn || !gn.value.trim()) {
          UI.toast('Nhap ten khach la');
          return;
        }
      }
      if (items.length === 0) {
        UI.toast('Them it nhat 1 san pham');
        return;
      }

      const total = items.reduce((s, it) => s + it.subtotal, 0);
      const note = document.getElementById('invoice-note').value.trim();

      const invoice = {
        temp_id: editingInvoice || DB.invoices.generateTempId(),
        customer_id: selectedCustomer ? selectedCustomer.id : null,
        customer_name: selectedCustomer ? selectedCustomer.name : null,
        guest_name: isGuest ? document.getElementById('guest-name').value.trim() : null,
        guest_address: isGuest ? (document.getElementById('guest-address')?.value.trim() || null) : null,
        created_date: editingInvoice
          ? (await DB.invoices.get(editingInvoice))?.created_date || UI.nowString()
          : UI.nowString(),
        total: total,
        note: note,
        details: items.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          price: it.price,
          subtotal: it.subtotal,
          item_type: it.item_type || 'product',
          note: it.note || '',
          unit: it.unit || ''
        }))
      };

      await DB.invoices.save(invoice);
      UI.toast(editingInvoice ? 'Da cap nhat don' : 'Da luu don hang');
      reset();
      // Navigate to orders page to see the saved invoice
      if (typeof App !== 'undefined') App.navigate('orders');
    };
  }

  // === Edit existing invoice ===
  async function edit(tempId) {
    const inv = await DB.invoices.get(tempId);
    if (!inv) { UI.toast('Khong tim thay don'); return; }
    // Load customer name if needed
    if (inv.customer_id && !inv.customer_name) {
      const c = await DB.customers.get(inv.customer_id);
      if (c) inv.customer_name = c.name;
    }
    if (typeof App !== 'undefined') {
      App.navigate('invoice');
      setTimeout(() => render(document.getElementById('app-content'), inv), 50);
    }
  }

  return { render, edit, reset };
})();
