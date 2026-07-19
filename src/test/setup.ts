// Adds jest-dom's DOM matchers (toBeInTheDocument, toBeDisabled, …) and clears
// React Testing Library's rendered output between specs.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
