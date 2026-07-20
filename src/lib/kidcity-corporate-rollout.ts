export type KidCityCorporateRolloutSchool = {
  location: string;
  requestedEmail: string;
  canonicalEmail: string;
  pilot?: boolean;
};

export const kidCityCorporateRolloutSchools = [
  {
    location: "Garland",
    requestedEmail: "garland@kidcityus.com",
    canonicalEmail: "garland@kidcityusa.com",
  },
  {
    location: "Granbury",
    requestedEmail: "granbury1@kidcityusa.com",
    canonicalEmail: "granbury@kidcityusa.com",
  },
  {
    location: "North Richland Hills",
    requestedEmail: "northrichlandhills@kidcityusa.com",
    canonicalEmail: "northrichlandhills@kidcityusa.com",
  },
  {
    location: "Corpus Christi 2",
    requestedEmail: "corpuschristi2@kidcityusa.com",
    canonicalEmail: "corpuschristi2@kidcityusa.com",
  },
  {
    location: "Canton NC",
    requestedEmail: "cantonnc@kidcityusa.com",
    canonicalEmail: "cantonnc@kidcityusa.com",
  },
  {
    location: "Pisgah Forest",
    requestedEmail: "pisgahforest@kidcityusa.com",
    canonicalEmail: "pisgahforest@kidcityusa.com",
  },
  {
    location: "Lees Summit",
    requestedEmail: "leessummit@kidcityusa.com",
    canonicalEmail: "leessummit@kidcityusa.com",
  },
  {
    location: "Kokomo",
    requestedEmail: "kokomo@kidcityusa.com",
    canonicalEmail: "kokomo@kidcityusa.com",
  },
  {
    location: "Oakleaf",
    requestedEmail: "oakleaf@kidcityusa.com",
    canonicalEmail: "oakleaf@kidcityusa.com",
  },
  {
    location: "Holly Hill",
    requestedEmail: "hollyhill@kidcityusa.com",
    canonicalEmail: "hollyhill@kidcityusa.com",
  },
  {
    location: "Longmont",
    requestedEmail: "longmont@kidcityusa.com",
    canonicalEmail: "longmont@kidcityusa.com",
    pilot: true,
  },
  {
    location: "Cordera",
    requestedEmail: "cordera@kidcityusa.com",
    canonicalEmail: "cordera@kidcityusa.com",
  },
  {
    location: "Beach Blvd",
    requestedEmail: "beachblvd@kidcityusa.com",
    canonicalEmail: "beachblvd@kidcityusa.com",
  },
] as const satisfies readonly KidCityCorporateRolloutSchool[];

export function normalizeRolloutEmail(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export function rolloutSchoolEmailCandidates(
  school: Pick<KidCityCorporateRolloutSchool, "requestedEmail" | "canonicalEmail">,
) {
  return Array.from(
    new Set([school.requestedEmail, school.canonicalEmail].map(normalizeRolloutEmail).filter(Boolean)),
  );
}

export function rolloutSchoolEmailCorrections(
  schools: readonly KidCityCorporateRolloutSchool[] = kidCityCorporateRolloutSchools,
) {
  return schools
    .filter((school) => normalizeRolloutEmail(school.requestedEmail) !== normalizeRolloutEmail(school.canonicalEmail))
    .map((school) => ({
      location: school.location,
      requestedEmail: normalizeRolloutEmail(school.requestedEmail),
      canonicalEmail: normalizeRolloutEmail(school.canonicalEmail),
    }));
}
