export class PrivacyTextError extends Error {}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DUTCH_PHONE_PATTERN =
  /(?<!\d)(?:(?:\+|00)31[\s()./-]?(?:\(0\)[\s()./-]?)?|0)(?:\d[\s()./-]*){9}(?!\d)/;
const NINE_DIGIT_PATTERN = /(?<!\d)(?:\d[\s.-]*){9}(?!\d)/;
const LABELLED_IDENTIFIER_PATTERN =
  /\b(?:naam|geboortedatum|adres|postcode|telefoon|mobiel|cliëntnummer|clientnummer|patientnummer|patiëntnummer|diagnose|aandoening|medicatie|behandeling)\s*:/i;
const POTENTIAL_FULL_NAME_PATTERN =
  /\b[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]{1,}(?:\s+(?:van|de|der|den|het|ten|ter|te)\s+|\s+)[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]{1,}\b/;
const BIRTH_DATE_PATTERN =
  /\b(?:geboren|geboortedatum)\b(?:\s*(?:op|is|:|-))?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/i;
const LABELLED_PERSON_NUMBER_PATTERN =
  /\b(?:pati[eë]nt|cli[eë]nt)(?:nummer|nr\.?)?\s*[:#=-]?\s*\d{6,12}\b/i;
const LABELLED_BSN_PATTERN =
  /\bbsn(?:nummer|nr\.?)?\b\s*[:#=-]?\s*(?:\d[\s.-]*){9}(?!\d)/i;
const LABELLED_NAME_PATTERN =
  /\b(?:naam|cli[eë]ntnaam|pati[eë]ntnaam)\b\s*(?::|=|-|is)?\s*[a-zà-öø-ÿ'’-]{2,}(?:\s+(?:van|de|der|den|het|ten|ter|te)\s+|\s+)[a-zà-öø-ÿ'’-]{2,}\b/i;
const CONTEXTUAL_NAME_PATTERN =
  /(?:\b(?!(?:de|het|een|interne|externe|project)\s)[a-zà-öø-ÿ'’-]{2,}\s+[a-zà-öø-ÿ'’-]{2,}\s+(?:bevestigde|verklaarde|mailde|belde|besprak|voerde|heeft)\b|\b(?:door|met)\s+(?!(?:de|het|een|interne|externe)\s)(?:(?:dhr|mevr|mw)\.?\s+)?(?:[a-zà-öø-ÿ'’-]{2,}|[a-z]\.)\s+[a-zà-öø-ÿ'’-]{2,}(?=\s+(?:met|in|voor|die|heeft|bevestigde|verklaarde)|\s*[,.;]|$))/i;

export function assertNoDirectIdentifiers(text: string, fieldLabel: string) {
  if (!text) return;
  const normalizedText = text.normalize("NFKC").replace(/[·•]/g, " ");
  if (
    EMAIL_PATTERN.test(normalizedText) ||
    DUTCH_PHONE_PATTERN.test(normalizedText) ||
    NINE_DIGIT_PATTERN.test(normalizedText) ||
    LABELLED_IDENTIFIER_PATTERN.test(normalizedText) ||
    POTENTIAL_FULL_NAME_PATTERN.test(normalizedText) ||
    BIRTH_DATE_PATTERN.test(normalizedText) ||
    LABELLED_PERSON_NUMBER_PATTERN.test(normalizedText) ||
    LABELLED_BSN_PATTERN.test(normalizedText) ||
    LABELLED_NAME_PATTERN.test(normalizedText) ||
    CONTEXTUAL_NAME_PATTERN.test(normalizedText)
  ) {
    throw new PrivacyTextError(
      `Voer in ${fieldLabel.toLowerCase()} geen directe persoonsgegevens, contactgegevens of gelabelde gezondheidsgegevens in.`,
    );
  }
}
