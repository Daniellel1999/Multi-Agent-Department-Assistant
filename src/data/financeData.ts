import type { GroundedFact } from "../domain.js";

export interface FinanceData {
  period: string;
  monthlyRevenue: number;
  operatingExpenses: number;
  cashBalance: number;
  monthlyBurnRate: number;
  grossMarginPercent: number;
  departmentBudgets: {
    engineering: number;
    sales: number;
    marketing: number;
    hr: number;
  };
  approvedHiringBudget: number;
  notes: string[];
}

export type FinanceFactKey = keyof typeof financeFactDefinitions;

export const financeData: FinanceData = {
  period: "Q2 FY2026",
  monthlyRevenue: 1250000,
  operatingExpenses: 980000,
  cashBalance: 4200000,
  monthlyBurnRate: 180000,
  grossMarginPercent: 63,
  departmentBudgets: {
    engineering: 420000,
    sales: 260000,
    marketing: 180000,
    hr: 70000
  },
  approvedHiringBudget: 240000,
  notes: [
    "Marketing is currently tracking 8% under its quarterly budget.",
    "Finance has approved hiring spend for critical roles only."
  ]
};

export const financeFactDefinitions = {
  period: {
    label: "Finance reporting period",
    path: "period",
    getValue: (data: FinanceData) => data.period
  },
  monthlyRevenue: {
    label: "Monthly revenue",
    path: "monthlyRevenue",
    getValue: (data: FinanceData) => data.monthlyRevenue
  },
  operatingExpenses: {
    label: "Operating expenses",
    path: "operatingExpenses",
    getValue: (data: FinanceData) => data.operatingExpenses
  },
  cashBalance: {
    label: "Cash balance",
    path: "cashBalance",
    getValue: (data: FinanceData) => data.cashBalance
  },
  monthlyBurnRate: {
    label: "Monthly burn rate",
    path: "monthlyBurnRate",
    getValue: (data: FinanceData) => data.monthlyBurnRate
  },
  grossMarginPercent: {
    label: "Gross margin percent",
    path: "grossMarginPercent",
    getValue: (data: FinanceData) => data.grossMarginPercent
  },
  engineeringBudget: {
    label: "Engineering budget",
    path: "departmentBudgets.engineering",
    getValue: (data: FinanceData) => data.departmentBudgets.engineering
  },
  salesBudget: {
    label: "Sales budget",
    path: "departmentBudgets.sales",
    getValue: (data: FinanceData) => data.departmentBudgets.sales
  },
  marketingBudget: {
    label: "Marketing budget",
    path: "departmentBudgets.marketing",
    getValue: (data: FinanceData) => data.departmentBudgets.marketing
  },
  hrBudget: {
    label: "HR budget",
    path: "departmentBudgets.hr",
    getValue: (data: FinanceData) => data.departmentBudgets.hr
  },
  approvedHiringBudget: {
    label: "Approved hiring budget",
    path: "approvedHiringBudget",
    getValue: (data: FinanceData) => data.approvedHiringBudget
  },
  financeNotes: {
    label: "Finance notes",
    path: "notes",
    getValue: (data: FinanceData) => data.notes.join(" ")
  }
} as const;

export function resolveFinanceFact(key: string, data: FinanceData): GroundedFact | undefined {
  const definition = financeFactDefinitions[key as FinanceFactKey];
  if (!definition) {
    return undefined;
  }

  return {
    source: "finance",
    label: definition.label,
    value: definition.getValue(data),
    path: definition.path
  };
}

export function getFinanceFactKeys(): string[] {
  return Object.keys(financeFactDefinitions);
}
