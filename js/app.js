/* global Chart */
(function () {
  const STORAGE_KEY = "dinfluencers-hub-data-v1";
  const SETTINGS_KEY = "dinfluencers-hub-settings-v1";

  // Safe storage shim — falls back to in-memory map when localStorage is
  // blocked (Edge Tracking Prevention, private mode, disabled cookies, etc).
  const safeStorage = (() => {
    const memory = new Map();
    let useLocal = false;
    try {
      const probe = "__ds_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      useLocal = true;
    } catch {
      useLocal = false;
    }
    return {
      getItem(key) {
        if (useLocal) {
          try { return window.localStorage.getItem(key); } catch { /* fallthrough */ }
        }
        return memory.has(key) ? memory.get(key) : null;
      },
      setItem(key, value) {
        if (useLocal) {
          try { window.localStorage.setItem(key, value); return; } catch { /* fallthrough */ }
        }
        memory.set(key, String(value));
      },
      removeItem(key) {
        if (useLocal) {
          try { window.localStorage.removeItem(key); } catch { /* ignore */ }
        }
        memory.delete(key);
      },
    };
  })();

  const nowIsoDate = () => new Date().toISOString().slice(0, 10);
  const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const defaultState = {
    leads: [],
    appointments: [],
    presentations: [],
    closings: [],
    followups: [],
    onboarding: [],
    team: [],
    objections: [],
    kpiLogs: [],
    goals: {
      signups: 10,
      contacts: 100,
      appointments: 20,
      income: 300000,
    },
    activity: [],
  };

  const defaultSettings = {
    name: "Leader",
    phone: "",
    whatsapp: "",
    email: "",
    rank: "Consultant",
    mentor: "",
    targetContacts: 20,
    targetAppts: 5,
    targetPres: 3,
    targetSignups: 2,
  };

  const state = loadState();
  const settings = loadSettings();
  const charts = {};
  const api = {
    online: false,
    base: "/api",
  };

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${api.base}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    return null;
  }

  function fromProspectRow(row) {
    return {
      id: String(row.id),
      name: row.name,
      phone: row.phone || "",
      source: row.source || "Other",
      status: (row.status || "cold").replace(/^./, (s) => s.toUpperCase()),
      notes: row.notes || "",
      createdAt: row.created_at || new Date().toISOString(),
    };
  }

  function fromTeamRow(row) {
    return {
      id: String(row.id),
      name: row.name,
      level: row.level || "Consultant",
      sales: Number(row.sales || 0),
      status: row.active === false ? "inactive" : "active",
      joinDate: (row.join_date || nowIsoDate()).slice(0, 10),
    };
  }

  function fromFollowupRow(row) {
    return {
      id: String(row.id),
      name: row.prospect_name || row.name || "Prospect",
      prospectId: row.prospect_id ? String(row.prospect_id) : null,
      date: (row.scheduled_date || nowIsoDate()).slice(0, 10),
      method: row.method || "WhatsApp",
      note: row.notes || "",
      done: (row.status || "pending") === "done",
    };
  }

  async function hydrateFromBackend() {
    try {
      const health = await apiRequest("/health");
      api.online = health?.db === "connected";

      if (!api.online) {
        return;
      }

      const [prospects, team, followups] = await Promise.all([
        apiRequest("/prospects"),
        apiRequest("/team"),
        apiRequest("/followups"),
      ]);

      state.leads = Array.isArray(prospects) ? prospects.map(fromProspectRow) : [];
      state.team = Array.isArray(team) ? team.map(fromTeamRow) : [];
      state.followups = Array.isArray(followups) ? followups.map(fromFollowupRow) : [];
      saveState();
    } catch {
      api.online = false;
    }
  }

  function loadState() {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      return { ...structuredClone(defaultState), ...JSON.parse(raw) };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function loadSettings() {
    try {
      const raw = safeStorage.getItem(SETTINGS_KEY);
      if (!raw) return structuredClone(defaultSettings);
      return { ...structuredClone(defaultSettings), ...JSON.parse(raw) };
    } catch {
      return structuredClone(defaultSettings);
    }
  }

  function saveState() {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveSettings() {
    safeStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa fa-circle-info"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 30);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  function addActivity(action) {
    state.activity.unshift({ id: uid(), action, at: new Date().toISOString() });
    state.activity = state.activity.slice(0, 30);
  }

  function formatCurrency(amount) {
    const n = Number(amount) || 0;
    return `₦${n.toLocaleString()}`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function getTodayCounts() {
    const today = nowIsoDate();
    const followupsToday = state.followups.filter((f) => f.date === today && !f.done).length;
    const signups = state.closings.filter((c) => c.status !== "pending").length;
    const totalLeads = state.leads.length;
    const appts = state.appointments.length;
    const convRate = totalLeads ? Math.round((signups / totalLeads) * 100) : 0;
    return { followupsToday, signups, totalLeads, appts, convRate };
  }

  function renderPageTitle(page) {
    const titleMap = {
      dashboard: "Dashboard",
      workflow: "Daily Workflow",
      prospecting: "Prospecting",
      appointments: "Appointments",
      presentations: "Presentations",
      closing: "Closing & Sign-Up",
      followup: "Follow-Up",
      onboarding: "Onboarding",
      team: "My Team",
      kpi: "KPI Tracker",
      accountability: "Accountability",
      tools: "Tools & Resources",
      settings: "Settings",
    };
    setText("pageTitle", titleMap[page] || "Dashboard");
  }

  function navigateTo(page) {
    document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));

    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add("active");

    document.querySelectorAll(`.nav-item[data-page='${page}']`).forEach((el) => el.classList.add("active"));
    renderPageTitle(page);
  }

  function renderDateHeader() {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    setText("pageDate", dateStr);
    setText("wfDate", dateStr);
  }

  function renderDashboard() {
    const { totalLeads, appts, signups, convRate, followupsToday } = getTodayCounts();
    const teamSize = state.team.length;

    setText("kpi-leads", String(totalLeads));
    setText("kpi-appts", String(appts));
    setText("kpi-signups", String(signups));
    setText("kpi-rate", `${convRate}%`);
    setText("kpi-followups", String(followupsToday));
    setText("kpi-team", String(teamSize));

    setText("badge-leads", String(totalLeads));
    const overdue = state.followups.filter((f) => !f.done && new Date(`${f.date}T00:00:00`) < new Date(`${nowIsoDate()}T00:00:00`)).length;
    setText("badge-followup", String(overdue));
    setText("badge-appts", String(state.appointments.length));

    renderFunnel();
    renderActivity();
    renderDashLeaderboard();
    renderWeeklyChart();
    renderLeadPieChart();
  }

  function renderFunnel() {
    const groups = {
      Cold: 0,
      Warm: 0,
      Hot: 0,
      Converted: 0,
    };
    state.leads.forEach((l) => {
      const k = (l.status || "Cold").toLowerCase();
      if (k === "cold") groups.Cold += 1;
      if (k === "warm") groups.Warm += 1;
      if (k === "hot") groups.Hot += 1;
      if (k === "converted") groups.Converted += 1;
    });

    const el = document.getElementById("funnelDisplay");
    if (!el) return;
    el.innerHTML = Object.entries(groups)
      .map(([label, count]) => `
        <div class="funnel-stage">
          <div class="funnel-label">${label}</div>
          <div class="funnel-count">${count}</div>
        </div>
      `)
      .join("");
  }

  function renderActivity() {
    const el = document.getElementById("activityFeed");
    if (!el) return;
    if (!state.activity.length) {
      el.innerHTML = '<div class="empty-state"><i class="fa fa-clock"></i><p>No activity yet.</p></div>';
      return;
    }

    el.innerHTML = state.activity
      .slice(0, 8)
      .map((a) => {
        const time = new Date(a.at).toLocaleString();
        return `<div class="activity-item"><i class="fa fa-circle"></i><div><p>${escapeHtml(a.action)}</p><small>${time}</small></div></div>`;
      })
      .join("");
  }

  function renderDashLeaderboard() {
    const el = document.getElementById("dashLeaderboard");
    if (!el) return;
    if (!state.team.length) {
      el.innerHTML = '<div class="empty-state"><i class="fa fa-users"></i><p>No team data yet.</p></div>';
      return;
    }

    const ranked = [...state.team]
      .sort((a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0))
      .slice(0, 5);

    el.innerHTML = ranked
      .map(
        (m, idx) => `<div class="lb-item">
          <div class="lb-rank ${idx === 0 ? "r1" : idx === 1 ? "r2" : idx === 2 ? "r3" : "rn"}">${idx + 1}</div>
          <div class="lb-info"><div class="lb-name">${escapeHtml(m.name)}</div><div class="lb-meta">${escapeHtml(m.level || "Consultant")} · ${m.sales || 0} sales</div></div>
          <span class="lb-score">${formatCurrency((m.sales || 0) * 5000)}</span>
        </div>`
      )
      .join("");
  }

  function safeChartDestroy(name) {
    if (charts[name]) {
      charts[name].destroy();
      delete charts[name];
    }
  }

  function renderWeeklyChart() {
    const canvas = document.getElementById("weeklyChart");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const values = labels.map(() => 0);

    state.leads.forEach((l) => {
      const d = new Date(l.createdAt || Date.now());
      const day = d.getDay();
      const idx = day === 0 ? 6 : day - 1;
      values[idx] += 1;
    });

    safeChartDestroy("weekly");
    charts.weekly = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "New Leads",
            data: values,
            borderColor: "#F5C518",
            backgroundColor: "rgba(245, 197, 24, 0.15)",
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function renderLeadPieChart() {
    const canvas = document.getElementById("leadPieChart");
    if (!canvas || typeof Chart === "undefined") return;

    const cold = state.leads.filter((l) => (l.status || "").toLowerCase() === "cold").length;
    const warm = state.leads.filter((l) => (l.status || "").toLowerCase() === "warm").length;
    const hot = state.leads.filter((l) => (l.status || "").toLowerCase() === "hot").length;
    const converted = state.leads.filter((l) => (l.status || "").toLowerCase() === "converted").length;

    safeChartDestroy("leadPie");
    charts.leadPie = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Cold", "Warm", "Hot", "Converted"],
        datasets: [{ data: [cold, warm, hot, converted], backgroundColor: ["#4A9EFF", "#FF8C42", "#E63946", "#2DC653"] }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function renderWorkflow() {
    const checklists = ["morning", "afternoon", "evening", "night"];
    let total = 0;
    let done = 0;

    checklists.forEach((block) => {
      const list = document.getElementById(`wf-${block}-list`);
      if (!list) return;
      const inputs = list.querySelectorAll("input[type='checkbox']");
      const checked = [...inputs].filter((i) => i.checked).length;
      total += inputs.length;
      done += checked;
      const pct = inputs.length ? Math.round((checked / inputs.length) * 100) : 0;
      const bar = document.getElementById(`prog-${block}`);
      if (bar) bar.style.width = `${pct}%`;
    });

    const allPct = total ? Math.round((done / total) * 100) : 0;
    const overall = document.getElementById("overallProgress");
    if (overall) overall.style.width = `${allPct}%`;
    setText("overallPct", `${allPct}% Complete`);
  }

  function renderProspecting() {
    const searchTerm = (document.getElementById("leadSearch")?.value || "").trim().toLowerCase();
    const catFilter = document.getElementById("leadCatFilter")?.value || "all";
    const sourceFilter = document.getElementById("leadSourceFilter")?.value || "all";

    const filtered = state.leads.filter((l) => {
      const text = `${l.name} ${l.phone} ${l.source}`.toLowerCase();
      const okSearch = !searchTerm || text.includes(searchTerm);
      const okCat = catFilter === "all" || (l.status || "Cold").toLowerCase() === catFilter.toLowerCase();
      const okSource = sourceFilter === "all" || (l.source || "other").toLowerCase() === sourceFilter.toLowerCase();
      return okSearch && okCat && okSource;
    });

    const body = document.getElementById("leadsTableBody");
    if (body) {
      if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty-row">No leads found.</td></tr>';
      } else {
        body.innerHTML = filtered
          .map(
            (l, idx) => `<tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(l.name)}</td>
              <td>${escapeHtml(l.phone || "")}</td>
              <td>${escapeHtml(l.source || "Other")}</td>
              <td><span class="badge-status badge-${(l.status || "Cold").toLowerCase()}">${escapeHtml(l.status || "Cold")}</span></td>
              <td>${new Date(l.createdAt || Date.now()).toLocaleDateString()}</td>
              <td>${escapeHtml(l.notes || "-")}</td>
              <td><button class="btn-sm" data-lead-id="${l.id}" data-action="delete-lead">Delete</button></td>
            </tr>`
          )
          .join("");
      }
    }

    const byStatus = {
      cold: state.leads.filter((l) => (l.status || "").toLowerCase() === "cold"),
      warm: state.leads.filter((l) => (l.status || "").toLowerCase() === "warm"),
      hot: state.leads.filter((l) => (l.status || "").toLowerCase() === "hot"),
      converted: state.leads.filter((l) => (l.status || "").toLowerCase() === "converted"),
    };

    setText("stat-cold", String(byStatus.cold.length));
    setText("stat-warm", String(byStatus.warm.length));
    setText("stat-hot", String(byStatus.hot.length));
    setText("stat-converted", String(byStatus.converted.length));

    setText("cnt-cold", String(byStatus.cold.length));
    setText("cnt-warm", String(byStatus.warm.length));
    setText("cnt-hot", String(byStatus.hot.length));
    setText("cnt-converted", String(byStatus.converted.length));

    renderKanbanColumn("Cold", byStatus.cold);
    renderKanbanColumn("Warm", byStatus.warm);
    renderKanbanColumn("Hot", byStatus.hot);
    renderKanbanColumn("Converted", byStatus.converted);
  }

  function renderKanbanColumn(statusLabel, leads) {
    const el = document.getElementById(`kanban-items-${statusLabel}`);
    if (!el) return;
    if (!leads.length) {
      el.innerHTML = '<div class="kanban-empty">No leads</div>';
      return;
    }
    el.innerHTML = leads
      .map(
        (l) => `<div class="kanban-card">
          <div class="kb-name">${escapeHtml(l.name)}</div>
          <div class="kb-meta">${escapeHtml(l.phone || "No phone")}</div>
          <div class="kb-actions">
            ${statusLabel !== "Cold" ? `<button class="btn-sm" data-action="move-lead" data-lead-id="${l.id}" data-status="Cold">Cold</button>` : ""}
            ${statusLabel !== "Warm" ? `<button class="btn-sm" data-action="move-lead" data-lead-id="${l.id}" data-status="Warm">Warm</button>` : ""}
            ${statusLabel !== "Hot" ? `<button class="btn-sm" data-action="move-lead" data-lead-id="${l.id}" data-status="Hot">Hot</button>` : ""}
            ${statusLabel !== "Converted" ? `<button class="btn-sm" data-action="move-lead" data-lead-id="${l.id}" data-status="Converted">Convert</button>` : ""}
          </div>
        </div>`
      )
      .join("");
  }

  function renderAppointments() {
    const statusFilter = document.getElementById("apptStatusFilter")?.value || "all";
    const list = state.appointments.filter((a) => statusFilter === "all" || a.status === statusFilter);

    const body = document.getElementById("apptsTableBody");
    if (body) {
      body.innerHTML = list.length
        ? list
            .map(
              (a, i) => `<tr>
                <td>${i + 1}</td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.date)}</td><td>${escapeHtml(a.time || "")}</td><td>${escapeHtml(a.method || "")}</td>
                <td><span class="badge-status badge-${escapeHtml(a.status || "booked")}">${escapeHtml(a.status || "booked")}</span></td>
                <td><button class="btn-sm" data-action="delete-appt" data-id="${a.id}">Delete</button></td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="7" class="empty-row">No appointments yet.</td></tr>';
    }

    const count = (s) => state.appointments.filter((a) => a.status === s).length;
    setText("apt-booked", String(count("booked")));
    setText("apt-confirmed", String(count("confirmed")));
    setText("apt-attended", String(count("attended")));
    setText("apt-rescheduled", String(count("rescheduled")));

    renderApptChart();
  }

  function renderApptChart() {
    const canvas = document.getElementById("apptChart");
    if (!canvas || typeof Chart === "undefined") return;
    safeChartDestroy("appt");

    const data = ["booked", "confirmed", "attended", "rescheduled", "cancelled"].map(
      (s) => state.appointments.filter((a) => a.status === s).length
    );

    charts.appt = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Booked", "Confirmed", "Attended", "Rescheduled", "Cancelled"],
        datasets: [{ data, backgroundColor: ["#4A9EFF", "#2DC653", "#F5C518", "#FF8C42", "#E63946"] }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
  }

  function renderPresentations() {
    const body = document.getElementById("presentationsBody");
    if (body) {
      body.innerHTML = state.presentations.length
        ? state.presentations
            .map(
              (p, i) => `<tr>
                <td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.type || "")}</td>
                <td>${escapeHtml(p.date || "")}</td><td>${escapeHtml(p.status || "booked")}</td><td>${escapeHtml(p.notes || "-")}</td>
                <td><button class="btn-sm" data-action="delete-pres" data-id="${p.id}">Delete</button></td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="7" class="empty-row">No presentations yet.</td></tr>';
    }

    const objectionLog = document.getElementById("objectionLog");
    if (objectionLog) {
      objectionLog.innerHTML = state.objections.length
        ? state.objections
            .slice(0, 8)
            .map((o) => `<div class="objection-item"><div class="obj-text">${escapeHtml(o)}</div></div>`)
            .join("")
        : '<div class="empty-state"><i class="fa fa-comment-slash"></i><p>No objections logged yet.</p></div>';
    }

    renderInterestChart();
  }

  function renderInterestChart() {
    const canvas = document.getElementById("interestChart");
    if (!canvas || typeof Chart === "undefined") return;
    safeChartDestroy("interest");

    const hot = state.leads.filter((l) => (l.status || "").toLowerCase() === "hot").length;
    const converted = state.leads.filter((l) => (l.status || "").toLowerCase() === "converted").length;
    const warm = state.leads.filter((l) => (l.status || "").toLowerCase() === "warm").length;

    charts.interest = new Chart(canvas, {
      type: "radar",
      data: {
        labels: ["Warm", "Hot", "Converted"],
        datasets: [
          {
            label: "Lead Heat",
            data: [warm, hot, converted],
            borderColor: "#F5C518",
            backgroundColor: "rgba(245,197,24,0.2)",
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function renderClosing() {
    const body = document.getElementById("closingBody");
    if (body) {
      body.innerHTML = state.closings.length
        ? state.closings
            .map(
              (c, i) => `<tr>
                <td>${i + 1}</td><td>${escapeHtml(c.name)}</td><td>${formatCurrency(c.amount)}</td><td>${escapeHtml(c.date)}</td>
                <td><span class="badge-status badge-${escapeHtml(c.status)}">${escapeHtml(c.status)}</span></td>
                <td><button class="btn-sm" data-action="delete-closing" data-id="${c.id}">Delete</button></td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="6" class="empty-row">No sign-ups logged yet.</td></tr>';
    }

    setText("cls-total", String(state.closings.length));
    setText("cls-paid", String(state.closings.filter((c) => c.status === "paid").length));
    setText("cls-pending", String(state.closings.filter((c) => c.status === "pending").length));
    setText("cls-onboarded", String(state.closings.filter((c) => c.onboarded).length));
  }

  function renderFollowup() {
    const filter = document.getElementById("fuFilter")?.value || "all";
    const today = nowIsoDate();

    const list = state.followups.filter((f) => {
      if (filter === "all") return true;
      if (filter === "overdue") return !f.done && f.date < today;
      if (filter === "today") return !f.done && f.date === today;
      if (filter === "upcoming") return !f.done && f.date > today;
      if (filter === "completed") return f.done;
      return true;
    });

    const body = document.getElementById("followupBody");
    if (body) {
      body.innerHTML = list.length
        ? list
            .map(
              (f, i) => `<tr>
                <td>${i + 1}</td><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.date)}</td><td>${escapeHtml(f.method || "")}</td><td>${escapeHtml(f.note || "-")}</td>
                <td>${f.done ? '<span class="badge-status badge-active">Done</span>' : `<button class="btn-sm" data-action="mark-fu" data-id="${f.id}">Mark Done</button>`}</td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="6" class="empty-row">No follow-ups.</td></tr>';
    }

    setText("fu-overdue", String(state.followups.filter((f) => !f.done && f.date < today).length));
    setText("fu-due-today", String(state.followups.filter((f) => !f.done && f.date === today).length));
    setText("fu-upcoming", String(state.followups.filter((f) => !f.done && f.date > today).length));
    setText("fu-completed", String(state.followups.filter((f) => f.done).length));
  }

  function renderOnboarding() {
    const body = document.getElementById("onboardingBody");
    if (!body) return;
    body.innerHTML = state.onboarding.length
      ? state.onboarding
          .map(
            (o, i) => `<tr>
              <td>${i + 1}</td><td>${escapeHtml(o.name)}</td><td>${escapeHtml(o.date || "")}</td><td>${escapeHtml(o.status || "In Progress")}</td>
              <td>${escapeHtml(o.notes || "-")}</td><td><button class="btn-sm" data-action="delete-onboard" data-id="${o.id}">Delete</button></td>
            </tr>`
          )
          .join("")
      : '<tr><td colspan="6" class="empty-row">No onboarding records.</td></tr>';
  }

  function renderTeam() {
    const query = (document.getElementById("teamSearch")?.value || "").toLowerCase();
    const levelFilter = (document.getElementById("teamLevelFilter")?.value || "all").toLowerCase();

    const list = state.team.filter((m) => {
      const okQuery = !query || `${m.name} ${m.level}`.toLowerCase().includes(query);
      const okLevel = levelFilter === "all" || (m.level || "").toLowerCase() === levelFilter;
      return okQuery && okLevel;
    });

    const grid = document.getElementById("teamGrid");
    if (grid) {
      grid.innerHTML = list.length
        ? list
            .map(
              (m) => `<div class="team-card ${escapeHtml((m.level || "consultant").toLowerCase())}">
                <div class="team-name">${escapeHtml(m.name)}</div>
                <div class="team-meta">${escapeHtml(m.level || "Consultant")}</div>
                <div class="team-meta">Sales: ${m.sales || 0}</div>
                <button class="btn-sm" data-action="delete-team" data-id="${m.id}">Remove</button>
              </div>`
            )
            .join("")
        : '<div class="empty-state"><i class="fa fa-users"></i><p>No team members.</p></div>';
    }

    setText("tm-leaders", String(state.team.filter((m) => (m.level || "").toLowerCase() === "leader").length));
    setText("tm-active", String(state.team.filter((m) => (m.status || "active") === "active").length));
    setText("tm-new", String(state.team.filter((m) => (m.joinDate || "") >= nowIsoDate()).length));
    setText("tm-inactive", String(state.team.filter((m) => (m.status || "active") !== "active").length));
  }

  function renderKPI() {
    const count = getTodayCounts();
    setText("k-contacts", String(state.leads.length));
    setText("k-appts-booked", String(state.appointments.length));
    setText("k-presentations", String(state.presentations.length));
    setText("k-conv-rate", `${count.convRate}%`);
    setText("k-signups", String(count.signups));

    const dupRate = state.team.length ? Math.round((state.team.filter((t) => (t.sales || 0) > 0).length / state.team.length) * 100) : 0;
    setText("k-dup-rate", `${dupRate}%`);

    renderKpiTrendChart();
    renderIncomeChart();

    const body = document.getElementById("kpiLogBody");
    if (body) {
      body.innerHTML = state.kpiLogs.length
        ? state.kpiLogs
            .slice(0, 20)
            .map(
              (k) => `<tr><td>${escapeHtml(k.date)}</td><td>${k.contacts}</td><td>${k.appts}</td><td>${k.presentations}</td><td>${k.signups}</td><td>${formatCurrency(k.income)}</td></tr>`
            )
            .join("")
        : '<tr><td colspan="6" class="empty-row">No KPI entries yet.</td></tr>';
    }
  }

  function renderKpiTrendChart() {
    const canvas = document.getElementById("kpiTrendChart");
    if (!canvas || typeof Chart === "undefined") return;
    safeChartDestroy("kpiTrend");

    const recent = [...state.kpiLogs].slice(-7);
    charts.kpiTrend = new Chart(canvas, {
      type: "line",
      data: {
        labels: recent.map((x) => x.date.slice(5)),
        datasets: [
          { label: "Contacts", data: recent.map((x) => x.contacts), borderColor: "#4A9EFF", tension: 0.3 },
          { label: "Appointments", data: recent.map((x) => x.appts), borderColor: "#2DC653", tension: 0.3 },
          { label: "Signups", data: recent.map((x) => x.signups), borderColor: "#F5C518", tension: 0.3 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function renderIncomeChart() {
    const canvas = document.getElementById("incomeChart");
    if (!canvas || typeof Chart === "undefined") return;
    safeChartDestroy("income");

    const monthly = new Array(12).fill(0);
    state.closings.forEach((c) => {
      if (!c.date) return;
      const m = new Date(c.date).getMonth();
      monthly[m] += Number(c.amount) || 0;
    });

    charts.income = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        datasets: [{ label: "Income", data: monthly, backgroundColor: "#F5C518" }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  function renderAccountability() {
    const signups = state.closings.length;
    const contacts = state.leads.length;
    const appts = state.appointments.length;
    const income = state.closings.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

    const pct = (val, target) => (target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0);

    setText("goal-signups-val", `${signups} / ${state.goals.signups}`);
    setText("goal-contacts-val", `${contacts} / ${state.goals.contacts}`);
    setText("goal-appts-val", `${appts} / ${state.goals.appointments}`);
    setText("goal-income-val", `${formatCurrency(income)} / ${formatCurrency(state.goals.income)}`);

    const sBar = document.getElementById("goal-signups-bar");
    if (sBar) sBar.style.width = `${pct(signups, state.goals.signups)}%`;
    const cBar = document.getElementById("goal-contacts-bar");
    if (cBar) cBar.style.width = `${pct(contacts, state.goals.contacts)}%`;
    const aBar = document.getElementById("goal-appts-bar");
    if (aBar) aBar.style.width = `${pct(appts, state.goals.appointments)}%`;
    const iBar = document.getElementById("goal-income-bar");
    if (iBar) iBar.style.width = `${pct(income, state.goals.income)}%`;

    const board = document.getElementById("leaderboardFull");
    if (board) {
      const ranked = [...state.team].sort((a, b) => (b.sales || 0) - (a.sales || 0));
      board.innerHTML = ranked.length
        ? ranked
            .map(
              (m, idx) => `<div class="lb-item"><div class="lb-rank ${idx < 3 ? `r${idx + 1}` : "rn"}">${idx + 1}</div><div class="lb-info"><div class="lb-name">${escapeHtml(m.name)}</div><div class="lb-meta">${escapeHtml(m.level || "Consultant")}</div></div><span class="lb-score">${m.sales || 0} sales</span></div>`
            )
            .join("")
        : '<div class="empty-state"><i class="fa fa-trophy"></i><p>No leaderboard data yet.</p></div>';
    }
  }

  function bindEvents() {
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo(item.dataset.page);
      });
    });

    const sideToggle = document.getElementById("sidebarToggle");
    if (sideToggle) {
      sideToggle.addEventListener("click", () => {
        document.getElementById("sidebar")?.classList.toggle("collapsed");
      });
    }

    const menuBtn = document.getElementById("menuBtn");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        document.getElementById("sidebar")?.classList.toggle("open");
      });
    }

    document.body.addEventListener("change", (e) => {
      if (e.target.matches(".wf-checklist input[type='checkbox']")) {
        renderWorkflow();
      }
    });

    document.body.addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t) return;

      if (t.dataset.action === "delete-lead") {
        if (api.online) {
          try {
            await apiRequest(`/prospects/${t.dataset.leadId}`, { method: "DELETE" });
          } catch {
            showToast("Could not delete lead from server", "error");
            return;
          }
        }
        state.leads = state.leads.filter((l) => l.id !== t.dataset.leadId);
        addActivity("Deleted a lead");
      }

      if (t.dataset.action === "move-lead") {
        const lead = state.leads.find((l) => l.id === t.dataset.leadId);
        if (lead) {
          if (api.online) {
            try {
              await apiRequest(`/prospects/${lead.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: String(t.dataset.status || "Cold").toLowerCase() }),
              });
            } catch {
              showToast("Could not update lead status on server", "error");
              return;
            }
          }
          lead.status = t.dataset.status;
          addActivity(`Moved ${lead.name} to ${lead.status}`);
        }
      }

      if (t.dataset.action === "delete-appt") state.appointments = state.appointments.filter((a) => a.id !== t.dataset.id);
      if (t.dataset.action === "delete-pres") state.presentations = state.presentations.filter((p) => p.id !== t.dataset.id);
      if (t.dataset.action === "delete-closing") state.closings = state.closings.filter((c) => c.id !== t.dataset.id);
      if (t.dataset.action === "delete-onboard") state.onboarding = state.onboarding.filter((o) => o.id !== t.dataset.id);
      if (t.dataset.action === "delete-team") {
        state.team = state.team.filter((m) => m.id !== t.dataset.id);
      }
      if (t.dataset.action === "mark-fu") {
        const f = state.followups.find((x) => x.id === t.dataset.id);
        if (f) {
          if (api.online) {
            try {
              await apiRequest(`/followups/${f.id}/complete`, { method: "PATCH" });
            } catch {
              showToast("Could not mark follow-up complete on server", "error");
              return;
            }
          }
          f.done = true;
        }
      }

      saveState();
      renderAll();
    });
  }

  // ── Modal helper ──────────────────────────────────────────────────────────
  function showFormModal(title, fieldsHtml, submitLabel, onSubmit) {
    const overlay = document.getElementById("modalOverlay");
    const content = document.getElementById("modalContent");
    if (!overlay || !content) return;
    content.innerHTML = `
      <h2 class="modal-title">${title}</h2>
      <form id="appForm" class="app-form">
        ${fieldsHtml}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${submitLabel}</button>
          <button type="button" class="btn btn-ghost" onclick="App.ui.closeModal()">Cancel</button>
        </div>
      </form>`;
    overlay.classList.add("open");
    document.getElementById("appForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      overlay.classList.remove("open");
      onSubmit(data);
    });
  }

  async function promptLead(defaultStatus) {
    return new Promise((resolve) => {
      showFormModal(
        "Add New Lead",
        `<div class="form-group"><label>Name *</label><input name="name" required placeholder="Full name" class="form-input"></div>
         <div class="form-group"><label>Phone</label><input name="phone" placeholder="+234..." class="form-input"></div>
         <div class="form-group"><label>Source</label>
           <select name="source" class="form-input" aria-label="Lead source">
             <option value="WhatsApp">WhatsApp</option><option value="Facebook">Facebook</option>
             <option value="Instagram">Instagram</option><option value="Referral">Referral</option><option value="Other">Other</option>
           </select></div>
         <div class="form-group"><label>Notes</label><textarea name="notes" class="form-input" rows="2" placeholder="Short notes..."></textarea></div>`,
        "Add Lead",
        async ({ name, phone, source, notes }) => {
          if (!name) return resolve();
          const localLead = { id: uid(), name, phone: phone || "", source: source || "Other", status: defaultStatus || "Cold", notes: notes || "", createdAt: new Date().toISOString() };
          if (api.online) {
            try {
              const created = await apiRequest("/prospects", { method: "POST", body: JSON.stringify({ name, phone, source: String(source || "other").toLowerCase(), status: String(defaultStatus || "Cold").toLowerCase(), notes }) });
              state.leads.push(fromProspectRow(created));
            } catch { state.leads.push(localLead); showToast("Saved locally (server unavailable)", "warning"); }
          } else { state.leads.push(localLead); }
          addActivity(`Added lead ${name}`); saveState(); renderAll(); showToast("Lead added", "success"); resolve();
        }
      );
    });
  }



  function promptAppointment() {
    showFormModal(
      "Book Appointment",
      `<div class="form-group"><label>Prospect Name *</label><input name="name" required class="form-input" placeholder="Name"></div>
       <div class="form-group"><label>Date</label><input name="date" type="date" class="form-input" value="${nowIsoDate()}"></div>
       <div class="form-group"><label>Time</label><input name="time" type="time" class="form-input" value="18:00"></div>
       <div class="form-group"><label>Method</label>
         <select name="method" class="form-input" aria-label="Meeting method">
           <option>Zoom</option><option>Call</option><option>In-person</option>
         </select></div>
       <div class="form-group"><label>Status</label>
         <select name="status" class="form-input" aria-label="Appointment status">
           <option value="booked">Booked</option><option value="confirmed">Confirmed</option>
           <option value="attended">Attended</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option>
         </select></div>`,
      "Save Appointment",
      ({ name, date, time, method, status }) => {
        if (!name) return;
        state.appointments.push({ id: uid(), name, date: date || nowIsoDate(), time: time || "18:00", method: method || "Zoom", status: status || "booked" });
        addActivity(`Booked appointment for ${name}`); saveState(); renderAll(); showToast("Appointment saved", "success");
      }
    );
  }

  function promptPresentation() {
    showFormModal(
      "Log Presentation",
      `<div class="form-group"><label>Guest / Prospect *</label><input name="name" required class="form-input" placeholder="Name"></div>
       <div class="form-group"><label>Type</label>
         <select name="type" class="form-input" aria-label="Presentation type">
           <option>Zoom</option><option>1-on-1</option><option>In-person</option>
         </select></div>
       <div class="form-group"><label>Date</label><input name="date" type="date" class="form-input" value="${nowIsoDate()}"></div>
       <div class="form-group"><label>Status</label>
         <select name="status" class="form-input" aria-label="Presentation status">
           <option value="booked">Booked</option><option value="attended">Attended</option><option value="cancelled">Cancelled</option>
         </select></div>
       <div class="form-group"><label>Notes</label><textarea name="notes" class="form-input" rows="2"></textarea></div>`,
      "Save Presentation",
      ({ name, type, date, status, notes }) => {
        if (!name) return;
        state.presentations.push({ id: uid(), name, type: type || "Zoom", date: date || nowIsoDate(), status: status || "booked", notes: notes || "" });
        addActivity(`Logged presentation for ${name}`); saveState(); renderAll(); showToast("Presentation saved", "success");
      }
    );
  }

  function promptClosing() {
    showFormModal(
      "Record Sign-Up",
      `<div class="form-group"><label>New Sign-Up Name *</label><input name="name" required class="form-input" placeholder="Name"></div>
       <div class="form-group"><label>Amount (₦)</label><input name="amount" type="number" class="form-input" value="5000" min="0"></div>
       <div class="form-group"><label>Date</label><input name="date" type="date" class="form-input" value="${nowIsoDate()}"></div>
       <div class="form-group"><label>Status</label>
         <select name="status" class="form-input" aria-label="Payment status">
           <option value="paid">Paid</option><option value="pending">Pending</option>
         </select></div>`,
      "Record Sign-Up",
      ({ name, amount, date, status }) => {
        if (!name) return;
        state.closings.push({ id: uid(), name, amount: Number(amount) || 0, date: date || nowIsoDate(), status: status || "paid", onboarded: false });
        addActivity(`Logged sign-up for ${name}`); saveState(); renderAll(); showToast("Sign-up recorded", "success");
      }
    );
  }

  async function promptFollowup() {
    return new Promise((resolve) => {
      showFormModal(
        "Schedule Follow-Up",
        `<div class="form-group"><label>Prospect Name *</label><input name="name" required class="form-input" placeholder="Name"></div>
         <div class="form-group"><label>Date</label><input name="date" type="date" class="form-input" value="${nowIsoDate()}"></div>
         <div class="form-group"><label>Method</label>
           <select name="method" class="form-input" aria-label="Follow-up method">
             <option>WhatsApp</option><option>Call</option><option>DM</option>
           </select></div>
         <div class="form-group"><label>Notes</label><textarea name="note" class="form-input" rows="2"></textarea></div>`,
        "Schedule Follow-Up",
        async ({ name, date, method, note }) => {
          if (!name) return resolve();
          const matchedLead = state.leads.find((l) => l.name.toLowerCase() === name.toLowerCase());
          const localFollowup = { id: uid(), name, date: date || nowIsoDate(), method: method || "WhatsApp", note: note || "", done: false, prospectId: matchedLead?.id || null };
          if (api.online && matchedLead?.id) {
            try {
              const created = await apiRequest("/followups", { method: "POST", body: JSON.stringify({ prospect_id: Number(matchedLead.id), scheduled_date: date || nowIsoDate(), method: String(method || "whatsapp").toLowerCase(), notes: note }) });
              state.followups.push(fromFollowupRow({ ...created, prospect_name: matchedLead.name }));
            } catch { state.followups.push(localFollowup); showToast("Saved locally (server unavailable)", "warning"); }
          } else { state.followups.push(localFollowup); }
          addActivity(`Scheduled follow-up for ${name}`); saveState(); renderAll(); showToast("Follow-up added", "success"); resolve();
        }
      );
    });
  }

  function promptOnboarding() {
    showFormModal(
      "Start Onboarding",
      `<div class="form-group"><label>New Member Name *</label><input name="name" required class="form-input" placeholder="Name"></div>
       <div class="form-group"><label>Status</label>
         <select name="status" class="form-input" aria-label="Onboarding status">
           <option value="In Progress">In Progress</option><option value="Completed">Completed</option><option value="Stalled">Stalled</option>
         </select></div>
       <div class="form-group"><label>Notes</label><textarea name="notes" class="form-input" rows="2"></textarea></div>`,
      "Start Onboarding",
      ({ name, status, notes }) => {
        if (!name) return;
        state.onboarding.push({ id: uid(), name, date: nowIsoDate(), status: status || "In Progress", notes: notes || "" });
        addActivity(`Started onboarding for ${name}`); saveState(); renderAll(); showToast("Onboarding entry added", "success");
      }
    );
  }

  async function promptTeam() {
    return new Promise((resolve) => {
      showFormModal(
        "Add Team Member",
        `<div class="form-group"><label>Name *</label><input name="name" required class="form-input" placeholder="Full name"></div>
         <div class="form-group"><label>Level</label>
           <select name="level" class="form-input" aria-label="Team level">
             <option>Starter</option><option selected>Consultant</option><option>Senior</option><option>Leader</option>
           </select></div>
         <div class="form-group"><label>Sales Count</label><input name="sales" type="number" class="form-input" value="0" min="0"></div>
         <div class="form-group"><label>Status</label>
           <select name="status" class="form-input" aria-label="Member status">
             <option value="active">Active</option><option value="inactive">Inactive</option>
           </select></div>`,
        "Add Member",
        async ({ name, level, sales, status }) => {
          if (!name) return resolve();
          const localMember = { id: uid(), name, level: level || "Consultant", sales: Number(sales) || 0, status: status || "active", joinDate: nowIsoDate() };
          if (api.online) {
            try {
              const created = await apiRequest("/team", { method: "POST", body: JSON.stringify({ name, phone: "", level: String(level || "starter").toLowerCase(), active: status === "active", join_date: nowIsoDate(), notes: "" }) });
              state.team.push(fromTeamRow(created));
            } catch { state.team.push(localMember); showToast("Saved locally (server unavailable)", "warning"); }
          } else { state.team.push(localMember); }
          addActivity(`Added team member ${name}`); saveState(); renderAll(); showToast("Team member added", "success"); resolve();
        }
      );
    });
  }

  function renderAll() {
    renderDateHeader();
    renderDashboard();
    renderWorkflow();
    renderProspecting();
    renderAppointments();
    renderPresentations();
    renderClosing();
    renderFollowup();
    renderOnboarding();
    renderTeam();
    renderKPI();
    renderAccountability();
  }

  function syncProfileFromSettings() {
    setText("welcomeName", settings.name || "Leader");

    const map = {
      "st-adminName": "name",
      "st-adminContact": "phone",
      "st-targetContacts": "targetContacts",
      "st-targetAppts": "targetAppts",
      "st-targetPres": "targetPres",
      "st-targetSignups": "targetSignups",
    };

    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = settings[key] ?? "";
    });
  }

  function saveProfileFromInputs() {
    const read = (id) => document.getElementById(id)?.value ?? "";
    settings.name = read("st-adminName") || "Leader";
    settings.phone = read("st-adminContact");
    settings.orgName = read("st-orgName");
    settings.currency = read("st-currency") || "₦";
    saveSettings();
    syncProfileFromSettings();
    showToast("Profile saved", "success");
  }

  function saveTargetsFromInputs() {
    const n = (id, fallback = 0) => Number(document.getElementById(id)?.value || fallback);
    settings.targetContacts = n("st-targetContacts", 20);
    settings.targetAppts = n("st-targetAppts", 5);
    settings.targetPres = n("st-targetPres", 3);
    settings.targetSignups = n("st-targetSignups", 2);

    state.goals.contacts = settings.targetContacts * 5;
    state.goals.appointments = settings.targetAppts * 4;
    state.goals.signups = settings.targetSignups * 4;

    saveSettings();
    saveState();
    renderAll();
    showToast("Targets saved", "success");
  }

  function initPwaSupport() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        showToast("Service worker registration failed", "error");
      });
    });

    const updateConnectivity = () => {
      const offline = !navigator.onLine;
      const banner = document.getElementById("offlineBanner");
      if (banner) banner.classList.toggle("show", offline);
    };
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    updateConnectivity();
  }

  const App = {
    async init() {
      await hydrateFromBackend();
      bindEvents();
      syncProfileFromSettings();
      renderAll();
      navigateTo("dashboard");
      initPwaSupport();
      if (api.online) {
        showToast("Connected to live backend", "success");
      } else {
        showToast("Running in local mode", "warning");
      }
    },

    ui: {
      closeModal(ev) {
        if (ev && ev.target && ev.target.id !== "modalOverlay") return;
        const modal = document.getElementById("modalOverlay");
        if (modal) modal.classList.remove("open");
      },
      openModal(html) {
        const overlay = document.getElementById("modalOverlay");
        const content = document.getElementById("modalContent");
        if (!overlay || !content) return;
        content.innerHTML = html;
        overlay.classList.add("open");
      },
    },

    workflow: {
      resetAll() {
        document.querySelectorAll(".wf-checklist input[type='checkbox']").forEach((i) => {
          i.checked = false;
        });
        renderWorkflow();
        showToast("Workflow checklist reset", "info");
      },
    },

    prospecting: {
      openAddModal(defaultStatus) {
        promptLead(defaultStatus);
      },
      filterLeads() {
        renderProspecting();
      },
      exportLeads() {
        const data = JSON.stringify(state.leads, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `leads-${nowIsoDate()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
    },

    appointments: {
      openAddModal() {
        promptAppointment();
      },
      filterAppts() {
        renderAppointments();
      },
    },

    presentations: {
      openAddModal() {
        promptPresentation();
      },
      addObjection() {
        const value = window.prompt("Enter objection text:");
        if (!value) return;
        state.objections.unshift(value);
        saveState();
        renderPresentations();
        showToast("Objection logged", "success");
      },
    },

    closing: {
      openAddModal() {
        promptClosing();
      },
    },

    followup: {
      openAddModal() {
        promptFollowup();
      },
      filter() {
        renderFollowup();
      },
    },

    onboarding: {
      openAddModal() {
        promptOnboarding();
      },
    },

    team: {
      openAddModal() {
        promptTeam();
      },
      filter() {
        renderTeam();
      },
    },

    kpi: {
      logDaily() {
        const contacts = Number(window.prompt("Contacts made today:", "0") || 0);
        const appts = Number(window.prompt("Appointments booked today:", "0") || 0);
        const presentations = Number(window.prompt("Presentations done today:", "0") || 0);
        const signups = Number(window.prompt("Sign-ups today:", "0") || 0);
        const income = Number(window.prompt("Income today (₦):", "0") || 0);
        state.kpiLogs.push({
          id: uid(),
          date: nowIsoDate(),
          contacts,
          appts,
          presentations,
          signups,
          income,
        });
        saveState();
        renderKPI();
        showToast("KPI entry added", "success");
      },
    },

    accountability: {
      openGoalsModal() {
        const s = Number(window.prompt("Monthly sign-up target:", String(state.goals.signups)) || state.goals.signups);
        const c = Number(window.prompt("Monthly contacts target:", String(state.goals.contacts)) || state.goals.contacts);
        const a = Number(window.prompt("Monthly appointments target:", String(state.goals.appointments)) || state.goals.appointments);
        const i = Number(window.prompt("Monthly income target (₦):", String(state.goals.income)) || state.goals.income);
        state.goals = { signups: s, contacts: c, appointments: a, income: i };
        saveState();
        renderAccountability();
        showToast("Goals updated", "success");
      },
      openReportModal() {
        const note = window.prompt("Daily report summary:");
        if (!note) return;
        addActivity(`Daily report: ${note}`);
        saveState();
        renderActivity();
      },
    },

    charts: {
      switchWeekly() {
        renderWeeklyChart();
      },
      switchKPI() {
        renderKpiTrendChart();
      },
    },

    settings: {
      save() {
        saveProfileFromInputs();
      },
      saveTargets() {
        saveTargetsFromInputs();
      },
    },

    utils: {
      copyText(btn) {
        const text = btn?.previousElementSibling?.textContent?.trim();
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => showToast("Copied", "success"));
      },
      exportAllData() {
        const payload = { state, settings, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `dinfluencers-backup-${nowIsoDate()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast("Data exported", "success");
      },
      importData() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = JSON.parse(String(reader.result || "{}"));
              if (parsed.state) Object.assign(state, { ...structuredClone(defaultState), ...parsed.state });
              if (parsed.settings) Object.assign(settings, { ...structuredClone(defaultSettings), ...parsed.settings });
              saveState();
              saveSettings();
              syncProfileFromSettings();
              renderAll();
              showToast("Data imported", "success");
            } catch {
              showToast("Invalid backup file", "error");
            }
          };
          reader.readAsText(file);
        });
        input.click();
      },
      confirmReset() {
        const ok = window.confirm("This will erase all stored app data. Continue?");
        if (!ok) return;
        safeStorage.removeItem(STORAGE_KEY);
        safeStorage.removeItem(SETTINGS_KEY);
        window.location.reload();
      },
    },
  };

  window.App = App;
  document.addEventListener("DOMContentLoaded", () => App.init());
})();
