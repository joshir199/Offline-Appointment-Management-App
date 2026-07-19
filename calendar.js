// calendar.js
const weekDays = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDate(d) {
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function isToday(d) {
  return d.toDateString() === new Date().toDateString();
}

/* =======================
 Utilities for color classes by type/status
 ======================= */
function typeClassFor(appt) {
  const t = (appt.type || '').toLowerCase();
  if (appt.status === 'completed' || appt.status === 'red') {
    if (t.includes('tint')) return 'type-tintado';
    if (t.includes('lunas')) return 'type-lunas';
    if (t.includes('pulid')) return 'type-pulido';
  }
  if (t.includes('tint')) return 'type-tintado';
  if (t.includes('lunas')) return 'type-lunas';
  if (t.includes('pulid')) return 'type-pulido';
  return 'type-default';
}

function buildHeaderCounts(count, isHoliday) {
  let html = '';
  if (isHoliday) {
      html += '🎉 Festivo 🎉';
  } else {
      if (count.green > 0) html += `<span style="color:#0abf04;">🟢:${count.green}</span>&nbsp;`;
      if (count.blue > 0) html += `<span style="color:#0090ff;">🔵:${count.blue}</span>&nbsp;`;
      if (count.yellow > 0) html += `<span style="color:#e0c000;">🟡:${count.yellow}</span>`;
      if (!html) html = ' _ ';
  }
  return `<div style="font-size:18px; font-weight: bold; margin-top:5px; margin-right:30px; line-height:1.5;">${html}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

/* ======================= Render Functions ======================= */
/* =======================
   Render calendar & slots
   ======================= */
function renderCalendar() {
    // ensure week view visible
    document.getElementById('weekContainer').style.display = 'block';
    document.getElementById('monthView').style.display = 'none';
    AppState.viewMode = 'week';

    const thead = document.querySelector('#calendar thead');
    const tbody = document.querySelector('#calendar tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    document.getElementById('weekInfo').textContent = `Semana: ${formatDate(AppState.currentMonday)} – ${formatDate(new Date(AppState.currentMonday.getTime() + 6*24*60*60*1000))}`;

    (async () => {
        const all = await db.getAll();
        const holidaySet = new Set(all.filter(a => a.isHoliday).map(a => a.date));

        // Header row
        let header = '<tr><th></th>';
        for (let i = 0; i < 7; i++) {
            const date = new Date(AppState.currentMonday);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const isHoliday = holidaySet.has(dateStr);   // check holiday date
            // Get appointment counts per day
            const list = all.filter(a => a.date === dateStr);
            // COUNT per type
            let count = { green: 0, blue: 0, yellow: 0};
            list.forEach(a => {
                if (a.type === "Tintado") count.green++;
                else if (a.type === "Lunas") count.blue++;
                else if (a.type === "Pulido") count.yellow++;
            });
            //////////////////
            const isWeekend = date.getDay() % 6 === 0; // 0 = Sunday, 6 = Saturday
            const cls = isToday(date)
                ? 'today ' + (isWeekend ? 'day-header weekend' : 'day-header weekday')
                : (isWeekend ? 'day-header weekend' : 'day-header weekday');
            header += `<th class="${cls}" data-date="${dateStr}">${weekDays[date.getDay()]}<br>${date.getDate()}<br>${buildHeaderCounts(count, isHoliday)}</th>`;
        }
        header += '</tr>';
        thead.innerHTML = header;

        // Add click event to header cells
        thead.querySelectorAll('th.day-header.weekday').forEach(th => {
            th.addEventListener('click', () => {
                const date = th.dataset.date;
                // Open modal at default time (9:00) when header is clicked
                if (!holidaySet.has(date)) {
                    openModal({ dataset: { date: date, time: '09:00' } });
                }
            });
        });



        const sections = [
            { label: "Mañana", start: 8, end: 12 },
            { label: "Mediodía", start: 12, end: 15 },
            { label: "Tarde", start: 15, end: 18 }
        ];

        //sections.forEach(sec => {
        for (const sec of sections) {
            // Time rows
            for (let h = sec.start; h < (sec.end === 18 ? 18 : sec.end); h++) {
                let tr = `<tr><td class="time-label">${h}:00 – ${h+1}:00</td>`;
                for (let d = 0; d < 7; d++) {
                    const date = new Date(AppState.currentMonday);
                    date.setDate(date.getDate() + d);
                    const dateStr = date.toISOString().split('T')[0];
                    const isholiday = holidaySet.has(dateStr);  // check holiday date
                    if (date.getDay() % 6 === 0 || isholiday) { tr += '<td class="closed">CERRADO</td>'; continue; } // closed on Saturday & sunday

                    const timeStr = `${h.toString().padStart(2,'0')}:00`;
                    tr += `<td class="time-slot" data-date="${dateStr}" data-time="${timeStr}" onclick="openModal(this)"></td>`;
                }
                tr += '</tr>';
                tbody.innerHTML += tr;
            }
        }


        loadAppointments();
    })();
}

async function isHolidayDay(dateStr) {
  const all = await db.getAll();
  return all.some(a => a.date === dateStr && (a.isHoliday ?? false));
}

/* =======================
 Month view rendering
 ======================= */
function renderMonthView(anchorDate) {
    AppState.viewMode = 'month';
    document.getElementById('weekContainer').style.display = 'none';
    document.getElementById('monthView').style.display = 'block';
    // Use UTC to avoid any local timezone shift
    const now = new Date();
    const anchor = anchorDate ? new Date(anchorDate) : new Date(AppState.currentMonday.getTime()); // copy timestamp
    const year = anchor.getUTCFullYear ? anchor.getUTCFullYear() : anchor.getFullYear(); // safe
    const month = anchor.getUTCMonth ? anchor.getUTCMonth() : anchor.getMonth();

    // Use UTC for all date calculations in month view
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));

    // Week starts on Monday
    const startIndex = (firstDay.getUTCDay() + 6) % 7;
    const totalCells = startIndex + lastDay.getUTCDate();
    const rows = Math.ceil(totalCells / 7);

    const container = document.getElementById('monthView');
    container.innerHTML = '';

    // simple toolbar
    const navHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:12px; padding:0 10px; width:100%;">
            <!-- Left spacer (invisible) to balance the layout -->
            <div style="min-width:200px; visibility:hidden;"></div>

            <!-- Center: Navigation buttons + month name (centered) -->
            <div style="display:flex; gap:12px; align-items:center; flex:1; justify-content:center;">
              <button id="monthPrev" class="btn btn-sm btn-outline-primary">← Mes anterior</button>
              <strong style="font-size:1.1rem; white-space:nowrap;">${new Date(year, month).toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</strong>
              <button id="monthNext" class="btn btn-sm btn-outline-primary">Mes siguiente →</button>
            </div>

            <!-- Right: Count summary box -->
            <div id="monthCountBox" style="
              background:#f8f9fa;
              border:2px solid #dee2e6;
              border-radius:6px;
              padding:6px 14px;
              font-size:0.95rem;
              font-weight:bold;
              white-space:nowrap;
              box-shadow:0 1px 3px rgba(0,0,0,0.1);
              min-width:240px;
              text-align:center;
            ">
              <span style="color:#0abf04;">🟢 Tintado: <span id="countTintado">0</span></span> &nbsp;|&nbsp;
              <span style="color:#0090ff;">🔵 Lunas: <span id="countLunas">0</span></span> &nbsp;|&nbsp;
              <span style="color:#e0ac00;">🟡 Pulido: <span id="countPulido">0</span>
            </div>
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
            const d = new Date(Date.UTC(year, month, dayCounter));
            const isCurrentMonth = d.getUTCMonth() === month;
            const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
            const dateKey = d.toISOString().split('T')[0]; // Always YYYY-MM-DD in UTC

            const inactive = isCurrentMonth ? '' : 'inactive';
            const weekendClass = isWeekend ? 'weekend' : '';

            html += `<td class="month-cell ${inactive} ${weekendClass}" data-date="${dateKey}">
                      <div class="day-number">${d.getUTCDate()}</div>
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
        const prevMonth = new Date(Date.UTC(year, month - 1, 1));
        renderMonthView(prevMonth);
    };
    document.getElementById('monthNext').onclick = () => {
        const nextMonth = new Date(Date.UTC(year, month + 1, 1));
        renderMonthView(nextMonth);
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

        // Create counter
        let monthlyOrderCount = { tintado: 0, lunas: 0, pulido: 0};

        // Second: Count only appointments in the current displayed month
        all.forEach(a => {
          const apptDate = new Date(a.date);
          // Check if appointment belongs to the current month/year
          if (apptDate.getFullYear() === year && apptDate.getMonth() === month) {
            const type = (a.type || '').trim();

            if (type === "Tintado") {
              monthlyOrderCount.tintado++;
              if (a.missed === 1) monthlyOrderCount.tintado--;
            }
            else if (type === "Lunas") {
              monthlyOrderCount.lunas++;
              if (a.missed === 1) monthlyOrderCount.lunas--;
            }
            else if (type === "Pulido") {
              monthlyOrderCount.pulido++;
              if (a.missed === 1) monthlyOrderCount.pulido--;
            }
          }
        });

        // ADD POPUP MENU FOR MONTH CELLS
        document.querySelectorAll('.month-cell').forEach(async cell => {
            const date = cell.dataset.date;

            const holiday = await isHolidayDay(date)

            // Check if there are any appointments on this date
            if (byDate[date] && byDate[date].length > 0) {
                cell.classList.add('has-appointment');  // Add special class
                const list = byDate[date];

                // COUNT per type
                let count = { blue: 0, green: 0, yellow: 0};
                list.forEach(a => {
                    if (a.type === "Tintado") {
                        count.green++;
                    } else if (a.type === "Lunas") {
                        count.blue++;
                    } else if (a.type === "Pulido") {
                        count.yellow++;
                    }
                });

                const text = `
                    <span style="color:#0abf04; font-weight: bold;">🟢 Tintado: ${count.green}</span><br>
                    <span style="color:#0090ff; font-weight: bold;">🔵 Lunas: ${count.blue}</span><br>
                    <span style="color:#E0A800; font-weight: bold;">🟡 Pulido: ${count.yellow}</span>
                `;
                cell.querySelector('.appt-box').innerHTML = holiday ? "🎉 Festivo" : text;
            }

            cell.onclick = async (e) => {
                e.stopPropagation();
                if (cell.classList.contains('inactive') || cell.classList.contains('weekend')) return;

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
                    <div class="menu-item" data-act="add"  style="padding:6px;cursor:pointer;">➕ Añadir Cita</div>
                    <div class="menu-item" data-act="holiday" style="padding:8px;cursor:pointer;">${holiday ? "🎉 Quitar festivo" : "🎉 Marcar como festivo"}</div>
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
                    /*
                    if (action === "view") {
                        const all = await db.getAll();
                        const list = all.filter(a => a.date === date);

                        // COUNT per type
                        let count = { blue: 0, green: 0, yellow: 0};
                        list.forEach(a => {
                            if (a.type === "Tintado") count.green++;
                            else if (a.type === "Lunas") count.blue++;
                            else if (a.type === "Pulido") count.yellow++;
                        });
                        showStyledAlert(date, count);
                    }
                    */

                    if (action === "add") {
                        // openModal expects dataset.date and dataset.time
                        if (!holiday) {
                            openModal({ dataset: { date, time: "09:00" }});
                        }
                    } else if (action === "holiday") {
                        await markAsHoliday(date);
                    }

                    menu.remove();
                };
            };
        });

        document.getElementById('countTintado').textContent = monthlyOrderCount.tintado;
        document.getElementById('countLunas').textContent   = monthlyOrderCount.lunas;
        document.getElementById('countPulido').textContent  = monthlyOrderCount.pulido;
    })();
}

