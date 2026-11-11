import { describe, expect, it } from "vitest";
import { renderApp } from "../src/ui.ts";

describe("owner page shell", () => {
  it("escapes a supplied nonce without creating an executable element", () => {
    const html = renderApp('"><img src=x onerror="alert(1)">');
    expect(html.match(/<script\b/g)).toHaveLength(1);
    expect(html.match(/<style\b/g)).toHaveLength(1);
    expect(html).not.toContain("<img");
    expect(html).toContain('nonce="&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"');
  });

  it("uses the same CSP nonce for its client and stylesheet without inline handlers or external scripts", () => {
    const html = renderApp("synthetic-nonce");
    const source = /<script nonce="synthetic-nonce">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(source).toBeDefined();
    expect(html.match(/nonce="synthetic-nonce"/g)).toHaveLength(2);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\son(?:click|load|error|submit)="/);
  });

  it("provides every static client control so initialization cannot stop on a missing element", () => {
    const html = renderApp("synthetic-nonce");
    const shell = html.slice(0, html.indexOf("<script"));
    const source = html.slice(html.indexOf("<script"));
    const ids = new Set([...shell.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    for (const reference of source.matchAll(/\$\('([a-z][a-z0-9-]+)'\)/g)) {
      expect(ids.has(reference[1]), `Missing client control: ${reference[1]}`).toBe(true);
    }
  });
});
