/**
 * Sikker skjemahåndtering for statisk GitHub Pages-hosting.
 * - Honeypot mot roboter
 * - Tidsjekk (avviser øyeblikkelige bots)
 * - Rate limiting i nettleseren
 * - Sanitering og XSS-trygg output
 * - Valgfri Web3Forms-levering når nøkkel er satt
 */
(function () {
  "use strict";

  const MAX = {
    name: 80,
    email: 120,
    phone: 30,
    subject: 120,
    message: 2000,
    review: 800,
  };

  const RATE_WINDOW_MS = 60_000;
  const RATE_MAX = 3;
  const MIN_FILL_MS = 1800;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeText(value, max) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .trim()
      .slice(0, max);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && !/[<>]/.test(email);
  }

  function getRateBucket(key) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : { t: [] };
      const now = Date.now();
      data.t = (data.t || []).filter((ts) => now - ts < RATE_WINDOW_MS);
      return data;
    } catch {
      return { t: [] };
    }
  }

  function bumpRate(key) {
    const data = getRateBucket(key);
    data.t.push(Date.now());
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* privat modus */
    }
  }

  function underRateLimit(key) {
    return getRateBucket(key).t.length < RATE_MAX;
  }

  function setStatus(el, type, message) {
    if (!el) return;
    el.className = "form-status " + (type === "success" ? "is-success" : "is-error");
    el.textContent = message;
  }

  function clearErrors(form) {
    form.querySelectorAll(".error").forEach((n) => {
      n.textContent = "";
    });
  }

  function showFieldError(form, name, msg) {
    const err = form.querySelector('[data-error-for="' + name + '"]');
    if (err) err.textContent = msg;
  }

  async function deliverPayload(payload) {
    const cfg = window.SITE_CONFIG || {};
    if (cfg.formAccessKey) {
      const res = await fetch(cfg.formEndpoint || "https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: cfg.formAccessKey,
          subject: payload.subject || "Melding fra Apoteker'n Café",
          from_name: payload.name,
          email: payload.email,
          message: payload.message,
          phone: payload.phone || "",
          rating: payload.rating || "",
          form_type: payload.type,
          botcheck: false,
        }),
      });
      if (!res.ok) throw new Error("Levering feilet");
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Levering feilet");
      return { mode: "remote" };
    }

    const vaultKey = "apotekern_inbox_v1";
    let vault = [];
    try {
      vault = JSON.parse(localStorage.getItem(vaultKey) || "[]");
      if (!Array.isArray(vault)) vault = [];
    } catch {
      vault = [];
    }
    vault.unshift({
      ...payload,
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      receivedAt: new Date().toISOString(),
    });
    vault = vault.slice(0, 40);
    localStorage.setItem(vaultKey, JSON.stringify(vault));
    return { mode: "local" };
  }

  function bindSecureForm(form) {
    if (!form) return;
    const started = Date.now();
    const status = form.querySelector(".form-status");
    const submitBtn = form.querySelector('[type="submit"]');
    const rateKey = "apotekern_rate_" + (form.dataset.formType || "contact");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(form);

      const hp = form.querySelector('input[name="website_url"]');
      if (hp && hp.value) {
        setStatus(status, "success", "Takk — vi har mottatt meldingen din.");
        form.reset();
        return;
      }

      if (Date.now() - started < MIN_FILL_MS) {
        setStatus(status, "error", "Ta deg tid til å fylle ut skjemaet, og prøv igjen.");
        return;
      }

      if (!underRateLimit(rateKey)) {
        setStatus(status, "error", "For mange meldinger fra denne nettleseren. Vent litt og prøv igjen.");
        return;
      }

      const type = form.dataset.formType || "contact";
      const name = sanitizeText(form.name?.value, MAX.name);
      const email = sanitizeText(form.email?.value, MAX.email);
      const phone = sanitizeText(form.phone?.value, MAX.phone);
      const subject = sanitizeText(form.subject?.value, MAX.subject);
      const message = sanitizeText(form.message?.value, type === "review" ? MAX.review : MAX.message);
      const rating = sanitizeText(form.rating?.value, 2);

      let ok = true;
      if (name.length < 2) {
        showFieldError(form, "name", "Skriv inn navnet ditt.");
        ok = false;
      }
      if (!isValidEmail(email)) {
        showFieldError(form, "email", "Skriv inn en gyldig e-postadresse.");
        ok = false;
      }
      if (type === "review") {
        if (!rating || Number(rating) < 1 || Number(rating) > 5) {
          showFieldError(form, "rating", "Velg en vurdering fra 1 til 5.");
          ok = false;
        }
        if (message.length < 10) {
          showFieldError(form, "message", "Skriv noen ord om besøket ditt.");
          ok = false;
        }
      } else if (message.length < 10) {
        showFieldError(form, "message", "Skriv en melding (minst 10 tegn).");
        ok = false;
      }

      if (!ok) {
        setStatus(status, "error", "Sjekk feltene merket med feil og prøv igjen.");
        return;
      }

      const payload = {
        type,
        name,
        email,
        phone,
        subject: subject || (type === "review" ? "Ny omtale" : "Kontaktmelding"),
        message,
        rating: rating || undefined,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.label = submitBtn.textContent;
        submitBtn.textContent = "Sender…";
      }

      try {
        const result = await deliverPayload(payload);
        bumpRate(rateKey);
        form.reset();
        if (type === "review" && result.mode === "local") {
          appendLocalReview(payload);
        }
        setStatus(
          status,
          "success",
          result.mode === "remote"
            ? "Meldingen er sendt — takk! Vi tar kontakt snart."
            : "Lagret sikkert på denne enheten. Legg inn Web3Forms-nøkkel i js/site-config.js for å motta e-post."
        );
      } catch (err) {
        setStatus(status, "error", "Noe gikk galt. Prøv igjen eller ring oss.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.label || "Send melding";
        }
      }
    });
  }

  function appendLocalReview(payload) {
    const grid = document.querySelector("[data-reviews-grid]");
    if (!grid) return;
    const card = document.createElement("article");
    card.className = "review-card reveal is-visible";
    const stars = "★".repeat(Number(payload.rating) || 5) + "☆".repeat(5 - (Number(payload.rating) || 5));
    const initial = escapeHtml(payload.name.charAt(0).toUpperCase());
    card.innerHTML =
      '<div class="stars" aria-label="' +
      escapeHtml(payload.rating) +
      ' av 5 stjerner">' +
      stars +
      "</div>" +
      "<blockquote>«" +
      escapeHtml(payload.message) +
      "»</blockquote>" +
      '<div class="reviewer"><div class="avatar" aria-hidden="true">' +
      initial +
      "</div><div><strong>" +
      escapeHtml(payload.name) +
      '</strong><span>Akkurat nå · Gjest</span></div></div>';
    grid.prepend(card);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form[data-secure-form]").forEach(bindSecureForm);
  });
})();
