export type ClassroomRatioInput = {
  children: number;
  staff: number;
  capacity: number;
  ratioRule?: string | null;
};

export type ClassroomRatioWarning = {
  status: "healthy" | "near_limit" | "over_ratio" | "over_capacity" | "missing_staff" | "missing_rule";
  tone: "default" | "secondary" | "destructive" | "outline";
  label: string;
  detail: string;
  requiredStaff: number | null;
  maxChildrenForStaff: number | null;
  overBy: number;
};

export function parseRatioRule(value: string | null | undefined) {
  const match = (value ?? "").match(/(\d+)\s*:\s*(\d+)/);
  if (!match) return null;

  const staff = Number(match[1]);
  const children = Number(match[2]);
  if (!Number.isFinite(staff) || !Number.isFinite(children) || staff <= 0 || children <= 0) return null;

  return {
    staff,
    children,
    maxChildrenPerStaff: children / staff,
  };
}

function normalizeLabel(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
}

function ratioRuleLines(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveClassroomRatioRule(input: {
  ratioRule?: string | null;
  ageGroup?: string | null;
  state?: string | null;
  licensingRatioRules?: string | null;
}) {
  if (parseRatioRule(input.ratioRule)) return input.ratioRule?.trim() ?? null;

  const ageGroup = normalizeLabel(input.ageGroup);
  const state = normalizeLabel(input.state);
  const lines = ratioRuleLines(input.licensingRatioRules);
  if (!ageGroup || !lines.length) return null;

  const exact = lines.find((line) => {
    const label = normalizeLabel(line.replace(/\d+\s*:\s*\d+.*/, ""));
    return label === ageGroup || label.endsWith(` ${ageGroup}`) || ageGroup.endsWith(` ${label}`);
  });
  if (exact && parseRatioRule(exact)) return exact;

  const fuzzy = lines.find((line) => {
    const label = normalizeLabel(line.replace(/\d+\s*:\s*\d+.*/, ""));
    return label && (label.includes(ageGroup) || ageGroup.includes(label));
  });
  if (fuzzy && parseRatioRule(fuzzy)) return fuzzy;

  if (state) {
    const stateFallback = lines.find((line) => normalizeLabel(line).startsWith(state) && parseRatioRule(line));
    if (stateFallback) return stateFallback;
  }

  const generic = lines.find((line) => parseRatioRule(line));
  return generic ?? null;
}

export function evaluateClassroomRatio(input: ClassroomRatioInput): ClassroomRatioWarning {
  const children = Math.max(0, Math.floor(input.children));
  const staff = Math.max(0, Math.floor(input.staff));
  const capacity = Math.max(0, Math.floor(input.capacity));
  const parsedRule = parseRatioRule(input.ratioRule);

  if (capacity > 0 && children > capacity) {
    return {
      status: "over_capacity",
      tone: "destructive",
      label: "Over capacity",
      detail: `${children - capacity} child${children - capacity === 1 ? "" : "ren"} over licensed classroom capacity.`,
      requiredStaff: parsedRule ? Math.ceil(children / parsedRule.maxChildrenPerStaff) : null,
      maxChildrenForStaff: parsedRule ? Math.floor(staff * parsedRule.maxChildrenPerStaff) : null,
      overBy: children - capacity,
    };
  }

  if (!parsedRule) {
    return {
      status: "missing_rule",
      tone: "outline",
      label: "Needs ratio rule",
      detail: "Add this classroom's licensing ratio rule to enable live ratio warnings.",
      requiredStaff: null,
      maxChildrenForStaff: null,
      overBy: 0,
    };
  }

  const requiredStaff = children > 0 ? Math.ceil(children / parsedRule.maxChildrenPerStaff) : 0;
  const maxChildrenForStaff = Math.floor(staff * parsedRule.maxChildrenPerStaff);

  if (children > 0 && staff <= 0) {
    return {
      status: "missing_staff",
      tone: "destructive",
      label: "No teacher assigned",
      detail: `${requiredStaff} teacher${requiredStaff === 1 ? "" : "s"} required for ${children} child${children === 1 ? "" : "ren"}.`,
      requiredStaff,
      maxChildrenForStaff,
      overBy: children,
    };
  }

  if (children > maxChildrenForStaff) {
    return {
      status: "over_ratio",
      tone: "destructive",
      label: "Ratio warning",
      detail: `${requiredStaff} teacher${requiredStaff === 1 ? "" : "s"} required; ${staff} assigned.`,
      requiredStaff,
      maxChildrenForStaff,
      overBy: children - maxChildrenForStaff,
    };
  }

  if (requiredStaff > 0 && staff === requiredStaff) {
    return {
      status: "near_limit",
      tone: "secondary",
      label: "At ratio limit",
      detail: `${staff} teacher${staff === 1 ? "" : "s"} covers up to ${maxChildrenForStaff} child${maxChildrenForStaff === 1 ? "" : "ren"}.`,
      requiredStaff,
      maxChildrenForStaff,
      overBy: 0,
    };
  }

  return {
    status: "healthy",
    tone: "default",
    label: "Ratio healthy",
    detail: `${staff} teacher${staff === 1 ? "" : "s"} assigned for ${children} child${children === 1 ? "" : "ren"}.`,
    requiredStaff,
    maxChildrenForStaff,
    overBy: 0,
  };
}
