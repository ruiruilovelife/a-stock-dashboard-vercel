import fs from "node:fs";

const target = "scripts/update-dashboard.mjs";
let source = fs.readFileSync(target, "utf8");

const helper = `
function buildIndexTrendProfile(profile, dayPct) {
  if (!profile) {
    return {
      status: "趋势待确认",
      score: 0,
      read: "只拿到当日涨跌，暂不能下中期结论。",
      action: "不因为单日红绿改变仓位，等周线和全A宽度确认。"
    };
  }
  let score = 0;
  if (profile.closeAbove20w) score += 2;
  else score -= 2;
  if (profile.maQueue) score += 1;
  if (profile.ma20Rising) score += 2;
  else score -= 1;
  if (Number(profile.quarterReturn) > 8) score += 1;
  if (Number(profile.quarterReturn) < -8) score -= 1;
  if (profile.volumeStairPass && Number(dayPct) > 0) score += 1;
  if (profile.volumeStairPass && Number(dayPct) < -1) score -= 1;

  const status = score >= 4
    ? "中期上行"
    : score >= 2
      ? "震荡偏强"
      : score <= -3
        ? "中期破位"
        : "震荡偏弱";
  const read = [
    profile.closeAbove20w ? "在20周线上方" : "低于20周线",
    profile.ma20Rising ? "20周线向上" : "20周线未上行",
    profile.maQueue ? "5/10/20周线排队" : "均线未排队",
    Number.isFinite(Number(profile.quarterReturn)) ? \`近3个月\${profile.quarterReturn}%\` : "近3个月待确认",
    Number.isFinite(Number(profile.distanceToHighPct)) ? \`距52周高点\${profile.distanceToHighPct}%\` : "52周位置待确认"
  ].join("，");
  const action = status === "中期上行"
    ? "指数趋势支持结构性进攻，但仍要看成交额和主线扩散。"
    : status === "震荡偏强"
      ? "可以做强主线，不适合全面加仓。"
      : status === "中期破位"
        ? "指数趋势不支持重仓进攻，先降弱势和高波动仓。"
        : "指数趋势偏弱，仓位跟随板块确认，不提前押满。";
  return { status, score, read, action };
}
`;

if (!source.includes("function buildIndexTrendProfile(")) {
  source = source.replace("async function fetchWeeklyProfiles(pool) {", `${helper}\nasync function fetchWeeklyProfiles(pool) {`);
}

source = source.replace(
  /const indexQuotes = await fetchSina\(INDICES\.map\(x => x\[0\]\)\)\.catch\(error => \{[\s\S]*?\n  \}\);/,
  `const indexQuotes = await fetchSina(INDICES.map(x => x[0])).catch(error => {
    console.warn(\`index quote fallback: \${error.message}\`);
    return previousIndices.map(i => ({
      name: i.name,
      prevClose: Number(i.close) / (1 + Number(i.pct || 0) / 100),
      close: Number(i.close)
    })).filter(q => Number.isFinite(q.close));
  });
  const indexWeeklyProfiles = await fetchWeeklyProfiles(INDICES.map(x => [x[0], x[1], x[0].replace(/^(sh|sz)/, "")])).catch(error => {
    console.warn(\`index weekly trend fallback: \${error.message}\`);
    return new Map();
  });`
);

source = source.replace(
  /const indices = indexQuotes\.map\(\(q, idx\) => \(\{[\s\S]*?\n  \}\)\);/,
  `const indices = indexQuotes.map((q, idx) => {
    const dayPct = pct(q.close, q.prevClose);
    const trend = buildIndexTrendProfile(indexWeeklyProfiles.get(INDICES[idx][0].replace(/^(sh|sz)/, "")), dayPct);
    return {
      name: INDICES[idx][1],
      close: Number(q.close.toFixed(2)),
      pct: dayPct,
      trend
    };
  });`
);

