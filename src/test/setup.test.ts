import { describe, it, expect } from "vitest";
// Import via the `@/` alias to verify it resolves under Vitest (mirrors Vite).
import { cn } from "@/lib/utils";

describe("test toolchain", () => {
  it("runs vitest with globals enabled", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves the @/ path alias", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("has jest-dom matchers available", () => {
    const el = document.createElement("div");
    el.textContent = "hello";
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("hello");
  });
});
