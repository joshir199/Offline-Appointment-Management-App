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
let viewMode = 'week'; // 'week' or 'month'
let deferredInstallPrompt = null;

function getMonday(d) { //get Monday of current week
    d = new Date(d);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.setDate(diff));
}
function formatDate(d) { return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
function isToday(d) { return d.toDateString() === new Date().toDateString(); }

/* =======================
 Utilities for color classes by type/status
 ======================= */
function typeClassFor(appt) {
    const t = (appt.type || '').toLowerCase();
    // changed
    if (appt.status === 'completed' || appt.status === 'red')
    {
        if (t.includes('tint')) return 'type-tintado';
        if (t.includes('lunas')) return 'type-lunas';
        if (t.includes('pulid')) return 'type-pulido';
    }
    if (t.includes('tint')) return 'type-tintado';
    if (t.includes('lunas')) return 'type-lunas';
    if (t.includes('pulid')) return 'type-pulido';
    return 'type-default';
}

/* =======================
   Render calendar & slots
   ======================= */
function renderCalendar() {
    // ensure week view visible
    document.getElementById('weekContainer').style.display = 'block';
    document.getElementById('monthView').style.display = 'none';
    viewMode = 'week';

    const thead = document.querySelector('#calendar thead');
    const tbody = document.querySelector('#calendar tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    document.getElementById('weekInfo').textContent = `Semana: ${formatDate(currentMonday)} – ${formatDate(new Date(currentMonday.getTime() + 6*24*60*60*1000))}`;

    // Header row
    let header = '<tr><th></th>';
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentMonday);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const isWeekend = date.getDay() % 6 === 0; // 0 = Sunday, 6 = Saturday
        const cls = isToday(date)
            ? 'today ' + (isWeekend ? 'day-header weekend' : 'day-header weekday')
            : (isWeekend ? 'day-header weekend' : 'day-header weekday');
        header += `<th class="${cls}" data-date="${dateStr}">${weekDays[date.getDay()]}<br>${date.getDate()}</th>`;
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
 Month view rendering
 ======================= */

function showStyledAlert(date, count) {
    const text = `
        Citas en ${date}<br>
        <span style="color:#0abf04;">🟢 Tintado: ${count.green}</span><br>
        <span style="color:#0090ff;">🔵 Lunas: ${count.blue}</span><br>
        <span style="color:#e0c000;">🟡 Pulido: ${count.yellow}</span>
    `;

    document.getElementById("alertText").innerHTML = text;
    document.getElementById("customAlert").style.display = "block";
}

function closeAlert() {
    document.getElementById("customAlert").style.display = "none";
}

function showAppointmentDetails(appt) {

    const text = `
      <strong>Detalles de la Cita</strong><br><br>

      <strong>Nombre:</strong> ${escapeHtml(appt.name)} &nbsp;&nbsp;&nbsp;
      <strong>Tel:</strong> ${escapeHtml(appt.phone)}<br><br>

      <strong>Tipo:</strong> ${escapeHtml(appt.type)} &nbsp;&nbsp;&nbsp;
      <strong>Hora:</strong> ${escapeHtml(appt.orderTime)} &nbsp;&nbsp;&nbsp;
      <strong>Matrícula:</strong> ${escapeHtml(appt.matricula || '-')}<br><br>

      <strong>Confirmación:</strong> ${escapeHtml(appt.confirmed || '')} &nbsp;&nbsp;&nbsp;
      <strong>Perdido:</strong> ${escapeHtml(appt.order || '')}<br><br>

      <strong>Observación:</strong><br>
      ${escapeHtml(appt.observations || '-')}
    `;

    document.getElementById("alertText").innerHTML = text;
    document.getElementById("customAlert").style.display = "block";
}


let monthAnchor = new Date(); // current shown month anchor
function renderMonthView(anchorDate) {
    viewMode = 'month';
    document.getElementById('weekContainer').style.display = 'none';
    document.getElementById('monthView').style.display = 'block';
    monthAnchor = anchorDate ? new Date(anchorDate) : new Date(currentMonday);

    const container = document.getElementById('monthView');
    container.innerHTML = ''; // clear

    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // week starts Monday => JS getDay: 1=Mon..0=Sun
    // compute start index where Monday=0
    const startIndex = (firstDay.getDay() + 6) % 7;
    const totalCells = startIndex + lastDay.getDate();
    const rows = Math.ceil(totalCells / 7);

    // simple toolbar
    const navHtml = `
      <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:8px;">
        <button id="monthPrev" class="btn btn-sm btn-outline-primary">← Mes anterior</button>
        <strong>${monthAnchor.toLocaleString('es-ES', { month: 'long' , year:'numeric' })}</strong>
        <button id="monthNext" class="btn btn-sm btn-outline-primary">Mes siguiente →</button>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', navHtml);

    // build table
    let html = `<table class="month-table"><thead><tr>
      <th>Lunes</th><th>Martes</th><th>Miércoles</th><th>Jueves</th><th>Viernes</th><th>Sábado</th><th>Domingo</th>
    </tr></thead><tbody>`;

    let dayCounter = 1 - startIndex;
    for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < 7; c++) {
            const d = new Date(year, month, dayCounter);
            const isCurrentMonth = d.getMonth() === month;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const dateKey = d.toISOString().split('T')[0];
            const inactive = (isCurrentMonth && !isWeekend) ? '' : 'inactive';

            html += `<td class="month-cell ${inactive}" data-date="${dateKey}">
                      <div class="day-number">${d.getDate()}</div>
                      <div class="appt-box" data-date="${dateKey}"></div>
                    </td>`;
            dayCounter++;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    container.insertAdjacentHTML('beforeend', html);

    // hook prev/next
    document.getElementById('monthPrev').onclick = () => {
        renderMonthView(new Date(year, month - 1, 1));
    };
    document.getElementById('monthNext').onclick = () => {
        renderMonthView(new Date(year, month + 1, 1));
    };

    // render appts into month cells
    (async () => {
        const all = await db.getAll();
        // map by date
        const byDate = {};
        all.forEach(a => {
            if (!byDate[a.date]) byDate[a.date] = [];
            byDate[a.date].push(a);
        });
        // ADD POPUP MENU FOR MONTH CELLS
        document.querySelectorAll('.month-cell').forEach(cell => {
            const date = cell.dataset.date;

            // Check if there are any appointments on this date
            if (byDate[date] && byDate[date].length > 0) {
                cell.classList.add('has-appointment');  // Add special class
                // Optional: show number of appointments
                //const count = byDate[date].length;
                //cell.querySelector('.appt-box').textContent = count;
                cell.querySelector('.appt-box').innerHTML = '📋🔔📋';
            }

            cell.onclick = async (e) => {
                e.stopPropagation();
                if (cell.classList.contains('inactive')) return;

                const menu = document.createElement('div');
                menu.className = "month-menu";
                menu.style.position = "absolute";
                menu.style.background = "white";
                menu.style.border = "1px solid #ccc";
                menu.style.padding = "10px";
                menu.style.borderRadius = "6px";
                menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                menu.style.zIndex = "9999";
                menu.style.top = (e.clientY + window.scrollY) + "px";
                menu.style.left = (e.clientX + window.scrollX) + "px";

                menu.innerHTML = `
                    <div class="menu-item" data-act="view" style="padding:6px;cursor:pointer;">📊 Ver Citas</div>
                    <div class="menu-item" data-act="add"  style="padding:6px;cursor:pointer;">➕ Añadir Cita</div>
                    <div class="menu-item" data-act="cancel" style="padding:6px;cursor:pointer;">✖ Cancelar</div>
                `;
                document.body.appendChild(menu);

                // CLOSE when clicking anywhere else
                const closer = (ev) => {
                    if (!menu.contains(ev.target)) {
                        menu.remove();
                        document.removeEventListener('click', closer);
                    }
                };
                setTimeout(() => document.addEventListener('click', closer), 50);

                // MENU ACTIONS
                menu.onclick = async (ev) => {
                    ev.stopPropagation();
                    const action = ev.target.dataset.act;

                    if (action === "view") {
                        const all = await db.getAll();
                        const list = all.filter(a => a.date === date);

                        // COUNT per type
                        let count = { blue: 0, green: 0, yellow: 0};
                        list.forEach(a => {
                            if (a.type === "Tintado") count.blue++;
                            else if (a.type === "Lunas") count.green++;
                            else if (a.type === "Pulido") count.yellow++;
                        });
                        showStyledAlert(date, count);
                    }

                    if (action === "add") {
                        // openModal expects dataset.date and dataset.time
                        openModal({ dataset: { date, time: "09:00" }});
                    }

                    menu.remove();
                };
            };
        });
    })();
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
            div.className = 'appt ' + typeClassFor(appt);

            div.dataset.id = appt.id;
            div.innerHTML = `
              <strong>${escapeHtml(appt.name)}</strong><br>
              <small>${escapeHtml(appt.orderTime)} • ${escapeHtml(appt.type || '')}</small><br>
              <small>${escapeHtml(appt.observations || '')}</small>
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
            // add reminders to save data every monday
            if (new Date().getDay() === 1) {    // Monday = 1
                // Its monday:
                const btn = document.getElementById('backup');
                const lastClick = localStorage.getItem('backupClickedThisWeek');
                if (lastClick !== new Date().toDateString()) {
                    btn.classList.add('monday-alert');     // vibrate + glow
                } else {
                    btn.classList.remove('monday-alert');  // calm down
                }

                // When user clicks → turn off the alert for this week
                btn.onclick = async (ev) => {
                    localStorage.setItem('backupClickedThisWeek', new Date().toDateString());
                    btn.classList.remove('monday-alert');
                    const data = await db.getAll();
                    downloadJSON(data, `lunas_sevilla_data_backup-${new Date().toISOString().slice(0,10)}.json`);
                };
            }
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
    /*
    if (now > end) appt.status = 'red';
    else if ((start - now) <= 60*60*1000) appt.status = 'yellow';
    else appt.status = 'green';
    */
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

/* =======================
   Modal / editing
   ======================= */
window.openModal = function(el) {

    const ds = el.dataset || el;
    window.currentDate = ds.date;
    const hour = parseInt(ds.time);

    document.getElementById('editId').value = '';
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('type').value = 'Tintado';
    document.getElementById('matricula').value = '';
    document.getElementById('orderTime').value = `${hour.toString().padStart(2,'0')}:00`;
    document.getElementById('confirmed').value = 'No';
    document.getElementById('order').value = 'No';
    const obsEl = document.getElementById('observations');
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
    const observations = document.getElementById('observations').value.trim();

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
        // refresh correct view

        if (viewMode === 'week') renderCalendar();
        else renderMonthView(monthAnchor);
        //loadAppointments();
    } catch (err) {
        console.error("Error saving appointment:", err);
        alert("Error inesperado al guardar. Revisa la consola (F12).");
    }
};

document.getElementById('deleteBtn').onclick = async () => {
    if (confirm('¿Eliminar esta cita de forma permanente?')) {
        await db.delete(Number(document.getElementById('editId').value));
        bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).hide();
        //loadAppointments();
        if (viewMode === 'week') renderCalendar();
        else renderMonthView(monthAnchor);
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
 Auto update statuses every minute
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
        if (viewMode === 'week') renderCalendar(); else renderMonthView(monthAnchor);
    }
}
setInterval(refreshAutoStatuses, 60*1000);


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
        //loadAppointments();
        if (viewMode === 'week') renderCalendar();
        else renderMonthView(monthAnchor);
        return;
    }
    /*
    if (action === 'completed') {
        appt.status = 'completed';
        appt.auto = false;
        appt.observations = (appt.observations || '') + (appt.observations && appt.observations.trim().length ? ' ' : '') + '(terminado)';
        await db.put(appt);
        //loadAppointments();
        if (viewMode === 'week') renderCalendar();
        else renderMonthView(monthAnchor);
        return;
    }
    */
    if (action === 'modify') {
        // call your editAppt function with the appt object
        editAppt(appt);
        return;
    }
    if (action === 'view') {
        // call your viewAppointment function with the appt object
        showAppointmentDetails(appt);
        return;
    }
    // cancel -> nothing
});

