import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * An HTTP server on 127.0.0.1 standing in for someone's webhook endpoint. `respond` picks the
 * status for each request (its index counts from 0). Close it after use.
 */
export async function startWebhookReceiver(respond: (index: number) => number = () => 200) {
  const requests: ReceivedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const index = requests.length;
      requests.push({
        method: req.method ?? '',
        path: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.statusCode = respond(index);
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/hooks/formyx`,
    port,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** A local port nothing listens on, so connecting to it is refused. */
export async function closedPort(): Promise<number> {
  const receiver = await startWebhookReceiver();
  await receiver.close();
  return receiver.port;
}
