import { MAX_BYTES, rankTickets, type RankedTicket, type Weights } from "./ranking.ts";

export async function rankUpload(
  request: Request,
  loadWeights: () => Promise<Weights | null>,
): Promise<{ ok: false; error: "file" | "weights" } | { ok: true; tickets: RankedTicket[]; weights: Weights }> {
  // formData() buffers the whole body, so refuse oversized requests first (64 KiB covers multipart overhead).
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 65_536) return { ok: false, error: "file" };

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return { ok: false, error: "file" };
  }
  if (!(file instanceof File) || file.size > MAX_BYTES) return { ok: false, error: "file" };

  let weights: Weights | null;
  try {
    weights = await loadWeights();
  } catch {
    weights = null;
  }
  if (!weights) return { ok: false, error: "weights" };

  const ranked = rankTickets(await file.text(), weights);
  return ranked.ok ? { ok: true, tickets: ranked.tickets, weights } : { ok: false, error: "file" };
}
