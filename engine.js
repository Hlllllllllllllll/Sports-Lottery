(function () {
  "use strict";

  function pick(text, patterns) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return (m[1] !== undefined ? m[1] : m[0]).trim();
    }
    return null;
  }

  function parseCNY(s) {
    if (!s) return null;
    const clean = s.replace(/,/g);
    const m = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*万?/);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (/万/.test(clean)) n *= 10000;
    return n;
  }

  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  function cnNum(s) {
    if (!s) return null;
    if (/^\d+$/.test(s)) return +s;
    return CN[s] != null ? CN[s] : null;
  }

  function parseMonths(s) {
    if (!s) return null;
    const m = s.match(/押\s*([0-9一二三四五六七八九十]+)\s*付\s*([0-9一二三四五六七八九十]+)/);
    if (m) return { depositMonths: cnNum(m[1]), payMonths: cnNum(m[2]) };
    return null;
  }

  function parseDate(s) {
    const m = s && s.match(/([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function yearsBetween(a, b) {
    if (!a || !b) return null;
    return Math.abs((b - a) / (365 * 24 * 3600 * 1000));
  }

  // Public helpers used by schema definitions at runtime.
  window.H = { pick, parseCNY, parseMonths, parseDate, yearsBetween, cnNum };

  // Core pipeline: extract fields then evaluate risk rules.
  window.runAnalysis = function (schemaId, text) {
    const schema = window.SCHEMAS[schemaId];
    if (!schema) return { error: "schema not found: " + schemaId };

    const fields = [];
    for (const f of schema.fields) {
      let raw = null;
      try { raw = f.extract(text); } catch (e) { raw = null; }
      const display = raw && raw.display !== undefined ? raw.display : (raw || null);
      const value = raw && raw.value !== undefined ? raw.value : raw;
      fields.push({ key: f.key, label: f.label, display: display, value: value });
    }

    const byKey = {};
    fields.forEach((f) => (byKey[f.key] = f));

    const risks = [];
    for (const r of schema.risks) {
      let hit = null;
      try { hit = r.check(text, fields, byKey); } catch (e) { hit = null; }
      if (hit) {
        risks.push({
          id: r.id,
          title: r.title,
          severity: r.severity,
          law: r.law || "",
          detail: typeof hit === "string" ? hit : (r.detail || ""),
        });
      }
    }

    const order = { high: 0, mid: 1, low: 2, info: 3 };
    risks.sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9));

    const nextActions = risks
      .filter((r) => r.severity === "high" || r.severity === "mid")
      .map((r) => r.title);

    return { schema: schema.id, fields: fields, risks: risks, nextActions: nextActions };
  };
})();
