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
  $("app").hidden = true; $("me").hidden = true; $("gate").hidden = false; $("gbtn").hidden = false;
  const m = $("gateMsg");
  m.hidden = !msg; m.textContent = msg || ""; m.className = "msg" + (isErr ? " err" : "");
  renderGoogleButton();
}
// Поки сервер не підтвердив доступ — лише екран входу з «Перевіряю доступ…», без розділів сторінки
function showChecking() {
  $("app").hidden = true; $("me").hidden = true; $("gate").hidden = false; $("gbtn").hidden = true;
  const m = $("gateMsg");
  m.hidden = false; m.textContent = "Перевіряю доступ…"; m.className = "msg info";
}

function forget(msg, isErr) {
  S.token = null; S.me = null; S.data = null; S.people = [];
  $("cards").innerHTML = ""; $("secBody").innerHTML = ""; $("teamBody").innerHTML = "";
  S.teamRows = null; S.teamDirty = false;
  clearLocal();
  try { gisReady && google.accounts.id.disableAutoSelect(); } catch (e) {}
  showGate(msg, isErr);
}

// ══ СЕРВЕР ══════════════════════════════════════════════
async function api(action, extra) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action: action, token: S.token }, extra || {})),
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
  // Розділи показуємо лише тим, кого сервер уже пустив у цій вкладці (кнопка «Оновити»)
  const inside = !!S.data;
  if (inside) {
    $("loading").hidden = false; $("error").hidden = true;
    ["people", "sec", "team"].forEach(t => $("tab-" + t).hidden = true);
  } else showChecking();
  let r;
  try { r = await api("getMap"); }
  catch (e) {
    if (inside) { $("loading").hidden = true; showError("Не вдалося зв'язатися з сервером. Перевірте інтернет і натисніть «Оновити»."); $("me").hidden = false; }
    else showGate("Не вдалося зв'язатися з сервером. Перевірте інтернет і спробуйте ще раз.", true);
    return;
  }
  if (r && r.ok) {
    $("gate").hidden = true; $("gbtn").hidden = false; $("app").hidden = false; $("loading").hidden = true; $("error").hidden = true;
    S.me = r.me; S.data = r.map; prepare(); renderAll();
    return;
  }
  if (r && r.error === "AUTH_REQUIRED") {
    if (r.denied) forget("Цієї адреси немає в списку доступу. Увійдіть робочим акаунтом або зверніться до адміністратора порталу.", true);
    else forget("Сесія завершилася. Увійдіть ще раз.");
    return;
  }
  if (inside) { $("loading").hidden = true; showError("Сервер повернув помилку. Спробуйте «Оновити» за хвилину; якщо не минає — напишіть адміністратору."); $("me").hidden = false; }
  else showGate("Сервер повернув помилку. Спробуйте увійти ще раз за хвилину; якщо не минає — напишіть адміністратору.", true);
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

