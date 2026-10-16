import { createTheme, rem, type MantineColorsTuple } from "@mantine/core";

export const brandCyan: MantineColorsTuple = [
  "#f5ffe3",
  "#e7ffbf",
  "#d0ff82",
  "#bbff4a",
  "#abff1d",
  "#9af000",
  "#79bb00",
  "#5b8c00",
  "#426600",
  "#2a4100",
];

export const brandOrange: MantineColorsTuple = [
  "#fff2df",
  "#ffdfb8",
  "#ffc680",
  "#ffae4d",
  "#ff9a25",
  "#ff8b09",
  "#d96f00",
  "#ad5600",
  "#7f3f00",
  "#582a00",
];

export const brandMagenta: MantineColorsTuple = [
  "#eef6dc",
  "#d8e7b6",
  "#b4cb83",
  "#8daf55",
  "#71953a",
  "#5f8729",
  "#4a691d",
  "#374f12",
  "#263807",
  "#162200",
];

export const brandBlue: MantineColorsTuple = [
  "#edf8f0",
  "#d6ebda",
  "#afd5b8",
  "#84be93",
  "#60ab74",
  "#499c62",
  "#357b4c",
  "#235d37",
  "#143f24",
  "#082513",
];

export const brandPurple: MantineColorsTuple = [
  "#faf7e9",
  "#eee4c3",
  "#dcc88e",
  "#caac5b",
  "#bd9542",
  "#b38831",
  "#8f6922",
  "#6f4f17",
  "#51380b",
  "#342300",
];

export const dark: MantineColorsTuple = [
  "#eef2ea",
  "#cbd1c7",
  "#a4ada2",
  "#7a877c",
  "#5a675d",
  "#3b473f",
  "#253027",
  "#171f18",
  "#0e140f",
  "#070b08",
];

export const themeMantine = createTheme({
  primaryColor: "brandOrange",
  primaryShade: { light: 5, dark: 5 },
  black: "#070b08",
  white: "#f7f7f2",
  colors: {
    dark,
    brandCyan,
    brandOrange,
    brandMagenta,
    brandBlue,
    brandPurple,
  },
  defaultRadius: "xl",
  radius: {
    xs: rem(6),
    sm: rem(10),
    md: rem(14),
    lg: rem(18),
    xl: rem(24),
  },
  shadows: {
    xs: "0 6px 16px rgba(0, 0, 0, 0.24)",
    sm: "0 10px 24px rgba(0, 0, 0, 0.28)",
    md: "0 18px 48px rgba(0, 0, 0, 0.34)",
    lg: "0 26px 80px rgba(0, 0, 0, 0.42)",
    xl: "0 40px 120px rgba(0, 0, 0, 0.48)",
  },
  focusRing: "auto",
  fontFamily:
    "var(--font-inter, Inter), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
  },
  lineHeights: {
    xs: "1.35",
    sm: "1.45",
    md: "1.6",
    lg: "1.6",
    xl: "1.5",
  },
  headings: {
    fontFamily:
      "var(--font-manrope, Manrope), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontWeight: "800",
    sizes: {
      h1: { fontSize: "3rem", lineHeight: "0.98", fontWeight: "800" },
      h2: { fontSize: "2.4rem", lineHeight: "1.02", fontWeight: "800" },
      h3: { fontSize: "1.7rem", lineHeight: "1.08", fontWeight: "800" },
      h4: { fontSize: "1.25rem", lineHeight: "1.2", fontWeight: "700" },
      h5: { fontSize: "1.125rem", lineHeight: "1.25", fontWeight: "700" },
      h6: { fontSize: "1rem", lineHeight: "1.3", fontWeight: "700" },
    },
  },
  components: {
    Button: {
      defaultProps: {
        radius: "xl",
      },
    },
    Card: {
      defaultProps: {
        radius: "xl",
        withBorder: true,
      },
    },
    Paper: {
      defaultProps: {
        radius: "xl",
        withBorder: true,
      },
    },
    Badge: {
      defaultProps: {
        radius: "xl",
      },
    },
  },
});
