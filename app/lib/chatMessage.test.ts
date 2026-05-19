import { describe, expect, it } from "vitest";
import { coerceChatMessageAttachments } from "./chatMessage";

describe("coerceChatMessageAttachments", () => {
  it("keeps valid image attachments and trims strings", () => {
    expect(
      coerceChatMessageAttachments([
        {
          type: "image",
          url: " https://blob.example.com/translated.jpg ",
          alt: " 翻译后的图片 ",
        },
      ]),
    ).toEqual([
      {
        type: "image",
        url: "https://blob.example.com/translated.jpg",
        alt: "翻译后的图片",
      },
    ]);
  });

  it("drops unsupported or incomplete attachments", () => {
    expect(
      coerceChatMessageAttachments([
        { type: "file", url: "https://example.com/a.pdf" },
        { type: "image", url: "" },
        null,
      ]),
    ).toEqual([]);
  });
});
