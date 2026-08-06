import Koa from "koa";
import request from "supertest";

describe("JSON prettification middleware", () => {
  function buildApp(responseBody: unknown) {
    const app = new Koa();

    // The upstream middleware that produces a response
    app.use(async (ctx, next) => {
      await next();

      if (
        ctx.body !== null &&
        ctx.body !== undefined &&
        typeof ctx.body === "object" &&
        !Buffer.isBuffer(ctx.body)
      ) {
        ctx.body = JSON.stringify(ctx.body, null, 2);
        ctx.type = "application/json";
      }
    });

    // Downstream middleware sets the body
    app.use(async (ctx) => {
      ctx.body = responseBody;
    });

    return app;
  }

  it("prettifies an object response body with 2-space indentation", async () => {
    const responseObject = { greeting: "Hello", name: "World" };
    const app = buildApp(responseObject);

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toBe(JSON.stringify(responseObject, null, 2));
    expect(response.type).toBe("application/json");
  });

  it("does not modify a string response body", async () => {
    const app = buildApp("plain string response");

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toBe("plain string response");
  });

  it("does not modify a Buffer response body", async () => {
    const bufferBody = Buffer.from("binary data");
    const app = buildApp(bufferBody);

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(Buffer.from("binary data"));
  });

  it("does not modify a null response body", async () => {
    const app = buildApp(null);

    const response = await request(app.callback()).get("/");

    expect(response.status).toBe(204);
  });
});
