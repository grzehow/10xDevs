import { WEIGHT_KEYS, type WeightKey } from "./ranking.ts";

export const MAX_WEIGHT = 1000;

const EMPTY = "Podaj wartość.";
const INVALID = "Wpisz liczbę od 0 do 1000 z najwyżej dwoma miejscami po przecinku.";
const TOO_BIG = "Wartość nie może przekraczać 1000.";
const NUMBER = /^\d{1,4}([.,]\d{1,2})?$/;

export type WeightsFormResult =
  | { ok: true; values: Record<WeightKey, string> }
  | { ok: false; errors: Partial<Record<WeightKey, string>>; raw: Record<WeightKey, string> };

export function parseWeightsForm(form: FormData): WeightsFormResult {
  const raw = {} as Record<WeightKey, string>;
  const values = {} as Record<WeightKey, string>;
  const errors: Partial<Record<WeightKey, string>> = {};

  for (const key of WEIGHT_KEYS) {
    const field = form.get(key);
    const text = typeof field === "string" ? field.trim() : "";
    raw[key] = text;
    if (text === "") errors[key] = EMPTY;
    else if (!NUMBER.test(text)) errors[key] = INVALID;
    else if (Number(text.replace(",", ".")) > MAX_WEIGHT) errors[key] = TOO_BIG;
    else values[key] = text.replace(",", ".");
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors, raw } : { ok: true, values };
}
