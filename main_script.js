setInterval(() => {
const now = new Date();
document.getElementById('clock').textContent =
  now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);

/* =======================
 IndexedDB wrapper (safe upgrade)
 ======================= */
const db = {
    async init() {
        if (this.db) return;
        return new Promise((res, rej) => {
        const req = indexedDB.open('RepairShop', 2);
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
    async getAll() { await this.init(); return new Promise(res => this.db.transaction('appts').objectStore('appts').getAll().onsuccess = e => res(e.target.result)); },
    async add(o) { await this.init(); return new Promise((res, rej) => { const tx = this.db.transaction('appts','readwrite'); const store = tx.objectStore('appts'); const r = store.add(o); r.onsuccess = () => {}; r.onerror = rej; tx.oncomplete = res; tx.onerror = rej; }); },
    async put(o) { await this.init(); return new Promise((res, rej) => { const tx = this.db.transaction('appts','readwrite'); const store = tx.objectStore('appts'); const r = store.put(o); r.onsuccess = () => {}; r.onerror = rej; tx.oncomplete = res; tx.onerror = rej; }); },
    async delete(id) { await this.init(); return new Promise(res => { const tx = this.db.transaction('appts','readwrite'); tx.objectStore('appts').delete(id); tx.oncomplete = res; }); },
    async clear() { await this.init(); return new Promise(res => { const tx = this.db.transaction('appts','readwrite'); tx.objectStore('appts').clear(); tx.oncomplete = res; }); }
};

const weekDays = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
let currentMonday = getMonday(new Date());
let deferredInstallPrompt = null;

function getMonday(d) {
    d = new Date(d);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}
function formatDate(d) { return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
function isToday(d) { return d.toDateString() === new Date().toDateString(); }

/* =======================
 Render calendar & slots
 ======================= */
function renderCalendar() {
    const thead = document.querySelector('#calendar thead');
    const tbody = document.querySelector('#calendar tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    document.getElementById('weekInfo').textContent = `${formatDate(currentMonday)} – ${formatDate(new Date(currentMonday.getTime() + 6*24*60*60*1000))}`;

    // Header row
    let header = '<tr><th></th>';
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentMonday); date.setDate(date.getDate() + i);
      const cls = isToday(date) ? 'today day-header' : 'day-header';
      header += `<th class="${cls}">${weekDays[date.getDay()]}<br>${date.getDate()}</th>`;
    }
    header += '</tr>';
    thead.innerHTML = header;

    const sections = [
      { label: "Mañana", start: 9, end: 12 },
      { label: "Mediodía", start: 12, end: 15 },
      { label: "Tarde", start: 15, end: 18 }
    ];

    sections.forEach(sec => {
        // Time rows
        for (let h = sec.start; h < (sec.end === 18 ? 18 : sec.end); h++) {
            let tr = `<tr><td class="time-label">${h}:00 – ${h+1}:00</td>`;
            for (let d = 0; d < 7; d++) {
                const date = new Date(currentMonday); date.setDate(date.getDate() + d);
                if (date.getDay() % 6 === 0) { tr += '<td class="closed">CERRADO</td>'; continue; } // closed on Saturday & sunday
                const dateStr = date.toISOString().split('T')[0];
                const timeStr = `${h.toString().padStart(2,'0')}:00`;
                tr += `<td class="time-slot" data-date="${dateStr}" data-time="${timeStr}" onclick="openModal(this)"></td>`;
            }
            tr += '</tr>';
            tbody.innerHTML += tr;
        }
    });

    loadAppointments();
}

/* =======================
 Load & render appointments
 ======================= */
async function loadAppointments() {
    const appts = await db.getAll();
    // normalize older data (ensure auto flag exists)
    appts.forEach(a => { if (typeof a.auto === 'undefined') a.auto = true; });
    // clean all the cells
    document.querySelectorAll('.time-slot').forEach(slot => slot.innerHTML = '');

    appts.forEach(appt => {

        // Normaliza la hora a la ranura más cercana (redondea hacia abajo)
        const [hour, minute] = appt.orderTime.split(':').map(Number);
        const roundedHour = hour;  // 10:31 → 10:00, 10:20 → 10:00
        const slotTimeStr = String(roundedHour).padStart(2, '0') + ':00';

        const cell = document.querySelector(`.time-slot[data-date="${appt.date}"][data-time="${slotTimeStr}"]`);

        if (cell) {
            const div = document.createElement('div');
            div.className = `appt ${appt.status || 'green'}`;
            div.dataset.id = appt.id;
            div.innerHTML = `
                <strong>${escapeHtml(appt.name)}</strong><br>
                ${appt.orderTime} ${appt.matricula ? '· ' + escapeHtml(appt.matricula) : ''}<br>
                <small>${escapeHtml(appt.type)} • ${appt.phone}</small>
            `;

            div.onclick = e => { e.stopPropagation(); openApptMenu(e, appt.id); };
            div.ondblclick = e => { e.stopPropagation(); cycleStatus(appt); };
            cell.appendChild(div);
        }
    });
    scheduleReminders(appts);
}

/* =======================
 Reminders
 ======================= */
// tiny beep base64 fallback (very short silent beep)
const defaultBeep = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function scheduleReminders(appts) {
    // create reminders relative to now; duplicates might occur across loads but harmless
    appts.forEach(appt => {
        try {
            if (appt.status === 'red') return;
            const [y,m,d] = appt.date.split('-');
            const [sh, sm] = appt.orderTime.split(':');
            const start = new Date(y, m-1, d, sh, sm);
            const reminder = new Date(start.getTime() - 5*60*1000);
            const ms = reminder - new Date();
            if (ms > 0) {
                setTimeout(() => {
                    // show notification if allowed
                    if (Notification.permission === "granted") {
                        new Notification(`5 min Reminder — ${appt.name}`, {
                            body: `${appt.orderTime}\n${appt.observations || ''}`.trim(),
                            tag: 'reminder-' + appt.id,
                            renotify: true
                        });
                    }
                    // Custom reminder sound – just put your file in the same folder
                    const audio = new Audio('reminder.mp3');   // change the filename if you use .wav or .ogg
                    audio.volume = 1.0;
                    audio.play().catch(() => {
                        console.log("Audio play blocked until user interacts.");
                    });
                }, ms);
            }
        } catch (err) {
            console.warn('Reminder scheduling failed for appt', appt, err);
        }
    });
}

/* ------------------------
 Auto-status rules
 ------------------------ */
function autoUpdateStatusFor(appt) {
    if (appt.auto === false) return;
    const [y,m,d] = appt.date.split('-');
    const [sh, sm] = appt.orderTime.split(':');
    const [eh, em] = appt.orderTime.split(':');
    const start = new Date(y, m-1, d, sh, sm);
    const end = new Date(y, m-1, d, eh+2, em);
    const now = new Date();
    if (now > end) appt.status = 'red';
    else if ((start - now) <= 60*60*1000) appt.status = 'yellow';
    else appt.status = 'green';
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

/* =======================
 Modal / editing
 ======================= */
window.openModal = function(el) {
    window.currentDate = el.dataset.date;
    const hour = parseInt(el.dataset.time);

    // Reset fields
    document.getElementById('editId').value = '';
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('type').value = 'Revision';
    document.getElementById('matricula').value = '';
    document.getElementById('orderTime').value = `${hour.toString().padStart(2,'0')}:00`;
    document.getElementById('confirmed').value = 'No';
    document.getElementById('order').value = 'No';
    document.getElementById('observations').value = '';

    document.getElementById('deleteBtn').style.display = 'none';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).show();
};

window.editAppt = function(appt) {
    document.getElementById('editId').value = appt.id;
    document.getElementById('name').value = appt.name;
    document.getElementById('observations').value = appt.observations || '';
    document.getElementById('orderTime').value = appt.orderTime;
    document.getElementById('type').value = appt.type;
    document.getElementById('matricula').value = appt.matricula || '';
    document.getElementById('phone').value = appt.phone;
    document.getElementById('confirmed').value = appt.confirmed || 'No';
    document.getElementById('order').value = appt.order || '';
    document.getElementById('deleteBtn').style.display = 'block';
    window.currentDate = appt.date;
    window.currentAppt = Object.assign({}, appt); // copy
    bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).show();
};

window.cycleStatus = async function(appt) {
    const order = { green: 'yellow', yellow: 'red', red: 'green' };
    appt.status = order[appt.status] || 'green';
    appt.auto = false; // user manually changed status; prevent auto-overwrite
    await db.put(appt);
    loadAppointments();
};

/* =======================
     Save / Delete (with conflict detection)
     =======================
document.getElementById('saveBtn').onclick = async () => {
    const id = document.getElementById('editId').value;
    const name = document.getElementById('name').value.trim();
    const orderTime = document.getElementById('orderTime').value.trim();
    const type = document.getElementById('type').value;
    const confirmed = document.getElementById('confirmed').value;
    const order = document.getElementById('order').value;
    const phone = document.getElementById('phone').value.trim();
    if (!name || !phone || !orderTime) {
        return alert("Por favor, complete todos los campos obligatorios.");
    }

    const observations = document.getElementById('observations').value.trim();
    // Construct appointment object
    const appt = {
        id: id ? parseInt(id) : undefined,
        date: window.currentDate,
        name,
        phone,
        type,
        matricula,
        orderTime,
        confirmed,
        order,
        observations,
        status: id ? (window.currentAppt?.status || 'green') : 'green',
        auto: id ? (window.currentAppt?.auto ?? true) : true
    };

    if (id) appt.id = Number(id);

    // conflict detection
    const all = await db.getAll();
    const conflicts = all.filter(a => a.date === appt.date && (!id || a.id !== appt.id));

    if (conflicts.length > 0) {
      let msg = 'Se encontraron nombramientos conflictivos:\n\n';
      conflicts.forEach(c => msg += `• ${c.name} ${c.start}–${c.end}\n`);
      msg += '\n¿Quieres anularlo y guardarlo de todas formas?';
      if (!confirm(msg)) return;
    }

    try {
      if (id) await db.put(appt);
      else await db.add(appt);
      bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).hide();
      loadAppointments();
    } catch (err) {
      console.error("Error al guardar:", err);
      alert("Failed to save. Check browser console (F12) for details.");
    }
  };
*/

document.getElementById('saveBtn').onclick = async () => {
    const id = document.getElementById('editId').value;
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const orderTime = document.getElementById('orderTime').value.trim();
    const type = document.getElementById('type').value;
    const matricula = document.getElementById('matricula').value.trim();
    const confirmed = document.getElementById('confirmed').value;
    const order = document.getElementById('order').value;
    const observations = document.getElementById('observations').value.trim();

    if (!name || !phone || !orderTime) {
        return alert("Por favor, complete todos los campos obligatorios.");
    }

    // Construcción del objeto (id solo si estamos editando)
    const appt = {
        date: window.currentDate,
        name,
        phone,
        type,
        matricula,
        orderTime,
        confirmed,
        order,
        observations,
        status: id ? (window.currentAppt?.status || 'green') : 'green',
        auto: id ? (window.currentAppt?.auto ?? true) : true
    };

    // ¡Importante! Solo añadir id si estamos editando
    if (id) appt.id = Number(id);

    // Detección de conflictos (corregido también: usaba variables inexistentes)
    const all = await db.getAll();
    const conflicts = all.filter(a =>
        a.date === appt.date &&
        a.orderTime === appt.orderTime &&
        (!id || a.id !== appt.id)
    );

    if (conflicts.length > 0) {
        let msg = 'Ya existe una cita a esa hora:\n\n';
        conflicts.forEach(c => msg += `• ${c.name} - ${c.orderTime}\n`);
        msg += '\n¿Quieres sobrescribir y guardar de todas formas?';
        if (!confirm(msg)) return;
    }

    try {
        if (id) {
            await db.put(appt);
        } else {
            // Eliminar id del objeto para que IndexedDB genere uno nuevo
            delete appt.id;
            await db.add(appt);
        }
        bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).hide();
        loadAppointments();
    } catch (err) {
        console.error("Error al guardar:", err);
        alert("Error inesperado al guardar. Revisa la consola (F12).");
    }
};

document.getElementById('deleteBtn').onclick = async () => {
    if (confirm('¿Eliminar esta cita de forma permanente?')) {
      await db.delete(Number(document.getElementById('editId').value));
      bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).hide();
      loadAppointments();
    }
};

function parseHM(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }

function isEndAfterStart(s,e) { return parseHM(e) > parseHM(s); }

/* =======================
     Navigation
     ======================= */
document.getElementById('prev').onclick = () => { currentMonday.setDate(currentMonday.getDate() - 7); renderCalendar(); };
document.getElementById('next').onclick = () => { currentMonday.setDate(currentMonday.getDate() + 7); renderCalendar(); };
document.getElementById('today').onclick = () => { currentMonday = getMonday(new Date()); renderCalendar(); };

/* =======================
     Backup / Restore / Export Week/Month
     ======================= */
function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

document.getElementById('backup').onclick = async (ev) => {
    if (ev.shiftKey) {
      const start = new Date(currentMonday);
      const end = new Date(currentMonday.getTime() + 6*24*60*60*1000);
      const data = (await db.getAll()).filter(a => {
        const d = new Date(a.date);
        return d >= start && d <= end;
      });
      downloadJSON(data, `repairshop-week-${start.toISOString().slice(0,10)}.json`);
      return;
    }

    if (ev.ctrlKey || ev.metaKey) {
      const m = currentMonday.getMonth(), y = currentMonday.getFullYear();
      const data = (await db.getAll()).filter(a => {
        const d = new Date(a.date);
        return d.getFullYear() === y && d.getMonth() === m;
      });
      downloadJSON(data, `repairshop-month-${y}-${String(m+1).padStart(2,'0')}.json`);
      return;
    }
    const data = await db.getAll();
    downloadJSON(data, `repairshop-backup-${new Date().toISOString().slice(0,10)}.json`);
};

document.getElementById('restoreBtn').onclick = () => document.getElementById('restore').click();
document.getElementById('restore').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await db.clear();
    for (const a of data) {
      await db.add(a);
    }
    alert('¡La copia de seguridad se restauró exitosamente!');
    loadAppointments();
};

