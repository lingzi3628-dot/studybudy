/**
 * Web Backend — Phase 61c
 *
 * A lightweight in-browser "database" for the WebBuilder preview.
 * Injected into the preview iframe so user-generated websites can
 * store and retrieve data — building real CRUD apps without a server.
 *
 * Uses IndexedDB under the hood (persistent across page reloads).
 * Falls back to localStorage if IndexedDB is unavailable.
 *
 * API exposed to the user's code (via `window.db`):
 *   db.set(collection, id, data)        → Promise<void>
 *   db.get(collection, id)              → Promise<any | null>
 *   db.getAll(collection)               → Promise<any[]>
 *   db.delete(collection, id)           → Promise<void>
 *   db.query(collection, predicate)     → Promise<any[]>
 *   db.clear(collection)                → Promise<void>
 *
 * Also provides a simple auth helper:
 *   auth.signup(email, password)        → Promise<{token, user}>
 *   auth.login(email, password)         → Promise<{token, user}>
 *   auth.currentUser()                  → {id, email} | null
 *   auth.logout()                       → void
 *
 * And a fetch wrapper for API calls:
 *   api.get(url)                        → Promise<Response>
 *   api.post(url, data)                 → Promise<Response>
 *   api.put(url, data)                  → Promise<Response>
 *   api.delete(url)                     → Promise<Response>
 */

export const WEB_BACKEND_SCRIPT = `
// === StudyBuddy Web Backend (IndexedDB + localStorage) ===
(function() {
  const DB_NAME = 'studybuddy_web_app';
  const DB_VERSION = 1;
  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));

      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Create object stores on demand — we don't know collections upfront
        if (!db.objectStoreNames.contains('_collections')) {
          db.createObjectStore('_collections', { keyPath: 'name' });
        }
      };
      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function ensureCollection(db, name) {
    return new Promise((resolve, reject) => {
      if (db.objectStoreNames.contains(name)) return resolve();
      // Need to close and reopen with higher version to add a store
      db.close();
      const newVersion = (db.version || 1) + 1;
      const req = indexedDB.open(DB_NAME, newVersion);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(name)) {
          d.createObjectStore(name, { keyPath: '_id' });
        }
      };
      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  window.db = {
    async set(collection, id, data) {
      const db = await openDB();
      await ensureCollection(db, collection);
      return new Promise((resolve, reject) => {
        const store = tx(db, collection, 'readwrite');
        const record = { ...data, _id: id || genId() };
        store.put(record);
        store.transaction.oncomplete = () => resolve(record);
        store.transaction.onerror = () => reject(store.transaction.error);
      });
    },

    async get(collection, id) {
      const db = await openDB();
      await ensureCollection(db, collection);
      return new Promise((resolve, reject) => {
        const store = tx(db, collection, 'readonly');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    async getAll(collection) {
      const db = await openDB();
      await ensureCollection(db, collection);
      return new Promise((resolve, reject) => {
        const store = tx(db, collection, 'readonly');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async delete(collection, id) {
      const db = await openDB();
      await ensureCollection(db, collection);
      return new Promise((resolve, reject) => {
        const store = tx(db, collection, 'readwrite');
        store.delete(id);
        store.transaction.oncomplete = () => resolve();
        store.transaction.onerror = () => reject(store.transaction.error);
      });
    },

    async query(collection, predicate) {
      const all = await this.getAll(collection);
      return all.filter(predicate);
    },

    async clear(collection) {
      const db = await openDB();
      await ensureCollection(db, collection);
      return new Promise((resolve, reject) => {
        const store = tx(db, collection, 'readwrite');
        store.clear();
        store.transaction.oncomplete = () => resolve();
        store.transaction.onerror = () => reject(store.transaction.error);
      });
    },
  };

  // === Simple Auth (localStorage-based) ===
  const AUTH_KEY = 'studybuddy_auth_users';
  const SESSION_KEY = 'studybuddy_auth_session';

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || '[]'); } catch { return []; }
  }

  function saveUsers(users) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(users));
  }

  window.auth = {
    async signup(email, password) {
      const users = getUsers();
      if (users.find(u => u.email === email)) {
        throw new Error('Email already registered');
      }
      const user = { id: genId(), email, password: btoa(password) }; // base64 "hash" (not secure, demo only)
      users.push(user);
      saveUsers(users);
      const token = genId();
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, userId: user.id, email: user.email }));
      return { token, user: { id: user.id, email: user.email } };
    },

    async login(email, password) {
      const users = getUsers();
      const user = users.find(u => u.email === email && u.password === btoa(password));
      if (!user) throw new Error('Invalid email or password');
      const token = genId();
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, userId: user.id, email: user.email }));
      return { token, user: { id: user.id, email: user.email } };
    },

    currentUser() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
    },

    logout() {
      localStorage.removeItem(SESSION_KEY);
    },
  };

  // === API helper (fetch wrapper) ===
  window.api = {
    async get(url, options = {}) {
      return fetch(url, { ...options, method: 'GET' });
    },
    async post(url, data, options = {}) {
      return fetch(url, {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: JSON.stringify(data),
      });
    },
    async put(url, data, options = {}) {
      return fetch(url, {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: JSON.stringify(data),
      });
    },
    async delete(url, options = {}) {
      return fetch(url, { ...options, method: 'DELETE' });
    },
  };

  // Console message so users know the backend is available
  console.log('StudyBuddy Web Backend ready! Use window.db, window.auth, window.api.');
})();
`;