// ══ РОЗДІЛИ-ТАБЛИЦІ «ЛЮДИ × ПУНКТИ» ═════════════════════
// Короткі назви стовпців; повна назва — у підказці
const SHORT = {
  // заявки
  "Писав(-ла) змістовну частину заявки": "Змістовна частина заявки", "Складав(-ла) бюджет проєкту": "Бюджет",
  "Готував(-ла) логічну рамку та індикатори": "Лограмка, індикатори", "Керував(-ла) проєктом": "Керував(-ла) проєктом",
  "Готував(-ла) змістовний звіт донору": "Змістовний звіт", "Готував(-ла) фінансовий звіт": "Фінансовий звіт",
  "Вів(-ла) переговори з донором": "Переговори з донором",
  "Пропонувати проєктні ідеї": "Проєктні ідеї", "Писати змістовну частину": "Писати змістовну частину",
  "Виходити на контакт із донорами": "Контакт із донорами", "Шукати конкурси й донорів у своїй темі": "Шукати конкурси",
  "Бути керівником проєкту": "Керівник проєкту", "Поки не готовий(-а)": "Поки не готовий(-а)",
  // донори
  "USAID (зокрема через Pact, Internews, MSI)": "USAID", "Міжнародний фонд «Відродження»": "МФ «Відродження»",
  "GIZ (зокрема U-LEAD)": "GIZ / U-LEAD", "DRI (Democracy Reporting International)": "DRI", "Chemonics (Кімонікс)": "Chemonics",
  "Європейська комісія / ЄС": "ЄК / ЄС", "Програма МАТРА (Нідерланди)": "МАТРА", "EUACI (Антикорупційна ініціатива ЄС)": "EUACI",
  "Уряд Великої Британії (FCDO)": "FCDO", "Центральне агентство з управління проєктами (Литва)": "Агентство проєктів (Литва)",
  "Посольство США в Україні": "Посольство США",
  // публічні формати
  "Письмовий коментар для медіа": "Письмовий коментар", "Коментар або інтерв'ю в прямому ефірі (радіо, ТБ, стрими)": "Прямий ефір",
  "Авторська колонка чи блог": "Колонка, блог", "Підготовка поінтсів — коротких тез позиції ЦППР зі своєї теми": "Поінтси",
  "Участь у відео ЦППР (коротке пояснення на камеру)": "Відео ЦППР", "Тексти чи тези для соцмереж ЦППР": "Тексти для соцмереж",
  "Виступ на публічному заході": "Виступ на заході", "Модерація заходу": "Модерація", "Коментар або виступ англійською": "Англійською",
  // досвід
  "Підготовка законопроєктів і поправок": "Законопроєкти, поправки",
  "Підготовка документів політики (зелені, білі книги, концепції, стратегії, дорожні карти)": "Документи політики",
  "Правова експертиза, підготовка експертних висновків": "Правова експертиза",
  "Участь у робочих групах при органах державної влади або органах місцевого самоврядування": "Робочі групи при органах",
  "Членство в консультативно-дорадчих органах, дисциплінарних або конкурсних комісіях": "Дорадчі органи, комісії",
  "Державна служба або робота в органах державної влади або органах місцевого самоврядування": "Держслужба, робота в органах",
  "Судова, прокурорська чи адвокатська практика": "Суд, прокуратура, адвокатура", "Викладання у закладах вищої освіти": "Викладання у ЗВО",
  "Проведення тренінгів і навчань": "Тренінги",
  // контакти
  "Верховна Рада, комітети": "ВРУ, комітети", "Кабінет Міністрів, міністерства": "КМУ, міністерства",
  "Президент і його консультативно-дорадчі органи": "Президент, дорадчі органи", "Органи місцевого самоврядування та їхні асоціації": "ОМС та асоціації",
  "Суди, органи суддівського врядування": "Суди, суддівське врядування", "Міжнародні організації і донори": "Міжнародні організації",
  "Університети й наукові установи": "Університети, наука", "Громадські організації та коаліції": "ГО, коаліції",
  "Уповноважений ВРУ з прав людини": "Омбудсман",
  // вміння
  "Готовий(-а) брати стажерів і практикантів за своїм напрямом": "Бере стажерів", "Менторство нових колег": "Менторство",
  "Редагування і коректура текстів": "Редагування, коректура", "ШІ-інструменти для аналітики й роботи з текстами": "ШІ для аналітики й текстів",
  "Автоматизація процесів за допомогою ШІ": "Автоматизація з ШІ", "Excel, таблиці, робота з даними": "Excel, дані",
  "Візуалізація даних, інфографіка": "Візуалізація, інфографіка", "Соціологія, методологія досліджень": "Соціологія, методологія",
  // комунікації
  "Новини, пресрелізи, анонси": "Новини, пресрелізи", "Редагування аналітичних матеріалів": "Редагування аналітики",
  "Робота з журналістами, пропонування тем медіа": "Робота з журналістами", "Підготовка спікерів до ефірів та інтерв'ю": "Підготовка спікерів",
  "Моніторинг медіа, аналітика охоплень": "Моніторинг медіа", "Таргетована реклама, просування": "Таргетована реклама",
  "Графічний дизайн, інфографіка": "Дизайн, інфографіка",
  // адмінпитання
  "Оформлення грантових заявок і додатків до них": "Оформлення заявок", "Організація заходів, логістика, відрядження": "Заходи, логістика, відрядження",
  "Політики і внутрішні положення ЦППР": "Політики й положення", "Фінансова звітність донорам": "Фінзвітність донорам",
  "Технічні питання по сайту": "Сайт", "Техніка, акаунти, доступи": "Техніка, акаунти"
};
const short = v => SHORT[v] || DIR_SHORT[v] || v;

