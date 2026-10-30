// Validators, theme getters and scales shared by the class groups of `merge-config.ts` (copied from tailwind-merge).
import { fromTheme, validators } from "tailwind-merge";

export const {
  isArbitraryFamilyName,
  isArbitraryLength,
  isArbitraryNumber,
  isArbitraryShadow,
  isArbitraryValue,
  isArbitraryVariable,
  isArbitraryVariableFamilyName,
  isArbitraryVariableLength,
  isArbitraryVariableShadow,
  isArbitraryVariableWeight,
  isArbitraryWeight,
  isFraction,
  isArbitraryImage,
  isArbitraryVariableImage,
  isArbitraryVariablePosition,
  isArbitraryPosition,
  isArbitraryVariableSize,
  isArbitrarySize,
  isInteger,
  isNumber,
  isAny,
  isAnyNonArbitrary,
  isTshirtSize,
} = validators;

export const themeColor = fromTheme("color");
export const themeFont = fromTheme("font");
export const themeText = fromTheme("text");
export const themeFontWeight = fromTheme("font-weight");
export const themeTracking = fromTheme("tracking");
export const themeLeading = fromTheme("leading");
export const themeBreakpoint = fromTheme("breakpoint");
export const themeContainer = fromTheme("container");
export const themeSpacing = fromTheme("spacing");
export const themeRadius = fromTheme("radius");
export const themeShadow = fromTheme("shadow");
export const themeAspect = fromTheme("aspect");
export const themeEase = fromTheme("ease");
export const themeAnimate = fromTheme("animate");

export const scalePosition = () => [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",

  "left-top",
  "top-right",

  "right-top",
  "bottom-right",

  "right-bottom",
  "bottom-left",

  "left-bottom",
];
export const scalePositionWithArbitrary = () => [
  ...scalePosition(),
  isArbitraryVariable,
  isArbitraryValue,
];
export const scaleOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
export const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
export const scaleInset = () => [isFraction, "full", "auto", ...scaleUnambiguousSpacing()];
export const scaleGridTemplateColsRows = () => [
  isInteger,
  "none",
  "subgrid",
  isArbitraryVariable,
  isArbitraryValue,
];
export const scaleOverscroll = () => ["auto", "contain", "none"];
export const scaleGridColRowStartOrEnd = () => [
  isInteger,
  "auto",
  isArbitraryVariable,
  isArbitraryValue,
];
export const scaleGridColRowStartAndEnd = () => [
  "auto",
  {
    span: ["full", isInteger, isArbitraryVariable, isArbitraryValue],
  },
  isInteger,
  isArbitraryVariable,
  isArbitraryValue,
];
export const scaleAlignPrimaryAxis = () => [
  "start",
  "end",
  "center",
  "between",
  "around",
  "evenly",
  "stretch",
  "baseline",
  "center-safe",
  "end-safe",
];
export const scaleAlignSecondaryAxis = () => [
  "start",
  "end",
  "center",
  "stretch",
  "center-safe",
  "end-safe",
];
export const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
export const scaleSizing = () => [
  isFraction,
  isArbitraryImage,
  isArbitraryVariableImage,
  isArbitraryVariablePosition,
  isArbitraryPosition,
  isArbitraryVariableSize,
  isArbitrarySize,
  "auto",
  "full",
  "dvw",
  "dvh",
  "lvw",
  "lvh",
  "svw",
  "svh",
  "min",
  "max",
  "fit",
  ...scaleUnambiguousSpacing(),
];
export const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
export const scaleBgPosition = () => [
  ...scalePosition(),
  isArbitraryVariablePosition,
  isArbitraryPosition,
  {
    position: [isArbitraryVariable, isArbitraryValue],
  },
];
export const scaleBgRepeat = () => [
  "no-repeat",
  {
    repeat: ["", "x", "y", "space", "round"],
  },
];
export const scaleBgSize = () => [
  "auto",
  "cover",
  "contain",
  isArbitraryVariableSize,
  isArbitrarySize,
  {
    size: [isArbitraryVariable, isArbitraryValue],
  },
];
export const scaleRadius = () => [
  "",
  "none",
  "full",
  themeRadius,
  isArbitraryVariable,
  isArbitraryValue,
];
export const scaleBorderWidth = () => ["", isNumber, isArbitraryVariableLength, isArbitraryLength];
export const scaleLineStyle = () => ["solid", "dashed", "dotted", "double"];
export const scaleRotate = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
export const scaleScale = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
export const scaleTranslate = () => [isFraction, "full", ...scaleUnambiguousSpacing()];
