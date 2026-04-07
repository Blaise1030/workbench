import { effectScope, onMounted, ref, watch } from "vue";

export const UI_THEME_PRESET_STORAGE_KEY = "instrument-ui-theme-preset";

export const UI_THEME_PRESET_IDS = ["default", "ocean", "violet", "amber"] as const;
export type UiThemePresetId = (typeof UI_THEME_PRESET_IDS)[number];

const PRESET_LABELS: Record<UiThemePresetId, string> = {
  default: "Default",
  ocean: "Ocean",
  violet: "Violet",
  amber: "Amber"
};

export function uiThemePresetLabel(id: UiThemePresetId): string {
  return PRESET_LABELS[id];
}

function isValidPreset(value: string | null): value is UiThemePresetId {
  return UI_THEME_PRESET_IDS.includes(value as UiThemePresetId);
}

function readStoredPreset(): UiThemePresetId {
  try {
    const raw = localStorage.getItem(UI_THEME_PRESET_STORAGE_KEY);
    if (isValidPreset(raw)) return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return "default";
}

/** Sets `data-instrument-preset` on `<html>` (omitted when default). */
export function applyUiThemePresetToDocument(preset: UiThemePresetId): void {
  if (preset === "default") {
    document.documentElement.removeAttribute("data-instrument-preset");
  } else {
    document.documentElement.dataset.instrumentPreset = preset;
  }
}

export function initUiThemePresetFromStorage(): UiThemePresetId {
  const preset = readStoredPreset();
  applyUiThemePresetToDocument(preset);
  return preset;
}

const preset = ref<UiThemePresetId>(readStoredPreset());

const uiThemePresetPersistenceScope = effectScope();
uiThemePresetPersistenceScope.run(() => {
  watch(
    preset,
    (next) => {
      try {
        localStorage.setItem(UI_THEME_PRESET_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      applyUiThemePresetToDocument(next);
    },
    { flush: "sync" }
  );
});

export function useUiThemePreset() {
  onMounted(() => {
    preset.value = readStoredPreset();
    applyUiThemePresetToDocument(preset.value);
  });

  function setPreset(next: UiThemePresetId): void {
    preset.value = next;
  }

  return { preset, setPreset, presets: UI_THEME_PRESET_IDS };
}
