import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("data/portfolio-config.json", "utf8"));
const target = "scripts/update-dashboard.mjs";
let source = fs.readFileSync(target, "utf8");

const stockLines = config.holdings.map(row => `  ${JSON.stringify(row)}`).join(",\n");
const stocksBlock = `const STOCKS = [\n${stockLines}\n];`;

source = source.replace(/const STOCKS = \[[\s\S]*?\];/, stocksBlock);
source = source.replace(/positionRatio: "\d+(?:\.\d+)?%"/g, `positionRatio: "${config.positionRatio}"`);

fs.writeFileSync(target, source);
console.log(`applied portfolio config: ${config.positionRatio}, ${config.holdings.length} holdings`);
