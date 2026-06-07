"use strict";

const STATUS_FILTERS = [
  ["Alla", "all"], ["Väntar", "applied"], ["Beviljat", "granted"],
  ["Avslaget", "rejected"], ["Försenat", "overdue"]
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
  rejected: "× Avslaget", overdue: "⚠ Försenat"
};

let sources = [];
let applications = [];
let categories = [];
let categoryById = new Map();
let activeCategory = "all";
let activeStatus = "all";
let appliedSourceIds = new Set();

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
  const total = apps.reduce((sum, app) => sum + parseAmount(app.amount), 0);
  const granted = apps.filter(app => app.status === "granted").reduce((sum, app) => sum + parseAmount(app.amount), 0);
  const active = apps.filter(app => app.status === "applied").length;
  const action = apps.filter(app => app.status === "applied" && daysUntil(app.expected_response_date) <= 14).length;
  const cards = [
    ["Σ", "Totalt sökt", formatSEK(total)],
    ["✓", "Beviljat", formatSEK(granted)],
    ["→", "Aktiva ansökningar", String(active)],
    ["!", "Behöver åtgärd", String(action)]
  ];
  target.innerHTML = cards.map(([icon, label, value]) => `
    <article class="card kpi-card">
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

  try {
    const data = await getJSON("funding_sources.json");
    sources = Array.isArray(data) ? data : data.sources;
    categories = Array.isArray(data) ? [] : data.categories;
    categoryById = new Map(categories.map(category => [category.id, category]));
    appliedSourceIds = loadAppliedSourceIds();
    const filterOptions = [
      { id: "all", label: "Alla" },
      ...categories.map(category => ({ id: category.id, label: category.label }))
    ];
    filters.innerHTML = filterOptions.map(category => `
      <button class="filter-chip ${category.id === "all" ? "active" : ""}" type="button" data-category="${escapeHTML(category.id)}">${escapeHTML(category.label)}</button>
    `).join("");
    renderSources(sources);
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
    return categoryMatch && (!term || haystack.includes(term));
  });
  renderSources(result);
}

function renderSources(data) {
  const target = document.getElementById("funding-list");
  document.getElementById("source-count").textContent = `${data.length} av ${sources.length} källor`;
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
    return `
      <article class="accordion-item ${appliedSourceIds.has(source.id) ? "source-applied" : ""}" data-source-id="${escapeHTML(source.id)}">
        <button class="accordion-header" type="button" aria-expanded="false" aria-controls="${id}">
          ${logoMarkup(source)}
          <span class="accordion-title" title="${escapeHTML(sourceName)}">${escapeHTML(truncateText(sourceName, 30))}</span>
          <span class="accordion-column">
            <span class="difficulty-badge difficulty-${difficultyClass(source.difficulty)}">${escapeHTML(source.difficulty)}</span>
          </span>
          <span class="accordion-amount" title="${escapeHTML(source.max_amount)}">${escapeHTML(compactAmount(source.max_amount))}</span>
          <span class="badge ${badgeClass}">${escapeHTML(categoryLabel)}</span>
          <span class="application-date" title="${escapeHTML(source.deadline)}">${escapeHTML(listApplicationDate(source.deadline))}</span>
          <span class="accordion-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="accordion-body" id="${id}">
          <div class="accordion-content">
            <label class="applied-control">
              <input type="checkbox" data-applied-source="${escapeHTML(source.id)}" ${appliedSourceIds.has(source.id) ? "checked" : ""}>
              <span>Ansökt</span>
              <small>Markera när ansökan är inskickad</small>
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
  bindAccordions(target);
}

async function loadApplications() {
  const filters = document.getElementById("status-filters");
  filters.innerHTML = STATUS_FILTERS.map(([label, value]) => `
    <button class="filter-chip ${value === "all" ? "active" : ""}" type="button" data-status="${value}">${label}</button>
  `).join("");
  filters.addEventListener("click", event => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    activeStatus = button.dataset.status;
    filters.querySelectorAll(".filter-chip").forEach(el => el.classList.toggle("active", el === button));
    filterApplications();
  });

  try {
    applications = await getJSON("applications.json");
    renderKPIs(document.getElementById("application-kpis"), applications);
    renderDeadlineAlerts();
    renderApplications(applications);
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

function renderApplications(data) {
  const target = document.getElementById("application-list");
  document.getElementById("application-count").textContent = `${data.length} av ${applications.length} ansökningar`;
  if (!data.length) {
    target.innerHTML = emptyMessage("Inga ansökningar matchar filtret.");
    return;
  }
  target.innerHTML = data.map(app => {
    const status = effectiveStatus(app);
    const id = `application-${escapeHTML(app.id)}`;
    return `
      <article class="accordion-item">
        <button class="accordion-header" type="button" aria-expanded="false" aria-controls="${id}">
          <span class="badge status-${status}">${STATUS_LABELS[status] || status}</span>
          <span class="accordion-title">${escapeHTML(app.funder_name)}</span>
          <span class="accordion-amount">${escapeHTML(app.amount)}</span>
          <span class="accordion-meta">Svar: ${formatDate(app.expected_response_date)}</span>
          <span class="accordion-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="accordion-body" id="${id}">
          <div class="accordion-content">
            <div class="detail-grid">
              ${detail("Ansökt", formatDate(app.applied_date))}
              ${detail("Förväntat svar", formatDate(app.expected_response_date))}
              ${detail("Kategori", app.category)}
            </div>
            <div class="detail-block"><h4>Anteckningar</h4><p>${escapeHTML(app.notes || "Inga anteckningar.")}</p></div>
          </div>
        </div>
      </article>`;
  }).join("");
  bindLogoFallbacks(target);
  bindAppliedCheckboxes(target);
  bindAccordions(target);
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
  return truncateText(shortDeadline(value), 15);
}

function compactAmount(value = "") {
  return String(value).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

function loadAppliedSourceIds() {
  try {
    const saved = JSON.parse(localStorage.getItem("fundello-applied-sources") || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function saveAppliedSourceIds() {
  try {
    localStorage.setItem("fundello-applied-sources", JSON.stringify([...appliedSourceIds]));
  } catch {
    // The visual state still works for the current page if storage is unavailable.
  }
}

function bindAppliedCheckboxes(container) {
  container.querySelectorAll("[data-applied-source]").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const sourceId = checkbox.dataset.appliedSource;
      const item = checkbox.closest(".accordion-item");
      if (checkbox.checked) appliedSourceIds.add(sourceId);
      else appliedSourceIds.delete(sourceId);
      item.classList.toggle("source-applied", checkbox.checked);
      saveAppliedSourceIds();
    });
  });
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
