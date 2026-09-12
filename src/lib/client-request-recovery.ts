/** A transport failure is an unknown write outcome, never permission to retry it automatically. */
export async function requestWithNetworkRecovery(
  input: RequestInfo | URL,
  init: RequestInit,
  recoveryMessage: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await fetcher(input, init);
  } catch {
    return new Response(JSON.stringify({ error: recoveryMessage, outcomeUnknown: true }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
