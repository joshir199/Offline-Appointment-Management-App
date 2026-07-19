
// Live clock
setInterval(() => {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);

// Initialize State for context
AppState.init();

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

function openApptMenu(event, apptId) {
    AppState.selectedApptId = apptId;
    const menu = document.getElementById('apptMenu');
    // position with small offset to avoid overlapping cursor
    menu.style.left = (event.pageX + 6) + 'px';
    menu.style.top = (event.pageY + 6) + 'px';
    menu.dataset.apptId = String(apptId);
    menu.style.display = 'block';
    // prevent document click from immediately hiding when clicking menu
    event.stopPropagation();
}

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
        if (AppState.viewMode === 'week') renderCalendar(); else renderMonthView(AppState.monthAnchor);
    }
}

function parseHM(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }

function isEndAfterStart(s,e) { return parseHM(e) > parseHM(s); }

function closeAlert() {
    document.getElementById("customAlert").style.display = "none";
}

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
    document.getElementById('orderDate').value = ds.date;
    const obsEl = document.getElementById('observations');
    if (obsEl) obsEl.value = '';

    document.getElementById('deleteBtn').style.display = 'none';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).show();
};

window.editAppt = function(appt) {
    console.log("Edit Appointment !")
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
    document.getElementById('orderDate').value = appt.date || '';
    window.currentDate = appt.date;
    window.currentAppt = Object.assign({}, appt);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('apptModal')).show();
};

/* =======================
   Save / Delete (with conflict detection)
   ======================= */