// Таблиця за полем-списком: стовпці — офіційні варіанти (за кількістю), решта відповідей — стовпець «Інше»
function fieldTable(id, title, field, more) {
  const official = arr((S.data.options || {})[field]);
  const cnt = {};
  S.people.forEach(p => arr(p[field]).forEach(v => cnt[v] = (cnt[v] || 0) + 1));
  const offSet = new Set(official);
  const cols = Object.keys(cnt).filter(v => offSet.has(v)).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b, "uk"))
    .map(v => ({ k: v, label: short(v), full: v }));
  // Відповіді своїми словами («Інше») — окремим текстовим стовпцем поруч, щоб їх було видно одразу
  const otherOf = p => arr(p[field]).filter(v => !offSet.has(v));
  const hasOther = S.people.some(p => otherOf(p).length);
  more = more || {};
  const extras = (hasOther ? [{ title: "Своїми словами", get: p => otherOf(p).join("; ") }] : []).concat(more.extras || []);
  return Object.assign({
    id, title, cols,
    rows: p => arr(p[field]).length > 0,
    val: (p, c) => arr(p[field]).includes(c.k) ? "yes" : ""
  }, more, { extras });
}

const PUB_LVL = { ok: "yes", try: "try", no: "no" };
const LANG_LEVELS = [["Читаю фахові тексти", "Читає"], ["Пишу аналітичні тексти", "Пише"], ["Виступаю і веду дискусію", "Виступає"]];
const SPEED_SHORT = { "Того ж дня": "того ж дня", "Наступного дня": "наступного дня", "Залежить від теми, потрібно більше часу": "залежить від теми", "Протягом години-двох": "1–2 години" };

