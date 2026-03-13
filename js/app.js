/**
 * Main app: routing, navigation, initialization.
 */
const App = (() => {
  let currentPage = 'invoice';

  const PAGE_TITLES = {
    invoice: 'Ghi đơn',
    orders: 'Đơn hàng',
    sync: 'Đồng bộ'
  };

  function showApp() {
    document.getElementById('app-header').classList.remove('hidden');
    document.getElementById('bottom-nav').classList.remove('hidden');
    document.getElementById('app-content').classList.remove('no-auth');
    updateHeaderEmployee();
  }

  function hideApp() {
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('app-content').classList.add('no-auth');
  }

  function updateHeaderEmployee() {
    const emp = Auth.getEmployee();
    const el = document.getElementById('header-employee');
    if (el && emp) {
      el.textContent = emp.name;
      el.classList.remove('hidden');
    }
  }

  function navigate(page) {
    // Allow sync page without login (for initial data download)
    if (page !== 'sync' && !Auth.isLoggedIn()) {
      checkAuth();
      return;
    }

    currentPage = page;
    const content = document.getElementById('app-content');
    const title = document.getElementById('header-title');
    title.textContent = PAGE_TITLES[page] || '';

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Scroll to top
    content.scrollTop = 0;
    window.scrollTo(0, 0);

    // Render page
    switch (page) {
      case 'invoice':
        Invoice.render(content);
        break;
      case 'orders':
        Sync.renderOrders(content);
        break;
      case 'sync':
        Sync.render(content);
        break;
    }
  }

  async function checkAuth() {
    const content = document.getElementById('app-content');

    // Check if employees exist
    const hasEmp = await Auth.hasEmployees();
    if (!hasEmp) {
      // No employees yet - show sync page to download data
      hideApp();
      // Show header and nav for sync access
      document.getElementById('app-header').classList.remove('hidden');
      document.getElementById('bottom-nav').classList.remove('hidden');
      document.getElementById('app-content').classList.remove('no-auth');
      Auth.renderNoEmployees(content);
      return;
    }

    // Already logged in?
    if (Auth.isLoggedIn()) {
      showApp();
      navigate('invoice');
      return;
    }

    // Show login screen
    hideApp();
    Auth.renderLogin(content, (emp) => {
      showApp();
      navigate('invoice');
      UI.toast(`Xin chào ${emp.name}!`);
    });
  }

  function doLogout() {
    Auth.logout();
    Invoice.reset();
    checkAuth();
  }

  async function init() {
    // Open database
    await DB.open();

    // Setup navigation
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', doLogout);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // Start cloud auto-sync (retry pending orders when online)
    Cloud.startAutoSync();

    // Auto-sync pending orders on startup if online
    if (navigator.onLine && Cloud.isConfigured()) {
      Cloud.syncPendingOrders().then((result) => {
        if (result.synced > 0) {
          UI.toast(`Đã đồng bộ ${result.synced} đơn lên cloud`);
        }
      });
    }

    // Check auth before showing app
    await checkAuth();
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);

  return { navigate, doLogout, checkAuth };
})();