/* =======================
     Auto-update loop: every minute
     ======================= */
async function refreshAutoStatuses() {
    const appts = await db.getAll();
    let changed = false;
    appts.forEach(a => {
      const old = a.status;
      autoUpdateStatusFor(a);
      if (a.status !== old) changed = true;
    });
    if (changed) {
      for (const a of appts) await db.put(a);
      loadAppointments();
    }
}
setInterval(refreshAutoStatuses, 60*1000);

/* =======================
     Notifications permission on first user gesture
     ======================= */
document.body.addEventListener('click', () => {
    if (Notification && Notification.permission !== "granted") {
      Notification.requestPermission().then(p => {
        console.log('Notification permission:', p);
      }).catch(()=>{});
    }
  }, { once: true });

/* =======================
     PWA support (inline manifest + simple SW)
     ======================= */
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.style.display = 'inline-block';
});

installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return alert('El mensaje de instalación no está disponible.');
    deferredInstallPrompt.prompt();
    try {
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log('Install choice', outcome);
    } catch (err) { /* ignore */ }
    deferredInstallPrompt = null;
    installBtn.style.display = 'none';
});

const manifest = {
    name: "Lunas Sevilla Agenda",
    short_name: "Lunas Sevilla",
    start_url: ".",
    display: "standalone",
    background_color: "#f8f9fa",
    theme_color: "#343a40",
    icons: []
};
const mr = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
const manifestURL = URL.createObjectURL(mr);
const link = document.createElement('link');
link.rel = 'manifest';
link.href = manifestURL;
document.head.appendChild(link);

