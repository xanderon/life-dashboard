export const THEME_STORAGE_KEY = "life-dashboard-theme";

export const THEME_OPTIONS = [
  {
    id: "system",
    label: "System",
    description: "Urmeaza preferinta sistemului",
  },
  {
    id: "light",
    label: "Light",
    description: "Ivory workspace",
  },
  {
    id: "dark",
    label: "Dark",
    description: "Graphite control room",
  },
  {
    id: "forest",
    label: "Forest",
    description: "Calm green terminal",
  },
  {
    id: "sunrise",
    label: "Sunrise",
    description: "Warm editorial tones",
  },
] as const;

export type ThemeMode = (typeof THEME_OPTIONS)[number]["id"];
export type ResolvedTheme = Exclude<ThemeMode, "system">;

export function resolveTheme(
  mode: ThemeMode,
  prefersDark: boolean
): ResolvedTheme {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return mode;
}

export function isThemeMode(value: string | null): value is ThemeMode {
  return THEME_OPTIONS.some((option) => option.id === value);
}
