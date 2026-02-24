/**
 * SOL Lab static site helper (GitHub Pages-friendly).
 * - Injects header/footer/contact into all pages
 * - Handles theme + language persistence
 * - Optional: renders news/board from news.json + image modal
 */
(function () {
  const DEFAULT_LANG = "en";
  const DEFAULT_THEME = "light";

  // NOTE: Site is declared up-front so helper functions (wireContact, etc.)
  // can safely reference it without hitting a temporal-dead-zone error.
  const Site = {
    _translations: null,
    _onLangChange: null,
    _activeLang: DEFAULT_LANG,
    _t(lang, key) {
      return this._translations?.[lang]?.[key];
    },
    setLanguage(lang) {
      setLang(lang);
      this._activeLang = lang;
      applyI18n(this._translations, lang);
      if (typeof this._contactLangSync === "function") this._contactLangSync(lang);
      if (typeof this._onLangChange === "function") this._onLangChange(lang);
      // sync contact button label (if visible)
      const openBtn = document.getElementById("contactToggleBtn");
      if (openBtn && !openBtn.classList.contains("hidden")) {
        openBtn.textContent = `📬 ${this._t(lang, "contact_button") || "Contact"}`;
      }
    },
    toggleLanguage() {
      const current = localStorage.getItem("lang") || DEFAULT_LANG;
      this.setLanguage(current === "en" ? "ko" : "en");
    },
    toggleDarkMode() {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "light" : "dark");
    },
    toggleMobileNav() {
      document.getElementById("navLinks")?.classList.toggle("hidden");
    },
    closeImageModal,
    init: async function (config) {
      const active = config?.active || "home";
      const headerMount = document.getElementById("site-header");
      const footerMount = document.getElementById("site-footer");
      const contactMount = document.getElementById("site-contact");

      if (headerMount) headerMount.innerHTML = headerHTML(active);
      if (footerMount) footerMount.innerHTML = footerHTML();
      if (contactMount) contactMount.innerHTML = contactHTML();

      wireHeader();
      wireContact();
      wireImageModal();

      initTheme();
      const lang = initLang();

      this._translations = config?.translations || {};
      this._onLangChange = config?.onLangChange || null;
      this._activeLang = lang;
      applyI18n(this._translations, lang);

      // Optional: render news/board
      if (config?.news?.containerId) {
        await renderNews({
          containerId: config.news.containerId,
          lang,
          translations: this._translations,
          limit: config.news.limit ?? null,
          enableShowMore: config.news.enableShowMore ?? true,
          showMoreStep: config.news.showMoreStep ?? 6,
          showImages: config.news.showImages ?? true,
        });
        // re-render on language change
        const prev = this._onLangChange;
        this._onLangChange = async (newLang) => {
          if (typeof prev === "function") prev(newLang);
          await renderNews({
            containerId: config.news.containerId,
            lang: newLang,
            translations: this._translations,
            limit: config.news.limit ?? null,
            enableShowMore: config.news.enableShowMore ?? true,
            showMoreStep: config.news.showMoreStep ?? 6,
            showImages: config.news.showImages ?? true,
          });
        };
      }

      // Contact button label
      const openBtn = document.getElementById("contactToggleBtn");
      if (openBtn) openBtn.textContent = `📬 ${this._t(lang, "contact_button") || "Contact"}`;
    }
  };

  function getPrefersDark() {
    try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
    catch { return false; }
  }

  function setTheme(theme) {
    const html = document.documentElement;
    const isDark = theme === "dark";
    html.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
    const ind = document.getElementById("themeIndicator");
    const dark = document.getElementById("themeDark");
    const light = document.getElementById("themeLight");
    if (dark && light) {
      dark.classList.toggle("text-white", isDark);
      dark.classList.toggle("text-slate-600", !isDark);
      dark.classList.toggle("dark:text-slate-300", !isDark);
      light.classList.toggle("text-white", !isDark);
      light.classList.toggle("text-slate-600", isDark);
      light.classList.toggle("dark:text-slate-300", isDark);
    }
    if (ind) ind.style.transform = isDark ? "translateX(100%)" : "translateX(0%)";
    const btn = document.getElementById("darkToggle");
    if (btn) btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  }

  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return saved;
    }
    const prefers = getPrefersDark() ? "dark" : DEFAULT_THEME;
    setTheme(prefers);
    return prefers;
  }

  function setLang(lang) {
    localStorage.setItem("lang", lang);
    // Sleek toggle UI
    const btn = document.getElementById("langBtn");
    const ind = document.getElementById("langIndicator");
    const en = document.getElementById("langEN");
    const ko = document.getElementById("langKO");
    if (en && ko) {
      en.classList.toggle("text-white", lang === "en");
      ko.classList.toggle("text-white", lang === "ko");
      en.classList.toggle("text-gray-700", lang !== "en");
      ko.classList.toggle("text-gray-700", lang !== "ko");
      en.classList.toggle("dark:text-gray-200", lang !== "en");
      ko.classList.toggle("dark:text-gray-200", lang !== "ko");
    }
    if (ind) ind.style.transform = (lang === "ko") ? "translateX(100%)" : "translateX(0%)";
    if (btn) btn.setAttribute("aria-label", lang === "en" ? "Switch to Korean" : "Switch to English");
  }

  function initLang() {
    const saved = localStorage.getItem("lang");
    const lang = (saved === "ko" || saved === "en") ? saved : DEFAULT_LANG;
    setLang(lang);
    return lang;
  }

  function applyI18n(translations, lang) {
    if (!translations || !translations[lang]) return;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      const val = translations[lang][key];
      if (val == null) return;
      // Allow explicit HTML injection for specific nodes
      if (el.hasAttribute("data-i18n-html")) el.innerHTML = val;
      else el.textContent = val;
    });
    if (translations[lang].title) document.title = translations[lang].title;

    // Keep language-dependent UI (expanders) in sync
    syncExpandableControls(lang, translations);
  }

  // --- Page helpers used by People page (and similar pages) ---
  function syncExpandableControls(lang, translations) {
    // Career toggle + bilingual career lists
    const careerToggle = document.getElementById("careerToggle");
    const careerSection = document.getElementById("careerSection");
    const careerKo = document.getElementById("career-ko");
    const careerEn = document.getElementById("career-en");

    if (careerSection && careerKo && careerEn) {
      careerKo.classList.toggle("hidden", lang !== "ko");
      careerEn.classList.toggle("hidden", lang !== "en");
    }
    if (careerToggle) {
      const isOpen = careerSection && !careerSection.classList.contains("hidden");
      const showText = translations?.[lang]?.show_career || (lang === "ko" ? "경력 보기" : "Show career");
      const hideText = translations?.[lang]?.hide_career || (lang === "ko" ? "경력 닫기" : "Hide career");
      careerToggle.textContent = isOpen ? hideText : showText;
    }

    // "See more" toggle buttons
    document.querySelectorAll("button[data-i18n='see_more_toggle']").forEach(btn => {
      const details = btn.nextElementSibling;
      const open = details && !details.classList.contains("hidden");
      const show = translations?.[lang]?.see_more || (lang === "ko" ? "자세히" : "See more");
      const hide = translations?.[lang]?.hide_more || (lang === "ko" ? "닫기" : "Hide");
      btn.textContent = open ? hide : show;
    });
  }

  // Inline onclick handlers in your existing HTML call these.
  // We provide them globally to avoid per-page duplication.
  window.toggleDetails = function (btn) {
    const details = btn?.nextElementSibling;
    if (!details) return;
    details.classList.toggle("hidden");
    const lang = localStorage.getItem("lang") || DEFAULT_LANG;
    syncExpandableControls(lang, Site._translations);
  };

  window.toggleCareer = function () {
    const careerSection = document.getElementById("careerSection");
    if (!careerSection) return;
    careerSection.classList.toggle("hidden");
    const lang = localStorage.getItem("lang") || DEFAULT_LANG;
    syncExpandableControls(lang, Site._translations);
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function headerHTML(active) {
    const is = (k) => (active === k ? "font-semibold underline" : "");
    return `
<!-- ✅ site.js 안에서 site-header에 주입할 HTML 템플릿 -->
<header class="sticky top-0 bg-white dark:bg-gray-900 shadow z-50">
  <nav class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
    <div class="flex items-center gap-3">
      <img src="images/sol.jpeg" alt="Lab Logo" class="w-10 h-10 rounded-full" />
      <a href="index.html" class="leading-tight hover:text-blue-500 transition">
        <div class="text-2xl font-bold" data-i18n="labname">SOL Lab</div>
        <div class="text-sm text-gray-500 dark:text-gray-300" data-i18n="lab_affil">at SKKU</div>
      </a>
    </div>

    <!-- Hamburger (mobile only) -->
    <button id="mobileNavBtn" class="md:hidden text-2xl">☰</button>

    <!-- Links -->
    <div id="navLinks"
      class="hidden md:flex md:items-center gap-6 flex-col md:flex-row absolute md:static top-20 left-0 w-full md:w-auto bg-white dark:bg-gray-900 p-4 md:p-0 z-40">
      <ul class="flex gap-6 md:flex-row flex-col md:gap-6 mt-4 md:mt-0">
        <li><a href="index.html" class="hover:text-blue-500 ${is("home")}" data-i18n="nav_home">Home</a></li>
        <li><a href="people.html" class="hover:text-blue-500 ${is("people")}" data-i18n="nav_people">People</a></li>
        <li><a href="research.html" class="hover:text-blue-500 ${is("research")}" data-i18n="nav_research">Research</a></li>
        <li><a href="publications.html" class="hover:text-blue-500 ${is("publications")}" data-i18n="nav_publications">Publications</a></li>
        <li><a href="projects.html" class="hover:text-blue-500 ${is("projects")}" data-i18n="nav_projects">Projects</a></li>
        <li><a href="teaching.html" class="hover:text-blue-500 ${is("teaching")}" data-i18n="nav_teaching">Teaching</a></li>
        <li><a href="notices.html" class="hover:text-blue-500 ${is("notices")}" data-i18n="nav_notice">Board</a></li>
      </ul>
      <div class="flex gap-2">
        <button id="langBtn" class="relative inline-grid grid-cols-2 items-center rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-1 text-xs font-semibold min-w-[78px]">
          <span id="langIndicator" class="absolute left-1 top-1 bottom-1 w-[calc(50%_-_0.25rem)] rounded-full bg-slate-900 dark:bg-slate-600 transition-transform duration-200"></span>
          <span id="langEN" class="relative z-10 px-2 py-0.5 text-slate-600 dark:text-slate-300">EN</span>
          <span id="langKO" class="relative z-10 px-2 py-0.5 text-slate-600 dark:text-slate-300">한</span>
        </button>
        <button id="darkToggle" class="relative inline-grid grid-cols-2 items-center rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-1 text-xs font-semibold min-w-[78px]">
          <span id="themeIndicator" class="absolute left-1 top-1 bottom-1 w-[calc(50%_-_0.25rem)] rounded-full bg-slate-900 dark:bg-slate-600 transition-transform duration-200"></span>
          <span id="themeLight" class="relative z-10 px-2 py-0.5 text-slate-600 dark:text-slate-300">☀️</span>
          <span id="themeDark" class="relative z-10 px-2 py-0.5 text-slate-600 dark:text-slate-300">🌙</span>
        </button>
      </div>
    </div>
  </nav>
</header>`;
  }

  function footerHTML() {
    return `
<footer class="bg-white dark:bg-gray-900 border-t py-6 mt-20 text-center">
  <div class="flex flex-col items-center space-y-2">
    <img src="images/skku.png" alt="SKKU Logo" class="h-12" />
    <p class="text-sm">&copy; 2025 Stochastic Optimization and Learning Lab</p>
    <p class="text-sm">
      <a href="https://www.skku.edu" class="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">Sungkyunkwan University</a>
    </p>
  </div>
</footer>`;
  }

  function contactHTML() {
    return `
<!-- Contact Information Panel -->
<div id="contact-info" class="hidden fixed bottom-10 right-10 bg-white/95 dark:bg-slate-900/95 border border-emerald-200/60 dark:border-emerald-300/20 backdrop-blur-sm p-6 rounded-xl shadow-[0_18px_45px_rgba(5,46,22,0.28)] z-50 max-w-xs">
  <button id="contactCloseBtn" class="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-xl font-bold" aria-label="Close contact panel">&times;</button>
  <div class="text-xs md:text-sm text-center md:text-left">
    <h2 class="text-xl font-bold mb-2" data-i18n="contact">Contact Information</h2>
    <p class="mb-4">
      <span data-i18n="university">Sungkyunkwan University</span><br>
      <span data-i18n="address">2066, Seobu-ro, Jangan-gu, Suwon, Gyeonggi, Korea (16419)</span><br>
      <span data-i18n="lab">Lab: #27415, Engineering Building II</span><br>
      <span data-i18n="tel">Tel: +82 31-290-7612</span><br>
      <span data-i18n="email">Email:</span>
      <a href="mailto:janghopark@skku.edu" class="text-blue-500 hover:underline">janghopark@skku.edu</a>
    </p>

    <div id="map-ko" class="flex flex-col items-center mt-3 hidden">
      <div class="cursor-pointer" data-map-open="ko">
        <iframe title="SKKU 지도 (한글)" src="https://www.google.com/maps?q=Engineering+Building+II,+Sungkyunkwan+University,+Suwon,+South+Korea&hl=ko&output=embed"
          width="180" height="100" style="border:0; border-radius: 6px; pointer-events: none;" loading="lazy"></iframe>
      </div>
    </div>

    <div id="map-en" class="flex flex-col items-center mt-3 hidden">
      <div class="cursor-pointer" data-map-open="en">
        <iframe title="SKKU Map (English)" src="https://www.google.com/maps?q=Engineering+Building+II,+Sungkyunkwan+University,+Suwon,+South+Korea&hl=en&output=embed"
          width="180" height="100" style="border:0; border-radius: 6px; pointer-events: none;" loading="lazy"></iframe>
      </div>
    </div>
  </div>
</div>

<!-- Map Modals -->
<div id="map-modal-ko" class="hidden fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center">
  <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg max-w-4xl w-full h-[80vh] relative">
    <button class="absolute top-2 right-4 text-gray-500 hover:text-red-500 text-2xl font-bold" data-map-close="ko" aria-label="Close map">&times;</button>
    <iframe title="SKKU 지도 전체 보기" src="https://www.google.com/maps?q=Engineering+Building+II,+Sungkyunkwan+University,+Suwon,+South+Korea&hl=ko&output=embed"
      width="100%" height="100%" style="border:0; border-radius: 0 0 1rem 1rem;" loading="lazy"></iframe>
  </div>
</div>
<div id="map-modal-en" class="hidden fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center">
  <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg max-w-4xl w-full h-[80vh] relative">
    <button class="absolute top-2 right-4 text-gray-500 hover:text-red-500 text-2xl font-bold" data-map-close="en" aria-label="Close map">&times;</button>
    <iframe title="SKKU Full Map View" src="https://www.google.com/maps?q=Engineering+Building+II,+Sungkyunkwan+University,+Suwon,+South+Korea&hl=en&output=embed"
      width="100%" height="100%" style="border:0; border-radius: 0 0 1rem 1rem;" loading="lazy"></iframe>
  </div>
</div>

<button id="contactToggleBtn" class="fixed bottom-10 right-10 z-50 bg-gradient-to-r from-emerald-300 via-green-200 to-emerald-400 text-slate-900 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-[0_12px_30px_rgba(16,185,129,0.35)] hover:brightness-95 transition"
        data-i18n="contact_button" aria-label="Open contact panel">📬 Contact</button>

<!-- Shared image modal (used by news/board if enabled) -->
<div id="imageModal" class="fixed inset-0 bg-black bg-opacity-75 hidden justify-center items-center z-50">
  <button class="absolute top-5 right-5 text-white text-2xl cursor-pointer" id="imgCloseBtn" aria-label="Close image">✕</button>
  <img id="modalImg" class="max-h-[90%] max-w-[90%] rounded-lg shadow-lg" alt="Modal image"/>
</div>
`;
  }

  function wireHeader() {
    const mobileBtn = document.getElementById("mobileNavBtn");
    const nav = document.getElementById("navLinks");
    if (mobileBtn && nav) {
      mobileBtn.addEventListener("click", () => nav.classList.toggle("hidden"));
    }
    const langBtn = document.getElementById("langBtn");
    if (langBtn) {
      langBtn.addEventListener("click", () => Site.toggleLanguage());
    }
    const darkBtn = document.getElementById("darkToggle");
    if (darkBtn) {
      darkBtn.addEventListener("click", () => Site.toggleDarkMode());
    }
  }

  function wireContact() {
    const contact = document.getElementById("contact-info");
    const openBtn = document.getElementById("contactToggleBtn");
    const closeBtn = document.getElementById("contactCloseBtn");

    function open() {
      contact?.classList.remove("hidden");
      openBtn?.classList.add("hidden");
    }
    function close() {
      contact?.classList.add("hidden");
      openBtn?.classList.remove("hidden");
      const lang = localStorage.getItem("lang") || DEFAULT_LANG;
      if (openBtn) openBtn.textContent = `📬 ${Site._t(lang, "contact_button") || "Contact"}`;
    }

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);

    // map language switch
    function toggleMapByLang(lang) {
      const mapKo = document.getElementById("map-ko");
      const mapEn = document.getElementById("map-en");
      if (mapKo && mapEn) {
        mapKo.classList.toggle("hidden", lang !== "ko");
        mapEn.classList.toggle("hidden", lang !== "en");
      }
    }

    document.querySelectorAll("[data-map-open]").forEach(el => {
      el.addEventListener("click", () => {
        const which = el.getAttribute("data-map-open");
        document.getElementById(which === "ko" ? "map-modal-ko" : "map-modal-en")?.classList.remove("hidden");
      });
    });
    document.querySelectorAll("[data-map-close]").forEach(el => {
      el.addEventListener("click", () => {
        const which = el.getAttribute("data-map-close");
        document.getElementById(which === "ko" ? "map-modal-ko" : "map-modal-en")?.classList.add("hidden");
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.getElementById("map-modal-ko")?.classList.add("hidden");
        document.getElementById("map-modal-en")?.classList.add("hidden");
        Site.closeImageModal();
      }
    });

    // keep map mini-preview in sync with language
    Site._contactLangSync = toggleMapByLang;

    toggleMapByLang(localStorage.getItem("lang") || DEFAULT_LANG);
    // default: keep openBtn visible, contact hidden
    close();
  }

  function openImageModal(imgSrc) {
    const modal = document.getElementById("imageModal");
    const img = document.getElementById("modalImg");
    if (!modal || !img) return;
    img.src = imgSrc;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeImageModal() {
    const modal = document.getElementById("imageModal");
    if (!modal) return;
    modal.classList.remove("flex");
    modal.classList.add("hidden");
  }

  function wireImageModal() {
    const closeBtn = document.getElementById("imgCloseBtn");
    closeBtn?.addEventListener("click", closeImageModal);
    const modal = document.getElementById("imageModal");
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeImageModal();
    });
  }

  async function renderNews({ containerId, lang, translations, limit = null, enableShowMore = true, showMoreStep = 6, showImages = true }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    let items = [];
    try {
      const res = await fetch(`news.json?cb=${Date.now()}`);
      items = await res.json();
    } catch (e) {
      console.error("Error loading news.json:", e);
      return;
    }
    items = items.filter(x => x);
    // sort desc by date string
    items.sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const totalCount = items.length;
    const shown = (limit != null) ? Math.max(0, limit) : totalCount;
    items = items.slice(0, shown);

    for (const item of items) {
      const div = document.createElement("div");
      div.className = "bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4";
      const title = item.title?.[lang] ?? "";
      const desc = item.description?.[lang] ?? "";
      const linkLabel = (translations?.[lang]?.news_link) || "View more";

      let imagesHTML = "";
      if (showImages && Array.isArray(item.images) && item.images.length) {
        imagesHTML = `<div class="flex gap-2 mt-3 flex-wrap">` +
          item.images.map(src => `
            <img src="${escapeHtml(src)}" class="w-24 h-24 rounded object-cover cursor-pointer" data-img-open="${escapeHtml(src)}" alt="news image">
          `).join("") +
          `</div>`;
      }

      div.innerHTML = `
        <h2 class="text-sm font-semibold mb-1">[${escapeHtml(item.date)}] ${title}</h2>
        <p class="text-sm text-gray-400 dark:text-gray-300 mb-1">${desc}</p>
        ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline text-sm">🔗 ${linkLabel}</a>` : ""}
        ${imagesHTML}
      `;
      container.appendChild(div);
    }

    container.querySelectorAll("[data-img-open]").forEach(el => {
      el.addEventListener("click", () => openImageModal(el.getAttribute("data-img-open")));
    });

    // Optional "Show more" expander
    if (enableShowMore && limit != null && totalCount > limit) {
      const wrap = document.createElement("div");
      wrap.className = "flex justify-center pt-4";
      const btn = document.createElement("button");
      btn.className = "px-4 py-2 rounded-full border bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm";
      btn.textContent = (lang === "ko") ? "더 보기" : "Show more";
      btn.addEventListener("click", async () => {
        const next = Math.min(totalCount, shown + showMoreStep);
        await renderNews({ containerId, lang, translations, limit: next, enableShowMore, showMoreStep, showImages });
      });
      wrap.appendChild(btn);
      container.appendChild(wrap);
    }
  }

  window.Site = Site;
})();
