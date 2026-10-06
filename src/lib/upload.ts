import { MAX_BYTES, rankTickets, type RankedTicket, type Weights } from "./ranking.ts";

export async function rankUpload(
  request: Request,
  loadWeights: () => Promise<Weights | null>,
): Promise<{ error: "file" | "weights" } | { tickets: RankedTicket[]; weights: Weights }> {
  // formData() buffers the whole body, so refuse oversized requests first (64 KiB covers multipart overhead).
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 65_536) return { error: "file" };

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return { error: "file" };
  }
  if (!(file instanceof File) || file.size > MAX_BYTES) return { error: "file" };

  const weights = await loadWeights();
  if (!weights) return { error: "weights" };

  const ranked = rankTickets(await file.text(), weights);
  return ranked.ok ? { tickets: ranked.tickets, weights } : { error: "file" };
}