if ('serviceWorker' in navigator) {
    const swCode = `
      const CACHE = 'repairshop-v1';
      self.addEventListener('install', e => {
        self.skipWaiting();
        e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/'])).catch(()=>{}));
      });
      self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
      self.addEventListener('fetch', e => {
        if (e.request.method !== 'GET') return;
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => { try { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } catch(e){} return resp; })));
      });
    `;
    const swBlob = new Blob([swCode], { type: 'text/javascript' });
    const swUrl = URL.createObjectURL(swBlob);
    navigator.serviceWorker.register(swUrl).catch(err => console.warn('SW register failed', err));
}

  /* =======================
     Context menu for appointments
     ======================= */
let selectedApptId = null;

function openApptMenu(event, apptId) {
    selectedApptId = apptId;
    const menu = document.getElementById('apptMenu');
    // position with small offset to avoid overlapping cursor
    menu.style.left = (event.pageX + 6) + 'px';
    menu.style.top = (event.pageY + 6) + 'px';
    menu.dataset.apptId = String(apptId);
    menu.style.display = 'block';
    // prevent document click from immediately hiding when clicking menu
    event.stopPropagation();
}

// hide when clicking outside
document.addEventListener('click', () => {
    const menu = document.getElementById('apptMenu');
    if (menu) menu.style.display = 'none';
});

// menu actions
document.getElementById('apptMenu').addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const action = ev.target && ev.target.dataset && ev.target.dataset.action;
    const menu = document.getElementById('apptMenu');
    if (!action) return;
    menu.style.display = 'none';
    const apptId = Number(menu.dataset.apptId || selectedApptId);
    if (!apptId) return;

    const all = await db.getAll();
    const appt = all.find(a => a.id === apptId);
    if (!appt) return;

    if (action === 'delete') {
      if (!confirm('¿Eliminar esta cita de forma permanente?')) return;
      await db.delete(apptId);
      loadAppointments();
      return;
    }
    if (action === 'completed') {
      appt.status = 'completed';
      appt.auto = false;
      appt.details = (appt.details || '') + (appt.details && appt.details.trim().length ? ' ' : '') + '(terminado)';
      await db.put(appt);
      loadAppointments();
      return;
    }
    if (action === 'modify') {
      // call your editAppt function with the appt object
      editAppt(appt);
      return;
    }
    // cancel -> nothing
});

/* =======================
     Init & initial refresh
     ======================= */
renderCalendar();
setTimeout(refreshAutoStatuses, 2000);