function sections() {
  const people = S.people;
  const pubKeys = [];
  people.forEach(p => Object.keys(p.pub || {}).forEach(k => { if (!pubKeys.includes(k)) pubKeys.push(k); }));
  const langs = [];
  people.forEach(p => Object.keys(p.lang || {}).forEach(k => { if (!langs.includes(k)) langs.push(k); }));
  return [
    { id: "dirs", title: "Напрями", lead: "Хто з експертів і адміністрації працює в яких напрямах (з анкети). Команду комунікацій за напрямами див. у розділі «Комунікації».",
      tables: [{
        id: "dirs", title: "Напрями ЦППР",
        cols: DIRS.map(d => ({ k: d.full, label: d.short, full: d.full })),
        rows: p => p.role !== "comms" && (arr(p.dirs).length || arr(p.dirsOther).length),
        val: (p, c) => arr(p.dirs).includes(c.k) ? "yes" : "",
        extras: [{ title: "Інші напрями", get: p => arr(p.dirsOther).join("; ") }]
      }] },
    { id: "comms", title: "Комунікації", lead: "Команда комунікацій: закріплення за напрямами і комунікаційні вміння всіх, хто їх позначив.",
      tables: [{
        id: "commsDirs", title: "Закріплення за напрямами",
        cols: DIRS.map(d => ({ k: d.full, label: d.short, full: d.full })),
        rows: p => p.role === "comms",
        val: (p, c) => arr(p.gridAssigned).includes(c.k) ? "yes" : arr(p.gridExtra).includes(c.k) ? "try" : "",
        legend: [["yes", "закріплений(-а)"], ["try", "працював(-ла) додатково"]]
      }, fieldTable("commsSkills", "Комунікаційні вміння", "comms", { extras: [{ title: "Інструменти", get: p => p.commsTools || "" }] })] },
    { id: "projects", title: "Проєкти", lead: "Досвід заявок і звітів, готовність долучатися до нових заявок, донори й програми. Донори — особистий досвід людей (у проєктах ЦППР або деінде).",
      tables: [fieldTable("grantDone", "Що вже робили", "grantDone"), fieldTable("grantReady", "До чого готові в нових заявках", "grantReady"),
        fieldTable("donors", "З якими донорами й програмами працювали", "donors")] },
    { id: "public", title: "Публічність", lead: "До яких публічних форматів люди готові і як швидко можуть дати коментар.",
      tables: [{
        id: "pub", title: "Публічні формати",
        cols: pubKeys.map(k => ({ k, label: short(k), full: k })),
        rows: p => Object.keys(p.pub || {}).length > 0,
        val: (p, c) => p.pub && p.pub[c.k] ? PUB_LVL[LVL(p.pub[c.k])] : "",
        legend: [["yes", "роблю і готовий(-а) далі"], ["try", "не робив(-ла), але спробую"], ["no", "радше ні"]],
        extras: [{ title: "Коментар", get: p => SPEED_SHORT[p.speed] || p.speed || "" }, { title: "Не просити коментувати", get: p => p.noComment || "" }]
      }] },
    { id: "lang", title: "Мови", lead: "Іноземні мови: читає фахові тексти, пише аналітику, виступає й веде дискусію.",
      tables: [{
        id: "lang", title: "Іноземні мови",
        cols: [].concat(...langs.map(l => LANG_LEVELS.map(([full, lab]) => ({ k: l + "|" + full, label: lab, full: l + ": " + full.toLowerCase(), group: l })))),
        rows: p => Object.keys(p.lang || {}).length > 0 || !!p.langOther,
        val: (p, c) => { const [l, lvl] = c.k.split("|"); return arr((p.lang || {})[l]).includes(lvl) ? "yes" : ""; },
        extras: [{ title: "Інші мови", get: p => p.langOther || "" }]
      }] },
    { id: "contacts", title: "Контакти і досвід", lead: "У яких середовищах люди мають робочі контакти і який мають досвід.",
      tables: [fieldTable("contacts", "Робочі контакти", "contacts"), fieldTable("exp", "Досвід", "exp")] },
    { id: "skills", title: "Вміння", lead: "Чим колеги готові ділитися — зокрема хто бере стажерів і готовий менторити.",
      tables: [fieldTable("share", "Чим готові ділитися з колегами", "share", { extras: [{ title: "Детальніше", get: p => p.shareTxt || "" }] })] },
    { id: "admin", title: "Адмінпитання", lead: "До кого звертатися з організаційними, фінансовими й технічними питаннями.",
      tables: [fieldTable("adminQ", "До кого з якими питаннями", "adminQ", { extras: [{ title: "Системи й інструменти", get: p => p.adminTools || "" }] })],
      cards: p => arr(p.adminQ).length > 0 }
  ];
}

S.sort = {};
function surname(p) { return p.name.split(" ").slice(-1)[0]; }
function cellScore(v) { v = v && v.v ? v.v : v; return v === "yes" ? 3 : v === "try" ? 2 : v === "no" ? 0.5 : 0; }

