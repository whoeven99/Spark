import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyEnvFileContent,
  ensureRuntimeEnv,
  isRenderPlatformEnvKey,
  resetRuntimeEnvLoaderForTests,
} from "../../../app/config/runtimeEnv.server";

describe("isRenderPlatformEnvKey", () => {
  it("matches PORT, RENDER, and RENDER_*", () => {
    expect(isRenderPlatformEnvKey("PORT")).toBe(true);
    expect(isRenderPlatformEnvKey("RENDER")).toBe(true);
    expect(isRenderPlatformEnvKey("RENDER_EXTERNAL_URL")).toBe(true);
    expect(isRenderPlatformEnvKey("RENDER_SERVICE_NAME")).toBe(true);
    expect(isRenderPlatformEnvKey("NODE_ENV")).toBe(false);
    expect(isRenderPlatformEnvKey("SHOPIFY_APP_URL")).toBe(false);
  });
});

describe("applyEnvFileContent secret override", () => {
  const probeKey = "SPARK_SECRET_OVERRIDE_PROBE";
  const savedProbe = process.env[probeKey];
  const savedNodeEnv = process.env.NODE_ENV;
  const savedPort = process.env.PORT;
  const savedRender = process.env.RENDER;
  const savedRenderUrl = process.env.RENDER_EXTERNAL_URL;

  afterEach(() => {
    if (savedProbe === undefined) delete process.env[probeKey];
    else process.env[probeKey] = savedProbe;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedPort === undefined) delete process.env.PORT;
    else process.env.PORT = savedPort;
    if (savedRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = savedRender;
    if (savedRenderUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = savedRenderUrl;
  });

  it("overrides NODE_ENV from Secret File even when platform set production", () => {
    process.env.NODE_ENV = "production";
    process.env.RENDER = "true";

    const result = applyEnvFileContent("NODE_ENV=test\n", {
      overrideExisting: false,
      fromSecretFile: true,
    });

    expect(process.env.NODE_ENV).toBe("test");
    expect(result.overridden).toContain("NODE_ENV");
    expect(result.appliedCount).toBe(1);
  });

  it("does not override PORT / RENDER* from Secret File", () => {
    process.env.PORT = "10000";
    process.env.RENDER = "true";
    process.env.RENDER_EXTERNAL_URL = "https://example.onrender.com";

    const result = applyEnvFileContent(
      [
        "PORT=9999",
        "RENDER=false",
        "RENDER_EXTERNAL_URL=https://evil.example",
        `${probeKey}=ok`,
      ].join("\n"),
      { overrideExisting: false, fromSecretFile: true },
    );

    expect(process.env.PORT).toBe("10000");
    expect(process.env.RENDER).toBe("true");
    expect(process.env.RENDER_EXTERNAL_URL).toBe("https://example.onrender.com");
    expect(process.env[probeKey]).toBe("ok");
    expect(result.skipped).toEqual(
      expect.arrayContaining(["PORT", "RENDER", "RENDER_EXTERNAL_URL"]),
    );
  });

  it("fill mode still skips already-set keys on Render", () => {
    process.env.RENDER = "true";
    process.env[probeKey] = "platform";

    const result = applyEnvFileContent(`${probeKey}=from-file\n`, {
      overrideExisting: false,
      fromSecretFile: false,
    });

    expect(process.env[probeKey]).toBe("platform");
    expect(result.skipped).toContain(probeKey);
    expect(result.appliedCount).toBe(0);
  });
});

describe("ensureRuntimeEnv from file", () => {
  const tmpFile = path.join(os.tmpdir(), `spark-env-test-${Date.now()}.env`);
  const savedTarget = process.env.ENV_FILE;
  const savedTursoUrl = process.env.TURSO_DATABASE_URL;

  afterEach(() => {
    if (savedTarget === undefined) delete process.env.ENV_FILE;
    else process.env.ENV_FILE = savedTarget;
    if (savedTursoUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = savedTursoUrl;
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  });

  it("loads keys from ENV_FILE when not already set", () => {
    fs.writeFileSync(tmpFile, "SPARK_ENV_FILE_PROBE=from-env-file\n", "utf8");
    delete process.env.SPARK_ENV_FILE_PROBE;
    process.env.ENV_FILE = tmpFile;
    resetRuntimeEnvLoaderForTests();

    ensureRuntimeEnv();

    expect(process.env.SPARK_ENV_FILE_PROBE).toBe("from-env-file");
  });

  it("getProjectRoot resolves to repo root", async () => {
    const { getProjectRoot } = await import("../../../app/config/runtimeEnv.server");
    const root = getProjectRoot();
    expect(fs.existsSync(path.join(root, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "app", "db.server.ts"))).toBe(true);
  });
});
