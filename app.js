"use strict";

const STATUS_FILTERS = [
  ["Alla", "all"], ["Väntar", "applied"], ["Beviljat", "granted"],
  ["Avslaget", "rejected"], ["Försenat", "overdue"],
  ["Ej aktuellt", "not_relevant"]
];

const CATEGORY_CLASSES = {
  "Svensk statlig": "badge-statlig", "Svensk stiftelse": "badge-stiftelse",
  "Nordisk": "badge-nordisk", "EU/Europa": "badge-eu",
  "FN/Multilateral": "badge-fn", "Internationell stiftelse": "badge-intl",
  "Teknik/CSR": "badge-teknik", "Finans/Bank": "badge-finans",
  "Kyrka/Trossamfund": "badge-kyrka", "Lotteri/Insamling": "badge-lotteri",
  "Forskning/Akademi": "badge-forskning", "Oväntad källa": "badge-ovaentad"
};

const DISPLAY_NAMES = {
  "sida-civil": "Sida",
  socialstyrelsen: "Socialstyrelsen",
  bra: "Brottsförebyggande rådet",
  migrationsverket: "Migrationsverket",
  "skandia-ideas": "Idéer för livet",
  "svenska-spel-gras": "Svenska Spel",
  "radda-barnen-fond": "Rädda Barnen",
  "eu-cerv": "CERV",
  "esf-plus": "ESF+",
  "coe-human-rights": "Europarådet",
  "eu-solidarity-corps": "European Solidarity Corps",
  "unicef-partnership": "UNICEF",
  "unodc-trafficking": "UNODC",
  ohchr: "OHCHR",
  "un-women": "UN Women",
  ciff: "CIFF",
  "meta-safety": "Meta",
  "apple-giving": "Apple",
  "folksam-trygga": "Folksam",
  "svenska-kyrkan-int": "Svenska kyrkan",
  fralsningsarmen: "Frälsningsarmén",
  vinnova: "Vinnova",
  "rotary-foundation": "Rotary Foundation",
  "lions-foundation": "Lions Clubs",
  ashoka: "Ashoka",
  kriminalvarden: "Kriminalvården"
};

const STATUS_LABELS = {
  applied: "⏳ Väntar", granted: "✓ Beviljat",
  rejected: "× Avslaget", overdue: "⚠ Försenat",
  not_relevant: "– Ej aktuellt"
};

const SOURCE_STATUS_CHOICES = [
  ["Väntar", "applied"], ["Beviljat", "granted"], ["Avslaget", "rejected"],
  ["Försenat", "overdue"], ["Ej aktuellt", "not_relevant"]
];

const FUNDING_STATUS_CHOICES = [
  ["Ansökt", "applied"], ["Beviljat", "granted"], ["Avslaget", "rejected"],
  ["Försenat", "overdue"], ["Ej aktuellt", "not_relevant"]
];

let sources = [];
let applications = [];
let categories = [];
let categoryById = new Map();
let activeCategory = "all";
let activeStatus = "all";
let sourceSort = { key: null, direction: "asc" };
let appliedSourceIds = new Set();
let localApplications = [];
let hiddenSourceIds = new Set();
let serverApplications = [];
let resetApplicationIds = new Set();

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  loadNavCount();
  const page = document.body.dataset.page;
  if (page === "home") {
    loadNewsFeed();
    loadHomeKPIs();
  } else if (page === "funding") {
    loadFundingSources();
  } else if (page === "applications") {
    loadApplications();
  }
});

function initMenu() {
  const button = document.querySelector(".menu-toggle");
  const links = document.querySelector(".nav-links");
  if (!button || !links) return;
  button.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(isOpen));
  });
}

