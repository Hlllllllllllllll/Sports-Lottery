(function () {
  "use strict";

  const schemaSel = document.getElementById("schema");
  const input = document.getElementById("input");
  const runBtn = document.getElementById("run");
  const sampleBtn = document.getElementById("sample");
  const out = document.getElementById("output");
  const summaryBox = document.getElementById("summary");
  const fieldsBox = document.getElementById("fields");
  const risksBox = document.getElementById("risks");
  const copyBtn = document.getElementById("copy");
  const aiKey = document.getElementById("aiKey");
  const aiProv = document.getElementById("aiProv");
  const aiBtn = document.getElementById("aiBtn");
  const aiMsg = document.getElementById("aiMsg");

  const SEV_CLASS = { high: "sev-high", mid: "sev-mid", low: "sev-low", info: "sev-info" };
  const SEV_TEXT = { high: "高风险", mid: "中风险", low: "低风险", info: "提示" };
  const SEV_ORDER = { high: 0, mid: 1, low: 2, info: 3 };

  Object.values(window.SCHEMAS).forEach((s) => {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name;
    schemaSel.appendChild(o);
  });

  let lastReport = "";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function buildReport(res, schemaName) {
    let t = "条款通 ClauseLens · 合同研判报告\n";
    t += "合同类型：" + schemaName + "\n";
    t += "────────────────────\n一、抽取字段\n";
    res.fields.forEach((f) => {
      t += "  · " + f.label + "：" + (f.display || f.value || "未提取到") + "\n";
    });
    t += "\n二、风险研判（共 " + res.risks.length + " 项）\n";
    if (res.risks.length === 0) {
      t += "  未检测到明显风险条款。\n";
    } else {
      res.risks.forEach((r, i) => {
        t += "  " + (i + 1) + ". [" + (SEV_TEXT[r.severity] || "提示") + "] " + r.title + "\n";
        if (r.law) t += "     法条：" + r.law + "\n";
        if (r.detail) t += "     说明：" + r.detail + "\n";
      });
    }
    t += "\n（本报告由规则引擎自动生成，不构成法律意见）\n";
    return t;
  }

  function render(res) {
    if (res.error) { out.hidden = true; return; }
    out.hidden = false;

    // 风险概览
    const counts = { high: 0, mid: 0, low: 0, info: 0 };
    res.risks.forEach((r) => { counts[r.severity] = (counts[r.severity] || 0) + 1; });
    const total = res.risks.length;
    let level = "基本可控", levelCls = "lvl-low";
    if (counts.high > 0) { level = "高风险"; levelCls = "lvl-high"; }
    else if (counts.mid > 0) { level = "需留意"; levelCls = "lvl-mid"; }
    else if (total === 0) { level = "暂无风险"; levelCls = "lvl-low"; }

    summaryBox.innerHTML = "";
    const lvl = document.createElement("div");
    lvl.className = "lvl " + levelCls;
    lvl.innerHTML =
      '<span class="lvl-num">' + total + '</span>' +
      '<span class="lvl-lab">项风险 · ' + level + "</span>";
    summaryBox.appendChild(lvl);

    [
      { k: "high", n: counts.high, t: "高" },
      { k: "mid", n: counts.mid, t: "中" },
      { k: "low", n: counts.low, t: "低" },
    ].forEach((c) => {
      const chip = document.createElement("div");
      chip.className = "stat " + SEV_CLASS[c.k];
      chip.innerHTML = '<span class="stat-n">' + c.n + '</span><span class="stat-t">' + c.t + "风险</span>";
      summaryBox.appendChild(chip);
    });

    // 抽取字段
    fieldsBox.innerHTML = "";
    res.fields.forEach((f) => {
      const row = document.createElement("div");
      row.className = "field";
      row.innerHTML =
        '<span class="fk">' + escapeHtml(f.label) + "</span>" +
        '<span class="fv">' + escapeHtml(f.display || f.value || "未提取到") + "</span>";
      fieldsBox.appendChild(row);
    });

    // 风险研判（按严重程度排序）
    risksBox.innerHTML = "";
    if (res.risks.length === 0) {
      const ok = document.createElement("div");
      ok.className = "ok";
      ok.textContent = "未检测到明显风险条款，但重大事项仍建议咨询执业律师。";
      risksBox.appendChild(ok);
    }
    res.risks.slice().sort((a, b) =>
      (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
    ).forEach((r) => {
      const card = document.createElement("div");
      card.className = "risk " + (SEV_CLASS[r.severity] || "sev-info");
      let html =
        '<div class="risk-h"><span class="badge ' + (SEV_CLASS[r.severity] || "sev-info") + '">' +
        (SEV_TEXT[r.severity] || "提示") + '</span><span class="rt">' + escapeHtml(r.title) + "</span></div>";
      if (r.law) html += '<div class="law">' + escapeHtml(r.law) + "</div>";
      if (r.detail) html += '<div class="det">' + escapeHtml(r.detail) + "</div>";
      card.innerHTML = html;
      risksBox.appendChild(card);
    });

    const schemaName = schemaSel.options[schemaSel.selectedIndex]
      ? schemaSel.options[schemaSel.selectedIndex].textContent
      : "";
    lastReport = buildReport(res, schemaName);
    copyBtn.textContent = "导出报告";
  }

  runBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    runBtn.classList.add("loading");
    runBtn.disabled = true;
    setTimeout(() => {
      const res = window.runAnalysis(schemaSel.value, text);
      render(res);
      runBtn.classList.remove("loading");
      runBtn.disabled = false;
    }, 380);
  });

  sampleBtn.addEventListener("click", () => {
    input.value = SAMPLE;
    schemaSel.value = "rental";
  });

  copyBtn.addEventListener("click", () => {
    if (!lastReport) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(lastReport).then(() => {
        copyBtn.textContent = "已复制";
        setTimeout(() => (copyBtn.textContent = "导出报告"), 1500);
      });
    }
  });

  aiBtn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) { alert("请先粘贴合同文本"); return; }
    const key = aiKey.value.trim();
    if (!key) { alert("请填写 API Key（生产环境建议经自有后端代理）"); return; }
    aiMsg.textContent = "调用中…";
    aiMsg.className = "ai-msg";
    try {
      const r = await callAI(text, schemaSel.value, key, aiProv.value);
      aiMsg.textContent = "AI 增强结果：\n" + r;
      aiMsg.className = "ai-msg ok";
    } catch (e) {
      aiMsg.textContent = "调用失败：" + e.message + "（浏览器直连常受 CORS 限制，建议经自有后端代理）";
      aiMsg.className = "ai-msg err";
    }
  });

  async function callAI(text, schemaId, key, prov) {
    const schema = window.SCHEMAS[schemaId];
    const sys = "你是严谨的中文合同审查助手，只返回 JSON，不要解释。";
    const prompt =
      "请从下面的" + schema.name + "文本中抽取关键字段并研判风险，严格以 JSON 返回：\n" +
      '{"fields":{字段名:值},"risks":[{"title":"风险名","severity":"high|mid|low|info","law":"相关法条","detail":"说明"}]}\n\n' +
      "合同文本：\n" + text;

    if (prov === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 2000, system: sys, messages: [{ role: "user", content: prompt }] }),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const d = await resp.json();
      return d.content[0].text;
    }
    const url = prov === "deepseek" ? "https://api.deepseek.com/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model: prov === "deepseek" ? "deepseek-chat" : "gpt-4o-mini",
        messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const d = await resp.json();
    return d.choices[0].message.content;
  }

  const SAMPLE =
    "房屋租赁合同\n" +
    "甲方（出租方）：张三\n" +
    "乙方（承租方）：李四\n" +
    "房屋坐落：北京市朝阳区幸福小区1号楼2单元301室\n" +
    "租赁期限：2024年1月1日至2046年1月1日\n" +
    "月租金：5000元\n" +
    "押金：20000元\n" +
    "租金按季支付。出租人有权随时涨租。承租人不得转租。\n" +
    "本合同一切损失概不负责。";
})();
