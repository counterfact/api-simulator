/* eslint-disable security/detect-non-literal-fs-filename -- Tutorial files are written only inside an exclusively created demo directory. */
import fs from "node:fs/promises";
import net from "node:net";
import { join } from "node:path";

import { coffeeShopFiles, SHOP_DOCUMENT } from "./coffee-shop.js";

export async function findDemoDirectory(root: string): Promise<string> {
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

export async function prepareDemo(
  root: string,
  directory: string,
): Promise<void> {
  const destination = join(root, directory);
  // Exclusive creation also protects an existing file, directory, or symlink.
  await fs.mkdir(destination);
  await fs.writeFile(
    join(destination, "openapi.json"),
    JSON.stringify(SHOP_DOCUMENT, null, 2),
  );
  for (const [file, contents] of Object.entries(coffeeShopFiles(destination))) {
    await fs.mkdir(join(destination, file, ".."), { recursive: true });
    await fs.writeFile(join(destination, file), contents);
  }
}

export async function isPortAvailable(port: number): Promise<boolean> {
  const probe = (host: string): Promise<boolean> =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") resolve(false);
        else if (
          host === "::" &&
          ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code ?? "")
        )
          resolve(true);
        else reject(error);
      });
      server.listen({ port, host }, () =>
        server.close((error) => (error ? reject(error) : resolve(true))),
      );
    });
  // Some platforms permit an IPv6 listener alongside an occupied IPv4 port.
  return (await probe("0.0.0.0")) && (await probe("::"));
}
