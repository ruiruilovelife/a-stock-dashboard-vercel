import fs from "node:fs";

function chinaParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const pick = (type) => parts.find(p => p.type === type)?.value;
  const hour = Number(pick("hour")) % 24;
  const minute = Number(pick("minute"));
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    weekday: pick("weekday"),
    minutes: hour * 60 + minute
  };
}

function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync("data/dashboard.json", "utf8"));
  } catch {
    return {};
  }
}

function decision(previous, now = new Date()) {
  if (process.env.GITHUB_EVENT_NAME === "push" && process.env.GITHUB_ACTOR === "github-actions[bot]") {
    return { shouldRun: false, reason: "skip-bot-data-commit" };
  }
  if (process.env.GITHUB_EVENT_NAME !== "schedule") {
    return { shouldRun: true, reason: "manual-or-push" };
  }

  const { date, weekday, minutes } = chinaParts(now);
  const weekend = weekday === "Sat" || weekday === "Sun";
  const lastUpdated = String(previous?.meta?.lastUpdated || "").replace(/\//g, "-");
  const lastDate = lastUpdated.slice(0, 10);
  const lastSession = previous?.meta?.session || "";
  const updatedToday = lastDate === date;
  const inRange = (start, end) => minutes >= start && minutes <= end;
  const alreadyHas = (names) => updatedToday && names.includes(lastSession);

  if (weekend) {
    if (inRange(17 * 60, 18 * 60 + 30) && !alreadyHas(["周末复盘版"])) return { shouldRun: true, reason: "weekend-evening" };
    if (minutes > 18 * 60 + 30 && minutes < 23 * 60 && !alreadyHas(["周末复盘版"])) return { shouldRun: true, reason: "weekend-catchup" };
    return { shouldRun: false, reason: `weekend-skip last=${lastDate || "-"} ${lastSession || "-"}` };
  }

  if (inRange(8 * 60 + 35, 9 * 60 + 30) && !alreadyHas(["早盘指导版", "午间复盘版", "盘后复盘版"])) {
    return { shouldRun: true, reason: "morning-window" };
  }
  if (inRange(12 * 60 + 20, 13 * 60 + 20) && !alreadyHas(["午间复盘版", "盘后复盘版"])) {
    return { shouldRun: true, reason: "midday-window" };
  }
  if (inRange(17 * 60, 18 * 60 + 30) && !alreadyHas(["盘后复盘版"])) {
    return { shouldRun: true, reason: "after-close-window" };
  }
  if (minutes > 13 * 60 + 20 && minutes < 17 * 60 && !alreadyHas(["午间复盘版", "盘后复盘版"])) {
    return { shouldRun: true, reason: "midday-catchup" };
  }
  if (minutes > 18 * 60 + 30 && minutes < 23 * 60 && !alreadyHas(["盘后复盘版"])) {
    return { shouldRun: true, reason: "after-close-catchup" };
  }

  return { shouldRun: false, reason: `not-an-update-window last=${lastDate || "-"} ${lastSession || "-"}` };
}

const result = decision(readPrevious());
const output = process.env.GITHUB_OUTPUT;
if (output) {
  fs.appendFileSync(output, `should_run=${result.shouldRun ? "true" : "false"}\n`);
  fs.appendFileSync(output, `reason=${result.reason}\n`);
}
console.log(`schedule gate: ${result.shouldRun ? "run" : "skip"} (${result.reason}); event=${process.env.GITHUB_EVENT_NAME || "local"}`);
