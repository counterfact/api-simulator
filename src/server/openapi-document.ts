import { type FSWatcher, watch } from "chokidar";
import createDebug from "debug";
import { dereference } from "@apidevtools/json-schema-ref-parser";

import type { OpenApiOperation } from "../counterfact-types/index.js";
import { applyOverlays } from "../util/apply-overlay.js";
import { waitForEvent } from "../util/wait-for-event.js";
import { sendTelemetry } from "../cli/telemetry.js";
import { CHOKIDAR_OPTIONS } from "./constants.js";
import type { HttpMethods } from "./registry.js";

const debug = createDebug("counterfact:server:openapi-document");

/**
 * Represents a loaded OpenAPI document. Knows the location of its source
 * file, can read the file and initialize itself, can watch for file-system
 * changes, and dispatches a `"reload"` event (via `EventTarget`) whenever
 * the document is reloaded from disk.
 */
export class OpenApiDocument extends EventTarget {
  /** The path or URL of the OpenAPI source file. */
  public readonly source: string;

  /**
   * Optional ordered list of overlay file paths/URLs to apply after each
   * load of the document.
   */
  public readonly overlays: readonly string[];

  public basePath?: string;

  public components?: {
    securitySchemes?: Record<
      string,
      {
        in?: "cookie" | "header" | "query";
        name?: string;
        type?: string;
      }
    >;
  };

  public paths: {
    [key: string]: {
      [key in Lowercase<HttpMethods>]?: OpenApiOperation;
    } & { additionalOperations?: Record<string, OpenApiOperation> };
  } = {};

  public produces?: string[];

  private watcher: FSWatcher | undefined;

  public constructor(source: string, overlays: readonly string[] = []) {
    super();
    this.source = source;
    this.overlays = overlays;
  }

  /**
   * Reads the source file and populates the document's properties.
   * Must be called at least once before the document data is accessible.
   */
  public async load(): Promise<void> {
    try {
      const data = (await dereference(this.source)) as {
        basePath?: string;
        components?: {
          securitySchemes?: Record<
            string,
            {
              in?: "cookie" | "header" | "query";
              name?: string;
              type?: string;
            }
          >;
        };
        paths: {
          [key: string]: {
            [key in Lowercase<HttpMethods>]?: OpenApiOperation;
          } & { additionalOperations?: Record<string, OpenApiOperation> };
        };
        produces?: string[];
      };

      if (this.overlays.length > 0) {
        await applyOverlays(
          data as unknown as Record<string, unknown>,
          this.overlays,
        );
      }

      this.basePath = data.basePath;
      this.components = data.components;
      this.paths = data.paths;
      this.produces = data.produces;
    } catch (error) {
      debug("could not load OpenAPI document from %s: %o", this.source, error);
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not load the OpenAPI spec from "${this.source}".\n${details}`,
        { cause: error },
      );
    }
  }

  /**
   * Starts watching the source file for changes. When a change is detected
   * the document reloads itself and dispatches a `"reload"` event.
   *
   * Has no effect when the source is `"_"` or a remote URL.
   */
  public async watch(): Promise<void> {
    if (this.source === "_" || this.source.startsWith("http")) {
      return;
    }

    this.watcher = watch(this.source, CHOKIDAR_OPTIONS).on("change", () => {
      sendTelemetry("file_change_detected", {
        changeType: "change",
        fileType: "openapi",
      });
      void (async () => {
        try {
          await this.load();
          debug("reloaded OpenAPI document from %s", this.source);
          this.dispatchEvent(new Event("reload"));
        } catch (error: unknown) {
          debug(
            "failed to reload OpenAPI document from %s: %o",
            this.source,
            error,
          );
        }
      })();
    });

    await waitForEvent(this.watcher, "ready");
  }

  /** Stops watching the source file. */
  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }
}
