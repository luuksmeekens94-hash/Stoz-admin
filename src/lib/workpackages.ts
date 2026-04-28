export const WORK_PACKAGES = [
  {
    code: "WP1",
    name: "Projectcoördinatie",
    activities: [
      { code: "A1.1", name: "Projectmanagement" },
      { code: "A1.2", name: "Kick-off" },
    ],
  },
  {
    code: "WP2",
    name: "Contentontwikkeling",
    activities: [
      { code: "A2.1", name: "Technisch" },
      { code: "A2.2", name: "Teksten" },
      { code: "A2.3", name: "Video's" },
    ],
  },
  {
    code: "WP3",
    name: "Scholing",
    activities: [
      { code: "A3.1", name: "Training communicatie" },
      { code: "A3.2", name: "Instructie tools" },
    ],
  },
  {
    code: "WP4",
    name: "Implementatie",
    activities: [
      { code: "A4.1", name: "Pilot Meijhorst" },
      { code: "A4.2", name: "Uitrol praktijk" },
    ],
  },
  {
    code: "WP5",
    name: "Verspreiding en borging",
    activities: [
      { code: "A5.1", name: "Kennisdeling" },
      { code: "A5.2", name: "Opschaling" },
    ],
  },
  {
    code: "WP6",
    name: "Monitoring en evaluatie",
    activities: [
      { code: "A6.1", name: "Monitoring" },
      { code: "A6.2", name: "Evaluatie" },
    ],
  },
] as const;
