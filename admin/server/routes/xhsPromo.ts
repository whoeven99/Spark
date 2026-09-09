import { Router, type Response } from "express";
import {
  arkCopyHint,
  buildCardSystemPrompt,
  buildCardUserPrompt,
  buildCopySystemPrompt,
  buildCopyUserPrompt,
  buildTitleSystemPrompt,
  buildTitleUserPrompt,
  generateXhsCardSlots,
  generateXhsCopy,
  generateXhsTitles,
  listCopyModels,
  resolveCopyModel,
} from "../promo/xhsCopyClient.js";
import { renderContentCards } from "../promo/xhsContentCards.js";
import {
  generateXhsCover,
  listCoverModels,
  previewImagePrompt,
  resolveCoverModel,
} from "../promo/xhsCoverClient.js";
import {
  emptyCoverSlots,
  isXhsDirection,
  normalizeCardSlots,
  type XhsContentCard,
  type XhsCoverSlots,
  type XhsDirection,
} from "../promo/xhsPlaybooks.js";

function clipPrompt(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  return text.slice(0, 12000);
}

function readDirection(raw: unknown): XhsDirection | null {
  const direction = String(raw ?? "").trim();
  return isXhsDirection(direction) ? direction : null;
}

function readTopic(raw: unknown): string {
  return String(raw ?? "").trim();
}

function readNotes(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 2000);
}

function readTitle(raw: unknown, fallback: string): string {
  const title = String(raw ?? "").trim();
  return (title || fallback).slice(0, 40);
}

function readCoverSlots(raw: unknown, fallbackTitle: string): XhsCoverSlots {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const asText = (value: unknown) => String(value ?? "").trim();
  const asList = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [];
  const empty = emptyCoverSlots();
  return {
    headline: asText(obj.headline) || fallbackTitle,
    subhead: asText(obj.subhead),
    leftTitle: asText(obj.leftTitle) || empty.leftTitle,
    rightTitle: asText(obj.rightTitle) || empty.rightTitle,
    leftHook: asText(obj.leftHook),
    rightHook: asText(obj.rightHook),
    left: asList(obj.left),
    right: asList(obj.right),
    metric: asText(obj.metric),
    metricNote: asText(obj.metricNote),
    promptBox: asText(obj.promptBox),
  };
}

function readCardSlots(raw: unknown, title: string, body: string): XhsContentCard[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return normalizeCardSlots(raw, title, body);
}

function fail(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

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

xhsPromoRouter.get("/prompts", (req, res) => {
  const direction = readDirection(req.query.direction);
  const topic = readTopic(req.query.topic);
  const notes = readNotes(req.query.notes);
  const title = readTitle(req.query.title, topic || "（选题）");
  const body = String(req.query.body ?? "").trim();
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  const topicText = topic || "（选题）";
  res.json({
    titleSystem: buildTitleSystemPrompt(),
    titleUser: buildTitleUserPrompt({ direction, topic: topicText, notes }),
    copySystem: buildCopySystemPrompt(),
    copyUser: buildCopyUserPrompt({
      direction,
      topic: topicText,
      notes,
      title,
    }),
    image: previewImagePrompt(direction, title || topicText),
    cardSystem: buildCardSystemPrompt(),
    cardUser: buildCardUserPrompt({
      direction,
      topic: topicText,
      notes,
      title,
      body,
    }),
  });
});

xhsPromoRouter.post("/titles", async (req, res) => {
  const direction = readDirection(req.body?.direction);
  const topic = readTopic(req.body?.topic);
  const notes = readNotes(req.body?.notes);
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (topic.length < 2) {
    fail(res, 400, "请填写选题");
    return;
  }
  try {
    const result = await generateXhsTitles({
      direction,
      topic,
      notes,
      provider: String(req.body?.copyProvider ?? "").trim() || null,
      systemPrompt: clipPrompt(req.body?.titleSystemPrompt),
      userPrompt: clipPrompt(req.body?.titleUserPrompt),
    });
    res.json({
      titles: result.titles,
      model: `${result.model.provider}:${result.model.model}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] titles failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.post("/copy", async (req, res) => {
  const direction = readDirection(req.body?.direction);
  const topic = readTopic(req.body?.topic);
  const notes = readNotes(req.body?.notes);
  const title = readTitle(req.body?.title, "");
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (topic.length < 2) {
    fail(res, 400, "请填写选题");
    return;
  }
  if (title.length < 2) {
    fail(res, 400, "请先确定标题");
    return;
  }
  try {
    const result = await generateXhsCopy({
      direction,
      topic,
      notes,
      title,
      provider: String(req.body?.copyProvider ?? "").trim() || null,
      systemPrompt: clipPrompt(req.body?.copySystemPrompt),
      userPrompt: clipPrompt(req.body?.copyUserPrompt),
    });
    res.json({
      title: result.draft.title,
      body: result.draft.body,
      tags: result.draft.tags,
      coverSlots: result.draft.cover,
      imagePrompt: previewImagePrompt(direction, result.draft.title, result.draft.cover),
      model: `${result.model.provider}:${result.model.model}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] copy failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.post("/cover", async (req, res) => {
  const direction = readDirection(req.body?.direction);
  const topic = readTopic(req.body?.topic);
  const title = readTitle(req.body?.title, topic);
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (title.length < 2) {
    fail(res, 400, "请先确定标题");
    return;
  }
  try {
    const coverSlots = readCoverSlots(req.body?.coverSlots, title);
    const cover = await generateXhsCover({
      direction,
      topic: title,
      cover: coverSlots,
      provider: String(req.body?.coverProvider ?? "").trim() || null,
      imagePrompt: clipPrompt(req.body?.imagePrompt),
    });
    res.json({
      image: cover.image,
      coverSlots,
      model: `${cover.model.provider}:${cover.model.model}`,
      coverError: cover.error ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] cover failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.post("/cards", async (req, res) => {
  const direction = readDirection(req.body?.direction);
  const topic = readTopic(req.body?.topic);
  const notes = readNotes(req.body?.notes);
  const title = readTitle(req.body?.title, topic);
  const body = String(req.body?.body ?? "").trim();
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (title.length < 2) {
    fail(res, 400, "请先确定标题");
    return;
  }
  try {
    const provided = readCardSlots(req.body?.cards, title, body);
    if (provided) {
      res.json({
        cards: renderContentCards({ direction, cards: provided }),
        model: null,
      });
      return;
    }
    const result = await generateXhsCardSlots({
      direction,
      topic: topic || title,
      notes,
      title,
      body,
      provider: String(req.body?.copyProvider ?? "").trim() || null,
      systemPrompt: clipPrompt(req.body?.cardSystemPrompt),
      userPrompt: clipPrompt(req.body?.cardUserPrompt),
    });
    res.json({
      cards: renderContentCards({ direction, cards: result.cards }),
      model: `${result.model.provider}:${result.model.model}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] cards failed", message);
    fail(res, 500, message);
  }
});
