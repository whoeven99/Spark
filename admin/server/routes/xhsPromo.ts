import { Router, type Response } from "express";
import { isAdminOpsDbConfigured } from "../lib/adminOpsDb.js";
import {
  arkCopyHint,
  buildCardSystemPrompt,
  buildCardUserPrompt,
  buildCardVisualSystemPrompt,
  buildCardVisualUserPrompt,
  isCardCopyPrompt,
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
import {
  deletePromptVersion,
  isPromptSlot,
  latestPromptVersions,
  listPromptVersions,
  normalizePayload,
  savePromptVersion,
} from "../promo/xhsPromptVersions.js";
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
import {
  analyzeReferenceStyle,
  readPublicNote,
  type ReferenceImage,
} from "../promo/xhsStyleAnalyze.js";

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
    cardSystem: buildCardVisualSystemPrompt(),
    cardUser: buildCardVisualUserPrompt({
      direction,
      topic: topicText,
      notes,
      title,
    }),
  });
});

function readReferenceImages(raw: unknown): ReferenceImage[] {
  if (!Array.isArray(raw)) return [];
  const images: ReferenceImage[] = [];
  for (const item of raw.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const base64 = String(rec.base64 ?? "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "").trim();
    if (!base64) continue;
    const mime = String(rec.mimeType ?? "image/jpeg").split(";")[0];
    const mimeType =
      mime === "image/png" || mime === "image/webp" || mime === "image/gif" ? mime : "image/jpeg";
    images.push({ mimeType, base64: base64.slice(0, 2_400_000) });
  }
  return images;
}

xhsPromoRouter.post("/preview", async (req, res) => {
  const link = String(req.body?.link ?? "").trim();
  if (!link) {
    fail(res, 400, "请贴小红书笔记链接");
    return;
  }
  try {
    const note = await readPublicNote(link);
    res.json({
      title: note.meta.title,
      description: note.meta.description,
      images: note.images,
      finalUrl: note.meta.finalUrl,
      warning: note.meta.warning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] preview failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.post("/analyze", async (req, res) => {
  const direction = readDirection(req.body?.direction);
  const topic = readTopic(req.body?.topic);
  const title = String(req.body?.title ?? "").trim().slice(0, 80);
  const body = String(req.body?.body ?? "").trim().slice(0, 4000);
  const images = readReferenceImages(req.body?.images);
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (!title && !body && images.length === 0) {
    fail(res, 400, "先读取链接，或贴上标题、正文、图片");
    return;
  }
  try {
    const analyzed = await analyzeReferenceStyle({
      direction,
      topic,
      title,
      body,
      images,
      copyProvider: String(req.body?.copyProvider ?? "").trim() || null,
    });
    res.json({
      ...analyzed.prompts,
      source: null,
      model: `${analyzed.model.provider}:${analyzed.model.model}`,
      sawImages: analyzed.sawImages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] analyze failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.get("/prompt-versions/latest", async (req, res) => {
  const direction = readDirection(req.query.direction);
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (!isAdminOpsDbConfigured()) {
    res.json({ title: null, copy: null, cover: null, cards: null });
    return;
  }
  try {
    res.json(await latestPromptVersions(direction));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] prompt latest failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.get("/prompt-versions", async (req, res) => {
  const direction = readDirection(req.query.direction);
  const slot = String(req.query.slot ?? "").trim();
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (!isPromptSlot(slot)) {
    fail(res, 400, "槽位必须是 title / copy / cover / cards");
    return;
  }
  if (!isAdminOpsDbConfigured()) {
    res.json({ versions: [] });
    return;
  }
  try {
    res.json({ versions: await listPromptVersions(slot, direction) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] prompt list failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.post("/prompt-versions", async (req, res) => {
  const direction = readDirection(req.body?.direction);
  const slot = String(req.body?.slot ?? "").trim();
  const note = String(req.body?.note ?? "").trim().slice(0, 80) || null;
  const createdBy = String(res.locals.adminUserId ?? "").trim();
  if (!direction) {
    fail(res, 400, "方向必须是 howto / compare / data");
    return;
  }
  if (!isPromptSlot(slot)) {
    fail(res, 400, "槽位必须是 title / copy / cover / cards");
    return;
  }
  if (!createdBy) {
    fail(res, 401, "未登录");
    return;
  }
  const payload = normalizePayload(slot, req.body?.payload);
  if (!payload) {
    fail(res, 400, "提示词是空的");
    return;
  }
  if (!isAdminOpsDbConfigured()) {
    fail(res, 503, "未配置 ADMIN_DATABASE_URL / ADMIN_DATABASE_AUTH_TOKEN");
    return;
  }
  try {
    const result = await savePromptVersion({
      slot,
      direction,
      note,
      payload,
      createdBy,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] prompt save failed", message);
    fail(res, 500, message);
  }
});

xhsPromoRouter.delete("/prompt-versions/:id", async (req, res) => {
  const id = String(req.params.id ?? "").trim();
  if (!id) {
    fail(res, 400, "缺少版本 id");
    return;
  }
  if (!isAdminOpsDbConfigured()) {
    fail(res, 503, "未配置 ADMIN_DATABASE_URL / ADMIN_DATABASE_AUTH_TOKEN");
    return;
  }
  try {
    const deleted = await deletePromptVersion(id);
    if (!deleted) {
      fail(res, 404, "这一版已经不在了");
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] prompt delete failed", message);
    fail(res, 500, message);
  }
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
    const customSystem = clipPrompt(req.body?.cardSystemPrompt);
    const customUser = clipPrompt(req.body?.cardUserPrompt);
    const stylePrompt = [customSystem, customUser].filter(Boolean).join("\n\n") || null;
    const coverProvider = String(req.body?.coverProvider ?? "").trim() || null;
    if (provided) {
      const rendered = await renderContentCards({
        direction,
        cards: provided,
        provider: coverProvider,
        stylePrompt,
      });
      res.json({
        cards: rendered.cards,
        model: null,
        cardError: rendered.error ?? null,
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
      systemPrompt: isCardCopyPrompt(customSystem) ? customSystem : buildCardSystemPrompt(),
      userPrompt: isCardCopyPrompt(customUser) ? customUser : buildCardUserPrompt({
        direction,
        topic: topic || title,
        notes,
        title,
        body,
      }),
    });
    const rendered = await renderContentCards({
      direction,
      cards: result.cards,
      provider: coverProvider,
      stylePrompt,
    });
    res.json({
      cards: rendered.cards,
      model: `${result.model.provider}:${result.model.model}`,
      cardError: rendered.error ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xhs-promo] cards failed", message);
    fail(res, 500, message);
  }
});
