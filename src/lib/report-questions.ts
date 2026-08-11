export type ReportQuestionSection =
  | "Datakwaliteit"
  | "Algemeen"
  | "Voortgang"
  | "Tussenresultaten"
  | "Activiteiten en planning"
  | "Samenwerking"
  | "Financieel";

export type ReportQuestionPriority = "BLOCKER" | "HIGH" | "NORMAL";

export interface ReportQuestion {
  id: string;
  section: ReportQuestionSection;
  priority: ReportQuestionPriority;
  question: string;
  knownEvidence?: string;
  reason: string;
}

interface QuestionSteeringInput {
  totals: {
    reportableHours: number;
    unapprovedPastHours: number;
    futureHours: number;
  };
  participants: Array<{
    id: string;
    category: string;
    label: string;
    questionableWorkPackageHours: number;
    signal: string;
    reportableHours?: number;
    budgetHours?: number;
  }>;
  workPackages: Array<{
    code: string;
    name: string;
    reportableHours: number;
    futureHours: number;
    outsidePhaseHours: number;
    signal: string;
  }>;
}

interface QuestionFinancialInput {
  blockers: readonly string[];
  totals: {
    pendingInvoiceMappingEuros: number;
    unmappedInvoiceEuros: number;
    classificationPendingEuros: number;
  };
}

export interface BuildReportQuestionsInput {
  steering: QuestionSteeringInput;
  financial: QuestionFinancialInput;
  clientCount: number;
  trainingCount: number;
  presentTrainingAttendees: number;
  trainingHourEntryCount: number;
  vatRecoverable: boolean;
  therapistSurveyResponseCount: number;
}

