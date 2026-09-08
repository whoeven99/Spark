import { Router } from "express";
import {
  arkCopyHint,
  generateXhsCopy,
  listCopyModels,
  resolveCopyModel,
} from "../promo/xhsCopyClient.js";
import { renderContentCards } from "../promo/xhsContentCards.js";
import { generateXhsCover, listCoverModels, resolveCoverModel } from "../promo/xhsCoverClient.js";
import { isXhsDirection } from "../promo/xhsPlaybooks.js";

export const xhsPromoRouter = Router();

xhsPromoRouter.get("/status", (_req, res) => {
  const copyOptions = listCopyModels();
  const copy = resolveCopyModel();
  const coverOptions = listCoverModels();
  const cover = resolveCoverModel();
  res.json({
    copy: copy
      ? { configured: true, provider: copy.provider, model: copy.model, options: copyOptions, hint: arkCopyHint() }
      : { configured: false, provider: null, model: null, options: [], hint: arkCopyHint() },
    cover: {
      configured: cover.provider !== "template",
      provider: cover.provider,
      model: cover.model,
      options: coverOptions,
    },
  });
});

xhsPromoRouter.post("/generate", async (req, res) => {
  const direction = String(req.body?.direction ?? "").trim();
  const topic = String(req.body?.topic ?? "").trim();
  const notes = String(req.body?.notes ?? "").trim().slice(0, 2000);
  const copyProvider = String(req.body?.copyProvider ?? "").trim() || null;
  const coverProvider = String(req.body?.coverProvider ?? "").trim() || null;

  if (!isXhsDirection(direction)) {
    res.status(400).json({ error: "方向必须是 howto / compare / data" });
    return;
  }
  if (topic.length < 2) {
    res.status(400).json({ error: "请填写选题" });
    return;
  }

  try {
    const copy = await generateXhsCopy({ direction, topic, notes, provider: copyProvider });
    const cover = await generateXhsCover({
      direction,
      topic,
      cover: copy.draft.cover,
      provider: coverProvider,
    });
    res.json({
      direction,
      title: copy.draft.title,
      body: copy.draft.body,
      tags: copy.draft.tags,
      coverSlots: copy.draft.cover,
      cards: renderContentCards({
        direction,
        cards: copy.draft.cards,
      }),
      image: cover.image,
      models: {
        copy: `${copy.model.provider}:${copy.model.model}`,
        cover: `${cover.model.provider}:${cover.model.model}`,
      },
      coverError: cover.error ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] generate failed", message);
    res.status(500).json({ error: message });
  }
});
