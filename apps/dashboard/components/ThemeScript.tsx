export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  const STORAGE_KEY = "life-dashboard-theme";
  const root = document.documentElement;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

  const themeColorMap = {
    light: "#f6efe5",
    dark: "#0d1420",
    forest: "#0c1b16",
    sunrise: "#fbefe2",
  };

  const isTheme = (value) => ["system", "light", "dark", "forest", "sunrise"].includes(value);

  const resolve = (mode) => {
    if (mode === "system") {
      return darkMedia.matches ? "dark" : "light";
    }

    return isTheme(mode) && mode !== "system" ? mode : darkMedia.matches ? "dark" : "light";
  };

  const applyTheme = (mode) => {
    const safeMode = isTheme(mode) ? mode : "system";
    const resolved = resolve(safeMode);

    root.dataset.themeMode = safeMode;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved === "light" || resolved === "sunrise" ? "light" : "dark";

    if (metaTheme) {
      metaTheme.setAttribute("content", themeColorMap[resolved] ?? themeColorMap.dark);
    }
  };

  const stored = window.localStorage.getItem(STORAGE_KEY);
  applyTheme(stored);

  darkMedia.addEventListener("change", () => {
    const currentMode = root.dataset.themeMode || window.localStorage.getItem(STORAGE_KEY) || "system";
    if (currentMode === "system") {
      applyTheme("system");
    }
  });
})();
`;
