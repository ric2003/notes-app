export const NOTE_COLOR_NAMES = [
  "yellow",
  "blue",
  "green",
  "pink",
  "purple",
  "orange",
] as const;

export type NoteColorName = (typeof NOTE_COLOR_NAMES)[number];

// Saturated sticky-note shades (real Post-it palette), with a darker
// edge of the same hue instead of a gray border.
export const NOTE_COLORS: Record<
  NoteColorName,
  { bg: string; border: string }
> = {
  yellow: { bg: "#FFE55C", border: "#E3BF22" },
  pink: { bg: "#FF8FB5", border: "#E05788" },
  green: { bg: "#8FD964", border: "#57AE38" },
  blue: { bg: "#79CBEB", border: "#3D97C6" },
  purple: { bg: "#C79FE8", border: "#9563C6" },
  orange: { bg: "#FFAC60", border: "#E07A28" },
};
