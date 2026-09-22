import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  user: null,
  view: "content",
  kind: "articles",
  lang: "en",
  rows: [],
  editing: null,
  form: {},
  settings: {},
  partners: [],
  inquiries: [],
  selectedInquiry: null,
};

const articleFields = {
  title: { type: "text", label: "Title" },
  excerpt: { type: "textarea", label: "Short introduction", rows: 3 },
  content: { type: "textarea", label: "Article text", rows: 10 },
};
const projectFields = {
  title: { type: "text", label: "Title" },
  summary: { type: "textarea", label: "Short introduction", rows: 3 },
  description: { type: "textarea", label: "Project description", rows: 10 },
  goal: { type: "textarea", label: "Goal", rows: 5 },
  audience: { type: "textarea", label: "Who it is for", rows: 5 },
  activities: { type: "textarea", label: "Activities", rows: 5 },
  outcomes: { type: "textarea", label: "Expected results", rows: 5 },
};

const emptyArticle = {
  slug: "", title_lt: "", title_en: "", excerpt_lt: "", excerpt_en: "",
  content_lt: "", content_en: "", image_url: "", seo_title_lt: "", seo_title_en: "",
  seo_description_lt: "", seo_description_en: "", social_image_url: "", scheduled_at: "", status: "draft",
};
const emptyProject = {
  slug: "", title_lt: "", title_en: "", summary_lt: "", summary_en: "", description_lt: "", description_en: "",
  goal_lt: "", goal_en: "", audience_lt: "", audience_en: "", activities_lt: "", activities_en: "",
  outcomes_lt: "", outcomes_en: "", programme: "", project_year: "", project_code: "", partner_name: "",
  image_url: "", gallery_urls: "", document_links: "", seo_title_lt: "", seo_title_en: "", seo_description_lt: "",
  seo_description_en: "", social_image_url: "", scheduled_at: "", featured: false, status: "draft",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function message(text, target = "global-message") {
  const element = document.getElementById(target);
  if (!element) return;
  element.textContent = text || "";
  if (target === "global-message") {
    element.classList.toggle("show", Boolean(text));
    if (text) window.setTimeout(() => element.classList.remove("show"), 5200);
  }
}

function setAuthMessage(text) { $("#auth-message").textContent = text || ""; }
function setEditorMessage(text) { $("#editor-message").textContent = text || ""; }

function showAuth() {
  $("#auth-view").classList.remove("hidden");
  $("#cms-view").classList.add("hidden");
}

async function showCms(user) {
  state.user = user;
  $("#auth-view").classList.add("hidden");
  $("#cms-view").classList.remove("hidden");
  $("#user-email").textContent = user.email || "";
  const { data: profile, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (error?.code === "PGRST205") {
    message("Supabase connected, but the SHIFT tables are not installed yet. Run supabase/shift-schema.sql once in Supabase SQL Editor.");
    return;
  }
  if (!profile?.is_admin) {
    message("This account is signed in but does not have administrator access. Set profiles.is_admin = true for this user in Supabase.");
    return;
  }
  await loadCurrentView();
}

async function loadCurrentView() {
  if (state.view === "content") await loadEntries();
  if (state.view === "website") await loadWebsite();
  if (state.view === "inquiries") await loadInquiries();
  if (state.view === "stats") await loadStats();
}

async function loadEntries() {
  const { data, error } = await supabase.from(state.kind).select("*").order("updated_at", { ascending: false });
  if (error) { state.rows = []; renderEntryList(); message(error.code === "PGRST205" ? "The CMS tables are missing. Run the supplied SHIFT schema SQL in Supabase." : error.message); return; }
  state.rows = data || [];
  renderEntryList();
  if (!state.editing) newEntry();
}

function newEntry() {
  state.editing = null;
  state.form = { ...(state.kind === "articles" ? emptyArticle : emptyProject) };
  renderEditor();
}

function editEntry(row) {
  state.editing = row.id;
  state.form = { ...(state.kind === "articles" ? emptyArticle : emptyProject), ...row };
  renderEditor();
}

function renderEntryList() {
  const list = $("#entry-list");
  if (!state.rows.length) { list.innerHTML = '<div class="entry-empty">No entries yet. Start with a new story.</div>'; return; }
  list.innerHTML = state.rows.map((row) => `<button class="entry-row ${state.editing === row.id ? "active" : ""}" data-id="${esc(row.id)}"><span class="status-dot ${row.status === "published" ? "" : "draft"}"></span><span><strong>${esc(row[`title_${state.lang}`] || row.title_en || "Untitled")}</strong><small>${row.status === "published" ? "Published" : "Draft"}</small></span><span class="arrow">›</span></button>`).join("");
  $$(".entry-row", list).forEach((button) => button.addEventListener("click", () => editEntry(state.rows.find((row) => row.id === button.dataset.id))));
}

function renderEditor() {
  const isProject = state.kind === "projects";
  const fields = isProject ? projectFields : articleFields;
  $("#editor-mode").textContent = state.editing ? "Editing entry" : "New entry";
  $("#editor-title").textContent = state.form[`title_${state.lang}`] || (isProject ? "Create a project." : "Create a news item.");
  $("#entry-status").textContent = state.form.status === "published" ? "Published" : "Draft";
  $("#entry-status").className = `status-pill ${state.form.status === "published" ? "published" : "draft"}`;
  $("#delete-entry").classList.toggle("hidden", !state.editing);
  $$("[data-lang]").forEach((button) => button.classList.toggle("active", button.dataset.lang === state.lang));
  const markup = [];
  for (const [key, config] of Object.entries(fields)) {
    const name = `${key}_${state.lang}`;
    markup.push(`<label>${config.label} · ${state.lang.toUpperCase()}${config.type === "textarea" ? `<textarea data-key="${name}" rows="${config.rows || 4}"></textarea>` : `<input data-key="${name}" />`}</label>`);
  }
  markup.push(`<label>Cover image URL<input data-key="image_url" type="url" /></label><div class="media-control"><button type="button" data-upload="image_url">＋ Upload cover image</button><input type="file" data-file="image_url" accept="image/*" /></div>`);
  markup.push(`<label>Slug / address<input data-key="slug" /></label><label>Scheduled publication<input data-key="scheduled_at" type="datetime-local" /></label>`);
  if (isProject) markup.push(`<div class="field-grid"><label>Programme<input data-key="programme" /></label><label>Project year<input data-key="project_year" /></label><label>Project code<input data-key="project_code" /></label><label>Partner name<input data-key="partner_name" /></label><label>Featured<select data-key="featured"><option value="false">No</option><option value="true">Yes</option></select></label></div>`);
  markup.push(`<details><summary>SEO fields</summary><div class="field-grid"><label>SEO title<input data-key="seo_title_${state.lang}" /></label><label>Social image URL<input data-key="social_image_url" type="url" /></label><label class="wide">SEO description<textarea data-key="seo_description_${state.lang}" rows="3"></textarea></label></div></details>`);
  $("#entry-fields").innerHTML = markup.join("");
  $$('[data-key]', $("#entry-fields")).forEach((control) => {
    const key = control.dataset.key;
    control.value = String(state.form[key] ?? "");
    control.addEventListener("input", () => {
      state.form[key] = control.type === "checkbox" ? control.checked : control.value;
      if (key === `title_${state.lang}`) $("#editor-title").textContent = control.value || (isProject ? "Create a project." : "Create a news item.");
    });
    control.addEventListener("change", () => { state.form[key] = control.value; });
  });
  $$("[data-upload]", $("#entry-fields")).forEach((button) => {
    const key = button.dataset.upload;
    const input = $(`[data-file="${key}"]`, $("#entry-fields"));
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => uploadFile(input.files?.[0], key));
  });
  renderEntryList();
}

async function uploadFile(file, key) {
  if (!file || !state.user) return;
  message("Uploading…");
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("site-media").upload(path, file, { upsert: false });
  if (error) { message(error.message); return; }
  const { data } = supabase.storage.from("site-media").getPublicUrl(path);
  state.form[key] = data.publicUrl;
  const control = $(`[data-key="${key}"]`, $("#entry-fields"));
  if (control) control.value = data.publicUrl;
  message("File uploaded");
}

async function saveEntry(status) {
  setEditorMessage("");
  const payload = { ...state.form, status, published_at: status === "published" && !state.form.scheduled_at ? new Date().toISOString() : null, scheduled_at: state.form.scheduled_at || null };
  const result = state.editing
    ? await supabase.from(state.kind).update(payload).eq("id", state.editing).select().single()
    : await supabase.from(state.kind).insert(payload).select().single();
  if (result.error) { setEditorMessage(result.error.message); return; }
  setEditorMessage(status === "published" ? "Published on the site." : "Draft saved.");
  state.editing = result.data.id;
  state.form = { ...state.form, ...result.data };
  await loadEntries();
}

async function deleteEntry() {
  if (!state.editing || !window.confirm("Delete this entry?")) return;
  const { error } = await supabase.from(state.kind).delete().eq("id", state.editing);
  if (error) { setEditorMessage(error.message); return; }
  newEntry();
  await loadEntries();
}

async function loadWebsite() {
  const [settingsResult, partnersResult] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", "main").maybeSingle(),
    supabase.from("partners").select("*").order("sort_order"),
  ]);
  if (settingsResult.error || partnersResult.error) { message(settingsResult.error?.message || partnersResult.error?.message); return; }
  state.settings = settingsResult.data || {};
  state.partners = partnersResult.data || [];
  const form = $("#settings-form");
  ["hero_title_en", "hero_title_lt", "hero_text_en", "hero_text_lt", "hero_image_url", "impact_projects", "impact_countries", "impact_participants"].forEach((key) => { if (form.elements[key]) form.elements[key].value = state.settings[key] ?? ""; });
  renderPartners();
}

