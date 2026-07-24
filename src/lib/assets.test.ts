import { describe, expect, it } from "vitest";
import { extFromName, looksLikeUrl } from "./assets";

describe("looksLikeUrl", () => {
  it("accepts http(s) URLs, trimming surrounding whitespace", () => {
    expect(looksLikeUrl("https://example.com/a.png")).toBe(true);
    expect(looksLikeUrl("http://example.com/x")).toBe(true);
    expect(looksLikeUrl("   https://example.com/a.png  ")).toBe(true);
  });

  it("rejects non-http(s) and non-URL strings", () => {
    expect(looksLikeUrl("ftp://example.com/a.png")).toBe(false);
    expect(looksLikeUrl("file:///c:/a.png")).toBe(false);
    expect(looksLikeUrl("just some text")).toBe(false);
    expect(looksLikeUrl("photo.png")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });

  it("rejects a URL with internal whitespace", () => {
    expect(looksLikeUrl("https://example.com/a b.png")).toBe(false);
  });
});

describe("extFromName", () => {
  it("returns the extension after the final dot", () => {
    expect(extFromName("photo.png")).toBe("png");
    expect(extFromName("archive.tar.gz")).toBe("gz");
  });

  it("preserves case (caller lowercases as needed)", () => {
    expect(extFromName("IMAGE.JPEG")).toBe("JPEG");
  });

  it("returns an empty string when there is no extension", () => {
    expect(extFromName("noext")).toBe("");
  });
});
