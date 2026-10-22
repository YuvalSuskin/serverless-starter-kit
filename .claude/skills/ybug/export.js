// Run with the built-in browser's javascript_tool on a Ybug project's reports
// page (https://app.ybug.io/projects/<id>/reports), signed in as the owner.
// It does what the page's "Export to CSV" link does, without the download:
// ask for an export, poll until the CSV is ready, then parse it. The last
// expression is the result: one object per report.

// The key in the CSV's `User Data` column that holds a session-replay link. It
// is set when the widget is added (the analytics tool the project uses writes
// it); a report without it simply has no replay link.
const REPLAY_FIELD = "posthog_replay_url";

const start = await fetch(location.href.replace(/\/reports/, "/export-reports"));
if (!start.ok) throw new Error(`export request: HTTP ${start.status}`);
const { uuid, token } = await start.json();
const ready = `/data/export/${encodeURIComponent(uuid)}?_token=${encodeURIComponent(token)}`;

let csv = null;
for (let attempt = 0; attempt < 30 && csv === null; attempt++) {
  const res = await fetch(ready);
  const type = res.headers.get("content-type") ?? "";
  if (res.ok && type.includes("csv")) csv = await res.text();
  else await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (csv === null) throw new Error("export not ready after a minute");

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
const rows = [];
let row = [];
let field = "";
let quoted = false;
for (let i = 0; i < csv.length; i++) {
  const c = csv[i];
  if (quoted) {
    if (c === '"' && csv[i + 1] === '"') ((field += '"'), i++);
    else if (c === '"') quoted = false;
    else field += c;
  } else if (c === '"') quoted = true;
  else if (c === ",") (row.push(field), (field = ""));
  else if (c === "\n" || c === "\r") {
    if (c === "\r" && csv[i + 1] === "\n") i++;
    (row.push(field), rows.push(row), (row = []), (field = ""));
  } else field += c;
}
if (field !== "" || row.length > 0) (row.push(field), rows.push(row));

const [header, ...records] = rows.filter((r) => r.some((cell) => cell !== ""));
const col = (name) => header.indexOf(name);
const userData = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

records.map((r) => ({
  number: Number(r[col("Report ID")]),
  key: r[col("Key")],
  title: r[col("Title")],
  status: r[col("Status")],
  url: r[col("Url")],
  comment: r[col("Comment")],
  createdAt: r[col("Created At")],
  replayUrl: userData(r[col("User Data")])[REPLAY_FIELD] ?? null,
  reportUrl: r[col("Report Url")],
}));