source = source.replace(
  /function marketConclusion\(indices, holdings, internals = \{\}\) \{\n  const cyb = indices\.find\(x => x\.name === "创业板指"\)\?\.pct \?\? 0;/,
  `function marketConclusion(indices, holdings, internals = {}) {
  const trendLine = indices.map(i => \`\${i.name}\${i.trend?.status || "趋势待确认"}：\${i.trend?.read || "周线待确认"}\`).join("；");
  const cyb = indices.find(x => x.name === "创业板指")?.pct ?? 0;`
);

source = source.replace(/return `指数和全A内部结构偏弱：\$\{internals\.read\} /, "return `指数趋势：${trendLine}。指数和全A内部结构偏弱：${internals.read} ");
source = source.replace(/return `全A赚钱效应扩散：\$\{internals\.read\} /, "return `指数趋势：${trendLine}。全A赚钱效应扩散：${internals.read} ");
source = source.replace(/return `市场处在弱平衡\/分化调整：\$\{internals\.read \|\| "指数回落但内部结构待确认。"\} /, "return `指数趋势：${trendLine}。市场处在弱平衡/分化调整：${internals.read || \"指数回落但内部结构待确认。\"} ");
source = source.replace(
  /return "科技成长线明显承压，先防守再找修复。明天重点看创业板\/科创50是否止跌，以及半导体材料是否有核心股反包。";/,
  "return `指数趋势：${trendLine}。科技成长线明显承压，先防守再找修复。明天重点看创业板/科创50是否止跌，以及半导体材料是否有核心股反包。`;"
);
source = source.replace(/return "指数未必最弱，但半导体材料链内部压力较大，组合需要降低弱势科技仓暴露。";/, "return `指数趋势：${trendLine}。指数未必最弱，但半导体材料链内部压力较大，组合需要降低弱势科技仓暴露。`;");
source = source.replace(/return "市场未出现系统性破坏，持仓按强弱分层处理：强势核心持有观察，弱势修复不加仓。";/, "return `指数趋势：${trendLine}。市场未出现系统性破坏，持仓按强弱分层处理：强势核心持有观察，弱势修复不加仓。`;");

source = source.replace(
  /const sh = indices\.find\(x => x\.name === "上证指数"\)\?\.pct \?\? 0;\n  const cyb = indices\.find\(x => x\.name === "创业板指"\)\?\.pct \?\? 0;\n  const kc = indices\.find\(x => x\.name === "科创50"\)\?\.pct \?\? 0;/,
  `const shIndex = indices.find(x => x.name === "上证指数") || {};
  const cybIndex = indices.find(x => x.name === "创业板指") || {};
  const kcIndex = indices.find(x => x.name === "科创50") || {};
  const sh = shIndex.pct ?? 0;
  const cyb = cybIndex.pct ?? 0;
  const kc = kcIndex.pct ?? 0;
  const shTrendScore = Number(shIndex.trend?.score || 0);
  const growthTrendScore = Math.min(Number(cybIndex.trend?.score || 0), Number(kcIndex.trend?.score || 0));`
);

source = source.replace(
  /const riskLevel = cyb < -3 \|\| kc < -4 \|\| globalTechWeak \|\| internalWeak \? "偏防守" : internalStrong \? "积极观察" : "中性观察";\n  const growthWeak = cyb < -2 \|\| kc < -3;\n  const growthStrong = cyb > 1\.5 \|\| kc > 2;\n  const broadStrong = sh > 0\.8;\n  const broadWeak = sh < -1\.2;/,
  `const riskLevel = cyb < -3 || kc < -4 || globalTechWeak || internalWeak || growthTrendScore <= -3 ? "偏防守" : internalStrong && growthTrendScore >= 2 ? "积极观察" : "中性观察";
  const growthWeak = cyb < -2 || kc < -3 || growthTrendScore <= -3;
  const growthStrong = (cyb > 1.5 || kc > 2) && growthTrendScore >= 2;
  const broadStrong = sh > 0.8 && shTrendScore >= 2;
  const broadWeak = sh < -1.2 || shTrendScore <= -3;`
);

source = source.replace(
  /\{ item: "上证\/宽基", value: sh, read: broadStrong \? "宽基走强，全面行情概率上升。" : broadWeak \? "宽基走弱，系统性风险上升。" : "宽基中性，更多是结构行情。" \},\n        \{ item: "创业板\/科创", value: Math\.min\(cyb, kc\), read: growthStrong \? "成长风险偏好回升。" : growthWeak \? "成长风险偏好收缩。" : "成长风格中性。" \},/,
  `{ item: "上证/宽基", value: sh, read: \`\${shIndex.trend?.status || "趋势待确认"}：\${shIndex.trend?.read || "周线待确认"}。${'${'}broadStrong ? "宽基走强，全面行情概率上升。" : broadWeak ? "宽基走弱，系统性风险上升。" : "宽基中性，更多是结构行情。"}\` },
        { item: "创业板/科创", value: Math.min(cyb, kc), read: \`创业板${'${'}cybIndex.trend?.status || "趋势待确认"}；科创50${'${'}kcIndex.trend?.status || "趋势待确认"}。${'${'}growthStrong ? "成长风险偏好回升。" : growthWeak ? "成长风险偏好收缩。" : "成长风格中性。"}\` },`
);

fs.writeFileSync(target, source);
console.log("applied index trend patch");
