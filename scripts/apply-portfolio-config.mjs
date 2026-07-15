import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("data/portfolio-config.json", "utf8"));
const target = "scripts/update-dashboard.mjs";
let source = fs.readFileSync(target, "utf8");

const stockLines = config.holdings.map(row => `  ${JSON.stringify(row)}`).join(",\n");
const stocksBlock = `const STOCKS = [\n${stockLines}\n];`;

const currentTracking = config.holdings.map(([symbol, name, code,, theme]) => [symbol, name, code, "当前持仓", theme]);
const currentCodes = new Set(currentTracking.map(row => row[2]));
const clearedTracking = (config.cleared || []).filter(row => !currentCodes.has(row[2]));
const trackingLines = [...currentTracking, ...clearedTracking].map(row => `  ${JSON.stringify(row)}`).join(",\n");
const trackingBlock = `const TRADE_TRACKING_BASE = [\n${trackingLines}\n];`;

source = source.replace(/const STOCKS = \[[\s\S]*?\];/, stocksBlock);
source = source.replace(/const TRADE_TRACKING_BASE = \[[\s\S]*?\];/, trackingBlock);
source = source.replace(/positionRatio: "[^"]*"/g, `positionRatio: "${config.positionRatio}"`);

fs.writeFileSync(target, source);
console.log(`applied portfolio config: ${config.positionRatio}, ${config.holdings.length} holdings`);
