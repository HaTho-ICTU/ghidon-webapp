/**
 * Authentication module for webapp.
 * Handles login, session, and SHA-256 password hashing.
 */
const Auth = (() => {
  const SESSION_KEY = 'ghidon_session';
  let currentEmployee = null;

  /**
   * Hash password using SHA-256 (matches Python's hashlib.sha256).
   */
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Attempt login with username and password.
   * Returns employee object if success, null if fail.
   */
  async function login(username, password) {
    const emp = await DB.employees.getByUsername(username);
    if (!emp) return null;
    if (!emp.active) return null;

    const hash = await hashPassword(password);
    if (hash !== emp.password_hash) return null;

    currentEmployee = emp;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: emp.id,
      name: emp.name,
      username: emp.username,
    }));
    return emp;
  }

  /**
   * Logout current employee.
   */
  function logout() {
    currentEmployee = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  /**
   * Get current logged-in employee.
   */
  function getEmployee() {
    if (currentEmployee) return currentEmployee;

    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        currentEmployee = JSON.parse(saved);
        return currentEmployee;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    return null;
  }

  /**
   * Check if user is logged in.
   */
  function isLoggedIn() {
    return getEmployee() !== null;
  }

  /**
   * Check if employees exist in database.
   */
  async function hasEmployees() {
    const count = await DB.employees.count();
    return count > 0;
  }

  /**
   * Render login screen.
   */
  function renderLogin(container, onSuccess) {
    container.innerHTML = `
      <div class="login-wrapper">
        <div class="login-card">
          <div class="login-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--blue)" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h2 class="login-title">Đăng nhập</h2>
          <p class="login-subtitle">Nhập tài khoản nhân viên để ghi đơn</p>
          <div class="form-group">
            <label class="form-label">Tài khoản</label>
            <input type="text" class="form-input" id="login-username" placeholder="Nhập tài khoản..." autocomplete="username" autocapitalize="off">
          </div>
          <div class="form-group">
            <label class="form-label">Mật khẩu</label>
            <input type="password" class="form-input" id="login-password" placeholder="Nhập mật khẩu..." autocomplete="current-password">
          </div>
          <div id="login-error" class="login-error hidden"></div>
          <button class="btn btn-primary btn-block" id="login-btn">Đăng nhập</button>
        </div>
      </div>
    `;

    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    async function doLogin() {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        errorEl.textContent = 'Vui lòng nhập tài khoản và mật khẩu';
        errorEl.classList.remove('hidden');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Đang đăng nhập...';
      errorEl.classList.add('hidden');

      const emp = await login(username, password);
      if (emp) {
        onSuccess(emp);
      } else {
        errorEl.textContent = 'Sai tài khoản hoặc mật khẩu';
        errorEl.classList.remove('hidden');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Đăng nhập';
        passwordInput.value = '';
        passwordInput.focus();
      }
    }

    loginBtn.onclick = doLogin;
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
    usernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') passwordInput.focus();
    });

    // Focus username input
    setTimeout(() => usernameInput.focus(), 100);
  }

  /**
   * Render "no employees" message (when no employees synced yet).
   */
  function renderNoEmployees(container) {
    container.innerHTML = `
      <div class="login-wrapper">
        <div class="login-card">
          <div class="login-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--amber)" stroke-width="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 class="login-title">Chưa có nhân viên</h2>
          <p class="login-subtitle">
            Vui lòng thêm nhân viên trong phần mềm desktop, sau đó đồng bộ dữ liệu lên cloud
            và tải xuống trên thiết bị này.
          </p>
          <button class="btn btn-primary btn-block" id="goto-sync-btn">Đi tới Đồng bộ</button>
        </div>
      </div>
    `;

    document.getElementById('goto-sync-btn').onclick = () => {
      if (typeof App !== 'undefined') App.navigate('sync');
    };
  }

  return { login, logout, getEmployee, isLoggedIn, hasEmployees, renderLogin, renderNoEmployees, hashPassword };
})();
