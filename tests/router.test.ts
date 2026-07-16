import { routeQuestion } from "../src/routing/router.js";

describe("routeQuestion", () => {
  it("routes finance-only questions to finance", () => {
    expect(routeQuestion("What is our monthly revenue?").route).toBe("finance");
  });

  it("routes singular cost questions to finance", () => {
    expect(routeQuestion("What is our cost?").route).toBe("finance");
  });

  it("routes plural cost questions to finance", () => {
    expect(routeQuestion("What are our costs?").route).toBe("finance");
  });

  it("routes expenses questions to finance", () => {
    expect(routeQuestion("What are our expenses?").route).toBe("finance");
  });

  it("does not match HR inside unrelated words", () => {
    expect(routeQuestion("What is our cash through next quarter?").route).toBe("finance");
    expect(routeQuestion("What cash threshold should we watch?").route).toBe("finance");
    expect(routeQuestion("Do we have cash for three quarters?").route).toBe("finance");
  });

  it("routes HR-only questions to hr", () => {
    expect(routeQuestion("Which teams have the highest attrition risk?").route).toBe("hr");
  });

  it("matches HR as a standalone acronym", () => {
    expect(routeQuestion("What is the HR headcount?").route).toBe("hr");
  });

  it("routes hiring affordability questions to both", () => {
    expect(routeQuestion("Can we afford to hire more engineers?").route).toBe("both");
  });

  it("routes unrelated questions to unknown", () => {
    expect(routeQuestion("What is the weather tomorrow?").route).toBe("unknown");
  });

  it("routes mixed finance and HR signals to both", () => {
    expect(routeQuestion("How does hiring affect the budget?").route).toBe("both");
  });
});
