export interface InterimSuggestionActor {
  key: string;
  name: string;
}

export interface InterimMaterializationSuggestion {
  key: string;
  actorKey: string;
  actorName: string;
  date: string;
  hours: number;
  description: string;
}

const DESCRIPTION_TEMPLATES: Record<string, string[]> = {
  "WP2|A2.2": [
    "Inhoudelijke teksten beoordeeld en aangescherpt voor gebruik in de praktijk.",
    "Praktijkinput verwerkt in teksten en afgestemd met de betrokken projectleden.",
    "Conceptteksten gecontroleerd op begrijpelijkheid en toepasbaarheid in de werksetting.",
  ],
  "WP3|A3.1": [
    "Communicatietraining voorbereid en afgestemd met het behandelteam.",
    "Trainingsmateriaal doorgenomen en vertaald naar concrete communicatieafspraken.",
    "Communicatietraining uitgevoerd en leerpunten met de betrokken collega's besproken.",
  ],
  "WP4|A4.1": [
    "Eerste implementatie voorbereid en werkafspraken voor de pilot concreet gemaakt.",
    "Collega's begeleid bij de eerste implementatiestappen en praktische vragen opgehaald.",
    "Pilotervaringen besproken en de implementatieaanpak op basis van feedback bijgesteld.",
    "Praktijkproces ingericht voor de implementatie en verantwoordelijkheden afgestemd.",
    "Eerste gebruiksmomenten geëvalueerd en vervolgacties voor de implementatie vastgelegd.",
  ],
};

function subtractUtcDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function proposalOffset(proposalId: string) {
  return Array.from(proposalId).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 9;
}

function proposedDates(asOf: string, proposalId: string, count: number) {
  const weekdayPattern = [4, 1, 4, 1, 3] as const;
  const dates: string[] = [];
  let cursor = subtractUtcDays(asOf, proposalOffset(proposalId));
  for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
    const wantedWeekday = weekdayPattern[rowIndex % weekdayPattern.length];
    for (let guard = 0; guard < 14; guard += 1) {
      const weekday = new Date(`${cursor}T00:00:00.000Z`).getUTCDay();
      if (weekday === wantedWeekday) {
        dates.push(cursor);
        cursor = subtractUtcDays(cursor, 1);
        break;
      }
      cursor = subtractUtcDays(cursor, 1);
    }
  }
  return dates.reverse();
}

function distributeHours(totalHours: number, rowCount: number) {
  const totalQuarters = Math.round(totalHours * 4);
  const baseQuarters = Math.floor(totalQuarters / rowCount);
  let remainder = totalQuarters - baseQuarters * rowCount;
  return Array.from({ length: rowCount }, () => {
    const quarters = baseQuarters + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return quarters / 4;
  });
}

export function buildInterimMaterializationSuggestions(input: {
  proposalId: string;
  workPackageCode: string;
  activityCode: string;
  activityName: string;
  remainingHours: number;
  asOf: string;
  actors: InterimSuggestionActor[];
  priorContributors: string[];
}): InterimMaterializationSuggestion[] {
  if (input.remainingHours <= 0 || !Number.isInteger(input.remainingHours * 4)) return [];
  const actorByKey = new Map(input.actors.map((actor) => [actor.key, actor]));
  const contributors = Array.from(new Set(input.priorContributors))
    .flatMap((key) => actorByKey.get(key) ? [actorByKey.get(key)!] : []);
  if (contributors.length === 0) return [];

  const rowCount = Math.ceil(input.remainingHours / 4);
  const dates = proposedDates(input.asOf, input.proposalId, rowCount);
  const hours = distributeHours(input.remainingHours, rowCount);
  const templates = DESCRIPTION_TEMPLATES[`${input.workPackageCode}|${input.activityCode}`] || [
    `${input.activityName} voorbereid, uitgevoerd en met de betrokken projectleden afgestemd.`,
  ];

  return dates.map((date, index) => {
    const actor = contributors[index % contributors.length];
    return {
      key: `${input.proposalId}-${index + 1}`,
      actorKey: actor.key,
      actorName: actor.name,
      date,
      hours: hours[index],
      description: templates[index % templates.length],
    };
  });
}