document.getElementById('saveBtn').onclick = async () => {
    console.log(" Save button click !")
    const id = document.getElementById('editId').value;
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const orderTime = document.getElementById('orderTime').value.trim();
    const type = document.getElementById('type').value;
    const matricula = document.getElementById('matricula').value.trim();
    const confirmed = document.getElementById('confirmed').value;
    const order = document.getElementById('order').value;
    const observations = document.getElementById('observations').value.trim();
    const missed = 0;
    const isHoliday = false;
    const apptDate = document.getElementById('orderDate').value.trim();
    console.log("OrderDate: ", apptDate)
    console.log("CurrentDate: ", window.currentDate)

    if (!name || !phone || !orderTime) {
        return alert("Por favor, complete todos los campos obligatorios.");
    }

    const appt = {
        date: apptDate,
        name,
        phone,
        type,
        matricula,
        orderTime,
        confirmed,
        order,
        observations,
        missed,
        isHoliday,
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


    // --- Check for previous "missed" appointments (no-show clients) ---
    const previousMissed = all.filter(a =>
        a.missed == 1 &&       // Missed flag is 1 (or true if boolean)
        a.name.trim().toLowerCase() === appt.name.trim().toLowerCase() &&
        a.phone.trim() === appt.phone.trim()
    );

    if (previousMissed.length > 0) {
        let warningMsg = `⚠️ ATENCIÓN: Este cliente tiene ${previousMissed.length} cita(s) perdida(s) previa(s):\n\n`;
        previousMissed.forEach(m => {
            warningMsg += `• ${m.date} , Tipo: ${m.type}\n`;
        });
        warningMsg += `\n¿Deseas continuar y guardar la nueva cita de todas formas?`;
        if (!confirm(warningMsg)) {
            return; // Cancel save if user clicks "No"
        }
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

        if (AppState.viewMode === 'week') renderCalendar();
        else renderMonthView(AppState.monthAnchor);
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
        if (AppState.viewMode === 'week') renderCalendar();
        else renderMonthView(AppState.monthAnchor);
    }
};

document.getElementById('prev').onclick = () => { AppState.currentMonday.setDate(AppState.currentMonday.getDate() - 7); renderCalendar(); };
document.getElementById('next').onclick = () => { AppState.currentMonday.setDate(AppState.currentMonday.getDate() + 7); renderCalendar(); };
document.getElementById('today').onclick = () => { AppState.currentMonday = getMonday(new Date()); renderCalendar(); };
document.getElementById('weekBtn').classList.add('active');
document.getElementById('weekBtn').onclick = () => {
    AppState.viewMode = "week";
    toggleNavButtons(true);
    renderCalendar();
}
document.getElementById('monthBtn').onclick = () => {
    AppState.viewMode = "month";
    toggleNavButtons(false);
    renderMonthView(new Date(AppState.currentMonday));
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
        const start = new Date(AppState.currentMonday);
        const end = new Date(AppState.currentMonday.getTime() + 6*24*60*60*1000);
        const data = (await db.getAll()).filter(a => {
            const d = new Date(a.date);
            return d >= start && d <= end;
        });
        downloadJSON(data, `lunas_sevilla_data_semana-${start.toISOString().slice(0,10)}.json`);
        return;
    }
    if (ev.ctrlKey || ev.metaKey) {
        const m = AppState.currentMonday.getMonth(), y = AppState.currentMonday.getFullYear();
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
    if (AppState.viewMode === 'week') renderCalendar(); else renderMonthView(AppState.monthAnchor);
};

// menu actions
document.getElementById('apptMenu').addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const action = ev.target && ev.target.dataset && ev.target.dataset.action;
    const menu = document.getElementById('apptMenu');
    if (!action) return;
    menu.style.display = 'none';
    const apptId = Number(menu.dataset.apptId || AppState.selectedApptId);
    if (!apptId) return;

    const all = await db.getAll();
    const appt = all.find(a => a.id === apptId);
    if (!appt) return;

    if (action === 'delete') {
        if (!confirm('¿Eliminar esta cita de forma permanente?')) return;
        await db.delete(apptId);
        //loadAppointments();
        if (AppState.viewMode === 'week') renderCalendar();
        else renderMonthView(AppState.monthAnchor);
        return;
    }

    if (action === 'missed') {
        appt.status = 'missed';
        appt.missed = 1;
        appt.observations = '🔴 [Faltó a la Cita]: ' + (appt.observations || '');
        await db.put(appt);
        //loadAppointments();
        if (AppState.viewMode === 'week') renderCalendar();
        else renderMonthView(AppState.monthAnchor);
        return;
    }

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

/////////////////////////////////////////////
/* =======================
   Search Appointment Feature
   ======================= */

document.getElementById('searchBtn').onclick = () => {
  // Clear previous results
  document.getElementById('searchPhone').value = '';
  document.getElementById('searchResults').innerHTML = `
    <div class="text-center text-muted py-4">
      Ingrese el número de teléfono y haga clic en Buscar
    </div>`;

  new bootstrap.Modal(document.getElementById('searchModal')).show();
};
// Search on button click
document.getElementById('searchOkBtn').onclick = async () => {
  const phoneInput = document.getElementById('searchPhone').value.trim();
  const resultsContainer = document.getElementById('searchResults');

  if (!phoneInput) {
    resultsContainer.innerHTML = `<div class="alert alert-warning">Por favor, introduzca un número de teléfono.</div>`;
    return;
  }

  const all = await db.getAll();

  // Filter by phone number (exact match after trimming)
  const results = all.filter(appt =>
    appt.phone && appt.phone.trim() === phoneInput
  );

  // Sort by date descending (most recent first)
  results.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="alert alert-info text-center">
        No se encontraron citas para el número de teléfono <strong>${phoneInput}</strong>
      </div>`;
    return;
  }

  // Build results list
  let html = `<h6 class="mb-3">Encontrado ${results.length} citas para <strong>${phoneInput}</strong></h6>`;

  html += `<div class="list-group">`;

  results.forEach(appt => {
    html += `
      <div class="list-group-item list-group-item-action">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${appt.date}</strong> • ${appt.orderTime}<br>
            <span class="text-primary">${appt.name}</span>
            <small class="text-muted"> | Vehículo: ${appt.matricula || '-'}</small>
          </div>
          <div class="text-end">
            <span class="badge bg-info">${appt.type}</span><br>
          </div>
        </div>
      </div>`;
  });

  html += `</div>`;
  resultsContainer.innerHTML = html;
};
/////////////////////////////////////////////////////////


// Final Initialization
setInterval(refreshAutoStatuses, 60*1000);
renderCalendar();
setTimeout(refreshAutoStatuses, 2000);