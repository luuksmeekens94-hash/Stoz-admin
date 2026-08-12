import { createHash } from "node:crypto";
import {
  INTERIM_HOUR_TARGETS,
  type InterimBudgetLineKey,
  type InterimCatchUpProposal,
  type buildInterimHoursSteering,
} from "@/lib/interim-hour-steering";

export class InterimProposalError extends Error {}

export interface InterimProposalRequest {
  requestId: string;
  asOf: string;
  proposals: InterimCatchUpProposal[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_FIELDS = new Set(["requestId", "asOf", "proposals"]);
const PROPOSAL_FIELDS = new Set([
  "budgetLineKey",
  "title",
  "workPackageCode",
  "activityCode",
  "targetHours",
  "currentHours",
  "proposedHours",
  "rationale",
]);
const BUDGET_LINE_KEYS = new Set<string>(
  INTERIM_HOUR_TARGETS.map((target) => target.budgetLineKey),
);
const WORK_PACKAGE_CODES = new Set(["WP1", "WP2", "WP3", "WP4", "WP5", "WP6"]);

type InterimSteering = ReturnType<typeof buildInterimHoursSteering>;

function asRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InterimProposalError(`${label} moet een object zijn.`);
  }
  return value as Record<string, unknown>;
}

function exactString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new InterimProposalError(`${label} moet tekst zijn.`);
  }
  return value.trim();
}

function exactNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InterimProposalError(`${label} moet een getal zijn.`);
  }
  return value;
}

function budgetLineKey(value: unknown) {
  const key = exactString(value, "Begrotingsregel");
  if (!BUDGET_LINE_KEYS.has(key)) throw new InterimProposalError("Begrotingsregel is ongeldig.");
  return key as InterimBudgetLineKey;
}

function workPackageCode(value: unknown) {
  const code = exactString(value, "Werkpakket");
  if (!WORK_PACKAGE_CODES.has(code)) throw new InterimProposalError("Werkpakket is ongeldig.");
  return code as InterimCatchUpProposal["workPackageCode"];
}

export function parseInterimProposalRequest(value: unknown): InterimProposalRequest {
  const input = asRecord(value, "Het verzoek");
  const unknown = Object.keys(input).filter((key) => !REQUEST_FIELDS.has(key));
  if (unknown.length) throw new InterimProposalError(`Onbekend veld: ${unknown.join(", ")}.`);
  const requestId = exactString(input.requestId, "Request-id").toLowerCase();
  if (!UUID_PATTERN.test(requestId)) throw new InterimProposalError("Request-id moet een geldige UUID zijn.");
  const asOf = exactString(input.asOf, "Peildatum");
  if (!DATE_PATTERN.test(asOf)) throw new InterimProposalError("Peildatum moet een geldige datum zijn.");
  if (!Array.isArray(input.proposals) || input.proposals.length === 0 || input.proposals.length > 20) {
    throw new InterimProposalError("Er moet een niet-lege voorstelset zijn.");
  }
  const proposals: InterimCatchUpProposal[] = input.proposals.map((value, index) => {
    const row = asRecord(value, `Voorstel ${index + 1}`);
    const unknownProposalFields = Object.keys(row).filter((key) => !PROPOSAL_FIELDS.has(key));
    if (unknownProposalFields.length) {
      throw new InterimProposalError(`Onbekend veld in voorstel ${index + 1}: ${unknownProposalFields.join(", ")}.`);
    }
    return {
      budgetLineKey: budgetLineKey(row.budgetLineKey),
      title: exactString(row.title, "Titel"),
      workPackageCode: workPackageCode(row.workPackageCode),
      activityCode: exactString(row.activityCode, "Activiteit"),
      targetHours: exactNumber(row.targetHours, "Doeluren"),
      currentHours: exactNumber(row.currentHours, "Huidige uren"),
      proposedHours: exactNumber(row.proposedHours, "Voorsteluren"),
      rationale: exactString(row.rationale, "Onderbouwing"),
    };
  });
  return { requestId, asOf, proposals };
}

function canonicalProposal(proposal: InterimCatchUpProposal) {
  return JSON.stringify([
    proposal.budgetLineKey,
    proposal.title,
    proposal.workPackageCode,
    proposal.activityCode,
    proposal.targetHours,
    proposal.currentHours,
    proposal.proposedHours,
    proposal.rationale,
  ]);
}

export function buildInterimProposalRequestFingerprint(
  request: Pick<InterimProposalRequest, "asOf" | "proposals">,
) {
  const canonical = JSON.stringify([
    request.asOf,
    request.proposals.map(canonicalProposal).sort(),
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function validateInterimProposalRequest(
  request: InterimProposalRequest,
  steering: InterimSteering,
) {
  const expected = steering.proposals.map(canonicalProposal).sort();
  const received = request.proposals.map(canonicalProposal).sort();
  if (JSON.stringify(received) !== JSON.stringify(expected)) {
    throw new InterimProposalError(
      "De aanvulvoorstellen zijn niet meer actueel. Vernieuw het dashboard en beoordeel de nieuwe verschillen.",
    );
  }
  return request;
}
