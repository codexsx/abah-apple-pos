// Vitest global setup. Extends `expect` with jest-dom matchers and ensures the
// DOM is cleaned up between tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
