// main_script.js (corrected)
// Live clock
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
      const req = indexedDB.open('LunasSevilla_v1', 2);
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
        const isWeekend = date.getDay() % 6 === 0; // 0 = Sunday, 6 = Saturday
        const cls = isToday(date)
            ? 'today ' + (isWeekend ? 'day-header weekend' : 'day-header weekday')
            : (isWeekend ? 'day-header weekend' : 'day-header weekday');
        header += `<th class="${cls}">${weekDays[date.getDay()]}<br>${date.getDate()}</th>`;
    }
    header += '</tr>';
    thead.innerHTML = header;

    // Add click event to header cells
    thead.querySelectorAll('th.day-header.weekday').forEach(th => {
        th.addEventListener('click', () => {
            const date = th.dataset.date;
            // Open modal at default time (9:00) when header is clicked
            openModal({ dataset: { date: date, time: '09:00' } });
        });
    });

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
    appts.forEach(a => { if (typeof a.auto === 'undefined') a.auto = true; });

    // debug
    console.log('loadAppointments: found', appts.length, 'appointments');

    // clear cells
    document.querySelectorAll('.time-slot').forEach(slot => slot.innerHTML = '');

    appts.forEach(appt => {
        // keep auto-update active
        autoUpdateStatusFor(appt);

        // be defensive: ensure orderTime exists
        if (!appt.orderTime) {
            console.warn('Skipping appt without orderTime:', appt);
            return;
        }
        const parts = String(appt.orderTime).split(':');
        const hour = Number(parts[0] || 0);
        const slotTimeStr = String(hour).padStart(2, '0') + ':00';
        const cell = document.querySelector(`.time-slot[data-date="${appt.date}"][data-time="${slotTimeStr}"]`);
        if (cell) {
            const div = document.createElement('div');
            // set background color directly
            if (appt.status === 'completed' || appt.status === 'red') div.style.backgroundColor = 'red';
            else if (appt.type === 'Tintado') div.style.backgroundColor = 'lightblue';
            else if (appt.type === 'Lunas') div.style.backgroundColor = 'lightgreen';
            else if (appt.type === 'Pulido') div.style.backgroundColor = 'lightyellow';
            else div.style.backgroundColor = 'lightgray'; // default


            div.dataset.id = appt.id;
            div.innerHTML = `
            <strong>${escapeHtml(appt.name)}</strong><br>
            ${escapeHtml(appt.orderTime)} ${appt.matricula ? '· ' + escapeHtml(appt.matricula) : ''}<br>
            <small>${escapeHtml(appt.type || '')} • ${escapeHtml(appt.phone || '')}</small>
            `;
            div.onclick = e => { e.stopPropagation(); openApptMenu(e, appt.id); };
            cell.appendChild(div);

            // dynamically increase cell height
            const appointmentHeight = div.offsetHeight; // height of the newly added appointment card
            const baseHeight = 1000; // initial cell height (you can adjust)
            const currentAppointments = cell.querySelectorAll('.appt').length;
            cell.style.minHeight = `${baseHeight + appointmentHeight * currentAppointments}px`;
        } else {
            // useful for debugging: show which slot couldn't be found
            console.debug('No cell for appt', appt.id, appt.date, slotTimeStr);
        }
    });

    scheduleReminders(appts);
}


/* =======================
   Reminders
   ======================= */
function scheduleReminders(appts) {
  appts.forEach(appt => {
    try {
      if (appt.status === 'red') return;
      if (!appt.orderTime) return;
      const [y,m,d] = appt.date.split('-');
      const [sh, sm] = appt.orderTime.split(':').map(Number);
      const start = new Date(y, m-1, d, sh, sm);
      const reminder = new Date(start.getTime() - 5*60*1000);
      const ms = reminder - new Date();
      if (ms > 0) {
        setTimeout(() => {
          if (Notification.permission === "granted") {
            new Notification(`5 min Reminder — ${appt.name}`, {
              body: `${appt.orderTime}\n${appt.observations || ''}`.trim(),
              tag: 'reminder-' + appt.id,
              renotify: true
            });
          }
          const audio = new Audio('reminder.mp3');
          audio.play().catch(()=>{ console.log('Audio blocked'); });
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
  if (!appt.orderTime || !appt.date) { appt.status = appt.status || 'green'; return; }
  const [y,m,d] = appt.date.split('-');
  const [sh, sm] = appt.orderTime.split(':').map(Number);
  const start = new Date(y, m-1, d, sh, sm);
  const end = new Date(start.getTime() + 60*60*1000); // assume 1 hour
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

  document.getElementById('editId').value = '';
  document.getElementById('name').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('type').value = 'Tintado';
  document.getElementById('matricula').value = '';
  document.getElementById('orderTime').value = `${hour.toString().padStart(2,'0')}:00`;
  document.getElementById('confirmed').value = 'No';
  document.getElementById('order').value = 'No';
  const obsEl = document.getElementById('observations') || document.getElementById('details');
  if (obsEl) obsEl.value = '';

  document.getElementById('deleteBtn').style.display = 'none';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).show();
};

window.editAppt = function(appt) {
  document.getElementById('editId').value = appt.id;
  document.getElementById('name').value = appt.name || '';
  document.getElementById('observations').value = appt.observations || '';
  document.getElementById('orderTime').value = appt.orderTime || '';
  document.getElementById('type').value = appt.type || 'Tintado';
  document.getElementById('matricula').value = appt.matricula || '';
  document.getElementById('phone').value = appt.phone || '';
  document.getElementById('confirmed').value = appt.confirmed || 'No';
  document.getElementById('order').value = appt.order || 'No';
  document.getElementById('deleteBtn').style.display = 'block';
  window.currentDate = appt.date;
  window.currentAppt = Object.assign({}, appt);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).show();
};


/* =======================
   Save / Delete (with conflict detection)
   ======================= */
document.getElementById('saveBtn').onclick = async () => {
  const id = document.getElementById('editId').value;
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const orderTime = document.getElementById('orderTime').value.trim();
  const type = document.getElementById('type').value;
  const matricula = document.getElementById('matricula').value.trim();
  const confirmed = document.getElementById('confirmed').value;
  const order = document.getElementById('order').value;
  const observations = (document.getElementById('observations') || document.getElementById('details')).value.trim();

  if (!name || !phone || !orderTime) {
    return alert("Por favor, complete todos los campos obligatorios.");
  }

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

  if (id) appt.id = Number(id);

  // conflict detection on same date/time (same slot)
  const all = await db.getAll();
  const conflicts = all.filter(a =>
    a.date === appt.date &&
    a.orderTime === appt.orderTime &&
    a.type == appt.type &&
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
      console.log('Updated appt:', appt);
    } else {
      // remove any id property to let IDB assign one
      delete appt.id;
      await db.add(appt);
      console.log('Added new appt:', appt);
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).hide();
    loadAppointments();
  } catch (err) {
    console.error("Error saving appointment:", err);
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
   Navigation & other features (backup/restore etc.)
   ... (keep your existing code below unchanged)
   ======================= */

// keep rest of your file as before (backup/restore, refreshAutoStatuses, notifications, PWA, menu actions, etc.)

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
      appt.observations = (appt.details || '') + (appt.observations && appt.observations.trim().length ? ' ' : '') + '(terminado)';
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

// initial call
renderCalendar();
setTimeout(refreshAutoStatuses, 2000);
