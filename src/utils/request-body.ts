/** Both HTTP entry points enforce this before any JSON parser/SDK/Agents code. */
export const MAX_MCP_BODY_BYTES = 64 * 1024;
export class RequestBodyError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export async function boundedRequest(request: Request): Promise<Request> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MCP_BODY_BYTES)
        throw new RequestBodyError(413, "MCP request exceeds 64 KiB");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body: bytes });
}
