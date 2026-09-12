import type { Server } from "node:http";

/** Own only this local fixture's resources, including failed launch/context setup. */
export async function withFixtureBrowser<Browser extends { close(): Promise<unknown> }>(
  server: Server,
  launch: () => Promise<Browser>,
  run: (browser: Browser) => Promise<void>,
) {
  let browser: Browser | undefined;
  try {
    browser = await launch();
    await run(browser);
  } finally {
    try {
      await browser?.close();
    } finally {
      if (server.listening) await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  }
}
