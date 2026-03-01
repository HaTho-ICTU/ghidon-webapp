/**
 * Sync module: import master data, export orders.
 */
const Sync = (() => {

  // === Render sync page ===
  async function render(container) {
    const customerCount = await DB.customers.count();
    const productCount = await DB.products.count();
    const orderCount = await DB.invoices.count();

    container.innerHTML = `
      <!-- Current data stats -->
      <div class="card">
        <div class="card-title">Du lieu hien tai</div>
        <div class="sync-stat">
          <div class="stat-box">
            <div class="stat-number">${customerCount}</div>
            <div class="stat-label">Khach hang</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${productCount}</div>
            <div class="stat-label">San pham</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${orderCount}</div>
            <div class="stat-label">Don hang</div>
          </div>
        </div>
      </div>

      <!-- Import section -->
      <div class="card">
        <div class="card-title">Nhap du lieu tu may tinh</div>
        <p class="text-secondary mb-12" style="font-size:0.85rem;">
          Chon file JSON da xuat tu phan mem desktop (khach hang, san pham, gia).
        </p>
        <input type="file" id="import-file" accept=".json" class="hidden">
        <button class="btn btn-primary btn-block" id="import-btn">
          Chon file de nhap
        </button>
        <div id="import-status" class="mt-8" style="font-size:0.85rem;"></div>
      </div>

      <!-- Export section -->
      <div class="card">
        <div class="card-title">Xuat don hang ve may tinh</div>
        <p class="text-secondary mb-12" style="font-size:0.85rem;">
          Xuat tat ca don hang thanh file JSON de nhap vao phan mem desktop.
        </p>
        <div class="form-group">
          <label class="form-label">Tu ngay</label>
          <input type="date" class="form-input" id="export-start" value="${todayStr()}">
        </div>
        <div class="form-group">
          <label class="form-label">Den ngay</label>
          <input type="date" class="form-input" id="export-end" value="${todayStr()}">
        </div>
        <button class="btn btn-success btn-block" id="export-btn">
          Xuat don hang
        </button>
        <div id="export-status" class="mt-8" style="font-size:0.85rem;"></div>
      </div>

      <!-- Danger zone -->
      <div class="card">
        <div class="card-title" style="color:var(--red);">Xoa du lieu</div>
        <button class="btn btn-danger btn-outline btn-block btn-sm" id="clear-orders-btn" style="color:var(--red);border-color:var(--red);">
          Xoa tat ca don hang
        </button>
      </div>
    `;

    setupImport();
    setupExport();
    setupClear();
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // === Import master data ===
  function setupImport() {
    const fileInput = document.getElementById('import-file');
    const btn = document.getElementById('import-btn');
    const status = document.getElementById('import-status');

    btn.onclick = () => fileInput.click();

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        status.textContent = 'Dang doc file...';
        const text = await file.text();
        const data = JSON.parse(text);

        // Import regions
        if (data.regions && data.regions.length) {
          await DB.regions.clear();
          await DB.regions.importAll(data.regions);
        }

        // Import customers
        if (data.customers && data.customers.length) {
          await DB.customers.importAll(data.customers);
        }

        // Import products + prices
        if (data.products) {
          await DB.products.importAll(
            data.products || [],
            data.product_prices || []
          );
        }

        const cCount = data.customers ? data.customers.length : 0;
        const pCount = data.products ? data.products.length : 0;

        status.innerHTML = `<span style="color:var(--green);">Thanh cong! Da nhap ${cCount} khach hang, ${pCount} san pham.</span>`;
        UI.toast('Nhap du lieu thanh cong');

        // Update stat boxes
        setTimeout(() => Sync.render(document.getElementById('app-content')), 1500);
      } catch (err) {
        status.innerHTML = `<span style="color:var(--red);">Loi: ${err.message}</span>`;
        UI.toast('Loi khi nhap du lieu');
      }

      // Reset file input
      fileInput.value = '';
    };
  }

  // === Export orders ===
  function setupExport() {
    document.getElementById('export-btn').onclick = async () => {
      const startDate = document.getElementById('export-start').value;
      const endDate = document.getElementById('export-end').value;
      const status = document.getElementById('export-status');

      if (!startDate || !endDate) {
        UI.toast('Chon ngay truoc');
        return;
      }

      const invoices = await DB.invoices.getByDateRange(startDate, endDate);

      if (invoices.length === 0) {
        status.innerHTML = '<span style="color:var(--amber);">Khong co don hang nao trong khoang thoi gian nay.</span>';
        return;
      }

      const exportData = {
        exported_at: UI.nowString(),
        invoices: invoices.map((inv) => ({
          temp_id: inv.temp_id,
          customer_id: inv.customer_id,
          guest_name: inv.guest_name,
          guest_address: inv.guest_address,
          created_date: inv.created_date,
          total: inv.total,
          note: inv.note || '',
          details: (inv.details || []).map((d) => ({
            product_id: d.product_id,
            quantity: d.quantity,
            price: d.price,
            subtotal: d.subtotal,
            item_type: d.item_type || 'product',
            note: d.note || ''
          }))
        }))
      };

      // Download JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_${startDate}_${endDate}.json`;
      a.click();
      URL.revokeObjectURL(url);

      status.innerHTML = `<span style="color:var(--green);">Da xuat ${invoices.length} don hang.</span>`;
      UI.toast('Xuat don hang thanh cong');
    };
  }

  // === Clear orders ===
  function setupClear() {
    document.getElementById('clear-orders-btn').onclick = () => {
      UI.confirm('Xoa tat ca don hang da ghi?', async () => {
        await DB.invoices.clear();
        UI.toast('Da xoa tat ca don hang');
        Sync.render(document.getElementById('app-content'));
      });
    };
  }

  // === Orders list page ===
  async function renderOrders(container) {
    const invoices = await DB.invoices.getToday();
    const allInvoices = await DB.invoices.getAll();

    // Date filter
    container.innerHTML = `
      <div class="card">
        <div class="flex-between mb-8">
          <div class="card-title" style="margin-bottom:0;">Don hang hom nay</div>
          <button class="btn btn-outline btn-xs" id="show-all-orders">Tat ca (${allInvoices.length})</button>
        </div>
        <div id="orders-list">
          ${invoices.length === 0
            ? '<div class="empty-state"><p>Chua co don hang nao hom nay</p></div>'
            : invoices.map((inv) => renderOrderCard(inv)).join('')
          }
        </div>
      </div>
    `;

    bindOrderCards();

    document.getElementById('show-all-orders').onclick = () => {
      renderAllOrders(container);
    };
  }

  async function renderAllOrders(container) {
    const invoices = await DB.invoices.getAll();

    container.innerHTML = `
      <div class="card">
        <div class="flex-between mb-8">
          <div class="card-title" style="margin-bottom:0;">Tat ca don hang</div>
          <button class="btn btn-outline btn-xs" id="show-today-orders">Hom nay</button>
        </div>
        <div id="orders-list">
          ${invoices.length === 0
            ? '<div class="empty-state"><p>Chua co don hang nao</p></div>'
            : invoices.map((inv) => renderOrderCard(inv)).join('')
          }
        </div>
      </div>
    `;

    bindOrderCards();

    document.getElementById('show-today-orders').onclick = () => {
      renderOrders(container);
    };
  }

  function renderOrderCard(inv) {
    const name = inv.customer_name || inv.guest_name || 'Khach la';
    const isG = !inv.customer_id;
    const itemCount = inv.details ? inv.details.length : 0;

    return `
      <div class="order-card" data-id="${inv.temp_id}">
        <div class="order-header">
          <div>
            <span class="order-customer">${name}</span>
            ${isG ? ' <span class="guest-tag">Khach la</span>' : ''}
          </div>
          <span class="order-total">${UI.formatCurrency(inv.total)}</span>
        </div>
        <div class="order-meta">${itemCount} san pham &middot; ${UI.formatDate(inv.created_date)}</div>
      </div>
    `;
  }

  function bindOrderCards() {
    document.querySelectorAll('.order-card').forEach((card) => {
      card.onclick = () => showOrderDetail(card.dataset.id);
    });
  }

  async function showOrderDetail(tempId) {
    const inv = await DB.invoices.get(tempId);
    if (!inv) return;

    const name = inv.customer_name || inv.guest_name || 'Khach la';

    const detailsHtml = (inv.details || []).map((d) => `
      <div class="item-row">
        <div class="item-info">
          <div class="item-name">${d.product_name || 'San pham'}</div>
          <div class="item-detail">${d.quantity} x ${UI.formatCurrency(d.price)}</div>
        </div>
        <div class="item-subtotal">${UI.formatCurrency(d.subtotal)}</div>
      </div>
    `).join('');

    UI.showModal(`
      <div class="modal-title">${name}</div>
      <div class="text-secondary text-center mb-12" style="font-size:0.8rem;">${UI.formatDate(inv.created_date)}</div>
      ${inv.note ? `<div class="mb-12" style="font-size:0.85rem;"><b>Ghi chu:</b> ${inv.note}</div>` : ''}
      ${detailsHtml}
      <div class="total-bar">
        <span class="total-label">Tong cong</span>
        <span class="total-amount">${UI.formatCurrency(inv.total)}</span>
      </div>
      <div class="action-row">
        <button class="btn btn-outline" id="modal-edit-btn">Sua don</button>
        <button class="btn btn-danger" id="modal-delete-btn">Xoa</button>
      </div>
    `);

    document.getElementById('modal-edit-btn').onclick = () => {
      UI.closeModal();
      Invoice.edit(tempId);
    };

    document.getElementById('modal-delete-btn').onclick = () => {
      UI.confirm('Xoa don hang nay?', async () => {
        await DB.invoices.delete(tempId);
        UI.toast('Da xoa don hang');
        App.navigate('orders');
      });
    };
  }

  return { render, renderOrders };
})();
