import type { QTcMethod, Sex } from "../api/types";

export type AgeBand =
  | "neonate"
  | "infant"
  | "child_1_5"
  | "child_6_12"
  | "adolescent"
  | "adult_18_39"
  | "adult_40_64"
  | "adult_65_plus";

export const AGE_BAND_OPTIONS: Array<{ value: AgeBand; label: string }> = [
  { value: "neonate", label: "Neonate" },
  { value: "infant", label: "Infant" },
  { value: "child_1_5", label: "Child 1–5 years" },
  { value: "child_6_12", label: "Child 6–12 years" },
  { value: "adolescent", label: "Adolescent" },
  { value: "adult_18_39", label: "Adult 18–39 years" },
  { value: "adult_40_64", label: "Adult 40–64 years" },
  { value: "adult_65_plus", label: "Adult 65+ years" },
];

export const SEX_OPTIONS: Array<{ value: Sex; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

export const QTC_METHOD_OPTIONS: Array<{ value: QTcMethod; label: string }> = [
  { value: "bazett", label: "Bazett" },
  { value: "fridericia", label: "Fridericia" },
];
