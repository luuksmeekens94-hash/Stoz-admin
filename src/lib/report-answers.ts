import type { ReportQuestion } from "@/lib/report-questions";

export type ResolvedReportAnswer = {
  question: ReportQuestion;
  answer: string;
  decidedOn: string;
  decidedBy: string;
};

const DECIDED_ON = "2026-08-10";
const DECIDED_BY = "Projecteigenaar";
const DECIDED_ON_BY_ID: Record<string, string> = {
  "hours-over-budget-websitebouwer": "2026-08-14",
  "hours-over-budget-fysiotherapeuten": "2026-08-14",
  "financial-hour-classification-pending": "2026-08-14",
  "training-attendance-reconciliation": "2026-08-14",
};

const ANSWERS_BY_ID: Record<string, string> = {
  "hours-over-budget-websitebouwer":
    "De websiteleverancier heeft operationeel 56 uur besteed aan WP2. De extra 31 uur ten opzichte van de oorspronkelijke 25 uur waren nodig voor onderdeel B1, de balans tussen SEO en inhoudelijke optimalisatie en de Arabische en Turkse versie. Zonder gekoppelde factuur worden deze uren in het huidige Model B op €0 actual gezet en pas in een latere rapportage als gemaakte kosten opgenomen; dit is daarom geen blocker voor het huidige voortgangsverslag.",
  "hours-over-budget-fysiotherapeuten":
    "Van de 96 geregistreerde fysiotherapie-uren vallen 68 uur onder implementatie en 28 uur onder opleiding. Voor 60 uur bestaat de verleende implementatieregel. De 8 implementatie-uren daarboven blijven zichtbaar als boven begroting en worden niet onvoorwaardelijk subsidiabel geclaimd zolang een formele herverdeling ontbreekt. De 28 opleidingsuren worden tegen het bevestigde interne waarderingstarief van €35 per uur als operationele scholingsdeelname geclassificeerd: €980 zichtbaar buiten Model B, zonder subsidieclaim of overhead.",
  "approved-budget-file-missing":
    "De gedeelde verleningsbeschikking van RVO en de ingediende Model B-begroting worden samen als leidende financiële bron gebruikt. De in de beschikking gewijzigde bedragen en subsidieverlening gaan voor op de oorspronkelijke begroting.",
  "financial-hour-classification-pending":
    "Registreer uren in de inhoudelijk passende categorie. De fysiotherapeutische opleidingsdeelname wordt tegen €35 per uur operationeel gewaardeerd en transparant buiten Model B gehouden; alleen de passende implementatie-inzet telt mee als subsidiabele realisatie.",
  "vat-treatment-confirmation":
    "Fy-fit kan de btw voor dit project niet verrekenen. Niet-verrekenbare btw maakt daarom onderdeel uit van de projectkosten. Voor leverancierskosten wordt dit toegepast op basis van de facturen; de financiële onderbouwing toont bedragen inclusief niet-verrekenbare btw.",
  "work-package-classification-WP2":
    "WP2 betreft inhoudsontwikkeling en vakinhoudelijke expertise voor de digitale toepassing. De inzet van fysiotherapeuten wordt daarom onder Implementatie geregistreerd, met WP2 als inhoudelijke herkomst.",
  "missing-registration-WP5":
    "In de huidige verslagperiode is voor WP5 nog geen afzonderlijke inzet geregistreerd. De werkzaamheden starten volgens planning vanaf augustus 2026; voortgang wordt vanaf die start als afzonderlijke forecast en realisatie vastgelegd.",
  "missing-registration-WP6":
    "Monitoring en evaluatie bestaan uit cliëntmetingen vóór en na afronding van het traject, circa drie maanden na afronding, aangevuld met behandelresultaten en een vragenlijst onder fysiotherapeuten. De basis is ingericht; de gegevensverzameling loopt mee met de gefaseerde implementatie.",
  "future-hours":
    "De bevestigde datumcorrectie is via de gespecialiseerde reconstructieroute verwerkt, met behoud van uren, activiteiten en auditspoor. Na de rapportagepeildatum staan daardoor geen gerealiseerde uren meer geregistreerd.",
  "training-attendance-reconciliation":
    "De presentielijst van de bevestigde training is leidend. Alleen aantoonbare deelname wordt geregistreerd, tot maximaal twee uur per deelnemer. Deze inzet wordt tegen €35 per uur gewaardeerd en zichtbaar buiten Model B gehouden; naamvarianten worden als dezelfde persoon behandeld.",
  "client-results-missing":
    "Er zijn nog geen volledige cliënttrajecten met een afgeronde voor- en nameting in de administratie. De eerste voortgangsrapportage vermeldt daarom dat cliëntuitkomsten nog niet beschikbaar zijn en dat meting volgt na afronding van de eerste trajecten.",
  "therapist-survey-missing":
    "De vragenlijst voor fysiotherapeuten wordt verstuurd zodra de implementatiefase voldoende ervaring heeft opgeleverd. De vragenlijst is inhoudelijk voorbereid; in deze verslagperiode zijn nog geen uitkomsten beschikbaar.",
  "model-d-planning":
    "De werkzaamheden zijn niet volledig volgens de oorspronkelijke tijdslijn uitgevoerd. De feitelijke uitvoering startte in maart 2026, later dan de formele projectstart. De resterende implementatie-, borgings- en evaluatieactiviteiten worden in de operationele forecast vastgelegd met datum, uitvoerder en uren. Op dit moment is geen wijziging van de formele einddatum voorzien.",
  "model-d-bottlenecks":
    "De latere feitelijke start en het nog beperkte aantal afgeronde cliënttrajecten beperken de beschikbaarheid van uitkomstgegevens. Daarnaast wijkt de inzet per kostencategorie af van de verleende begroting. Deze afwijkingen worden transparant gerapporteerd; alleen kosten met een herleidbare financiële bron worden als gemaakte kosten opgenomen.",
  "model-d-external-developments":
    "In de verslagperiode zijn geen afzonderlijke externe ontwikkelingen of organisatorische veranderingen geregistreerd die naast de latere feitelijke start aantoonbaar van invloed zijn op de projectuitvoering.",
  "model-d-digitised-processes":
    "Gerealiseerd is een digitale meertalige informatievoorziening rond zorgpaden, met digitale patiëntinformatie en video’s als voorbereiding en ondersteuning van het behandeltraject. De inhoud en vindbaarheid worden stapsgewijs uitgebreid.",
  "model-d-implementation":
    "Er is geïnventariseerd, vakinhoud is ontwikkeld en vertaald, digitale content en video zijn geproduceerd en de toepassing is technisch ingericht. De opschaling verloopt gefaseerd per zorgpad, zodat inhoud en werkproces tijdens gebruik kunnen worden aangescherpt.",
  "model-d-digitalized-process":
    "Gerealiseerd is een digitale meertalige informatievoorziening rond zorgpaden, met digitale patiëntinformatie en video’s als voorbereiding en ondersteuning van het behandeltraject. De inhoud en vindbaarheid worden stapsgewijs uitgebreid.",
  "model-d-implementation-scaling":
    "Er is geïnventariseerd, vakinhoud is ontwikkeld en vertaald, digitale content en video zijn geproduceerd en de toepassing is technisch ingericht. De opschaling verloopt gefaseerd per zorgpad, zodat inhoud en werkproces tijdens gebruik kunnen worden aangescherpt.",
  "model-d-embedding":
    "De digitale informatie wordt gekoppeld aan intake, behandelplan en vervolgmomenten. Patiënten krijgen gerichte informatie vooraf en tijdens het traject; de fysiotherapeut gebruikt dezelfde content in de begeleiding. Borging in alle reguliere werkprocessen is nog in uitvoering.",
  "model-d-staff-engagement":
    "Fysiotherapeuten zijn betrokken via een praktijktraining, vakinhoudelijke inhoudsontwikkeling en feedback op toepasbaarheid. Vijftien aanwezige medewerkers zijn als cursist geregistreerd. Verdere ondersteuning gebeurt tijdens de gefaseerde invoering.",
  "model-d-staff-support":
    "Fysiotherapeuten zijn betrokken via een praktijktraining, vakinhoudelijke inhoudsontwikkeling en feedback op toepasbaarheid. De presentielijst en urenadministratie sluiten aan op vijftien aanwezige medewerkers van ieder twee uur. Verdere ondersteuning vindt plaats tijdens de gefaseerde invoering.",
  "model-d-client-engagement":
    "Patiënten krijgen eenvoudige meertalige informatie en ondersteunende video’s. De eerste gebruiks- en uitkomstmetingen volgen bij afgeronde trajecten; er zijn nu nog geen volledige voor- en nametingen beschikbaar.",
  "model-d-clients":
    "Patiënten krijgen eenvoudige meertalige informatie en ondersteunende video’s. De eerste gebruiks- en uitkomstmetingen volgen bij afgeronde trajecten; er zijn nu nog geen volledige voor- en nametingen beschikbaar.",
  "model-d-monitoring":
    "De monitoring combineert cliëntmetingen vóór en na het traject, een meting circa drie maanden na afronding, behandelresultaten en een vragenlijst onder fysiotherapeuten. De registratiebasis is ingericht en wordt gevuld naarmate meer trajecten worden afgerond.",
  "model-d-impact":
    "Er zijn nog onvoldoende afgeronde trajecten voor een betrouwbare kwantitatieve impactuitspraak. De verwachte bijdrage ligt in beter begrip, betere voorbereiding, consistente informatie en efficiëntere begeleiding. Dit wordt in volgende verslagperioden getoetst met cliënt- en medewerkergegevens.",
  "model-d-knowledge-sharing":
    "Kennisdeling gebeurt voorlopig binnen Fy-fit via training, gezamenlijke inhoudsontwikkeling en gebruiksfeedback. De externe verspreiding van lessen en herbruikbare werkwijzen is voorzien in de latere activiteiten van WP5.",
  "model-d-activity-status":
    "De voortgang wordt per goedgekeurde activiteit weergegeven in de conceptversie van Model D, met oorspronkelijke planning, feitelijke status en bijzonderheden. De projectadministratie blijft leidend voor de verdere actualisatie.",
  "model-d-collaboration":
    "De uitvoering vindt plaats binnen Fy-fit met de praktijkhouders, praktijkmanager, fysiotherapeuten, front- en backoffice, de externe projectmanager en leveranciers. Specifieke borging met inkopers en bredere externe partners is nog beperkt en wordt in de volgende fase verder uitgewerkt.",
  "model-d-purchaser":
    "De samenwerking met de inkoper is in deze verslagperiode nog beperkt. Er zijn nog geen afzonderlijke contractafspraken over de digitale of hybride werkwijze vastgelegd. Borging met inkopers is voorzien binnen WP5 en wordt in de volgende fase concreter uitgewerkt.",
  "model-d-supplier":
    "Leveranciers ondersteunen de technische realisatie, website en digitale content. Leveranciersinzet blijft operationeel zichtbaar, maar wordt in het financiële verslag alleen als gemaakte kosten opgenomen wanneer een factuur of betaalbewijs aanwezig en gekoppeld is.",
  "model-d-other-parties":
    "De samenwerking met overige betrokken partijen staat in deze fase vooral in het teken van interne implementatie. Regionale samenwerking en bredere kennisdeling worden vanaf WP5 verder opgebouwd.",
  "model-d-planning-deviations":
    "De activiteiten lopen inhoudelijk door, maar de financiële realisatie wijkt per kostencategorie af van de oorspronkelijke verdeling. Er wordt niet kunstmatig gestopt op een subsidiebudgetgrens: operationeel benodigde inzet wordt apart geforecast met datum, uitvoerder en uren; financiële dekking en begrotingsafwijkingen blijven afzonderlijk zichtbaar.",
};

export function resolveReportQuestions(questions: ReportQuestion[]): {
  openQuestions: ReportQuestion[];
  resolvedAnswers: ResolvedReportAnswer[];
} {
  const openQuestions: ReportQuestion[] = [];
  const resolvedAnswers: ResolvedReportAnswer[] = [];

  for (const question of questions) {
    const answer = ANSWERS_BY_ID[question.id];
    if (!answer) {
      openQuestions.push(question);
      continue;
    }

    resolvedAnswers.push({
      question,
      answer,
      decidedOn: DECIDED_ON_BY_ID[question.id] || DECIDED_ON,
      decidedBy: DECIDED_BY,
    });
  }

  return { openQuestions, resolvedAnswers };
}
