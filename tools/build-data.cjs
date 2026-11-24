const fs = require("node:fs");
const path = require("node:path");
const { matchAdmission } = require("./admission-rules.cjs");
const nameReview = require("./major-matches.json");
const admissionNotices = require("./admission-notices.json");

const sheets = JSON.parse(fs.readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, ""));
const admissions = matchAdmission(sheets["전형정보"]);
const tracks = { general: "", bachelor: "_학사" };
const counts = {};
const records = [];
const profiles = [];
const profileKeys = new Map();

function keyOf(record) {
  return [record.school, record.field, record.major].map(item => item.normalize("NFC").replace(/\s+/g, "")).join("|");
}

const noticeKey = (track, school, major) => JSON.stringify([track, school.normalize("NFC"), major.normalize("NFC")]);
const noticeIndex = new Map();
const matchedNotices = new Set();
const notices = admissionNotices.map(({ school, majors, tracks, ...notice }, index) => {
  for (const track of tracks) {
    for (const major of majors) {
      const key = noticeKey(track, school, major);
      if (noticeIndex.has(key)) throw new Error("Duplicate admission notice: " + key);
      noticeIndex.set(key, index);
    }
  }
  return notice;
});

function count(raw, absolute = false) {
  const value = raw.trim().replace(/,/g, "");
  if (!/^-?\d+(?:\.0+)?$/.test(value)) return null;
  const quantity = Number(value);
  return absolute ? Math.abs(quantity) : quantity >= 0 ? quantity : null;
}

function rate(raw) {
  const value = raw.trim().replace(/,/g, "");
  const match = value.match(/^(\d+(?:\.\d+)?)(?:\s*:\s*1(?:\.0+)?)?$/);
  return match ? Number(match[1]) : null;
}

function readTrack(name) {
  const header = sheets[name].findIndex(row => row[0].trim() === "대학" && row[3].trim() === "모집단위");
  if (header < 0) throw new Error("Missing competition header in " + name);
  return sheets[name].slice(header + 1).flatMap((row) => {
    const [school, field, division, major, capacity, applicants, competition] = row.map(value => value.trim());
    return school && major ? [{
      school, field, division: division === "-" ? "" : division, major,
      capacity: count(capacity, true), applicants: count(applicants), rate: rate(competition)
    }] : [];
  });
}

function indexYear(yearRows) {
  const index = new Map();
  for (const row of yearRows) {
    const key = keyOf(row);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function reviewedNames(track, past, current) {
  const matched = new Map();
  const usedOldNames = new Set();
  const underReview = new Set();

  for (const entry of nameReview.matches) {
    if (!entry.tracks.includes(track)) continue;
    const oldKey = keyOf({ ...entry, major: entry.old });
    const newKey = keyOf({ ...entry, major: entry.new });
    const previous = past.get(oldKey) || [];
    const next = current.get(newKey) || [];
    if (previous.length !== 1 || next.length !== 1 || past.has(newKey) || current.has(oldKey)) {
      console.warn("Skipped confirmed name pair with changed or ambiguous rows:", entry.school, entry.old, entry.new, track);
      continue;
    }
    if (matched.has(newKey) || usedOldNames.has(oldKey)) {
      throw new Error("Reviewed name pairs overlap: " + entry.school + " " + entry.new);
    }
    matched.set(newKey, { previous: previous[0], note: entry.note, sources: entry.sources });
    usedOldNames.add(oldKey);
  }

  for (const entry of nameReview.review) {
    if (!entry.tracks.includes(track)) continue;
    const oldKey = keyOf({ ...entry, major: entry.old });
    const newKey = keyOf({ ...entry, major: entry.new });
    if (past.has(oldKey) && current.has(newKey) && !usedOldNames.has(oldKey) && !matched.has(newKey)) {
      underReview.add(oldKey);
      underReview.add(newKey);
    }
  }

  return { matched, usedOldNames, underReview };
}


function facts(row) {
  return row ? [row.capacity, row.applicants, row.rate] : null;
}

function append(track, older, newer, blocked = false, decision = null, review = false) {
  const row = newer || older;
  const plans = newer ? admissions(track, row.school, row.major, row.field, row.division) : [];
  const key = noticeKey(track, row.school, row.major);
  const notice = newer ? noticeIndex.get(key) : undefined;
  if (notice !== undefined) matchedNotices.add(key);
  let admission = null;
  if (plans.length) {
    const key = JSON.stringify(plans);
    if (!profileKeys.has(key)) {
      profileKeys.set(key, profiles.length);
      profiles.push(plans);
    }
    admission = profileKeys.get(key);
  }
  records.push({
    track, school: row.school, field: row.field, division: row.division, major: row.major,
    y25: facts(older), y26: facts(newer), blocked, admission,
    ...(notice !== undefined ? { notice } : {}),
    ...(decision ? { comparison: { previousName: older.major, note: decision.note, sources: decision.sources } } : {}),
    ...(review ? { review: true } : {})
  });
}

for (const [track, suffix] of Object.entries(tracks)) {
  const older = readTrack("경쟁률2025" + suffix);
  const newer = readTrack("경쟁률2026" + suffix);
  const past = indexYear(older);
  const current = indexYear(newer);
  const names = reviewedNames(track, past, current);
  let paired = 0;
  let ambiguous = 0;
  for (const key of new Set([...current.keys(), ...past.keys()])) {
    if (names.usedOldNames.has(key)) continue;
    const a = past.get(key) || [];
    const b = current.get(key) || [];
    const approved = names.matched.get(key);
    if (approved) {
      append(track, approved.previous, b[0], false, approved);
      paired++;
      continue;
    }
    if (a.length === 1 && b.length === 1) {
      append(track, a[0], b[0]);
      paired++;
      continue;
    }
    const blocked = a.length > 1 || b.length > 1;
    const pending = names.underReview.has(key);
    if (blocked) ambiguous++;
    for (const row of b) append(track, null, row, blocked, null, pending);
    for (const row of a) append(track, row, null, blocked, null, pending);
  }
  counts[track] = { y25: older.length, y26: newer.length, paired, ambiguous, renamed: names.matched.size };
}

const schools = new Set(records.map(row => row.school));
const totalSources = Object.values(counts).reduce((sum, count) => sum + count.y25 + count.y26, 0);
const pairedTotal = Object.values(counts).reduce((sum, count) => sum + count.paired, 0);

if (totalSources !== records.length + pairedTotal) throw new Error("Competition rows did not reconcile");
if (records.some(row => row.y25?.some(value => value != null && !Number.isFinite(value)) || row.y26?.some(value => value != null && !Number.isFinite(value)))) {
  throw new Error("Non-finite competition metric");
}
const unmatchedNotices = [...noticeIndex.keys()].filter(key => !matchedNotices.has(key));
if (unmatchedNotices.length) throw new Error("Admission notices without a current competition row: " + unmatchedNotices.join(", "));
const data = { title: "2026 편입통합검색.xlsx", schools: schools.size, totalSources, counts, records, admissions: profiles, notices };
const payload = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
fs.writeFileSync(path.join(__dirname, "..", "data.js"), "window.TRANSFER_DATA = " + payload + ";\n");
console.log(JSON.stringify({ schools: schools.size, sourceRows: totalSources, records: records.length, counts, linkedRows: records.filter(row => row.admission != null).length, profiles: profiles.length, noticeRows: records.filter(row => row.notice != null).length }));