function hours(value: number) {
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(value)} uur`;
}

function euros(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function stableQuestionKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildReportQuestions(input: BuildReportQuestionsInput): ReportQuestion[] {
  const questions: ReportQuestion[] = [
    {
      id: "model-d-planning",
      section: "Algemeen",
      priority: "HIGH",
      question:
        "Zijn de werkzaamheden uitgevoerd volgens de oorspronkelijke planning? Zo nee: welke onderdelen zijn verschoven en wat betekent dit voor de rest van de planning?",
      knownEvidence:
        "Formele start 1 september 2025; in de administratie staan de eerste inhoudelijke uren vanaf maart 2026.",
      reason: "Verplicht onderdeel van RVO Model D.",
    },
    {
      id: "model-d-bottlenecks",
      section: "Algemeen",
      priority: "HIGH",
      question:
        "Welke knelpunten deden zich voor, wanneer, en wat waren de inhoudelijke én financiële gevolgen?",
      reason: "Verplicht onderdeel van RVO Model D; uren alleen geven hier geen antwoord op.",
    },
    {
      id: "model-d-external-developments",
      section: "Algemeen",
      priority: "NORMAL",
      question:
        "Welke externe ontwikkelingen of organisatorische veranderingen beïnvloedden de uitvoering of het beoogde resultaat?",
      reason: "Verplicht onderdeel van RVO Model D.",
    },
    {
      id: "model-d-digitised-processes",
      section: "Voortgang",
      priority: "HIGH",
      question:
        "Welke onderdelen van het zorgproces voor mensen met beperkte basisvaardigheden zijn in deze periode concreet gedigitaliseerd of hybride gemaakt?",
      reason: "RVO vraagt een beschrijving van de gedigitaliseerde zorg- of ondersteuningsprocessen.",
    },
    {
      id: "model-d-implementation",
      section: "Voortgang",
      priority: "HIGH",
      question:
        "Welke activiteiten zijn uitgevoerd om de digitale en hybride processen te implementeren en op te schalen, en wat is aantoonbaar opgeleverd?",
      reason: "RVO vraagt uitvoering én opschaling; uren zijn alleen ondersteunend bewijs.",
    },
    {
      id: "model-d-embedding",
      section: "Voortgang",
      priority: "HIGH",
      question:
        "Wat is al ingebed in de reguliere werkprocessen, welke werkwijzen zijn nog pilot en wat moet nog worden geborgd?",
      reason: "Verplicht onderdeel van RVO Model D.",
    },
    {
      id: "model-d-staff-support",
      section: "Voortgang",
      priority: "HIGH",
      question:
        "Hoe zijn medewerkers betrokken, gestimuleerd en ondersteund, en welk effect had de training op hun handelen in de praktijk?",
      knownEvidence:
        input.trainingCount > 0
          ? `${input.trainingCount} training(en) geregistreerd met ${input.presentTrainingAttendees} aanwezige deelnemers.`
          : "Nog geen training geregistreerd.",
      reason: "RVO vraagt activiteiten én tussenresultaten voor zorgmedewerkers.",
    },
    {
      id: "model-d-clients",
      section: "Voortgang",
      priority: "HIGH",
      question:
        "Hoe zijn cliënten en eventueel mantelzorgers betrokken en ondersteund, en hoeveel cliënten gebruikten welke digitale hulpmiddelen?",
      knownEvidence: `${input.clientCount} cliëntregistratie(s) in de projectadministratie.`,
      reason: "RVO vraagt cliëntbetrokkenheid en bereikte aantallen.",
    },
    {
      id: "model-d-monitoring",
      section: "Tussenresultaten",
      priority: "HIGH",
      question:
        "Hoe is monitoring en evaluatie ingericht, welke indicatoren worden gemeten en welke gegevens zijn al beschikbaar?",
      reason: "Verplicht onderdeel van RVO Model D en kern van WP6.",
    },
    {
      id: "model-d-impact",
      section: "Tussenresultaten",
      priority: "NORMAL",
      question:
        "Welke voorlopige impact is zichtbaar op kwaliteit, toegankelijkheid, betaalbaarheid en duurzaamheid, en op welke gegevens is dat gebaseerd?",
      reason: "RVO vraagt voorlopige impact indien beschikbaar; zonder brondata mag geen effect worden geclaimd.",
    },
    {
      id: "model-d-knowledge-sharing",
      section: "Tussenresultaten",
      priority: "NORMAL",
      question:
        "Welke lessen, kennis en ervaringen zijn al breder gedeeld, met wie en via welke aantoonbare activiteiten?",
      reason: "Verplicht onderdeel van RVO Model D en kern van WP5.",
    },
    {
      id: "model-d-purchaser",
      section: "Samenwerking",
      priority: "NORMAL",
      question:
        "Hoe verloopt de samenwerking met de inkoper en wat is gedaan om de hybride werkwijze in contractafspraken te borgen?",
      reason: "Verplicht samenwerkingsonderdeel van RVO Model D.",
    },
    {
      id: "model-d-supplier",
      section: "Samenwerking",
      priority: "NORMAL",
      question:
        "Hoe verloopt de samenwerking met leveranciers en hoe ondersteunen zij implementatie en opschaling?",
      reason: "Verplicht samenwerkingsonderdeel van RVO Model D.",
    },
    {
      id: "model-d-other-parties",
      section: "Samenwerking",
      priority: "NORMAL",
      question:
        "Welke andere partijen waren betrokken, wat leverden zij en hoe verliep die samenwerking?",
      reason: "Verplicht samenwerkingsonderdeel van RVO Model D.",
    },
  ];

  const monitoringQuestion = questions.find((question) => question.id === "model-d-monitoring");
  if (input.therapistSurveyResponseCount > 0 && monitoringQuestion) {
    monitoringQuestion.knownEvidence = `${input.therapistSurveyResponseCount} therapeutresponsen ontvangen als meting vóór brede implementatie; dit is nog geen effectmeting.`;
  } else {
    questions.unshift({
      id: "therapist-survey-missing",
      section: "Tussenresultaten",
      priority: "HIGH",
      question:
        "Voer de therapeutmeting vóór brede implementatie uit en leg responsaantal, schaalverdelingen en verwachtingen vast.",
      knownEvidence: "Nog geen therapeutrespons in de projectadministratie.",
      reason:
        "WP6 en Model D vragen een ingerichte monitoring; zonder respons is nog geen uitgangsmeting beschikbaar.",
    });
  }

  if (input.presentTrainingAttendees !== input.trainingHourEntryCount) {
    questions.unshift({
      id: "training-attendance-reconciliation",
      section: "Datakwaliteit",
      priority: "BLOCKER",
      question:
        "Reconcilieer de presentielijst op naam met de WP3-urenregels. Voeg alleen uren toe voor personen die aantoonbaar deelnamen en van wie inzet subsidiabel is.",
      knownEvidence: `${input.presentTrainingAttendees} aanwezigen tegenover ${input.trainingHourEntryCount} afzonderlijke WP3-urenregels.`,
      reason:
        "Een verschil is geen bewijs voor ontbrekende uren; personen, rollen, datum en begrotingsgrond moeten eerst overeenkomen.",
    });
  }

  if (!input.vatRecoverable) {
    questions.unshift({
      id: "vat-treatment-confirmation",
      section: "Financieel",
      priority: "BLOCKER",
      question:
        "Bevestig met de officiële goedgekeurde begroting of RVO hoe niet-verrekenbare btw in Model B moet worden opgenomen en per begrotingsregel begrensd.",
      knownEvidence: "Fy-fit kan btw volgens projectbevestiging niet verrekenen.",
      reason:
        "Niet-verrekenbare btw kan subsidiabel zijn, maar mag niet zonder bronbevestiging bovenop bedragen worden gezet die mogelijk al inclusief btw zijn verleend.",
    });
  }

  if (input.steering.totals.futureHours > 0) {
    questions.unshift({
      id: "future-hours",
      section: "Datakwaliteit",
      priority: "BLOCKER",
      question: `Er staat ${hours(input.steering.totals.futureHours)} op toekomstige datums. Zijn dit planningsregels of werkelijk uitgevoerde uren met een onjuiste datum?`,
      knownEvidence: "Toekomstige regels tellen niet mee als realisatie.",
      reason: "Een toekomstige datum kan niet als gerealiseerde inzet worden verantwoord.",
    });
  }

  if (input.steering.totals.unapprovedPastHours > 0) {
    questions.unshift({
      id: "unapproved-hours",
      section: "Datakwaliteit",
      priority: "BLOCKER",
      question: `Moet ${hours(input.steering.totals.unapprovedPastHours)} aan concept- of ingediende uren nog worden beoordeeld?`,
      reason: "Alleen goedgekeurde uren zijn financieel rapportageklaar.",
    });
  }

  for (const participant of input.steering.participants) {
    if (participant.signal === "OVER_BUDGET") {
      questions.unshift({
        id: `hours-over-budget-${stableQuestionKey(participant.category)}`,
        section: "Financieel",
        priority: "BLOCKER",
        question: `${participant.label} staat op ${hours(participant.reportableHours || 0)} tegenover ${hours(participant.budgetHours || 0)} begroot. Welke inzet verklaart de overschrijding en onder welke goedgekeurde begrotingsregel hoort die?`,
        reason: "Een overschrijding kan inhoudelijk terecht zijn, maar vraagt een herleidbare toelichting of formele herverdeling.",
      });
    }

    if (participant.questionableWorkPackageHours > 0) {
      questions.unshift({
        id: `participant-classification-${stableQuestionKey(participant.category)}`,
        section: "Datakwaliteit",
        priority: "BLOCKER",
        question: `${participant.label} heeft ${hours(participant.questionableWorkPackageHours)} op werkpakketten die niet logisch aansluiten op deze begrotingsrol. Wat was de feitelijke rol en onder welke begrotingspost hoort de inzet?`,
        reason: "Rol, werkpakket en begrotingspost moeten herleidbaar bij elkaar aansluiten.",
      });
    }
  }

  for (const workPackage of input.steering.workPackages) {
    if (workPackage.signal === "MISSING_REGISTRATION") {
      questions.unshift({
        id: `missing-registration-${workPackage.code}`,
        section: "Activiteiten en planning",
        priority: "HIGH",
        question: `${workPackage.code} (${workPackage.name}) is volgens het ingediende activiteitenplan gestart, maar heeft geen rapportageklare uren. Wat is inhoudelijk al uitgevoerd, door wie en met welk resultaat?`,
        reason: "Geen uren betekent niet automatisch geen inhoudelijke voortgang; dit moet door de projectleider worden geduid.",
      });
    }
    if (workPackage.signal === "CHECK_CLASSIFICATION") {
      questions.unshift({
        id: `work-package-classification-${workPackage.code}`,
        section: "Activiteiten en planning",
        priority: "BLOCKER",
        question: `${workPackage.code} bevat ${hours(workPackage.outsidePhaseHours)} buiten de ingediende planperiode. Klopt de classificatie, of is sprake van een planningsafwijking die in Model D moet worden toegelicht?`,
        reason: "Uren buiten de ingediende fase vragen een inhoudelijke verklaring of herclassificatie.",
      });
    }
  }

  if (input.clientCount === 0) {
    questions.unshift({
      id: "client-results-missing",
      section: "Tussenresultaten",
      priority: "BLOCKER",
      question:
        "Hoeveel cliënten hebben de digitale hulpmiddelen feitelijk gebruikt? Lever de telling per hulpmiddel en licht toe waar de bronregistratie staat.",
      knownEvidence: "De projectadministratie bevat nog 0 cliëntregistraties.",
      reason: "RVO vraagt bereikte cliëntaantallen; zonder bronregistratie is dat onderdeel niet onderbouwd.",
    });
  }

  if (input.financial.blockers.includes("INVOICE_AMOUNT_INVALID")) {
    questions.unshift({
      id: "invoice-amount-invalid",
      section: "Financieel",
      priority: "BLOCKER",
      question:
        "Corrigeer of onderbouw facturen met negatieve, niet-numerieke of intern niet-aansluitende bedragen voordat ze in Model B worden gebruikt.",
      knownEvidence:
        "Deze facturen tellen fail-closed niet mee in de bekende realisatie.",
      reason:
        "Bedrag ex. btw plus btw moet aansluiten op bedrag incl. btw en geen bedrag mag negatief of niet-eindig zijn.",
    });
  }

  if (input.financial.blockers.includes("APPROVED_BUDGET_FILE_MISSING")) {
    questions.unshift({
      id: "approved-budget-file-missing",
      section: "Financieel",
      priority: "BLOCKER",
      question:
        "Kun je het door RVO bij de beschikking gevoegde bestand ‘Goedgekeurde begroting (STOZ25-03851282).xlsx’ toevoegen?",
      knownEvidence:
        "De beschikking noemt €39.410 subsidie en twee correcties; de aangepaste XLSX ontbreekt lokaal.",
      reason: "De gereconstrueerde regels sluiten aan, maar het officiële bestand blijft de definitieve lijnbron.",
    });
  }

  if (input.financial.totals.classificationPendingEuros > 0) {
    questions.unshift({
      id: "financial-hour-classification-pending",
      section: "Financieel",
      priority: "BLOCKER",
      question: `Bepaal voor ${euros(input.financial.totals.classificationPendingEuros)} aan indicatieve urenwaarde of en onder welke verleende Model-B-regel deze inzet subsidiabel is.`,
      knownEvidence:
        "De uren zijn inhoudelijk geregistreerd, maar sluiten nog niet eenduidig aan op een verleende kostencategorie.",
      reason:
        "Werkpakketregistratie is geen automatische financiële goedkeuring; onbekende toerekening blijft buiten de realisatie.",
    });
  }

  if (input.financial.totals.pendingInvoiceMappingEuros > 0) {
    questions.unshift({
      id: "invoice-mapping-pending",
      section: "Financieel",
      priority: "BLOCKER",
      question: `Bevestig voor ${euros(input.financial.totals.pendingInvoiceMappingEuros)} aan facturen welke goedgekeurde begrotingsregel van toepassing is.`,
      reason: "Leveranciersnaam geeft alleen een voorstel; geen definitieve kostentoerekening.",
    });
  }

  if (input.financial.totals.unmappedInvoiceEuros > 0) {
    questions.unshift({
      id: "invoice-mapping-missing",
      section: "Financieel",
      priority: "BLOCKER",
      question: `Koppel ${euros(input.financial.totals.unmappedInvoiceEuros)} aan facturen handmatig aan een goedgekeurde begrotingsregel.`,
      reason: "Zonder koppeling kan geen betrouwbaar financieel totaal per categorie worden opgesteld.",
    });
  }

  return questions;
}
