import { describe, expect, test, afterAll } from "bun:test";
import server from "./index";

describe("Bun Server", () => {
  const baseUrl = `http://localhost:${server.port}`;

  afterAll(() => {
    server.stop();
  });

  test("GET / returns Hello from Bun", async () => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    const text = await response.text();
    expect(text).toBe("Hello from Bun");
  });

  test("GET /health returns status ok", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok" });
  });

  test("GET /unknown returns 404", async () => {
    const response = await fetch(`${baseUrl}/unknown`);
    expect(response.status).toBe(404);
  });
});