/* =======================
     Navigation & view toggles
     ======================= */
function toggleNavButtons(enable) {
    document.getElementById('prev').disabled = !enable;
    document.getElementById('next').disabled = !enable;
    document.getElementById('today').disabled = !enable;
    if(enable){
        document.getElementById('weekBtn').classList.add('active');
        document.getElementById('monthBtn').classList.remove('active');
    } else {
        document.getElementById('weekBtn').classList.remove('active');
        document.getElementById('monthBtn').classList.add('active');
    }

    // Optional: add visual fading
    const opacity = enable ? "1" : "0.5";
    document.getElementById('prev').style.opacity = opacity;
    document.getElementById('next').style.opacity = opacity;
    document.getElementById('today').style.opacity = opacity;
}

document.getElementById('prev').onclick = () => { currentMonday.setDate(currentMonday.getDate() - 7); renderCalendar(); };
document.getElementById('next').onclick = () => { currentMonday.setDate(currentMonday.getDate() + 7); renderCalendar(); };
document.getElementById('today').onclick = () => { currentMonday = getMonday(new Date()); renderCalendar(); };
document.getElementById('weekBtn').classList.add('active');
document.getElementById('weekBtn').onclick = () => {
    viewMode = "week";
    toggleNavButtons(true);
    renderCalendar();
}
document.getElementById('monthBtn').onclick = () => {
    viewMode = "month";
    toggleNavButtons(false);
    renderMonthView(new Date(currentMonday));
}

/* =======================
     Backup / Restore
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
        downloadJSON(data, `lunas_sevilla_data_semana-${start.toISOString().slice(0,10)}.json`);
        return;
    }
    if (ev.ctrlKey || ev.metaKey) {
        const m = currentMonday.getMonth(), y = currentMonday.getFullYear();
        const data = (await db.getAll()).filter(a => {
            const d = new Date(a.date);
            return d.getFullYear() === y && d.getMonth() === m;
        });
        downloadJSON(data, `lunas_sevilla_data_mes-${y}-${String(m+1).padStart(2,'0')}.json`);
        return;
    }
    const data = await db.getAll();
    downloadJSON(data, `lunas_sevilla_data_backup-${new Date().toISOString().slice(0,10)}.json`);
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
    if (viewMode === 'week') renderCalendar(); else renderMonthView(monthAnchor);
};


// initial call
renderCalendar();
setTimeout(refreshAutoStatuses, 2000);
