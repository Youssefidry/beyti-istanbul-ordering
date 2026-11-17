(() => {
  const themeColors = {
    sufra: "#183c32",
    sunset: "#663b2f",
    ocean: "#174c5a"
  };

  window.applySiteTheme = (theme) => {
    const selectedTheme = Object.prototype.hasOwnProperty.call(themeColors, theme) ? theme : "sufra";
    document.documentElement.dataset.theme = selectedTheme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = themeColors[selectedTheme];
  };

  window.applySiteBrand = (siteName, logoData) => {
    const name = typeof siteName === "string" && siteName.trim() ? siteName.trim() : "سفرة";
    document.querySelectorAll("[data-site-name]").forEach((element) => {
      element.textContent = name;
    });
    document.querySelectorAll("[data-site-logo-mark]").forEach((mark) => {
      if (logoData) {
        const image = document.createElement("img");
        image.className = "site-logo-image";
        image.alt = "";
        image.src = logoData;
        mark.replaceChildren(image);
      } else {
        mark.textContent = Array.from(name)[0];
      }
    });

    const pageTitle = document.querySelector("title")?.dataset.siteTitle;
    if (pageTitle === "home") {
      const menuTitles = { ar: "قائمتنا", fr: "Notre carte", en: "Our menu" };
      const language = document.documentElement.lang;
      document.title = document.body.classList.contains("menu-page")
        ? `${name} | ${menuTitles[language] || menuTitles.ar}`
        : `${name} | اطلب من طاولتك`;
    }
    if (pageTitle === "staff") document.title = `بوابة الموظفين | ${name}`;
    if (pageTitle === "admin") document.title = `الإدارة | ${name}`;
  };

  window.applySiteSettings = (settings) => {
    window.applySiteTheme(settings.theme);
    window.applySiteBrand(settings.siteName, settings.logoData);
  };

  fetch("/api/site-settings", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Site settings request failed: ${response.status}`);
      return response.json();
    })
    .then((settings) => window.applySiteSettings(settings))
    .catch((error) => console.error("Could not load site settings.", error));
})();
