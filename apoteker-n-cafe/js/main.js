(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");

  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      links.classList.toggle("is-open", !open);
    });

    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        toggle.setAttribute("aria-expanded", "false");
        links.classList.remove("is-open");
      });
    });
  }

  document.querySelectorAll('a[href$=".html"], a[href="./"], a[href="index.html"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || a.target === "_blank") return;
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && !url.hash) return;
      e.preventDefault();
      document.body.classList.add("is-leaving");
      setTimeout(() => {
        window.location.href = href;
      }, 480);
    });
  });

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  const chips = document.querySelectorAll("[data-menu-filter]");
  const categories = document.querySelectorAll("[data-menu-category]");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => {
        c.classList.remove("is-active");
        c.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("is-active");
      chip.setAttribute("aria-pressed", "true");
      const filter = chip.getAttribute("data-menu-filter");
      categories.forEach((cat) => {
        const show = filter === "all" || cat.getAttribute("data-menu-category") === filter;
        cat.hidden = !show;
        if (show) {
          cat.querySelectorAll(".menu-item").forEach((item, i) => {
            item.style.opacity = "0";
            item.style.transform = "translateY(12px)";
            requestAnimationFrame(() => {
              setTimeout(() => {
                item.style.transition =
                  "opacity 0.45s cubic-bezier(0.22,1,0.36,1), transform 0.45s cubic-bezier(0.22,1,0.36,1)";
                item.style.opacity = "1";
                item.style.transform = "none";
              }, i * 45);
            });
          });
        }
      });
    });
  });

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
})();
