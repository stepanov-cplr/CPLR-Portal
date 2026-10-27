/* Портал ЦППР — етап 1: карта експертиз. Жодних даних у цьому файлі немає: усе приходить із сервера після входу. */
"use strict";

// ══ НАЛАШТУВАННЯ ════════════════════════════════════════
// Адреса розгортання Apps Script (закінчується на /exec)
const API_URL = "https://script.google.com/macros/s/AKfycbxB64bylyS8qeaHMZmFIa4uxx3uSLUY9WLXUTXd4lNvHOM3iFwEfSZxCJGF7aTRL7L01A/exec";
const CLIENT_ID = "480913215993-h8o3gcsismg88cjg7h7e48h9o8gpj45r.apps.googleusercontent.com";
const SK = "cplrp_"; // префікс ключів у сховищі браузера

// ══ СТАН ════════════════════════════════════════════════
const S = {
  token: null, me: null, data: null, people: [], tab: "people",
  f: { q: "", dirs: new Set(), toggles: new Set(), contact: "", donor: "", grantDone: "", grantReady: "", exp: "" }
};
const $ = id => document.getElementById(id);

// ══ ДОПОМІЖНЕ ═══════════════════════════════════════════
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s == null ? "" : s).toLowerCase().replace(/[ʼ’`´]/g, "'").replace(/ё/g, "е");
const arr = v => Array.isArray(v) ? v : [];

function store(kind) { try { return kind === "s" ? window.sessionStorage : window.localStorage; } catch (e) { return null; } }
function saveToken(t) { const s = store("s"); try { s && s.setItem(SK + "token", t); } catch (e) {} }
function jwtExp(t) {
  try {
    const b = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4))))).exp || 0;
  } catch (e) { return 0; }
}
function loadToken() {
  const s = store("s");
  try {
    const t = s && s.getItem(SK + "token");
    if (t && jwtExp(t) > Date.now() / 1000 + 60) return t;
  } catch (e) {}
  return null;
}
// Після виходу чи відмови — прибрати все наше з браузера
function clearLocal() {
  ["s", "l"].forEach(k => {
    const s = store(k);
    if (!s) return;
    try { Object.keys(s).filter(x => x.indexOf(SK) === 0).forEach(x => s.removeItem(x)); } catch (e) {}
  });
}

// ══ ВХІД ════════════════════════════════════════════════
let gisReady = false;
window.onGoogleLibraryLoad = function () {
  gisReady = true;
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: r => { if (r && r.credential) { S.token = r.credential; saveToken(r.credential); loadMap(); } },
    auto_select: true,
    use_fedcm_for_prompt: true,
    cancel_on_tap_outside: false
  });
  if (!$("gate").hidden) renderGoogleButton();
};

function renderGoogleButton() {
  if (!gisReady) return;
  $("gbtn").innerHTML = "";
  google.accounts.id.renderButton($("gbtn"), { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: "uk" });
  try { google.accounts.id.prompt(); } catch (e) {}
}

function showGate(msg, isErr) {
  $("app").hidden = true; $("me").hidden = true; $("gate").hidden = false;
  const m = $("gateMsg");
  m.hidden = !msg; m.textContent = msg || ""; m.className = "msg" + (isErr ? " err" : "");
  renderGoogleButton();
}

function forget(msg, isErr) {
  S.token = null; S.me = null; S.data = null; S.people = [];
  $("cards").innerHTML = ""; $("index").innerHTML = ""; $("adminIndex").innerHTML = ""; $("adminCards").innerHTML = "";
  clearLocal();
  try { gisReady && google.accounts.id.disableAutoSelect(); } catch (e) {}
  showGate(msg, isErr);
}

// ══ СЕРВЕР ══════════════════════════════════════════════
async function api(action) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: action, token: S.token }),
    redirect: "follow", cache: "no-store", credentials: "omit"
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function loadMap() {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(API_URL)) {
    showGate("Сторінку ще не під'єднано до сервера: у файлі app.js не вписано адресу розгортання.", true);
    return;
  }
  $("gate").hidden = true; $("app").hidden = false; $("loading").hidden = false; $("error").hidden = true;
  ["people", "index", "admin"].forEach(t => $("tab-" + t).hidden = true);
  let r;
  try { r = await api("getMap"); }
  catch (e) { $("loading").hidden = true; showError("Не вдалося зв'язатися з сервером. Перевірте інтернет і натисніть «Оновити»."); $("me").hidden = false; return; }
  $("loading").hidden = true;
  if (r && r.ok) {
    S.me = r.me; S.data = r.map; prepare(); renderAll();
    return;
  }
  if (r && r.error === "AUTH_REQUIRED") {
    if (r.denied) forget("Цієї адреси немає в списку доступу. Увійдіть робочим акаунтом або зверніться до адміністратора порталу.", true);
    else forget("Сесія завершилася. Увійдіть ще раз.");
    return;
  }
  showError("Сервер повернув помилку. Спробуйте «Оновити» за хвилину; якщо не минає — напишіть адміністратору.");
  $("me").hidden = false;
}
function showError(t) { const e = $("error"); e.textContent = t; e.hidden = false; }

// ══ ПІДГОТОВКА ДАНИХ ════════════════════════════════════
const ROLE = { expert: "Експерт(-ка)", comms: "Комунікації", admin: "Адміністрація" };
const LANG_SHORT = { "Читаю фахові тексти": "читаю", "Пишу аналітичні тексти": "пишу", "Виступаю і веду дискусію": "виступаю" };
const LVL = v => /^Роблю/i.test(v) ? "ok" : /^Не робив/i.test(v) ? "try" : "no";
const LVL_TXT = { ok: "роблю", try: "спробую", no: "радше ні" };
const INTERNS = "Готовий(-а) брати стажерів і практикантів за своїм напрямом";
const MENTOR = "Менторство нових колег";
let DIRS = [], DIR_SHORT = {};

function pubKey(p, start) { return Object.keys(p.pub || {}).find(k => k.indexOf(start) === 0); }
function canPub(p, start) { const k = pubKey(p, start); return !!k && LVL(p.pub[k]) !== "no"; }

function prepare() {
  DIRS = arr(S.data.directions);
  DIR_SHORT = {}; DIRS.forEach(d => DIR_SHORT[d.full] = d.short);
  S.people = arr(S.data.people).map((p, i) => {
    p._id = "p" + i;
    p.initials = p.name.split(/\s+/).map(w => w[0] || "").slice(0, 2).join("").toUpperCase();
    p.dirKeys = p.role === "comms" ? arr(p.gridAssigned) : arr(p.dirs);
    p.en = canPub(p, "Коментар або виступ англійською");
    p.live = canPub(p, "Коментар або інтерв");
    const top = [p.name, ROLE[p.role], p.email, arr(p.dirs).map(d => DIR_SHORT[d] + " " + d).join(" "), arr(p.dirsOther).join(" "),
      arr(p.gridAssigned).map(d => DIR_SHORT[d]).join(" "), p.topics, p.adjacent, arr(p.contacts).join(" "), p.speed,
      Object.keys(p.lang || {}).join(" ")].join(" \n ");
    const det = [p.now, arr(p.exp).join(" "), arr(p.donors).join(" "), arr(p.grantDone).join(" "), arr(p.grantReady).join(" "),
      Object.keys(p.pub || {}).join(" "), p.pubOther, p.noComment, arr(p.comms).join(" "), p.commsTools, arr(p.adminQ).join(" "),
      p.adminTools, p.faq, arr(p.share).join(" "), p.shareTxt, p.langOther, p.note, p.learn, p.hide, p.forgot,
      arr(p.gridExtra).join(" ")].join(" \n ");
    p._top = norm(top); p._det = norm(det);
    p._name = norm(p.name); p._topics = norm(p.topics); p._adj = norm(p.adjacent);
    return p;
  });
}

// ══ ПІДСВІЧУВАННЯ ═══════════════════════════════════════
let TERMS = [];
function hl(text) {
  text = String(text == null ? "" : text);
  if (!TERMS.length) return esc(text);
  const n = norm(text);
  if (n.length !== text.length) return esc(text);
  const m = [];
  TERMS.forEach(t => { let i = 0; while ((i = n.indexOf(t, i)) >= 0) { m.push([i, i + t.length]); i += t.length; } });
  if (!m.length) return esc(text);
  m.sort((a, b) => a[0] - b[0]);
  const merged = [m[0].slice()];
  m.slice(1).forEach(r => { const last = merged[merged.length - 1]; if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()); });
  let out = "", pos = 0;
  merged.forEach(([a, b]) => { out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>"; pos = b; });
  return out + esc(text.slice(pos));
}

// ══ ФІЛЬТРИ ═════════════════════════════════════════════
const TOGGLES = [
  { k: "en", label: "Коментує англійською", test: p => p.en },
  { k: "live", label: "Готовий(-а) до прямого ефіру", test: p => p.live },
  { k: "interns", label: "Бере стажерів", test: p => arr(p.share).includes(INTERNS) },
  { k: "mentor", label: "Менторство", test: p => arr(p.share).includes(MENTOR) }
];
const SELECTS = [
  { k: "contact", label: "Контакти в середовищі", field: "contacts" },
  { k: "donor", label: "Працював(-ла) з донором", field: "donors" },
  { k: "grantDone", label: "Досвід заявок і звітів", field: "grantDone" },
  { k: "grantReady", label: "Готовий(-а) в заявках", field: "grantReady" },
  { k: "exp", label: "Досвід", field: "exp" }
];

function optionCounts(field) {
  const c = {};
  S.people.forEach(p => arr(p[field]).forEach(v => c[v] = (c[v] || 0) + 1));
  return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b, "uk")).map(v => [v, c[v]]);
}

function renderFilters() {
  const pseudo = [{ k: "@comms", short: "Комунікації" }, { k: "@admin", short: "Адмінпитання" }];
  $("dirChips").innerHTML = DIRS.map(d => ({ k: d.full, short: d.short })).concat(pseudo)
    .map(d => `<button type="button" class="chip" data-dir="${esc(d.k)}" aria-pressed="${S.f.dirs.has(d.k)}" title="${esc(d.k)}">${esc(d.short)}</button>`).join("");
  $("toggleChips").innerHTML = TOGGLES
    .map(t => `<button type="button" class="chip toggle" data-toggle="${t.k}" aria-pressed="${S.f.toggles.has(t.k)}">${esc(t.label)}</button>`).join("");
  $("selects").innerHTML = SELECTS.map(s => `<label>${esc(s.label)}<select data-sel="${s.k}"><option value="">— будь-що —</option>` +
    optionCounts(s.field).filter(([, n]) => n > 0).map(([v, n]) => `<option value="${esc(v)}"${S.f[s.k] === v ? " selected" : ""}>${esc(v)} (${n})</option>`).join("") +
    `</select></label>`).join("");
}

function matches(p) {
  const f = S.f;
  if (f.dirs.size) {
    const ok = [...f.dirs].some(d => d === "@comms" ? p.role === "comms" : d === "@admin" ? (p.role === "admin" || arr(p.adminQ).length > 0) : p.dirKeys.includes(d));
    if (!ok) return false;
  }
  for (const t of TOGGLES) if (f.toggles.has(t.k) && !t.test(p)) return false;
  for (const s of SELECTS) if (f[s.k] && !arr(p[s.field]).includes(f[s.k])) return false;
  for (const t of TERMS) if (p._top.indexOf(t) < 0 && p._det.indexOf(t) < 0) return false;
  return true;
}

function anyFilter() {
  const f = S.f;
  return !!(f.q || f.dirs.size || f.toggles.size || SELECTS.some(s => f[s.k]));
}

// ══ КАРТКА ══════════════════════════════════════════════
function tags(list, cls) { return arr(list).map(v => `<span class="tag ${cls || ""}">${hl(v)}</span>`).join(""); }
function sec(title, body) { return body ? `<div class="sec"><div class="lbl">${esc(title)}</div>${body}</div>` : ""; }
function txt(v) { return v ? `<div class="txt">${hl(v)}</div>` : ""; }
function ul(list) { return arr(list).length ? `<ul class="plain">${arr(list).map(v => `<li>${hl(v)}</li>`).join("")}</ul>` : ""; }

const CONTACTS_SHOWN = 6;
function contactTags(p) {
  const c = arr(p.contacts);
  if (TERMS.length || c.length <= CONTACTS_SHOWN + 1) return tags(c);
  return tags(c.slice(0, CONTACTS_SHOWN)) + `<button type="button" class="tag soft more-contacts" data-more="${p._id}">ще ${c.length - CONTACTS_SHOWN}</button>`;
}

function langLine(p) {
  const parts = Object.keys(p.lang || {}).map(l => `${hl(l)}: ${arr(p.lang[l]).map(x => esc(LANG_SHORT[x] || x)).join(" · ")}`);
  return parts.join("; ");
}

function card(p, prefix) {
  const isComms = p.role === "comms";
  const dirs = isComms
    ? tags(arr(p.gridAssigned).map(d => DIR_SHORT[d] || d), "dir assigned") + tags(arr(p.gridExtra).map(d => DIR_SHORT[d] || d), "soft")
    : tags(arr(p.dirs).map(d => DIR_SHORT[d] || d), "dir") + tags(p.dirsOther, "soft");
  const facts = [];
  const lang = langLine(p);
  if (lang) facts.push(`<span><b>Мови:</b> ${lang}</span>`);
  if (p.speed) facts.push(`<span><b>Коментар:</b> ${hl(p.speed)}</span>`);

  const pubRows = Object.keys(p.pub || {}).map(k => { const l = LVL(p.pub[k]); return `<li><span class="lvl ${l}"></span>${hl(k)} — <i>${LVL_TXT[l]}</i></li>`; });
  let det = "";
  det += sec("Зараз працює над", txt(p.now));
  det += sec("Досвід", ul(p.exp));
  det += sec("Комунікаційні вміння", ul(p.comms));
  det += sec("Інструменти", txt(p.commsTools));
  det += sec("З яких адмінпитань звертатися", ul(p.adminQ));
  det += sec("Системи й інструменти", txt(p.adminTools));
  det += sec("Про що найчастіше запитують колеги", txt(p.faq));
  det += sec("Заявки: що вже робив(-ла)", ul(p.grantDone));
  det += sec("Заявки: до чого готовий(-а)", ul(p.grantReady));
  det += sec("Донори й програми (особистий досвід)", arr(p.donors).length ? `<div class="tags">${tags(p.donors)}</div>` : "");
  det += sec("Публічні формати", pubRows.length ? `<ul class="plain" style="list-style:none;padding-left:0">${pubRows.join("")}</ul>` : "");
  det += sec("Інші формати", txt(p.pubOther));
  det += sec("Не просити про публічний коментар", txt(p.noComment));
  det += sec("Чим готовий(-а) ділитися", ul(p.share));
  det += sec("Про це детальніше", txt(p.shareTxt));
  det += sec("Інші мови", txt(p.langOther));
  if (S.me && S.me.isAdmin && (p.learn || p.hide || p.forgot)) {
    det += `<div class="sec adminonly"><div class="lbl">Бачать лише адміни</div>` +
      sec("Чого хотів(-ла) б навчитися", txt(p.learn)) + sec("Чи є щось, чого не показувати", txt(p.hide)) + sec("Що ми забули запитати", txt(p.forgot)) + `</div>`;
  }
  const openDet = TERMS.length && TERMS.some(t => p._top.indexOf(t) < 0 && p._det.indexOf(t) >= 0);

  return `<article class="card" id="${(prefix || "") + p._id}">
    <div class="head"><div class="ava ${esc(p.role)}">${esc(p.initials)}</div>
      <div><div class="nm">${hl(p.name)}</div><div class="role">${esc(ROLE[p.role] || "")}</div>
      ${p.email ? `<a class="mail" href="mailto:${esc(p.email)}">${hl(p.email)}</a>` : ""}</div></div>
    ${dirs ? `<div class="tags">${dirs}</div>` : ""}
    ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}
    ${p.topics ? `<div><div class="lbl">Звертатися в першу чергу</div>${txt(p.topics)}</div>` : ""}
    ${p.adjacent ? `<div><div class="lbl">Суміжне</div>${txt(p.adjacent)}</div>` : ""}
    ${arr(p.contacts).length ? `<div><div class="lbl">Робочі контакти</div><div class="tags">${contactTags(p)}</div></div>` : ""}
    ${facts.length ? `<div class="facts">${facts.join("")}</div>` : ""}
    ${det ? `<details class="more-info"${openDet ? " open" : ""}><summary>Детальніше</summary>${det}</details>` : ""}
  </article>`;
}

// ══ ВКЛАДКИ ═════════════════════════════════════════════
// Релевантність: збіг у «Звертатися в першу чергу» важить більше, ніж у деталях
function score(p) {
  if (!TERMS.length) return 0;
  const phrase = TERMS.join(" ");
  let s = 0;
  TERMS.forEach(t => {
    if (p._name.indexOf(t) >= 0) s += 6;
    if (p._topics.indexOf(t) >= 0) s += 5;
    else if (p._adj.indexOf(t) >= 0) s += 3;
    else if (p._top.indexOf(t) >= 0) s += 2;
    else s += 1;
  });
  if (TERMS.length > 1) {
    if (p._topics.indexOf(phrase) >= 0) s += 12;
    else if (p._adj.indexOf(phrase) >= 0) s += 8;
    else if (p._top.indexOf(phrase) >= 0) s += 4;
    else if (p._det.indexOf(phrase) >= 0) s += 2;
  }
  return s;
}

function renderPeople() {
  let list = S.people.filter(matches);
  if (TERMS.length) list = list.map((p, i) => [score(p), i, p]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(x => x[2]);
  $("cards").innerHTML = list.length ? list.map(p => card(p)).join("") : `<div class="empty">Нікого не знайдено. Спробуйте коротше слово або скиньте фільтри.</div>`;
  $("count").textContent = anyFilter() ? `Знайдено: ${list.length} з ${S.people.length}` : `Усього: ${S.people.length}`;
  $("reset").hidden = !anyFilter();
}

const GROUPS = [
  { t: "Напрями", items: p => p.role === "comms" ? arr(p.gridAssigned).map(d => DIR_SHORT[d] || d) : arr(p.dirs).map(d => DIR_SHORT[d] || d).concat(arr(p.dirsOther)), mark: p => p.role === "comms" ? "комунікації" : "" },
  { t: "Робочі контакти в середовищах", items: p => arr(p.contacts) },
  { t: "Досвід", items: p => arr(p.exp) },
  { t: "Комунікаційні вміння", items: p => arr(p.comms) },
  { t: "Чим готові ділитися з колегами", items: p => arr(p.share) },
  { t: "Заявки й звіти: хто вже робив", items: p => arr(p.grantDone) },
  { t: "Заявки: хто до чого готовий", items: p => arr(p.grantReady) },
  { t: "Публічні формати: хто робить або спробує", items: p => Object.keys(p.pub || {}).filter(k => LVL(p.pub[k]) !== "no"), mark: (p, it) => LVL(p.pub[it]) === "try" ? "спробує" : "" },
  { t: "Мови", items: p => Object.keys(p.lang || {}), mark: (p, it) => arr(p.lang[it]).map(x => LANG_SHORT[x] || x).join(", ") },
  { t: "Донори й програми (особистий досвід)", items: p => arr(p.donors) }
];

function groupHtml(g, people, filterTerms) {
  const map = {};
  people.forEach(p => g.items(p).forEach(it => { (map[it] = map[it] || []).push(p); }));
  let rows = Object.keys(map).sort((a, b) => map[b].length - map[a].length || a.localeCompare(b, "uk"));
  if (filterTerms.length) rows = rows.filter(it => filterTerms.every(t => norm(it + " " + map[it].map(p => p.name).join(" ")).indexOf(t) >= 0));
  if (!rows.length) return "";
  return `<div class="idx-group"><h2>${esc(g.t)} <small>${rows.length}</small></h2>` + rows.map(it =>
    `<div class="idx-row"><div class="item">${esc(it)} <small>· ${map[it].length}</small></div><div class="people">` +
    map[it].map(p => { const m = g.mark ? g.mark(p, it) : ""; return `<button type="button" class="plink" data-open="${p._id}">${esc(p.name)}${m ? ` <i>${esc(m)}</i>` : ""}</button>`; }).join("") +
    `</div></div>`).join("") + `</div>`;
}

function renderIndex() {
  const terms = norm($("iq").value).split(/\s+/).filter(Boolean);
  const html = GROUPS.map(g => groupHtml(g, S.people, terms)).join("");
  $("index").innerHTML = html || `<div class="empty">Нічого не знайдено.</div>`;
}

function renderAdmin() {
  const ppl = S.people.filter(p => arr(p.adminQ).length);
  $("adminIndex").innerHTML = groupHtml({ t: "Питання → до кого", items: p => arr(p.adminQ) }, ppl, []);
  const saved = TERMS; TERMS = [];
  $("adminCards").innerHTML = ppl.map(p => card(p, "a-")).join("");
  TERMS = saved;
}

function renderAll() {
  $("me").hidden = false;
  $("meName").textContent = (S.me.name || S.me.email) + (S.me.isAdmin ? " · адмін" : "");
  const upd = S.data.updated ? new Date(S.data.updated).toLocaleDateString("uk-UA") : "";
  $("stat").textContent = `${S.people.length} людей · ${S.data.answered} анкет${upd ? " · остання " + upd : ""}`;
  renderFilters(); renderPeople(); renderIndex(); renderAdmin(); switchTab(S.tab);
}

function switchTab(t) {
  S.tab = t;
  document.querySelectorAll("nav.tabs [role=tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  ["people", "index", "admin"].forEach(x => $("tab-" + x).hidden = x !== t);
}

function openPerson(id) {
  const p = S.people.find(x => x._id === id);
  if (!p) return;
  S.f = { q: "", dirs: new Set(), toggles: new Set(), contact: "", donor: "", grantDone: "", grantReady: "", exp: "" };
  $("q").value = p.name; S.f.q = p.name; TERMS = norm(p.name).split(/\s+/).filter(Boolean);
  renderFilters(); renderPeople(); switchTab("people");
  const el = $(id);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); }
}

// ══ ПОДІЇ ═══════════════════════════════════════════════
let qTimer = null;
document.addEventListener("DOMContentLoaded", () => {
  $("q").addEventListener("input", e => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { S.f.q = e.target.value; TERMS = norm(S.f.q).split(/\s+/).filter(Boolean); renderPeople(); }, 120);
  });
  $("iq").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(renderIndex, 120); });
  $("dirChips").addEventListener("click", e => {
    const b = e.target.closest("[data-dir]"); if (!b) return;
    const k = b.dataset.dir; S.f.dirs.has(k) ? S.f.dirs.delete(k) : S.f.dirs.add(k);
    b.setAttribute("aria-pressed", String(S.f.dirs.has(k))); renderPeople();
  });
  $("toggleChips").addEventListener("click", e => {
    const b = e.target.closest("[data-toggle]"); if (!b) return;
    const k = b.dataset.toggle; S.f.toggles.has(k) ? S.f.toggles.delete(k) : S.f.toggles.add(k);
    b.setAttribute("aria-pressed", String(S.f.toggles.has(k))); renderPeople();
  });
  $("selects").addEventListener("change", e => { const s = e.target.closest("[data-sel]"); if (!s) return; S.f[s.dataset.sel] = s.value; renderPeople(); });
  $("reset").addEventListener("click", () => {
    S.f = { q: "", dirs: new Set(), toggles: new Set(), contact: "", donor: "", grantDone: "", grantReady: "", exp: "" };
    $("q").value = ""; TERMS = []; renderFilters(); renderPeople();
  });
  document.querySelector("nav.tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) switchTab(b.dataset.tab); });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-open]"); if (b) { openPerson(b.dataset.open); return; }
    const m = e.target.closest("[data-more]");
    if (m) { const p = S.people.find(x => x._id === m.dataset.more); if (p) m.parentNode.innerHTML = tags(p.contacts); }
  });
  $("logout").addEventListener("click", () => forget("Ви вийшли. Дані з цього браузера прибрано."));
  $("refresh").addEventListener("click", () => {
    const t = loadToken();
    if (t) { S.token = t; loadMap(); } else forget("Сесія завершилася. Увійдіть ще раз.");
  });

  const t = loadToken();
  if (t) { S.token = t; loadMap(); } else showGate();
});
