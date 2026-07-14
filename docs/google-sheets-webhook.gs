const SHEET_NAME = "consultation_requests";
const HEADERS = [
  "submitted_at",
  "name",
  "phone",
  "business_name",
  "business_number",
  "email",
  "industry",
  "annual_revenue",
  "needed_fund",
  "existing_loan",
  "overdue_tax",
  "interest",
  "message",
  "privacy_agreed",
  "source",
  "user_agent",
];

function doPost(event) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty(
    "GOOGLE_SHEETS_WEBHOOK_SECRET",
  );

  let body;
  try {
    body = JSON.parse(event.postData.contents || "{}");
  } catch (error) {
    return json({ ok: false, message: "Invalid JSON" });
  }

  if (!expectedSecret || body.secret !== expectedSecret) {
    return json({ ok: false, message: "Unauthorized" });
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  ensureHeaders(sheet);

  const data = body.data || {};
  sheet.appendRow([
    body.submitted_at || new Date().toISOString(),
    data.name || "",
    data.phone || "",
    data.business_name || "",
    data.business_number || "",
    data.email || "",
    data.industry || "",
    data.annual_revenue || "",
    data.needed_fund || "",
    data.existing_loan || "",
    data.overdue_tax || "",
    data.interest || "",
    data.message || "",
    data.privacy_agreed === true,
    data.source || "",
    data.user_agent || "",
  ]);

  return json({ ok: true });
}

function ensureHeaders(sheet) {
  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = HEADERS.every((header, index) => currentHeaders[index] === header);

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
