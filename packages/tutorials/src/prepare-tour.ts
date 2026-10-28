/* eslint-disable security/detect-non-literal-fs-filename -- Tutorial files are written only inside an exclusively created demo directory. */
import fs from "node:fs/promises";
import { join, resolve } from "node:path";

import { format } from "prettier";
import { stringify } from "yaml";

import { coffeeShopFiles, SHOP_DOCUMENT } from "./coffee-shop/coffee-shop.js";

import {
  initializeWalkthroughWorkspace,
  walkthroughWorkspace,
} from "./coffee-shop/coffee-shop-workspace.js";

export async function findTourDirectory(root: string): Promise<string> {
  for (let suffix = 1; ; suffix++) {
    const name =
      suffix === 1 ? "counterfact-demo" : `counterfact-demo-${suffix}`;
    try {
      await fs.lstat(join(root, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return name;
      throw error;
    }
  }
}

export async function prepareTour(
  root: string,
  directory: string,
  tour: string = "coffee-shop",
): Promise<{ source: string; destination: string; walkthroughPath: string }> {
  if (tour !== "coffee-shop") throw new Error(`Unknown tour: ${tour}`);
  const destination = resolve(root, directory);
  // Exclusive creation also protects an existing file, directory, or symlink.
  await fs.mkdir(destination);
  await fs.writeFile(
    join(destination, "openapi.yaml"),
    stringify(SHOP_DOCUMENT),
  );
  for (const [file, contents] of Object.entries(coffeeShopFiles(destination))) {
    await fs.mkdir(join(destination, file, ".."), { recursive: true });
    await fs.writeFile(
      join(destination, file),
      await format(contents, { parser: "typescript" }),
    );
  }
  await initializeWalkthroughWorkspace(destination);
  return {
    source: join(destination, "openapi.yaml"),
    destination,
    walkthroughPath: "/walkthrough",
  };
}

/** Snapshot normal generator output before inviting the learner to edit it. */
export async function finalizeTour(destination: string): Promise<void> {
  await walkthroughWorkspace(destination);
}
