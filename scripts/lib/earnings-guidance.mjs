function earningsGuidanceFromEvents(events = []) {
  const byCode = new Map();
  for (const event of events) {
    if (!event?.code || !/业绩预告|财报/.test(`${event.type || ""} ${event.title || ""}`)) continue;
    const text = (event.facts || []).join(" ");
    const match = text.match(/归母净利润预计\s*([\d.]+)亿元至([\d.]+)亿元[^。]*上年同期\s*([\d.]+)亿元[^。]*同比增长\s*([\d.]+)%至([\d.]+)%/);
    if (!match) continue;
    byCode.set(event.code, {
      guidancePeriod: /H1|半年度|上半年/.test(`${event.title} ${text}`) ? "H1" : "UNKNOWN",
      guidancePeriodProfitLowYi: Number(match[1]),
      guidancePeriodProfitHighYi: Number(match[2]),
      guidancePriorPeriodProfitYi: Number(match[3]),
      guidanceGrowthLowPct: Number(match[4]),
      guidanceGrowthHighPct: Number(match[5]),
      guidanceSource: event.source || "公司业绩预告",
      guidanceDate: event.date || null,
      guidanceTitle: event.title || null
    });
  }
  return byCode;
}

export { earningsGuidanceFromEvents };