// Mark / Unmark a day as Holiday
async function markAsHoliday(dateStr) {

    const all = await db.getAll();
    // All records for this date
    const dayRecords = all.filter(a => a.date === dateStr);
    // 1. Already marked as holiday -> change back to normal day
    const holidayRecord = dayRecords.find(a => a.isHoliday === true);

    if (holidayRecord) {
        alert(
            "Este día ya está marcado como festivo.\n" +
            "Se cambiará nuevamente a día normal."
        );
        holidayRecord.isHoliday = false;
        console.log("Update the holiday item and refresh the view")
        await db.delete(holidayRecord.id);
        renderMonthView(AppState.monthAnchor);
        return;
    }

    // 2. Check if normal appointments exist
    const normalAppointments = dayRecords.filter(a => !a.isHoliday);
    console.log(normalAppointments.length)
    if (normalAppointments.length > 0) {
        alert(
            "⚠️ Este día tiene citas programadas.\n\n" +
            "Mueva primero las citas antes de marcarlo como festivo."
        );
        return;
    }

    // 3. No appointments -> create holiday record
    const holiday = {
        date: dateStr,
        name: "",
        phone: "",
        type: "",
        matricula: "",
        orderTime: "",
        confirmed: "",
        order: "",
        observations: "Festivo",
        missed: 0,
        isHoliday: true,
        status: "",
        auto: false
    };

    await db.add(holiday);
    alert("Día marcado como festivo correctamente.");
    renderMonthView(AppState.monthAnchor);
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

        //const isHoliday = appt.isHoliday ?? false;
        //if (appt.isHoliday) return; // Skip holidays
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

function showAppointmentDetails(appt) {

    const text = `
      <strong>Detalles de la Cita</strong><br><br>

      <strong>Nombre:</strong> ${escapeHtml(appt.name)} &nbsp;&nbsp;&nbsp;
      <strong>Tel:</strong> ${escapeHtml(appt.phone)}<br><br>

      <strong>Tipo:</strong> ${escapeHtml(appt.type)} &nbsp;&nbsp;&nbsp;
      <strong>Hora:</strong> ${escapeHtml(appt.orderTime)} &nbsp;&nbsp;&nbsp;
      <strong>Vehículo:</strong> ${escapeHtml(appt.matricula || '-')}<br><br>

      <strong>Confirmación:</strong> ${escapeHtml(appt.confirmed || '')} &nbsp;&nbsp;&nbsp;
      <strong>Perdido:</strong> ${escapeHtml(appt.order || '')}<br><br>

      <strong>Observación:</strong><br>
      ${escapeHtml(appt.observations || '-')}
    `;

    document.getElementById("alertText").innerHTML = text;
    document.getElementById("customAlert").style.display = "block";
}

// Export functions so they can be used in app.js
window.renderCalendar = renderCalendar;
window.renderMonthView = renderMonthView;
window.loadAppointments = loadAppointments;
window.scheduleReminders = scheduleReminders;
window.autoUpdateStatusFor = autoUpdateStatusFor;
window.showAppointmentDetails = showAppointmentDetails;