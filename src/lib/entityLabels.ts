// Shared entity label map — customer-facing names for report entity types.
// Both JobStatus (MVP) and JobPlayground render redaction reports from this map.
export const entityLabels: Record<string, string> = {
  PERSON: "People",
  ORGANIZATION: "Organizations",
  EMAIL_ADDRESS: "Email addresses",
  CA_PHONE: "Phone numbers",
  IP_ADDRESS: "IP addresses",
  STREET_ADDRESS: "Street addresses",
  CA_POSTAL_CODE: "Postal codes",
  DATE_TIME: "Personal dates",
  CA_SIN: "Social Insurance Numbers",
  CA_HEALTH_CARD: "Health card numbers",
  CA_DRIVERS_LICENCE: "Driver’s licence numbers",
  CA_PASSPORT: "Passport numbers",
  CA_BANK_ACCOUNT: "Bank account details",
  CREDIT_CARD: "Credit card numbers",
  CARD_CVV: "Card security codes",
  IBAN_CODE: "IBANs",
  SENSITIVE_MEDICAL: "Medical information",
  CA_COURT_FILE_NUMBER: "Court file numbers",
}