function renderPartners() {
  const list = $("#partner-list");
  list.innerHTML = state.partners.length ? state.partners.map((item) => `<div class="partner-row"><strong>${esc(item.name)}</strong><small>${item.is_visible ? "Visible" : "Hidden"}</small><button type="button" data-partner="${esc(item.id)}">Edit</button></div>`).join("") : '<div class="entry-empty">No partners yet.</div>';
  $$('[data-partner]', list).forEach((button) => button.addEventListener("click", () => openPartner(state.partners.find((item) => item.id === button.dataset.partner))));
}

function openPartner(item = {}) {
  const form = $("#partner-form");
  form.classList.remove("hidden");
  ["id", "name", "website_url", "logo_url"].forEach((key) => { if (form.elements[key]) form.elements[key].value = item[key] || ""; });
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  ["impact_projects", "impact_countries", "impact_participants"].forEach((key) => { payload[key] = Number(payload[key] || 0); });
  const { error } = await supabase.from("site_settings").upsert({ id: "main", ...payload });
  $("#settings-message").textContent = error ? error.message : "Homepage settings saved.";
}

async function savePartner(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const id = payload.id;
  delete payload.id;
  const result = id ? await supabase.from("partners").update(payload).eq("id", id) : await supabase.from("partners").insert(payload);
  $("#partner-message").textContent = result.error ? result.error.message : "Partner saved.";
  if (!result.error) { event.currentTarget.classList.add("hidden"); await loadWebsite(); }
}

