/**
 * Cloud sync module - Supabase REST API client.
 * Handles uploading orders and downloading master data.
 */
const Cloud = (() => {
  // === Config - thay doi sau khi tao project Supabase ===
  const CONFIG = {
    url: 'https://ovepotgheizgqkhfgbgz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92ZXBvdGdoZWl6Z3FraGZnYmd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMzA4OTcsImV4cCI6MjA4ODkwNjg5N30.js6498uHHl_cqbXo_cWfosCeOmhNf7Bn2H_QocWx0bE',
  };

  function isConfigured() {
    return CONFIG.url && !CONFIG.url.includes('YOUR_PROJECT_ID');
  }

  function headers() {
    return {
      'apikey': CONFIG.anonKey,
      'Authorization': `Bearer ${CONFIG.anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  }

  function apiUrl(table, query) {
    return `${CONFIG.url}/rest/v1/${table}${query ? '?' + query : ''}`;
  }

  // === Upload order to cloud ===
  async function uploadOrder(invoice) {
    if (!isConfigured()) return { ok: false, error: 'Cloud chưa cấu hình' };

    try {
      // 1. Insert order header
      const orderData = {
        temp_id: invoice.temp_id,
        customer_id: invoice.customer_id || null,
        customer_name: invoice.customer_name || '',
        guest_name: invoice.guest_name || '',
        guest_address: invoice.guest_address || '',
        created_date: invoice.created_date,
        total: invoice.total || 0,
        note: invoice.note || '',
        created_by: invoice.created_by || '',
        synced_to_desktop: false,
      };

      const res = await fetch(apiUrl('cloud_orders'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const errText = await res.text();
        // Duplicate temp_id = already uploaded, treat as success
        if (res.status === 409 || errText.includes('duplicate')) {
          return { ok: true, duplicate: true };
        }
        throw new Error(errText);
      }

      const [savedOrder] = await res.json();

      // 2. Insert order details
      if (invoice.details && invoice.details.length > 0) {
        const detailsData = invoice.details.map((d) => ({
          order_id: savedOrder.id,
          product_id: d.product_id || null,
          product_name: d.product_name || '',
          quantity: d.quantity || 0,
          price: d.price || 0,
          subtotal: d.subtotal || 0,
          item_type: d.item_type || 'product',
          note: d.note || '',
        }));

        const detailRes = await fetch(apiUrl('cloud_order_details'), {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(detailsData),
        });

        if (!detailRes.ok) {
          console.warn('Cloud: lỗi lưu chi tiết đơn', await detailRes.text());
        }
      }

      return { ok: true };
    } catch (err) {
      console.error('Cloud upload error:', err);
      return { ok: false, error: err.message };
    }
  }

  // === Delete order from cloud ===
  async function deleteOrder(tempId) {
    if (!isConfigured()) return;

    try {
      await fetch(apiUrl('cloud_orders', `temp_id=eq.${encodeURIComponent(tempId)}`), {
        method: 'DELETE',
        headers: headers(),
      });
    } catch (err) {
      console.warn('Cloud delete error:', err);
    }
  }

  // === Sync pending orders (offline → cloud) ===
  async function syncPendingOrders() {
    if (!isConfigured()) return { synced: 0, failed: 0 };

    const allInvoices = await DB.invoices.getAll();
    const pending = allInvoices.filter((inv) => inv.cloud_status === 'pending');

    let synced = 0;
    let failed = 0;

    for (const inv of pending) {
      const result = await uploadOrder(inv);
      if (result.ok) {
        inv.cloud_status = 'synced';
        await DB.invoices.save(inv);
        synced++;
      } else {
        failed++;
      }
    }

    return { synced, failed };
  }

  // === Download master data from cloud ===
  async function downloadMasterData() {
    if (!isConfigured()) return { ok: false, error: 'Cloud chưa cấu hình' };

    try {
      const res = await fetch(
        apiUrl('cloud_master_data', 'data_type=eq.full_export&order=updated_at.desc&limit=1'),
        { headers: headers() }
      );

      if (!res.ok) throw new Error(await res.text());

      const rows = await res.json();
      if (!rows.length) return { ok: false, error: 'Chưa có dữ liệu trên cloud' };

      const data = rows[0].data;

      // Import vào IndexedDB (giống logic import file JSON hiện tại)
      if (data.regions && data.regions.length) {
        await DB.regions.clear();
        await DB.regions.importAll(data.regions);
      }

      if (data.customers && data.customers.length) {
        await DB.customers.importAll(data.customers);
      }

      if (data.products) {
        await DB.products.importAll(data.products || [], data.product_prices || []);
      }

      // Import employees
      if (data.employees && data.employees.length) {
        await DB.employees.importAll(data.employees);
      }

      return {
        ok: true,
        customers: data.customers ? data.customers.length : 0,
        products: data.products ? data.products.length : 0,
        employees: data.employees ? data.employees.length : 0,
        updated_at: rows[0].updated_at,
      };
    } catch (err) {
      console.error('Cloud download error:', err);
      return { ok: false, error: err.message };
    }
  }

  // === Check connection ===
  async function checkConnection() {
    if (!isConfigured()) return false;

    try {
      const res = await fetch(apiUrl('cloud_orders', 'limit=0'), {
        headers: headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // === Get pending count ===
  async function getPendingCount() {
    const allInvoices = await DB.invoices.getAll();
    return allInvoices.filter((inv) => inv.cloud_status === 'pending').length;
  }

  // === Auto-sync on network restore ===
  function startAutoSync() {
    if (!isConfigured()) return;

    window.addEventListener('online', async () => {
      console.log('Cloud: online - syncing pending orders...');
      const result = await syncPendingOrders();
      if (result.synced > 0) {
        UI.toast(`Đã đồng bộ ${result.synced} đơn lên cloud`);
      }
    });
  }

  return {
    isConfigured,
    uploadOrder,
    deleteOrder,
    syncPendingOrders,
    downloadMasterData,
    checkConnection,
    getPendingCount,
    startAutoSync,
    CONFIG,
  };
})();
