// db.js
/* =======================
   IndexedDB wrapper (safe upgrade)
   ======================= */
const db = {
  async init() {
    if (this.db) return;
    return new Promise((res, rej) => {
      const req = indexedDB.open('LunasSevilla_v2', 2);
      req.onupgradeneeded = e => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains('appts')) {
          idb.createObjectStore('appts', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = e => { this.db = e.target.result; res(); };
      req.onerror = rej;
    });
  },
  async getAll() {
    await this.init();
    return new Promise(res => this.db.transaction('appts').objectStore('appts').getAll().onsuccess = e => res(e.target.result));
  },
  async add(o) {
    await this.init();
    return new Promise((res, rej) => {
      const tx = this.db.transaction('appts','readwrite');
      const store = tx.objectStore('appts');
      const r = store.add(o);
      r.onsuccess = () => {};
      r.onerror = rej;
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  },
  async put(o) {
    await this.init();
    return new Promise((res, rej) => {
      const tx = this.db.transaction('appts','readwrite');
      const store = tx.objectStore('appts');
      const r = store.put(o);
      r.onsuccess = () => {};
      r.onerror = rej;
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  },
  async delete(id) {
    await this.init();
    return new Promise(res => {
      const tx = this.db.transaction('appts','readwrite');
      tx.objectStore('appts').delete(id);
      tx.oncomplete = res;
    });
  },
  async clear() {
    await this.init();
    return new Promise(res => {
      const tx = this.db.transaction('appts','readwrite');
      tx.objectStore('appts').clear();
      tx.oncomplete = res;
    });
  }
};
window.db = db;  // expose to other file