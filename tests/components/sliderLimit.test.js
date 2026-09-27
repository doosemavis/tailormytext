import { describe, it, expect } from "vitest";
import { limitStep } from "../../src/components/sliderLimit";

// `value` is what Radix reports (mapped from the pointer's absolute position);
// `intent` is where the user is actually pushing (value at grab + pointer
// travel since the grab). Defaults to `value` for keyboard and track clicks.
describe("limitStep", () => {
  it("passes values through when there is no limit", () => {
    expect(limitStep({ value: 900, limit: undefined, pointerDown: true, alreadyOver: false }))
      .toEqual({ shown: 900, enteredLimit: false, over: false });
  });

  it("passes values at or under the limit through", () => {
    expect(limitStep({ value: 400, limit: 400, pointerDown: true, alreadyOver: false }))
      .toEqual({ shown: 400, enteredLimit: false, over: false });
  });

  it("pins the thumb at the limit and reports entering it on a drag", () => {
    expect(limitStep({ value: 910, limit: 400, pointerDown: true, alreadyOver: false }))
      .toEqual({ shown: 400, enteredLimit: true, over: true });
  });

  it("reports entering the limit only once per push while the pointer stays over it", () => {
    expect(limitStep({ value: 950, limit: 400, pointerDown: true, alreadyOver: true }))
      .toEqual({ shown: 400, enteredLimit: false, over: true });
  });

  it("pins keyboard steps at the limit without a mid-drag entry (commit handles the prompt)", () => {
    expect(limitStep({ value: 1000, limit: 400, pointerDown: false, alreadyOver: false }))
      .toEqual({ shown: 400, enteredLimit: false, over: true });
  });

  // Owner-reported: thumb parked on the lock, grabbed right of its centre,
  // dragged LEFT — the first pixel of travel reads as ~410 from the absolute
  // pointer position and wrongly opened the Pro prompt.
  it("does not treat grabbing the thumb right of centre and moving left as a push", () => {
    expect(limitStep({ value: 410, intent: 397, limit: 400, slack: 10, pointerDown: true, alreadyOver: false }))
      .toEqual({ shown: 400, enteredLimit: false, over: false });
  });

  it("ignores a nudge within the slack past the limit (hand jitter)", () => {
    expect(limitStep({ value: 410, intent: 408, limit: 400, slack: 10, pointerDown: true, alreadyOver: false }))
      .toEqual({ shown: 400, enteredLimit: false, over: false });
  });

  it("treats real travel beyond the slack as a push into the limit", () => {
    expect(limitStep({ value: 430, intent: 425, limit: 400, slack: 10, pointerDown: true, alreadyOver: false }))
      .toEqual({ shown: 400, enteredLimit: true, over: true });
  });
});