async function loadInquiries() {
  const { data, error } = await supabase.from("inquiries").select("*").order("created_at", { ascending: false });
  if (error) { message(error.message); return; }
  state.inquiries = data || [];
  state.selectedInquiry = state.selectedInquiry || state.inquiries[0]?.id || null;
  $("#new-count").textContent = String(state.inquiries.filter((item) => item.status === "new").length || "");
  renderInquiries();
}

function renderInquiries() {
  $("#inquiry-list").innerHTML = state.inquiries.length ? state.inquiries.map((item) => `<button class="inquiry-row ${item.id === state.selectedInquiry ? "active" : ""}" data-inquiry="${esc(item.id)}"><strong>${esc(item.name || "Unnamed")}</strong><small>${esc(item.status)} · ${new Date(item.created_at).toLocaleDateString()}</small><p>${esc(item.message)}</p></button>`).join("") : '<div class="entry-empty">No enquiries yet.</div>';
  $$('[data-inquiry]', $("#inquiry-list")).forEach((button) => button.addEventListener("click", () => { state.selectedInquiry = button.dataset.inquiry; renderInquiries(); }));
  const item = state.inquiries.find((entry) => entry.id === state.selectedInquiry);
  if (!item) { $("#inquiry-reader").innerHTML = '<p class="muted">Select an enquiry to read it.</p>'; return; }
  $("#inquiry-reader").innerHTML = `<span class="status-pill ${esc(item.status)}">${esc(item.status)}</span><h2>${esc(item.name)}</h2><div class="inquiry-meta"><a href="mailto:${esc(item.email)}">${esc(item.email)}</a><span>${esc(item.organization)}</span><time>${new Date(item.created_at).toLocaleString()}</time></div><div class="inquiry-message">${esc(item.message)}</div><div class="field-grid"><label>Assignee<input data-inquiry-field="assignee" value="${esc(item.assignee)}" /></label><label>Tags<input data-inquiry-field="tags" value="${esc(item.tags)}" /></label><label class="wide">Internal notes<textarea data-inquiry-field="internal_notes" rows="4">${esc(item.internal_notes)}</textarea></label></div><div class="inquiry-actions"><button class="button button-primary" data-status="replied">Mark replied</button><button class="button button-muted" data-status="archived">Archive</button><button class="danger-button" data-remove-inquiry="${esc(item.id)}">Delete</button></div>`;
  $$('[data-inquiry-field]', $("#inquiry-reader")).forEach((control) => control.addEventListener("change", () => updateInquiry(item.id, control.dataset.inquiryField, control.value)));
  $$('[data-status]', $("#inquiry-reader")).forEach((button) => button.addEventListener("click", () => updateInquiry(item.id, "status", button.dataset.status)));
  $("[data-remove-inquiry]", $("#inquiry-reader")).addEventListener("click", () => removeInquiry(item.id));
}

