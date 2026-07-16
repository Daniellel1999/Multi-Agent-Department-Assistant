import type { GroundedFact } from "../domain.js";

export interface HrData {
  period: string;
  totalHeadcount: number;
  headcountByDepartment: {
    engineering: number;
    sales: number;
    marketing: number;
    hr: number;
  };
  openRolesByDepartment: {
    engineering: number;
    sales: number;
    marketing: number;
    hr: number;
  };
  attritionRatePercent: number;
  engagementScore: number;
  recruitingPipelineQualifiedCandidates: number;
  capacityNotes: string[];
}

export type HrFactKey = keyof typeof hrFactDefinitions;

export const hrData: HrData = {
  period: "Q2 FY2026",
  totalHeadcount: 86,
  headcountByDepartment: {
    engineering: 38,
    sales: 24,
    marketing: 14,
    hr: 10
  },
  openRolesByDepartment: {
    engineering: 5,
    sales: 3,
    marketing: 1,
    hr: 0
  },
  attritionRatePercent: 11,
  engagementScore: 72,
  recruitingPipelineQualifiedCandidates: 18,
  capacityNotes: [
    "Engineering managers report delivery risk from unfilled backend roles.",
    "Sales has enough pipeline coverage for the next two account executive hires."
  ]
};

export const hrFactDefinitions = {
  period: {
    label: "HR reporting period",
    path: "period",
    getValue: (data: HrData) => data.period
  },
  totalHeadcount: {
    label: "Total headcount",
    path: "totalHeadcount",
    getValue: (data: HrData) => data.totalHeadcount
  },
  engineeringHeadcount: {
    label: "Engineering headcount",
    path: "headcountByDepartment.engineering",
    getValue: (data: HrData) => data.headcountByDepartment.engineering
  },
  salesHeadcount: {
    label: "Sales headcount",
    path: "headcountByDepartment.sales",
    getValue: (data: HrData) => data.headcountByDepartment.sales
  },
  marketingHeadcount: {
    label: "Marketing headcount",
    path: "headcountByDepartment.marketing",
    getValue: (data: HrData) => data.headcountByDepartment.marketing
  },
  hrHeadcount: {
    label: "HR headcount",
    path: "headcountByDepartment.hr",
    getValue: (data: HrData) => data.headcountByDepartment.hr
  },
  engineeringOpenRoles: {
    label: "Engineering open roles",
    path: "openRolesByDepartment.engineering",
    getValue: (data: HrData) => data.openRolesByDepartment.engineering
  },
  salesOpenRoles: {
    label: "Sales open roles",
    path: "openRolesByDepartment.sales",
    getValue: (data: HrData) => data.openRolesByDepartment.sales
  },
  marketingOpenRoles: {
    label: "Marketing open roles",
    path: "openRolesByDepartment.marketing",
    getValue: (data: HrData) => data.openRolesByDepartment.marketing
  },
  hrOpenRoles: {
    label: "HR open roles",
    path: "openRolesByDepartment.hr",
    getValue: (data: HrData) => data.openRolesByDepartment.hr
  },
  attritionRatePercent: {
    label: "Attrition rate percent",
    path: "attritionRatePercent",
    getValue: (data: HrData) => data.attritionRatePercent
  },
  engagementScore: {
    label: "Engagement score",
    path: "engagementScore",
    getValue: (data: HrData) => data.engagementScore
  },
  recruitingPipelineQualifiedCandidates: {
    label: "Qualified recruiting candidates",
    path: "recruitingPipelineQualifiedCandidates",
    getValue: (data: HrData) => data.recruitingPipelineQualifiedCandidates
  },
  capacityNotes: {
    label: "Capacity notes",
    path: "capacityNotes",
    getValue: (data: HrData) => data.capacityNotes.join(" ")
  }
} as const;

export function resolveHrFact(key: string, data: HrData): GroundedFact | undefined {
  const definition = hrFactDefinitions[key as HrFactKey];
  if (!definition) {
    return undefined;
  }

  return {
    source: "hr",
    label: definition.label,
    value: definition.getValue(data),
    path: definition.path
  };
}

export function getHrFactKeys(): string[] {
  return Object.keys(hrFactDefinitions);
}
