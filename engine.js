/*
 * ClauseLens 引擎核心（schema 驱动）
 * ---------------------------------------------------------------
 * 一份代码同时兼容：浏览器 <script> 引入 与 CommonJS（Node / 微信小程序）。
 * 对外暴露：
 *   H  —— 基础工具（抽取 / 金额 / 日期 / 中文数字）
 *   C  —— 通用构件：F（字段构造器）与 R（通用风险规则），供 schemas 复用
 *   runAnalysis(schemaId, text) —— 抽取字段 + 研判风险
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.H = api.H;
    root.C = api.C;
    root.runAnalysis = api.runAnalysis;
  }
})(typeof window !== "undefined" ? window : {}, function () {
  "use strict";

  /* ==================== H：基础工具 ==================== */

  function pick(text, patterns) {
    for (const p of patterns) {
      const m = (text || "").match(p);
      if (m) return (m[1] !== undefined ? m[1] : m[0]).trim();
    }
    return null;
  }

  function parseCNY(s) {
    if (!s) return null;
    const clean = String(s).replace(/,/g, "");
    const m = clean.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (/亿/.test(clean)) n *= 100000000;
    else if (/万/.test(clean)) n *= 10000;
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

  function fmtMoney(v) {
    return "¥" + Number(v).toLocaleString("zh-CN");
  }

  const H = { pick, parseCNY, parseMonths, parseDate, yearsBetween, cnNum, fmtMoney };

  /* ==================== C.F：字段构造器 ==================== */

  const F = {
    // 纯文本抽取
    text(key, label, patterns) {
      return { key, label, extract: (t) => ({ display: pick(t, patterns), value: null }) };
    },

    // 金额抽取：优先命中即返回 ¥ 格式化
    money(key, label, patterns) {
      return {
        key,
        label,
        extract(t) {
          for (const p of patterns) {
            const m = (t || "").match(p);
            if (m && m[1] != null) {
              const v = parseCNY(m[1]);
              if (v == null || isNaN(v)) continue;
              return { display: fmtMoney(v), value: v };
            }
          }
          return { display: null, value: null };
        },
      };
    },

    // 数字 + 单位
    num(key, label, patterns, unit) {
      return {
        key,
        label,
        extract(t) {
          for (const p of patterns) {
            const m = (t || "").match(p);
            if (m && m[1] != null) {
              const v = parseFloat(String(m[1]).replace(/,/g, ""));
              if (isNaN(v)) continue;
              return { display: m[1] + (unit || "") + (m[2] || ""), value: v };
            }
          }
          return { display: null, value: null };
        },
      };
    },

    // 有无标记（value 为布尔，便于规则判断）
    flag(key, label, re) {
      return {
        key,
        label,
        extract(t) {
          const hit = re.test(t || "");
          return { display: hit ? "有" : "无", value: hit };
        },
      };
    },

    // 三态：命中不同正则给出不同文案，默认 def
    tri(key, label, opts, def) {
      return {
        key,
        label,
        extract(t) {
          for (const o of opts) {
            if (o.re.test(t || "")) return { display: o.display, value: o.display };
          }
          return { display: def || "未约定", value: null };
        },
      };
    },

    // 起止日期区间 / 年限
    dateRange(key, label) {
      return {
        key,
        label,
        extract(t) {
          const m = (t || "").match(
            /([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日)\s*[至到~]\s*([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日)/
          );
          if (m) {
            const s = parseDate(m[1]);
            const e = parseDate(m[2]);
            const y = yearsBetween(s, e);
            return {
              display: m[1] + " 至 " + m[2] + (y ? "（约 " + y.toFixed(1) + " 年）" : ""),
              value: { start: m[1], end: m[2], years: y },
            };
          }
          const ym = (t || "").match(/期限[^\d\n]{0,8}([0-9]+(?:\.[0-9]+)?)\s*年/);
          if (ym) return { display: ym[1] + " 年", value: { years: +ym[1] } };
          const mm = (t || "").match(/期限[^\d\n]{0,8}([0-9]+)\s*个?月/);
          if (mm) return { display: mm[1] + " 个月", value: { years: +mm[1] / 12 } };
          if (/无固定期限|长期|永久/.test(t || "")) return { display: "长期 / 无固定期限", value: { years: 99 } };
          return { display: null, value: null };
        },
      };
    },

    // 利率：统一折算为「年化百分比」存入 value
    rate(key, label) {
      return {
        key,
        label,
        extract(t) {
          t = t || "";
          let m = t.match(/(?:年利率|年化利率|年息|年化)[^\d\n]{0,6}([0-9]+(?:\.[0-9]+)?)\s*%/);
          if (m) {
            const v = parseFloat(m[1]);
            return { display: v + "% / 年", value: v };
          }
          m = t.match(/(?:月利率|月息)[^\d\n]{0,6}([0-9]+(?:\.[0-9]+)?)\s*(%|‰)/);
          if (m) {
            const raw = parseFloat(m[1]);
            const v = m[2] === "‰" ? raw * 0.1 * 12 : raw * 12;
            return { display: m[0] + "（年化约 " + v.toFixed(1) + "%）", value: v };
          }
          m = t.match(/(?:日利率|日息)[^\d\n]{0,6}([0-9]+(?:\.[0-9]+)?)\s*‰/);
          if (m) {
            const v = parseFloat(m[1]) * 0.365;
            return { display: m[0] + "（年化约 " + v.toFixed(1) + "%）", value: v };
          }
          m = t.match(/日息[^\d\n]{0,4}万分之\s*([0-9]+(?:\.[0-9]+)?)/);
          if (m) {
            const v = parseFloat(m[1]) / 10000 * 365 * 100;
            return { display: m[0] + "（年化约 " + v.toFixed(1) + "%）", value: v };
          }
          m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
          if (m) {
            const v = parseFloat(m[1]);
            return { display: v + "% / 年", value: v };
          }
          return { display: null, value: null };
        },
      };
    },
  };

  /* ==================== C.R：通用风险规则 ==================== */

  const R = {
    // 免责 / 责任豁免
    disclaimer() {
      return {
        id: "disclaimer",
        title: "含免责 / 责任豁免条款",
        severity: "high",
        law: "《民法典》第506条：造成对方人身损害、或因故意或重大过失造成对方财产损失的免责条款无效；第497条：不合理免除己方责任、加重对方责任、限制对方主要权利的格式条款无效。",
        check: (t) =>
          /免责|概不负责|不承担责任|后果自负|风险自负|不承担任何|与本公司无关|与甲方无关|与乙方无关/.test(t)
            ? true
            : null,
      };
    },

    // 未约定争议解决
    noJurisdiction() {
      return {
        id: "noJurisdiction",
        title: "未约定争议解决 / 管辖",
        severity: "info",
        law: "建议明确争议解决方式（诉讼或仲裁）与管辖法院，便于日后维权时快速确定受理机构。",
        check: (t) => (/争议(解决|处理)|管辖|仲裁|诉讼|法院/.test(t) ? null : true),
      };
    },

    // 违约金复核
    breachReview() {
      return {
        id: "breachReview",
        title: "违约金 / 赔偿责任需复核",
        severity: "mid",
        law: "《民法典》第585条：约定的违约金过分高于造成的损失的，人民法院或者仲裁机构可以根据请求予以适当减少；建议约定合理比例与上限。",
        check: (t) => (/违约|违约金|赔偿金|滞纳金|逾期/.test(t) ? true : null),
      };
    },

    // 未约定解除 / 终止
    noTermination(kw) {
      const re = kw || /解除|终止|退费|退款|退出|退伙|退卡|退订|取消/;
      return {
        id: "noTermination",
        title: "未约定解除 / 退出与费用结算",
        severity: "mid",
        law: "《民法典》第562—566条：建议约定解除条件、通知方式、已履行部分的结算与善后，避免退出时被扣费或索赔。",
        check: (t) => (re.test(t) ? null : true),
      };
    },

    // 自动续约 / 默认续费
    autoRenew() {
      return {
        id: "autoRenew",
        title: "存在自动续约 / 默认续费",
        severity: "mid",
        law: "建议明确自动续费前的提醒义务、提前通知期限与一键取消方式，避免被连续扣费。",
        check: (t) =>
          /自动续约|自动续费|自动延期|默认续费|连续包月|自动扣款|到期自动/.test(t) ? true : null,
      };
    },

    // 单方变更 / 最终解释权
    unilateral() {
      return {
        id: "unilateral",
        title: "对方可单方变更条款",
        severity: "high",
        law: "《民法典》第543条：当事人协商一致，可以变更合同。约定一方有权单方变更、调整或解除的条款，可能因排除对方主要权利而被认定无效。",
        check: (t) =>
          /单方(变更|调整|解除|修改|终止)|有权随时(调整|变更|修改|解除|终止)|可根据需要调整|以(甲方|乙方|本公司|本店)规定为准/.test(
            t
          )
            ? true
            : null,
      };
    },

    finalInterpret() {
      return {
        id: "finalInterpret",
        title: "含「最终解释权」条款",
        severity: "mid",
        law: "《合同行政监督管理办法》《消费者权益保护法》第26条：经营者不得以格式条款作出排除或限制消费者权利、减轻或免除经营者责任的规定，「最终解释权归本店所有」属典型不公平格式条款。",
        check: (t) => (/最终解释权|解释权(归|属于)/.test(t) ? true : null),
      };
    },

    // 概不退费
    noRefund() {
      return {
        id: "noRefund",
        title: "约定概不退费 / 过期作废",
        severity: "high",
        law: "《消费者权益保护法》第26条：经营者不得以格式条款作出排除或限制消费者权利、减轻或免除经营者责任、加重消费者责任的规定，此类条款无效。",
        check: (t) =>
          /概不退(费|款|换)|不予退还|不得退款|不退不换|一经(售出|办理|缴纳|支付)[^\n。；;]{0,10}不退|过期作废|余额不退/
            .test(t)
            ? true
            : null,
      };
    },

    // 字段缺失（display 为空 /「无」/「未约定」均视为缺失）
    missing(key, title, law, severity) {
      return {
        id: "miss_" + key,
        title: title,
        severity: severity || "mid",
        law: law,
        check: (t, fields, by) => {
          const f = by[key];
          const d = f && f.display;
          return !d || d === "无" || d === "未约定" || d === "未识别" ? true : null;
        },
      };
    },

    // 预付款比例过高（用于承揽 / 服务 / 装修类）
    payFrontHigh() {
      return {
        id: "payFrontHigh",
        title: "预付款比例偏高，需复核",
        severity: "mid",
        law: "建议按进度分期付款，并保留不低于 10% 的尾款于验收合格后支付，降低对方收款后怠工、失联的风险。",
        check: (t) => {
          const m = (t || "").match(/(?:预付|定金|首期|预付款)[^\d\n]{0,8}([0-9]+)\s*%/);
          if (m) {
            const p = +m[1];
            if (p > 50) return "预付款比例为 " + p + "%，建议下调并保留尾款。";
            return null;
          }
          return /一次性付清|签订(合同|协议)后[^\n。；;]{0,10}付清|全额预付/.test(t)
            ? "约定签订后一次性付清全款，建议改为按进度分期。"
            : null;
        },
      };
    },
  };

  /* ==================== 核心管线 ==================== */

  function runAnalysis(schemaId, text) {
    const schemas = (typeof module !== "undefined" && module.exports
      ? require("./schemas.js")
      : root.SCHEMAS) || {};
    const schema = schemas[schemaId];
    if (!schema) return { error: "schema not found: " + schemaId };

    const fields = [];
    for (const f of schema.fields) {
      let raw = null;
      try { raw = f.extract(text || ""); } catch (e) { raw = null; }
      const display = raw && raw.display !== undefined ? raw.display : (raw || null);
      const value = raw && raw.value !== undefined ? raw.value : raw;
      fields.push({ key: f.key, label: f.label, display: display, value: value });
    }

    const byKey = {};
    fields.forEach((f) => (byKey[f.key] = f));

    const risks = [];
    for (const r of schema.risks) {
      let hit = null;
      try { hit = r.check(text || "", fields, byKey); } catch (e) { hit = null; }
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
  }

  return { H, C: { F, R }, runAnalysis };
});
