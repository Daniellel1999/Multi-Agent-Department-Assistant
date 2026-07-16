import type { RouteDecision } from "../domain.js";

const financeSignals = [
  "finance",
  "revenue",
  "profit",
  "margin",
  "cash",
  "runway",
  "budget",
  "expense",
  "expenses",
  "cost",
  "costs",
  "spend",
  "burn",
  "forecast"
];

const hrSignals = [
  "hr",
  "headcount",
  "employee",
  "employees",
  "hire",
  "hiring",
  "open role",
  "open roles",
  "recruit",
  "attrition",
  "retention",
  "engagement",
  "team capacity",
  "understaffed",
  "staffing"
];

const crossDepartmentSignals = ["should we", "can we", "afford to hire", "hire more", "staffing budget", "growth plan"];

export function routeQuestion(question: string): RouteDecision {
  const normalized = question.toLowerCase();
  const matchedFinanceSignals = findSignals(normalized, financeSignals);
  const matchedHrSignals = findSignals(normalized, hrSignals);
  const matchedCrossSignals = findSignals(normalized, crossDepartmentSignals);
  const matchedSignals = [...matchedFinanceSignals, ...matchedHrSignals, ...matchedCrossSignals];

  const hasFinance = matchedFinanceSignals.length > 0;
  const hasHr = matchedHrSignals.length > 0;
  const isCrossDepartmentHiringDecision =
    matchedCrossSignals.length > 0 && /\b(hire|hiring|headcount|staff|staffing|people|roles?)\b/.test(normalized);

  if ((hasFinance && hasHr) || isCrossDepartmentHiringDecision) {
    return {
      route: "both",
      reason: "Question includes signals that need both finance and HR perspectives.",
      matchedSignals
    };
  }

  if (hasFinance) {
    return {
      route: "finance",
      reason: "Question matched finance signals only.",
      matchedSignals
    };
  }

  if (hasHr) {
    return {
      route: "hr",
      reason: "Question matched HR signals only.",
      matchedSignals
    };
  }

  return {
    route: "unknown",
    reason: "Question did not match finance or HR signals.",
    matchedSignals: []
  };
}

function findSignals(question: string, signals: string[]): string[] {
  return signals.filter((signal) => matchesSignal(question, signal));
}

function matchesSignal(question: string, signal: string): boolean {
  return new RegExp(`\\b${escapeRegExp(signal)}\\b`).test(question);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