function matrixHtml(t) {
  const people = S.people.filter(p => t.rows(p));
  if (!people.length || !t.cols.length) return "";
  const vals = new Map(people.map(p => [p._id, t.cols.map(c => t.val(p, c))]));
  const total = p => vals.get(p._id).reduce((a, v) => a + (cellScore(v) >= 2 ? 1 : 0), 0);
  const sk = S.sort[t.id] || "";
  const ci = t.cols.findIndex(c => c.k === sk);
  people.sort((a, b) => {
    if (sk === "@name") return surname(a).localeCompare(surname(b), "uk");
    if (ci >= 0) { const d = cellScore(vals.get(b._id)[ci]) - cellScore(vals.get(a._id)[ci]); if (d) return d; }
    return total(b) - total(a) || surname(a).localeCompare(surname(b), "uk");
  });
  const groups = t.cols.some(c => c.group);
  let head = "";
  if (groups) {
    const g = [];
    t.cols.forEach(c => { const last = g[g.length - 1]; if (last && last.n === c.group) last.span++; else g.push({ n: c.group, span: 1 }); });
    head += `<tr class="grp"><th class="nm"></th>${g.map(x => `<th colspan="${x.span}">${esc(x.n)}</th>`).join("")}${(t.extras || []).map(() => "<th></th>").join("")}</tr>`;
  }
  head += `<tr><th class="nm"><button type="button" class="sortbtn${sk === "@name" ? " on" : ""}" data-sort="${esc(t.id)}" data-col="@name">Ім'я ↕</button></th>` +
    t.cols.map(c => `<th class="col${c.k === sk ? " on" : ""}"><button type="button" class="vh" data-sort="${esc(t.id)}" data-col="${esc(c.k)}" title="${esc(c.full)} — натисніть, щоб відсортувати">${esc(c.label)}</button></th>`).join("") +
    (t.extras || []).map(x => `<th class="ex">${esc(x.title)}</th>`).join("") + `</tr>`;
  const body = people.map(p => {
    const v = vals.get(p._id);
    return `<tr><th class="nm"><button type="button" class="plink2" data-open="${p._id}">${esc(p.name)}</button><span class="tot">${total(p)}</span></th>` +
      v.map((x, i) => {
        const cls = x && x.v ? x.v : x;
        const tip = p.name + " — " + t.cols[i].full + (x && x.tip ? ": " + x.tip : "");
        return `<td class="${i === ci ? "on" : ""}">${cls ? `<span class="dot ${cls}" title="${esc(tip)}"></span>` : `<span class="nil"></span>`}</td>`;
      }).join("") +
      (t.extras || []).map(x => `<td class="ex">${esc(x.get(p))}</td>`).join("") + `</tr>`;
  }).join("");
  const foot = `<tr class="sum"><th class="nm">Разом</th>` + t.cols.map((c, i) => {
    let y = 0, tr = 0; people.forEach(p => { const s = cellScore(vals.get(p._id)[i]); if (s === 3) y++; else if (s === 2) tr++; });
    return `<td>${y || ""}${tr ? `<small>+${tr}</small>` : ""}</td>`;
  }).join("") + (t.extras || []).map(() => "<td></td>").join("") + `</tr>`;
  const legend = t.legend ? `<div class="legend">${t.legend.map(([c, l]) => `<span><span class="dot ${c}"></span>${esc(l)}</span>`).join("")}</div>` : "";
  return `<div class="mx-block"><h2>${esc(t.title)} <small>${people.length} ${people.length === 1 ? "особа" : "осіб"}</small></h2>${legend}
    <div class="mx-wrap"><table class="mx"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div></div>`;
}

function renderSection(id) {
  const sec = sections().find(x => x.id === id);
  if (!sec) return;
  const saved = TERMS; TERMS = [];
  let html = `<p class="lead">${esc(sec.lead)} Натисніть назву стовпця, щоб відсортувати; ім'я — щоб відкрити картку.</p>` +
    sec.tables.map(matrixHtml).join("");
  if (sec.cards) {
    const ppl = S.people.filter(sec.cards);
    html += `<h2 class="sec-h">Картки</h2><div class="grid">${ppl.map(p => card(p, "s-")).join("")}</div>`;
  }
  TERMS = saved;
  $("secBody").innerHTML = html || `<div class="empty">Немає даних.</div>`;
}

// ══ КОМАНДА (білий список; лише адміни) ═════════════════
const EMAIL_RE = /^[^@\s"'<>()\[\],;:]+@[^@\s"'<>()\[\],;:]+\.[^@\s"'<>()\[\],;:]+$/;

async function loadTeam() {
  $("teamBody").innerHTML = `<div class="loading">Завантажую команду…</div>`;
  let r;
  try { r = await api("getAccess"); } catch (e) { r = null; }
  if (!r || !r.ok) { $("teamBody").innerHTML = `<div class="banner">Не вдалося завантажити команду${r && r.error === "FORBIDDEN" ? ": немає прав адміністратора" : ""}.</div>`; return; }
  S.teamRows = r.rows.map(x => ({ name: x.name, email: x.email, note: x.note }));
  S.teamAdmins = arr(r.admins);
  S.teamDirty = false; S.teamBad = [];
  renderTeam();
}

