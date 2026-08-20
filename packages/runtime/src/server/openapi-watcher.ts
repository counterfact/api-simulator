import { type FSWatcher, watch } from "chokidar";
import createDebug from "debug";

import { waitForEvent } from "../util/wait-for-event.js";
import { CHOKIDAR_OPTIONS } from "./constants.js";
import type { Dispatcher } from "./dispatcher.js";
import { loadOpenApiDocument } from "./load-openapi-document.js";

const debug = createDebug("counterfact:server:openapi-watcher");

export class OpenApiWatcher {
  private readonly openApiPath: string;

  private readonly dispatcher: Dispatcher;

  private watcher: FSWatcher | undefined;

  public constructor(openApiPath: string, dispatcher: Dispatcher) {
    this.openApiPath = openApiPath;
    this.dispatcher = dispatcher;
  }

  public async watch(): Promise<void> {
    if (this.openApiPath === "_" || this.openApiPath.startsWith("http")) {
      return;
    }

    this.watcher = watch(this.openApiPath, CHOKIDAR_OPTIONS).on(
      "change",
      () => {
        void (async () => {
          try {
            this.dispatcher.openApiDocument = await loadOpenApiDocument(
              this.openApiPath,
            );
            debug("reloaded OpenAPI document from %s", this.openApiPath);
          } catch (error: unknown) {
            debug(
              "failed to reload OpenAPI document from %s: %o",
              this.openApiPath,
              error,
            );
          }
        })();
      },
    );

    await waitForEvent(this.watcher, "ready");
  }

  public async stopWatching(): Promise<void> {
    await this.watcher?.close();
  }
}