async function getJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function loadNavCount() {
  try {
    const data = await getJSON("funding_sources.json");
    const count = Array.isArray(data) ? data.length : data.sources.length;
    document.querySelectorAll("[data-source-count]").forEach(el => { el.textContent = count; });
  } catch {
    document.querySelectorAll("[data-source-count]").forEach(el => { el.textContent = "–"; });
  }
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function safeURL(value = "") {
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function parseAmount(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return Number(digits) || 0;
}

function formatSEK(value) {
  return `${new Intl.NumberFormat("sv-SE").format(value)} SEK`;
}

function daysUntil(dateString) {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return Infinity;
  const target = new Date(`${dateString}T23:59:59`);
  return Math.ceil((target - new Date()) / 86400000);
}

function effectiveStatus(app) {
  if (app.status === "applied" && daysUntil(app.expected_response_date) < 0) return "overdue";
  return app.status;
}

function timeAgo(isoString) {
  const diffSeconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSeconds < 60) return "nyss";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min sedan`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} timmar sedan`;
  if (diffSeconds < 172800) return "igår";
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)} dagar sedan`;
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(isoString));
}

function renderKPIs(target, apps) {
  const summaries = ["applied", "granted", "rejected", "overdue", "not_relevant"].map(status => {
    const matching = apps.filter(app => effectiveStatus(app) === status);
    return {
      status,
      count: matching.length,
      amount: matching.reduce((sum, app) => sum + parseAmount(app.amount), 0)
    };
  });
  const totalAmount = apps.reduce((sum, app) => sum + parseAmount(app.amount), 0);
  const cards = [
    ["Σ", `Totalt · ${apps.length} ansökningar`, formatSEK(totalAmount), "all"],
    ...summaries.map(summary => [
      { applied: "…", granted: "✓", rejected: "×", overdue: "!", not_relevant: "–" }[summary.status],
      `${STATUS_LABELS[summary.status].replace(/^[^\s]+\s/, "")} · ${summary.count} st`,
      formatSEK(summary.amount),
      summary.status
    ])
  ];
  target.innerHTML = cards.map(([icon, label, value, status]) => `
    <article class="card kpi-card kpi-status-${status}">
      <span class="kpi-icon">${icon}</span>
      <span class="kpi-label">${label}</span>
      <strong class="kpi-value">${value}</strong>
    </article>`).join("");
}

async function loadHomeKPIs() {
  const target = document.getElementById("home-kpis");
  try {
    renderKPIs(target, await getJSON("applications.json"));
  } catch {
    target.innerHTML = errorMessage("Kunde inte läsa applications.json.");
  }
}

async function loadNewsFeed() {
  const target = document.getElementById("news-feed");
  const iconMap = { agent_analysis: "◇", application_update: "▤", deadline_alert: "!" };
  try {
    const news = (await getJSON("news.json"))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
    if (!news.length) {
      target.innerHTML = emptyMessage("Inga händelser att visa ännu.");
      return;
    }
    target.innerHTML = news.map(item => `
      <article class="news-card">
        <span class="news-icon" aria-hidden="true">${iconMap[item.type] || "·"}</span>
        <div class="news-content">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.summary)}</p>
          <span class="agent-label">${escapeHTML(item.agent || "system")}</span>
        </div>
        <time class="news-meta" datetime="${escapeHTML(item.timestamp)}">${timeAgo(item.timestamp)}</time>
      </article>`).join("");
  } catch {
    target.innerHTML = errorMessage("Kunde inte läsa news.json.");
  }
}

async function loadFundingSources() {
  const filters = document.getElementById("category-filters");
  filters.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    filters.querySelectorAll(".filter-chip").forEach(el => el.classList.toggle("active", el === button));
    filterSources();
  });
  document.getElementById("source-search").addEventListener("input", filterSources);
  document.querySelector(".funding-column-headings").addEventListener("click", event => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    const key = button.dataset.sort;
    sourceSort = {
      key,
      direction: sourceSort.key === key && sourceSort.direction === "asc" ? "desc" : "asc"
    };
    updateSortHeadings();
    filterSources();
  });

  try {
    const data = await getJSON("funding_sources.json");
    sources = Array.isArray(data) ? data : data.sources;
    categories = Array.isArray(data) ? [] : data.categories;
    categoryById = new Map(categories.map(category => [category.id, category]));
    localApplications = loadLocalApplications();
    appliedSourceIds = new Set(localApplications.map(application => application.source_id));
    hiddenSourceIds = loadHiddenSourceIds();
    hiddenSourceIds.forEach(sourceId => {
      if (localApplications.some(application => application.source_id === sourceId)) return;
      const application = createLocalApplication(sourceId, 0, "not_relevant");
      if (application) localApplications.push(application);
    });
    appliedSourceIds = new Set(localApplications.map(application => application.source_id));
    saveLocalApplications();
    const filterOptions = [
      { id: "all", label: "Alla" },
      ...categories.map(category => ({ id: category.id, label: category.label }))
    ];
    filters.innerHTML = filterOptions.map(category => `
      <button class="filter-chip ${category.id === "all" ? "active" : ""}" type="button" data-category="${escapeHTML(category.id)}">${escapeHTML(category.label)}</button>
    `).join("");
    const restoreButton = document.getElementById("restore-hidden");
    restoreButton.addEventListener("click", () => {
      localApplications = localApplications.filter(application => application.status !== "not_relevant");
      appliedSourceIds = new Set(localApplications.map(application => application.source_id));
      hiddenSourceIds.clear();
      saveLocalApplications();
      saveHiddenSourceIds();
      filterSources();
    });
    filterSources();
  } catch {
    document.getElementById("funding-list").innerHTML = errorMessage("Kunde inte läsa funding_sources.json.");
    document.getElementById("source-count").textContent = "Ingen data tillgänglig";
  }
}

function filterSources() {
  const term = document.getElementById("source-search").value.trim().toLocaleLowerCase("sv");
  const result = sources.filter(source => {
    const category = categoryById.get(source.category);
    const categoryMatch = activeCategory === "all" || source.category === activeCategory;
    const haystack = `${source.name} ${source.full_name || ""} ${source.country} ${category?.label || source.category}`.toLocaleLowerCase("sv");
    return !hiddenSourceIds.has(source.id) && categoryMatch && (!term || haystack.includes(term));
  });
  renderSources(sortSources(result));
}

function sortSources(items) {
  if (!sourceSort.key) return items;
  const direction = sourceSort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const first = sourceSortValue(a, sourceSort.key);
    const second = sourceSortValue(b, sourceSort.key);
    if (typeof first === "number" && typeof second === "number") {
      return (first - second) * direction;
    }
    return String(first).localeCompare(String(second), "sv", { numeric: true, sensitivity: "base" }) * direction;
  });
}

function sourceSortValue(source, key) {
  if (key === "name") return displayName(source);
  if (key === "difficulty") {
    const difficulty = String(source.difficulty).toLocaleLowerCase("sv");
    if (difficulty.includes("låg") || difficulty.includes("low")) return 1;
    if (difficulty.includes("hög") || difficulty.includes("high")) return 3;
    return 2;
  }
  if (key === "amount") return parseAmount(source.max_amount);
  if (key === "category") return categoryById.get(source.category)?.label || source.category;
  if (key === "deadline") return deadlineSortValue(source.deadline);
  return "";
}

function deadlineSortValue(value = "") {
  const timing = applicationDateTiming(value);
  if (timing.days !== null && Number.isFinite(timing.days)) return timing.days;
  const normalized = shortDeadline(value).toLocaleLowerCase("sv");
  if (normalized.includes("löpande")) return 1000000;
  if (normalized.includes("varierar")) return 1000001;
  return 1000002;
}

function updateSortHeadings() {
  document.querySelectorAll("[data-sort]").forEach(button => {
    const active = button.dataset.sort === sourceSort.key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-sort", active ? (sourceSort.direction === "asc" ? "ascending" : "descending") : "none");
    button.querySelector("span").textContent = active
      ? (sourceSort.direction === "asc" ? "↑" : "↓")
      : "↕";
  });
}

function renderSources(data) {
  const target = document.getElementById("funding-list");
  const visibleTotal = sources.length - hiddenSourceIds.size;
  document.getElementById("source-count").textContent = `${data.length} av ${visibleTotal} synliga källor`;
  const restoreButton = document.getElementById("restore-hidden");
  restoreButton.hidden = hiddenSourceIds.size === 0;
  restoreButton.textContent = `Visa ej aktuella (${hiddenSourceIds.size})`;
  if (!data.length) {
    target.innerHTML = emptyMessage("Inga finansieringskällor matchar filtret.");
    return;
  }
  target.innerHTML = data.map(source => {
    const id = `source-${escapeHTML(source.id)}`;
    const category = categoryById.get(source.category);
    const categoryLabel = category?.label || source.category;
    const badgeClass = category?.badge_class || CATEGORY_CLASSES[source.category] || "badge-statlig";
    const sourceName = displayName(source);
    const localApplication = localApplications.find(application => application.source_id === source.id);
    return `
      <article class="accordion-item ${localApplication ? `source-applied source-status-${localApplication.status}` : ""}" data-source-id="${escapeHTML(source.id)}">
        <button class="accordion-header" type="button" aria-expanded="false" aria-controls="${id}">
          ${logoMarkup(source)}
          <span class="accordion-title" title="${escapeHTML(sourceName)}">${escapeHTML(truncateText(sourceName, 30))}</span>
          <span class="accordion-column">
            <span class="difficulty-badge difficulty-${difficultyClass(source.difficulty)}">${escapeHTML(source.difficulty)}</span>
          </span>
          <span class="accordion-amount" title="${escapeHTML(source.max_amount)}">${escapeHTML(compactAmount(source.max_amount))}</span>
          <span class="badge ${badgeClass}">${escapeHTML(categoryLabel)}</span>
          <span class="application-date" title="${escapeHTML(source.deadline)}">${escapeHTML(listApplicationDate(source.deadline))}</span>
          <span class="accordion-chevron" aria-hidden="true"></span>
        </button>
        <div class="accordion-body" id="${id}">
          <div class="accordion-content">
            <div class="source-status-control" data-source-status-control="${escapeHTML(source.id)}">
              <span class="source-status-label">Status</span>
              <div class="source-status-options">
                ${FUNDING_STATUS_CHOICES.map(([label, status]) => `
                  <button type="button" role="switch" aria-checked="${localApplication?.status === status}" class="source-status-option status-choice-${status} ${localApplication?.status === status ? "selected" : ""}" data-source-status="${escapeHTML(source.id)}" data-status="${status}">
                    <span>${label}</span><span class="status-switch" aria-hidden="true"></span>
                  </button>
                `).join("")}
              </div>
              <small>Ett aktivt reglage åt gången. Ansökt sparas som Väntar under Ansökningar.</small>
            </div>
            <label class="applied-amount ${localApplication?.status === "applied" ? "visible" : ""}">
              <span>Sökt belopp</span>
              <span class="amount-input-wrap">
                <input type="text" inputmode="numeric" autocomplete="off" data-applied-amount="${escapeHTML(source.id)}" value="${localApplication ? escapeHTML(String(localApplication.amount_value || "")) : ""}" placeholder="Exempel: 500 000">
                <strong>SEK</strong>
              </span>
              <small>Beloppet används automatiskt i ansökningsöversikten.</small>
            </label>
            <div class="detail-grid">
              ${detail("Maxbelopp", source.max_amount)}
              ${detail("Ansökningsdatum", shortDeadline(source.deadline))}
              ${detail("Svårighetsgrad", source.difficulty)}
              ${detail("Land", source.country)}
            </div>
            <div class="detail-block"><h4>Behörighet</h4><p>${escapeHTML(source.eligibility)}</p></div>
            <div class="detail-block"><h4>Strategiskt tips</h4><p>${escapeHTML(source.tip)}</p></div>
            <div class="action-row">
              ${source.contact_email ? `<a href="mailto:${escapeHTML(source.contact_email)}">✉ ${escapeHTML(source.contact_email)}</a>` : ""}
              ${source.contact_url ? `<a href="${safeURL(source.contact_url)}" target="_blank" rel="noopener noreferrer">Öppna ansökningssida ↗</a>` : ""}
            </div>
          </div>
        </div>
      </article>`;
  }).join("");
  bindLogoFallbacks(target);
  bindAppliedControls(target);
  bindAccordions(target);
}

async function loadApplications() {
  const filters = document.getElementById("status-filters");
  filters.addEventListener("click", event => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    activeStatus = button.dataset.status;
    filters.querySelectorAll(".filter-chip").forEach(el => el.classList.toggle("active", el === button));
    filterApplications();
  });

  try {
    serverApplications = await getJSON("applications.json");
    localApplications = loadLocalApplications();
    hiddenSourceIds = loadHiddenSourceIds();
    resetApplicationIds = loadResetApplicationIds();
    refreshApplicationsView();
    document.getElementById("reset-all-applications").addEventListener("click", resetAllApplications);
  } catch {
    document.getElementById("application-kpis").innerHTML = errorMessage("Kunde inte läsa applications.json.");
    document.getElementById("application-count").textContent = "Ingen data tillgänglig";
  }
}

function renderDeadlineAlerts() {
  const upcoming = applications
    .filter(app => app.status === "applied" && daysUntil(app.expected_response_date) <= 14)
    .sort((a, b) => daysUntil(a.expected_response_date) - daysUntil(b.expected_response_date));
  const target = document.getElementById("deadline-alerts");
  if (!upcoming.length) {
    target.innerHTML = "";
    return;
  }
  const app = upcoming[0];
  const days = daysUntil(app.expected_response_date);
  const timing = days < 0 ? `${Math.abs(days)} dagar försenad` : days === 0 ? "idag" : `${days} dagar kvar`;
  target.innerHTML = `<div class="alert"><span aria-hidden="true">!</span><span>Dags att följa upp! — ${escapeHTML(app.funder_name)} (${timing})</span></div>`;
}

function filterApplications() {
  const result = activeStatus === "all"
    ? applications
    : applications.filter(app => effectiveStatus(app) === activeStatus);
  renderApplications(result);
}

function refreshApplicationsView() {
  applications = mergeApplications(serverApplications, localApplications);
  renderStatusFilters(document.getElementById("status-filters"));
  renderKPIs(document.getElementById("application-kpis"), applications);
  renderDeadlineAlerts();
  filterApplications();
}

function renderApplications(data) {
  const target = document.getElementById("application-list");
  document.getElementById("application-count").textContent = `${data.length} av ${applications.length} ansökningar`;
  if (!data.length) {
    target.innerHTML = emptyMessage("Inga ansökningar matchar filtret.");
    return;
  }
  if (activeStatus === "all") {
    target.innerHTML = ["applied", "granted", "rejected", "overdue", "not_relevant"]
      .map(status => {
        const statusItems = data.filter(app => effectiveStatus(app) === status);
        if (!statusItems.length) return "";
        const total = statusItems.reduce((sum, app) => sum + parseAmount(app.amount), 0);
        return `
          <section class="application-status-group">
            <div class="application-group-heading">
              <span class="badge status-${status}">${STATUS_LABELS[status]}</span>
              <strong>${statusItems.length} ${statusItems.length === 1 ? "ansökan" : "ansökningar"}</strong>
              <span>${formatSEK(total)}</span>
            </div>
            ${statusItems.map(renderApplicationItem).join("")}
          </section>`;
      }).join("");
  } else {
    target.innerHTML = data.map(renderApplicationItem).join("");
  }
  bindApplicationControls(target);
  bindAccordions(target);
}

function renderApplicationItem(app) {
    const status = effectiveStatus(app);
    const id = `application-${escapeHTML(app.id)}`;
    return `
      <article class="accordion-item">
        <button class="accordion-header" type="button" aria-expanded="false" aria-controls="${id}">
          <span class="badge status-${status}">${STATUS_LABELS[status] || status}</span>
          <span class="accordion-title">${escapeHTML(app.funder_name)}</span>
          <span class="accordion-amount">${escapeHTML(app.amount)}</span>
          <span class="accordion-meta">Svar: ${formatDate(app.expected_response_date)}</span>
          <span class="accordion-chevron" aria-hidden="true"></span>
        </button>
        <div class="accordion-body" id="${id}">
          <div class="accordion-content">
            <div class="source-status-control">
              <span class="source-status-label">Ändra status</span>
              <div class="source-status-options">
                ${SOURCE_STATUS_CHOICES.map(([label, choice]) => `
                  <button type="button" role="switch" aria-checked="${app.status === choice}" class="source-status-option status-choice-${choice} ${app.status === choice ? "selected" : ""}" data-application-status="${escapeHTML(app.id)}" data-status="${choice}">
                    <span>${label}</span><span class="status-switch" aria-hidden="true"></span>
                  </button>
                `).join("")}
                <button type="button" class="source-status-option reset-status-option" data-reset-application="${escapeHTML(app.id)}">Nollställ</button>
              </div>
              <small>Nollställ tar bort ansökningsmarkeringen helt.</small>
            </div>
            <div class="detail-grid">
              ${detail("Ansökt", formatDate(app.applied_date))}
              ${detail("Förväntat svar", formatDate(app.expected_response_date))}
              ${detail("Kategori", app.category)}
            </div>
            <div class="detail-block"><h4>Anteckningar</h4><p>${escapeHTML(app.notes || "Inga anteckningar.")}</p></div>
          </div>
        </div>
      </article>`;
}

function logoMarkup(source) {
  const initials = displayName(source)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toLocaleUpperCase("sv");
  return `
    <span class="source-logo">
      <img src="assets/logos/${logoFileName(source.id)}.png" alt="" width="32" height="32">
      <span class="source-logo-fallback" aria-hidden="true">${escapeHTML(initials || "•")}</span>
    </span>`;
}

function displayName(source) {
  return DISPLAY_NAMES[source.id] || String(source.name).split(/\s+[—–]\s+/)[0];
}

function logoFileName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLocaleLowerCase("en");
}

function bindLogoFallbacks(container) {
  container.querySelectorAll(".source-logo img").forEach(image => {
    const logo = image.closest(".source-logo");
    const showImage = () => {
      image.hidden = false;
      logo.classList.add("loaded");
    };
    const showFallback = () => {
      logo.classList.remove("loaded");
      image.hidden = true;
    };
    image.addEventListener("load", showImage, { once: true });
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete) {
      if (image.naturalWidth > 0) showImage();
      else showFallback();
    }
  });
}

function bindAccordions(container) {
  container.querySelectorAll(".accordion-header").forEach(header => {
    header.addEventListener("click", () => {
      const item = header.closest(".accordion-item");
      const body = document.getElementById(header.getAttribute("aria-controls"));
      const open = !item.classList.contains("open");
      container.querySelectorAll(".accordion-item.open").forEach(other => {
        other.classList.remove("open");
        other.querySelector(".accordion-header").setAttribute("aria-expanded", "false");
        other.querySelector(".accordion-body").style.maxHeight = null;
      });
      item.classList.toggle("open", open);
      header.setAttribute("aria-expanded", String(open));
      body.style.maxHeight = open ? `${body.scrollHeight}px` : null;
    });
  });
}

function detail(label, value) {
  return `<div><span class="detail-label">${escapeHTML(label)}</span><span class="detail-value">${escapeHTML(value || "–")}</span></div>`;
}

function shortDeadline(value = "") {
  const match = String(value).match(/^Se\s+([a-z0-9.-]+\.[a-z]{2,})(?:\/\S*)?\s+för\b/i);
  return match ? `Se ${match[1]}` : value;
}

function difficultyClass(value = "") {
  const normalized = String(value).toLocaleLowerCase("sv");
  if (normalized.includes("låg") || normalized.includes("low")) return "low";
  if (normalized.includes("hög") || normalized.includes("high")) return "high";
  return "medium";
}

function applicationDateBadge(value = "") {
  if (isNominationDeadline(value)) {
    return `<span class="date-empty" title="Se utfälld information">—</span>`;
  }
  const label = shortDeadline(value);
  const timing = applicationDateTiming(value);
  const title = timing.days === null
    ? timing.description
    : `${timing.days} dagar kvar`;
  return `<span class="date-badge date-${timing.level}" title="${escapeHTML(title)}">${escapeHTML(label)}</span>`;
}

function isNominationDeadline(value = "") {
  return /nominering|nomination/i.test(String(value));
}

function truncateText(value = "", maxLength = 30) {
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function listApplicationDate(value = "") {
  if (isNominationDeadline(value)) return "—";
  return truncateText(shortDeadline(value), 25);
}

function compactAmount(value = "") {
  return String(value).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

function loadLocalApplications() {
  try {
    const saved = JSON.parse(localStorage.getItem("fundello-local-applications") || "[]");
    if (Array.isArray(saved) && saved.length) return saved;

    const legacyIds = JSON.parse(localStorage.getItem("fundello-applied-sources") || "[]");
    if (!Array.isArray(legacyIds)) return [];
    return legacyIds.map(sourceId => createLocalApplication(sourceId, 0)).filter(Boolean);
  } catch {
    return [];
  }
}

function loadHiddenSourceIds() {
  try {
    const saved = JSON.parse(localStorage.getItem("fundello-hidden-sources") || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function loadResetApplicationIds() {
  try {
    const saved = JSON.parse(localStorage.getItem("fundello-reset-applications") || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function saveResetApplicationIds() {
  try {
    localStorage.setItem("fundello-reset-applications", JSON.stringify([...resetApplicationIds]));
  } catch {
    // The current page still updates if storage is unavailable.
  }
}

function saveHiddenSourceIds() {
  try {
    localStorage.setItem("fundello-hidden-sources", JSON.stringify([...hiddenSourceIds]));
  } catch {
    // Hiding still works until the page is reloaded.
  }
}

function saveLocalApplications() {
  try {
    localStorage.setItem("fundello-local-applications", JSON.stringify(localApplications));
    localStorage.removeItem("fundello-applied-sources");
  } catch {
    // The visual state still works for the current page if storage is unavailable.
  }
}

function createLocalApplication(sourceId, amountValue, status = "applied") {
  const source = sources.find(item => item.id === sourceId);
  if (!source) return null;
  const category = categoryById.get(source.category);
  return {
    id: `local-${source.id}`,
    source_id: source.id,
    funder_name: displayName(source),
    category: category?.label || source.category,
    amount: formatSEK(amountValue || 0),
    amount_value: amountValue || 0,
    applied_date: new Date().toISOString().slice(0, 10),
    expected_response_date: "",
    status,
    notes: "Registrerad som ansökt i finansieringskatalogen."
  };
}

function mergeApplications(serverApplications, localItems) {
  const localIds = new Set(localItems.map(application => application.id));
  return [
    ...serverApplications.filter(application => !localIds.has(application.id) && !resetApplicationIds.has(application.id)),
    ...localItems
  ];
}

function parseEnteredAmount(value = "") {
  const digits = String(value).replace(/[^\d]/g, "");
  return Number(digits) || 0;
}

function bindAppliedControls(container) {
  container.querySelectorAll("[data-source-status]").forEach(button => {
    button.addEventListener("click", () => {
      const sourceId = button.dataset.sourceStatus;
      const status = button.dataset.status;
      const item = button.closest(".accordion-item");
      const amountPanel = item.querySelector(".applied-amount");
      const amountInput = item.querySelector("[data-applied-amount]");
      const existing = localApplications.find(application => application.source_id === sourceId);
      if (existing?.status === status) {
        appliedSourceIds.delete(sourceId);
        localApplications = localApplications.filter(application => application.source_id !== sourceId);
        hiddenSourceIds.delete(sourceId);
        item.querySelectorAll("[data-source-status]").forEach(option => {
          option.classList.remove("selected");
          option.setAttribute("aria-checked", "false");
        });
        item.classList.remove("source-applied", "source-status-applied", "source-status-granted", "source-status-rejected", "source-status-overdue");
        amountPanel.classList.remove("visible");
        saveLocalApplications();
        saveHiddenSourceIds();
        const body = item.querySelector(".accordion-body");
        if (item.classList.contains("open")) body.style.maxHeight = `${body.scrollHeight}px`;
        return;
      }
      if (status === "not_relevant") {
        let application = localApplications.find(item => item.source_id === sourceId);
        if (!application) {
          application = createLocalApplication(sourceId, parseEnteredAmount(amountInput.value), status);
          if (application) localApplications.push(application);
        } else {
          application.status = status;
          application.amount_value = parseEnteredAmount(amountInput.value);
          application.amount = formatSEK(application.amount_value);
        }
        appliedSourceIds.add(sourceId);
        hiddenSourceIds.add(sourceId);
        saveLocalApplications();
        saveHiddenSourceIds();
        filterSources();
        return;
      }

      appliedSourceIds.add(sourceId);
      let application = localApplications.find(item => item.source_id === sourceId);
      if (!application) {
        application = createLocalApplication(sourceId, parseEnteredAmount(amountInput.value), status);
        if (application) localApplications.push(application);
      } else {
        application.status = status;
      }
      item.querySelectorAll("[data-source-status]").forEach(option => {
        option.classList.toggle("selected", option === button);
        option.setAttribute("aria-checked", String(option === button));
      });
      item.classList.remove("source-status-applied", "source-status-granted", "source-status-rejected", "source-status-overdue");
      item.classList.add("source-applied", `source-status-${status}`);
      amountPanel.classList.toggle("visible", status === "applied");
      saveLocalApplications();
      const body = item.querySelector(".accordion-body");
      if (item.classList.contains("open")) body.style.maxHeight = `${body.scrollHeight}px`;
    });
  });

  container.querySelectorAll("[data-applied-amount]").forEach(input => {
    input.addEventListener("input", () => {
      const sourceId = input.dataset.appliedAmount;
      const application = localApplications.find(item => item.source_id === sourceId);
      if (!application) return;
      application.amount_value = parseEnteredAmount(input.value);
      application.amount = formatSEK(application.amount_value);
      saveLocalApplications();
    });
  });
}

function bindApplicationControls(container) {
  container.querySelectorAll("[data-application-status]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const applicationId = button.dataset.applicationStatus;
      const status = button.dataset.status;
      const current = applications.find(application => application.id === applicationId);
      if (!current) return;
      if (current.status === status) {
        resetApplication(applicationId);
        return;
      }

      let local = localApplications.find(application => application.id === applicationId);
      if (!local) {
        local = { ...current };
        localApplications.push(local);
      }
      local.status = status;
      resetApplicationIds.delete(applicationId);
      if (local.source_id) {
        if (status === "not_relevant") hiddenSourceIds.add(local.source_id);
        else hiddenSourceIds.delete(local.source_id);
      }
      saveLocalApplications();
      saveHiddenSourceIds();
      saveResetApplicationIds();
      refreshApplicationsView();
    });
  });

  container.querySelectorAll("[data-reset-application]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      resetApplication(button.dataset.resetApplication);
    });
  });
}

function resetApplication(applicationId) {
  const current = applications.find(application => application.id === applicationId);
  localApplications = localApplications.filter(application => application.id !== applicationId);
  if (serverApplications.some(application => application.id === applicationId)) {
    resetApplicationIds.add(applicationId);
  } else {
    resetApplicationIds.delete(applicationId);
  }
  if (current?.source_id) hiddenSourceIds.delete(current.source_id);
  saveLocalApplications();
  saveHiddenSourceIds();
  saveResetApplicationIds();
  refreshApplicationsView();
}

function resetAllApplications() {
  if (!applications.length) return;
  if (!window.confirm("Nollställ alla ansökningar och statusar?")) return;
  localApplications = [];
  hiddenSourceIds.clear();
  resetApplicationIds = new Set(serverApplications.map(application => application.id));
  activeStatus = "all";
  saveLocalApplications();
  saveHiddenSourceIds();
  saveResetApplicationIds();
  refreshApplicationsView();
}

function renderStatusFilters(container) {
  const allAmount = applications.reduce((sum, app) => sum + parseAmount(app.amount), 0);
  const options = [
    ["Alla", "all", applications.length, allAmount],
    ...STATUS_FILTERS.slice(1).map(([label, status]) => {
      const matching = applications.filter(app => effectiveStatus(app) === status);
      return [label, status, matching.length, matching.reduce((sum, app) => sum + parseAmount(app.amount), 0)];
    })
  ];
  container.innerHTML = options.map(([label, value, count, amount]) => `
    <button class="filter-chip status-filter-card ${value === activeStatus ? "active" : ""}" type="button" data-status="${value}">
      <strong>${label}</strong>
      <span>${count} st · ${formatSEK(amount)}</span>
    </button>
  `).join("");
}

function applicationDateTiming(value = "") {
  const text = String(value).trim();
  const normalized = text.toLocaleLowerCase("sv");

  if (normalized.includes("löpande") || normalized.includes("när som helst")) {
    return { level: "rolling", days: null, description: "Ansökan är löpande" };
  }

  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const target = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 23, 59, 59);
    return dateProximity(target);
  }

  const months = {
    januari: 0, februari: 1, mars: 2, april: 3, maj: 4, juni: 5,
    juli: 6, augusti: 7, september: 8, oktober: 9, november: 10, december: 11
  };
  const mentionedMonths = Object.entries(months)
    .filter(([month]) => normalized.includes(month))
    .map(([, index]) => index);

  if (mentionedMonths.length) {
    const now = new Date();
    const candidates = mentionedMonths.map(month => {
      let target = new Date(now.getFullYear(), month, 1, 23, 59, 59);
      if (target < now) target = new Date(now.getFullYear() + 1, month, 1, 23, 59, 59);
      return target;
    });
    const next = candidates.sort((a, b) => a - b)[0];
    return dateProximity(next);
  }

  return { level: "unknown", days: null, description: "Exakt ansökningsdatum saknas" };
}

function dateProximity(target) {
  const days = Math.max(0, Math.ceil((target - new Date()) / 86400000));
  if (days <= 30) return { level: "urgent", days, description: "Ansökningsdatumet närmar sig" };
  if (days <= 90) return { level: "soon", days, description: "Ansökningsdatum inom tre månader" };
  return { level: "later", days, description: "Ansökningsdatum längre fram" };
}

function formatDate(value) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function emptyMessage(message) {
  return `<div class="empty-state">${escapeHTML(message)}</div>`;
}

function errorMessage(message) {
  return `<div class="error-state">${escapeHTML(message)} Starta sidan via en lokal HTTP-server, inte direkt som en fil.</div>`;
}