function teamProblems() {
  const bad = new Set(), seen = {};
  S.teamRows.forEach((r, i) => {
    const e = String(r.email || "").trim().toLowerCase();
    const n = String(r.name || "").trim();
    if (!n && !e && !String(r.note || "").trim()) return;
    if (!n || (e && !EMAIL_RE.test(e))) bad.add(i);
    if (e) { if (seen[e] !== undefined) { bad.add(i); bad.add(seen[e]); } else seen[e] = i; }
  });
  return bad;
}

function renderTeam(status) {
  if (status) S.teamStatus = status;
  else if (S.teamDirty) S.teamStatus = null;
  status = status || S.teamStatus;
  const rows = S.teamRows || [];
  const bad = teamProblems();
  const withMail = rows.filter(r => EMAIL_RE.test(String(r.email || "").trim().toLowerCase())).length;
  const inList = new Set(rows.map(r => norm(r.name).split(/\s+/).sort().join(" ")));
  const notInList = S.people.filter(p => !inList.has(norm(p.name).split(/\s+/).sort().join(" ")));
  $("teamBody").innerHTML = `
    <p class="lead">Білий список порталу: хто може увійти. Пошта звідси показується й на картках.
      Адміністратори (${S.teamAdmins.map(esc).join(", ")}) мають доступ завжди.
      ${withMail ? "" : "<b>Поки в списку немає жодної адреси, діє команда з CPLR Events.</b>"}</p>
    <div class="team-tools">
      <button type="button" class="btn primary" id="teamSave"${S.teamDirty ? "" : " disabled"}>Зберегти</button>
      <button type="button" class="btn" id="teamAdd">+ Додати людину</button>
      ${notInList.length ? `<button type="button" class="btn" id="teamAddMap">+ Додати всіх із карти, кого немає (${notInList.length})</button>` : ""}
      <span class="team-status${status && status.err ? " err" : ""}" id="teamStatus">${esc(status ? status.text : (S.teamDirty ? "Є незбережені зміни" : `У списку ${rows.length}, з поштою ${withMail}`))}</span>
    </div>
    <div class="mx-wrap"><table class="team">
      <thead><tr><th>Ім'я та прізвище</th><th>Пошта</th><th>Примітка</th><th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${bad.has(i) ? "bad" : ""}">
        <td><input data-i="${i}" data-f="name" value="${esc(r.name)}" maxlength="120" placeholder="Ім'я Прізвище"></td>
        <td><input data-i="${i}" data-f="email" value="${esc(r.email)}" maxlength="200" placeholder="пошта" inputmode="email" autocomplete="off"></td>
        <td><input data-i="${i}" data-f="note" value="${esc(r.note)}" maxlength="200"></td>
        <td><button type="button" class="del" data-del="${i}" title="Видалити рядок" aria-label="Видалити рядок">✕</button></td></tr>`).join("")}</tbody>
    </table></div>
    ${bad.size ? `<p class="team-hint err">Позначені рядки: потрібне ім'я і правильна пошта; одна адреса — лише в одному рядку.</p>` : ""}`;
}

function teamMark(text, err) { const s = $("teamStatus"); if (s) { s.textContent = text; s.className = "team-status" + (err ? " err" : ""); } }

async function saveTeam() {
  if (teamProblems().size) { renderTeam({ text: "Виправте позначені рядки", err: true }); return; }
  teamMark("Зберігаю…");
  const btn = $("teamSave"); if (btn) btn.disabled = true;
  let r;
  try { r = await api("saveAccess", { rows: S.teamRows }); } catch (e) { r = null; }
  if (r && r.ok) {
    S.teamRows = r.rows.map(x => ({ name: x.name, email: x.email, note: x.note }));
    S.teamDirty = false;
    renderTeam({ text: "Збережено ✓" });
    refreshMapQuietly();
  } else if (r && r.error === "AUTH_REQUIRED") {
    forget("Сесія завершилася. Увійдіть ще раз — незбережені зміни команди втрачено.");
  } else {
    renderTeam({ text: (r && r.message) || "Не вдалося зберегти. Спробуйте ще раз.", err: true });
    if ($("teamSave")) $("teamSave").disabled = false;
  }
}

async function refreshMapQuietly() {
  try {
    const r = await api("getMap");
    if (r && r.ok) { S.me = r.me; S.data = r.map; prepare(); renderAll(true); }
  } catch (e) {}
}

function renderAll(keepTeam) {
  $("me").hidden = false;
  $("meName").textContent = (S.me.name || S.me.email) + (S.me.isAdmin ? " · адмін" : "");
  const upd = S.data.updated ? new Date(S.data.updated).toLocaleDateString("uk-UA") : "";
  $("stat").textContent = `${S.people.length} людей · ${S.data.answered} анкет${upd ? " · остання " + upd : ""}`;
  const miss = S.me.isAdmin ? arr(S.data.missingEmail) : [];
  const an = $("adminNote");
  an.hidden = !miss.length;
  an.innerHTML = miss.length ? `<b>Бачать лише адміни.</b> Без пошти на карті (${miss.length}): ${miss.map(esc).join(", ")}. ` +
    `Допишіть адреси в розділі <button type="button" class="linkbtn" data-tab="team">«Команда»</button>.` : "";
  document.querySelectorAll("[data-adminonly]").forEach(b => b.hidden = !S.me.isAdmin);
  if (!S.me.isAdmin && S.tab === "team") S.tab = "people";
  if (!keepTeam) { S.teamRows = null; S.teamDirty = false; }
  renderFilters(); renderPeople(); switchTab(S.tab);
}

function switchTab(t) {
  if (t === "team" && !(S.me && S.me.isAdmin)) t = "people";
  S.tab = t;
  document.querySelectorAll("nav.tabs [role=tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  const isSec = t !== "people" && t !== "team";
  $("tab-people").hidden = t !== "people";
  $("tab-sec").hidden = !isSec;
  $("tab-team").hidden = t !== "team";
  if (isSec) renderSection(t);
  if (t === "team") { if (S.teamRows) renderTeam(); else loadTeam(); }
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
  // таблиці: сортування
  $("secBody").addEventListener("click", e => {
    const b = e.target.closest("[data-sort]"); if (!b) return;
    const id = b.dataset.sort, col = b.dataset.col;
    S.sort[id] = S.sort[id] === col ? "" : col;
    const y = window.scrollY; renderSection(S.tab); window.scrollTo(0, y);
  });
  // команда
  $("teamBody").addEventListener("input", e => {
    const i = e.target.dataset.i, f = e.target.dataset.f;
    if (i === undefined || !f || !S.teamRows[i]) return;
    S.teamRows[i][f] = e.target.value;
    S.teamStatus = null;
    if (!S.teamDirty) { S.teamDirty = true; const b = $("teamSave"); if (b) b.disabled = false; }
    teamMark("Є незбережені зміни");
  });
  $("teamBody").addEventListener("change", () => { if (S.teamRows) { const bad = teamProblems(); document.querySelectorAll("#teamBody tbody tr").forEach((tr, i) => tr.classList.toggle("bad", bad.has(i))); } });
  $("teamBody").addEventListener("click", e => {
    if (e.target.closest("#teamSave")) { saveTeam(); return; }
    if (e.target.closest("#teamAdd")) {
      S.teamRows.push({ name: "", email: "", note: "" }); S.teamDirty = true; renderTeam();
      const ins = document.querySelectorAll('#teamBody input[data-f="name"]'); if (ins.length) ins[ins.length - 1].focus();
      return;
    }
    if (e.target.closest("#teamAddMap")) {
      const inList = new Set(S.teamRows.map(r => norm(r.name).split(/\s+/).sort().join(" ")));
      S.people.forEach(p => { if (!inList.has(norm(p.name).split(/\s+/).sort().join(" "))) S.teamRows.push({ name: p.name, email: p.email || "", note: "з карти" }); });
      S.teamDirty = true; renderTeam(); return;
    }
    const d = e.target.closest("[data-del]");
    if (d) { S.teamRows.splice(+d.dataset.del, 1); S.teamDirty = true; renderTeam(); }
  });
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
  document.addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { switchTab(b.dataset.tab); if (!b.closest("nav")) window.scrollTo(0, 0); } });
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
