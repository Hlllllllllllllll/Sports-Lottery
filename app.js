(function () {
  "use strict";

  const schemaSel = document.getElementById("schema");
  const input = document.getElementById("input");
  const runBtn = document.getElementById("run");
  const sampleBtn = document.getElementById("sample");
  const out = document.getElementById("output");
  const fieldsBox = document.getElementById("fields");
  const risksBox = document.getElementById("risks");
  const jsonBox = document.getElementById("json");
  const copyBtn = document.getElementById("copy");
  const aiKey = document.getElementById("aiKey");
  const aiProv = document.getElementById("aiProv");
  const aiBtn = document.getElementById("aiBtn");
  const aiMsg = document.getElementById("aiMsg");

  const SEV_CLASS = { high: "sev-high", mid: "sev-mid", low: "sev-low", info: "sev-info" };
  const SEV_TEXT = { high: "高风险", mid: "中风险", low: "低风险", info: "提示" };

  Object.values(window.SCHEMAS).forEach((s) => {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name;
    schemaSel.appendChild(o);
  });

  function render(res) {
    if (res.error) { out.hidden = true; return; }
    out.hidden = false;

    fieldsBox.innerHTML = "";
    res.fields.forEach((f) => {
      const row = document.createElement("div");
      row.className = "field";
      const k = document.createElement("span");
      k.className = "fk";
      k.textContent = f.label;
      const v = document.createElement("span");
      v.className = "fv";
      v.textContent = f.display || f.value || "未提取到";
      row.appendChild(k);
      row.appendChild(v);
      fieldsBox.appendChild(row);
    });

    risksBox.innerHTML = "";
    if (res.risks.length === 0) {
      const ok = document.createElement("div");
      ok.className = "ok";
      ok.textContent = "未检测到明显风险条款，但重大事宜仍建议咨询执业律师。";
      risksBox.appendChild(ok);
    }
    res.risks.forEach((r) => {
      const card = document.createElement("div");
      card.className = "risk " + (SEV_CLASS[r.severity] || "sev-info");
      const h = document.createElement("div");
      h.className = "risk-h";
      const badge = document.createElement("span");
      badge.className = "badge " + (SEV_CLASS[r.severity] || "sev-info");
      badge.textContent = SEV_TEXT[r.severity] || "提示";
      const title = document.createElement("span");
      title.className = "rt";
      title.textContent = r.title;
      h.appendChild(badge);
      h.appendChild(title);
      card.appendChild(h);
      if (r.law) {
        const law = document.createElement("div");
        law.className = "law";
        law.textContent = r.law;
        card.appendChild(law);
      }
      if (r.detail) {
        const det = document.createElement("div");
        det.className = "det";
        det.textContent = r.detail;
        card.appendChild(det);
      }
      risksBox.appendChild(card);
    });

    jsonBox.textContent = JSON.stringify(res, null, 2);
  }

  runBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) { alert("请先粘贴合同文本"); return; }
    const res = window.runAnalysis(schemaSel.value, text);
    render(res);
  });

  sampleBtn.addEventListener("click", () => {
    input.value = SAMPLE;
    schemaSel.value = "rental";
  });

  copyBtn.addEventListener("click", () => {
    const text = jsonBox.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "已复制";
        setTimeout(() => (copyBtn.textContent = "复制 JSON"), 1500);
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