async function updateInquiry(id, key, value) {
  const { error } = await supabase.from("inquiries").update({ [key]: value }).eq("id", id);
  if (error) message(error.message); else await loadInquiries();
}

async function removeInquiry(id) {
  if (!window.confirm("Delete this enquiry?")) return;
  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) message(error.message); else { state.selectedInquiry = null; await loadInquiries(); }
}

async function loadStats() {
  const [views, inquiries] = await Promise.all([supabase.from("page_views").select("path"), supabase.from("inquiries").select("id")]);
  if (views.error || inquiries.error) { message(views.error?.message || inquiries.error?.message); return; }
  const counts = {};
  (views.data || []).forEach((row) => { counts[row.path] = (counts[row.path] || 0) + 1; });
  $("#stat-total").textContent = String(views.data?.length || 0);
  $("#stat-pages").textContent = String(Object.keys(counts).length);
  $("#stat-enquiries").textContent = String(inquiries.data?.length || 0);
  $("#path-list").innerHTML = Object.entries(counts).sort(([, a], [, b]) => b - a).map(([path, count]) => `<div class="path-row"><strong>${esc(path)}</strong><span>${count} views</span></div>`).join("") || '<div class="entry-empty">No page views yet.</div>';
}

function switchView(view) {
  state.view = view;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".cms-view").forEach((panel) => panel.classList.toggle("hidden", panel.id !== `view-${view}`));
  void loadCurrentView();
}

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
  setAuthMessage(error ? error.message : "Signed in.");
});

$("#signup-button").addEventListener("click", async () => {
  const form = $("#auth-form");
  const values = Object.fromEntries(new FormData(form).entries());
  if (!values.email || !values.password) { setAuthMessage("Enter an email and password first."); return; }
  const { error } = await supabase.auth.signUp({ email: values.email, password: values.password, options: { emailRedirectTo: window.location.href } });
  setAuthMessage(error ? error.message : "Account created. Check your email, then ask an owner to grant admin access.");
});

$("#logout-button").addEventListener("click", () => void supabase.auth.signOut());
$("#new-entry").addEventListener("click", newEntry);
$("#save-draft").addEventListener("click", () => void saveEntry("draft"));
$("#publish-entry").addEventListener("click", () => void saveEntry("published"));
$("#delete-entry").addEventListener("click", () => void deleteEntry());
$("#settings-form").addEventListener("submit", (event) => void saveSettings(event));
$("#new-partner").addEventListener("click", () => openPartner());
$("#cancel-partner").addEventListener("click", () => $("#partner-form").classList.add("hidden"));
$("#partner-form").addEventListener("submit", (event) => void savePartner(event));
$$('[data-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$$('[data-kind]').forEach((button) => button.addEventListener("click", () => { state.kind = button.dataset.kind; $$("[data-kind]").forEach((item) => item.classList.toggle("active", item === button)); newEntry(); void loadEntries(); }));
$$('[data-lang]').forEach((button) => button.addEventListener("click", () => { state.lang = button.dataset.lang; renderEditor(); }));

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) void showCms(session.user); else showAuth();
});
const { data: sessionData } = await supabase.auth.getSession();
if (sessionData.session?.user) await showCms(sessionData.session.user); else showAuth();
