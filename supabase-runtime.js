import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./admin/supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const text = (key, value) => {
  const node = document.querySelector(`[data-cms="${key}"]`);
  if (node && value) node.textContent = value;
};

const richHeroTitle = (value) => {
  const node = document.querySelector('[data-cms="hero-title"]');
  if (!node || !value) return;
  const words = String(value).trim().split(/\s+/);
  const accentCount = Math.min(2, Math.max(1, words.length - 1));
  const splitAt = Math.max(1, words.length - accentCount);
  const escape = (part) => part.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  node.innerHTML = `${escape(words.slice(0, splitAt).join(" "))} <em>${escape(words.slice(splitAt).join(" "))}</em>`;
};

const { data } = await supabase.from("site_settings").select("hero_title_en, hero_text_en, hero_image_url").eq("id", "main").maybeSingle();
if (data) {
  richHeroTitle(data.hero_title_en);
  text("hero-text", data.hero_text_en);
  const image = document.querySelector('[data-cms="hero-image"]');
  if (image && data.hero_image_url) image.src = data.hero_image_url;
}

const contactForm = document.querySelector("#contact-form");
contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const messageNode = document.querySelector("#contact-message");
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  messageNode.textContent = "Sending…";
  const payload = Object.fromEntries(new FormData(form).entries());
  const { error } = await supabase.from("inquiries").insert({ ...payload, language: "en" });
  submit.disabled = false;
  if (error) {
    messageNode.textContent = error.code === "PGRST205" ? "Contact storage is being prepared. Please email the project team for now." : error.message;
    return;
  }
  form.reset();
  messageNode.textContent = "Thanks — your message is on its way to the project team.";
});

await supabase.from("page_views").insert({ path: window.location.pathname });
