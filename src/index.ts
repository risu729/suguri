export default {
  fetch(request: Request): Response {
    if (new URL(request.url).pathname !== "/health") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    return new Response(
      request.method === "HEAD" ? null : JSON.stringify({ service: "suguri", status: "scaffold" }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  },
} satisfies ExportedHandler;
