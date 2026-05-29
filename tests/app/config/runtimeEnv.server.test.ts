import { describe, expect, it, afterEach } from "vitest";
import fs, { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureRuntimeEnv,
  resetRuntimeEnvLoaderForTests,
} from "../../../app/config/runtimeEnv.server";

describe("ensureRuntimeEnv from file", () => {
  const tmpFile = path.join(os.tmpdir(), `spark-env-test-${Date.now()}.env`);
  const savedTarget = process.env.ENV_FILE;
  const savedTursoUrl = process.env.TURSO_TEST_DATABASE_URL;

  afterEach(() => {
    if (savedTarget === undefined) delete process.env.ENV_FILE;
    else process.env.ENV_FILE = savedTarget;
    if (savedTursoUrl === undefined) delete process.env.TURSO_TEST_DATABASE_URL;
    else process.env.TURSO_TEST_DATABASE_URL = savedTursoUrl;
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
