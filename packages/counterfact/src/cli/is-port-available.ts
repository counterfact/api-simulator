import net from "node:net";

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
