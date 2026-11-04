import type Koa from "koa";
import type { MultipartFile } from "@counterfact/types";

export const MULTIPART_BODY_LIMIT = 10 * 1024 * 1024;

/** Buffer bounded uploads in memory; never write client filenames to disk. */
export function multipartBodyParser(): Koa.Middleware {
  return async (ctx, next) => {
    if (
      !ctx.is("multipart/form-data") ||
      ["GET", "HEAD"].includes(ctx.method)
    ) {
      return await next();
    }
    if (Number(ctx.get("content-length")) > MULTIPART_BODY_LIMIT) {
      ctx.req.resume();
      ctx.throw(413, "Multipart request exceeds the 10 MiB limit");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of ctx.req.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MULTIPART_BODY_LIMIT) {
        ctx.req.resume();
        ctx.throw(413, "Multipart request exceeds the 10 MiB limit");
      }
      chunks.push(bytes);
    }
    const rawBody = Buffer.concat(chunks);
    let form: FormData;
    try {
      form = await new Response(rawBody, {
        headers: { "content-type": ctx.get("content-type") },
      }).formData();
    } catch {
      return ctx.throw(400, "Malformed multipart/form-data request");
    }
    const fields = new Map<string, (string | MultipartFile)[]>();
    for (const [name, value] of form) {
      const field =
        typeof value === "string"
          ? value
          : {
              data: new Uint8Array(await value.arrayBuffer()),
              filename: value.name,
              contentType: value.type,
              size: value.size,
            };
      const values = fields.get(name) ?? [];
      values.push(field);
      fields.set(name, values);
    }
    ctx.request.body = Object.fromEntries(
      [...fields].map(([name, values]) => [
        name,
        values.length === 1 ? values[0] : values,
      ]),
    );
    // koa-bodyparser declares rawBody as string; uploads must retain their bytes
    // for $.proxy(), including binary content and the original boundary.
    Object.assign(ctx.request, { rawBody });
    await next();
  };
}
