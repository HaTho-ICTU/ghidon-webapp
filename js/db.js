/**
 * IndexedDB wrapper for offline storage.
 * Schema matches the desktop SQLite database.
 */
const DB = (() => {
  const DB_NAME = 'ghidon_db';
  const DB_VERSION = 2;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;

        // Regions
        if (!d.objectStoreNames.contains('regions')) {
          d.createObjectStore('regions', { keyPath: 'id' });
        }

        // Customers
        if (!d.objectStoreNames.contains('customers')) {
          const cs = d.createObjectStore('customers', { keyPath: 'id' });
          cs.createIndex('region_id', 'region_id', { unique: false });
          cs.createIndex('name', 'name', { unique: false });
        }

        // Products
        if (!d.objectStoreNames.contains('products')) {
          const ps = d.createObjectStore('products', { keyPath: 'id' });
          ps.createIndex('name', 'name', { unique: false });
        }

        // Product prices
        if (!d.objectStoreNames.contains('product_prices')) {
          const pp = d.createObjectStore('product_prices', { keyPath: 'id' });
          pp.createIndex('product_id', 'product_id', { unique: false });
        }

        // Invoices (use auto-generated string temp_id as key)
        if (!d.objectStoreNames.contains('invoices')) {
          const inv = d.createObjectStore('invoices', { keyPath: 'temp_id' });
          inv.createIndex('created_date', 'created_date', { unique: false });
          inv.createIndex('customer_id', 'customer_id', { unique: false });
        }

        // Employees (v2)
        if (!d.objectStoreNames.contains('employees')) {
          const emp = d.createObjectStore('employees', { keyPath: 'id' });
          emp.createIndex('username', 'username', { unique: true });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeName, mode) {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Generic CRUD
  async function getAll(storeName) {
    await open();
    return promisify(tx(storeName, 'readonly').getAll());
  }

  async function get(storeName, key) {
    await open();
    return promisify(tx(storeName, 'readonly').get(key));
  }

  async function put(storeName, data) {
    await open();
    return promisify(tx(storeName, 'readwrite').put(data));
  }

  async function del(storeName, key) {
    await open();
    return promisify(tx(storeName, 'readwrite').delete(key));
  }

  async function clear(storeName) {
    await open();
    return promisify(tx(storeName, 'readwrite').clear());
  }

  async function bulkPut(storeName, items) {
    await open();
    const store = tx(storeName, 'readwrite');
    return Promise.all(items.map((item) => promisify(store.put(item))));
  }

  async function getByIndex(storeName, indexName, value) {
    await open();
    return promisify(tx(storeName, 'readonly').index(indexName).getAll(value));
  }

  // === Domain-specific helpers ===

  // Regions
  const regions = {
    getAll: () => getAll('regions'),
    importAll: (data) => bulkPut('regions', data),
    clear: () => clear('regions'),
  };

  // Customers
  const customers = {
    getAll: () => getAll('customers'),
    get: (id) => get('customers', id),
    search: async (keyword) => {
      const all = await getAll('customers');
      if (!keyword) return all;
      const kw = keyword.toLowerCase();
      return all.filter((c) =>
        c.name.toLowerCase().includes(kw) ||
        (c.phone && c.phone.includes(kw)) ||
        (c.address && c.address.toLowerCase().includes(kw))
      );
    },
    importAll: async (data) => {
      await clear('customers');
      if (data.length) await bulkPut('customers', data);
    },
    clear: () => clear('customers'),
    count: async () => (await getAll('customers')).length,
  };

  // Products (with extra prices merged)
  const products = {
    getAll: async () => {
      const prods = await getAll('products');
      const prices = await getAll('product_prices');
      const priceMap = {};
      for (const p of prices) {
        if (!priceMap[p.product_id]) priceMap[p.product_id] = [];
        priceMap[p.product_id].push(p);
      }
      return prods.map((p) => ({
        ...p,
        extra_prices: priceMap[p.id] || [],
      }));
    },
    get: async (id) => {
      const p = await get('products', id);
      if (!p) return null;
      p.extra_prices = await getByIndex('product_prices', 'product_id', id);
      return p;
    },
    search: async (keyword) => {
      const all = await products.getAll();
      if (!keyword) return all;
      const kw = keyword.toLowerCase();
      return all.filter((p) => p.name.toLowerCase().includes(kw));
    },
    importAll: async (prodsData, pricesData) => {
      await clear('products');
      await clear('product_prices');
      if (prodsData.length) await bulkPut('products', prodsData);
      if (pricesData.length) await bulkPut('product_prices', pricesData);
    },
    clear: async () => { await clear('products'); await clear('product_prices'); },
    count: async () => (await getAll('products')).length,
  };

  // Invoices
  const invoices = {
    getAll: async () => {
      const all = await getAll('invoices');
      all.sort((a, b) => b.created_date.localeCompare(a.created_date));
      return all;
    },
    get: (tempId) => get('invoices', tempId),
    save: (invoice) => put('invoices', invoice),
    delete: (tempId) => del('invoices', tempId),
    getToday: async () => {
      const all = await getAll('invoices');
      const today = new Date().toISOString().slice(0, 10);
      return all
        .filter((inv) => inv.created_date.slice(0, 10) === today)
        .sort((a, b) => b.created_date.localeCompare(a.created_date));
    },
    getByDateRange: async (startDate, endDate) => {
      const all = await getAll('invoices');
      return all
        .filter((inv) => {
          const d = inv.created_date.slice(0, 10);
          return d >= startDate && d <= endDate;
        })
        .sort((a, b) => b.created_date.localeCompare(a.created_date));
    },
    clear: () => clear('invoices'),
    count: async () => (await getAll('invoices')).length,
    generateTempId: () => 'web_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
  };

  // Employees
  const employees = {
    getAll: () => getAll('employees'),
    get: (id) => get('employees', id),
    getByUsername: async (username) => {
      const all = await getAll('employees');
      return all.find((e) => e.username === username) || null;
    },
    importAll: async (data) => {
      await clear('employees');
      if (data.length) await bulkPut('employees', data);
    },
    clear: () => clear('employees'),
    count: async () => (await getAll('employees')).length,
  };

  return { open, regions, customers, products, invoices, employees };
})();
