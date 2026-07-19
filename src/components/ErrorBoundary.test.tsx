import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ shouldThrow = true }: { shouldThrow?: boolean }): React.ReactElement {
  if (shouldThrow) throw new Error("chart blew up");
  return <p>rendered fine</p>;
}

// React logs caught errors to console.error; silence it so the suite output
// stays readable, and so a passing test doesn't look like a failing one.
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("passing through", () => {
  it("renders children untouched when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("rendered fine")).toBeInTheDocument();
  });
});

describe("catching", () => {
  it("shows the fallback instead of unmounting the tree", () => {
    render(
      <ErrorBoundary label="chart">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/this chart could not be displayed/i)).toBeInTheDocument();
  });

  it("surfaces the error message so the failure is diagnosable", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("chart blew up")).toBeInTheDocument();
  });

  it("uses a custom fallback when one is supplied", () => {
    render(
      <ErrorBoundary fallback={(e) => <p>custom: {e.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom: chart blew up")).toBeInTheDocument();
  });

  it("still logs to the console for debugging", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalled();
  });
});

describe("isolation", () => {
  // The whole point: a sibling failing must not take out the rest of the page.
  it("leaves siblings outside the boundary rendering", () => {
    render(
      <div>
        <p>answer text survives</p>
        <ErrorBoundary label="chart">
          <Boom />
        </ErrorBoundary>
        <p>and so does this</p>
      </div>,
    );
    expect(screen.getByText("answer text survives")).toBeInTheDocument();
    expect(screen.getByText("and so does this")).toBeInTheDocument();
    expect(screen.getByText(/could not be displayed/i)).toBeInTheDocument();
  });

  it("contains the failure to its own boundary when several are siblings", () => {
    render(
      <div>
        <ErrorBoundary label="chart">
          <Boom />
        </ErrorBoundary>
        <ErrorBoundary label="chart">
          <Boom shouldThrow={false} />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText(/could not be displayed/i)).toBeInTheDocument();
    expect(screen.getByText("rendered fine")).toBeInTheDocument();
  });
});

describe("recovery", () => {
  it("re-renders children after Try again when the cause is gone", async () => {
    let willThrow = true;
    function Flaky() {
      if (willThrow) throw new Error("transient");
      return <p>recovered</p>;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/could not be displayed/i)).toBeInTheDocument();

    willThrow = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
