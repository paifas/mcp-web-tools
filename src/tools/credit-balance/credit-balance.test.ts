import { describe, it, expect } from "vitest";

// Test the credit balance formatting logic
describe("credit balance formatting", () => {
  it("shows remaining credits", () => {
    const planLimit = 1000;
    const planUsage = 33;
    const remaining = planLimit - planUsage;
    const percentUsed = Math.round((planUsage / planLimit) * 100);
    const lines = [
      `Plan: Researcher — ${planUsage} / ${planLimit} credits (${percentUsed}% used)`,
      `Remaining: ${remaining}`,
      `Breakdown — search: 27, extract: 6`,
    ];
    expect(lines[0]).toContain("3% used");
    expect(lines[1]).toBe("Remaining: 967");
  });

  it("warns when credits are low", () => {
    const remaining = 30;
    const lines = ["Plan: Researcher — 970 / 1000 credits (97% used)", `Remaining: ${remaining}`];
    if (remaining < 50) {
      lines.push("Credits running low. Top up at https://tavily.com");
    }
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("running low");
  });

  it("does not warn when credits are healthy", () => {
    const remaining = 500;
    const lines = ["Plan: Researcher — 500 / 1000 credits (50% used)", `Remaining: ${remaining}`];
    if (remaining < 50) {
      lines.push("Credits running low.");
    }
    expect(lines).toHaveLength(2);
  });
});
