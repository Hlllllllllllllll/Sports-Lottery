// Schemas are data + extractor/checker functions. The engine (engine.js) is
// schema-driven: adding a new vertical is a config-only change.
window.SCHEMAS = {

  // ---- Hero product: 房屋租赁合同 ----
  rental: {
    id: "rental",
    name: "房屋租赁合同",
    blurb: "抽取出租方、租金、押金、租期等关键条款，并研判押金上限、租期、违约、维修等风险。",
    fields: [
      {
        key: "landlord", label: "出租方（甲方）",
        extract: (t) => ({
          display: window.H.pick(t, [
            /出租方[（(]?甲方[）)]?[:：]?\s*([^\n，,。；;]{2,20})/,
            /甲方[（(]?出租方[）)]?[:：]?\s*([^\n，,。；;]{2,20})/,
            /出租方[:：]\s*([^\n，,。；;]{2,20})/,
          ]),
          value: null,
        }),
      },
      {
        key: "tenant", label: "承租方（乙方）",
        extract: (t) => ({
          display: window.H.pick(t, [
            /承租方[（(]?乙方[）)]?[:：]?\s*([^\n，,。；;]{2,20})/,
            /乙方[（(]?承租方[）)]?[:：]?\s*([^\n，,。；;]{2,20})/,
            /承租方[:：]\s*([^\n，,。；;]{2,20})/,
          ]),
          value: null,
        }),
      },
      {
        key: "address", label: "房屋坐落",
        extract: (t) => ({
          display: window.H.pick(t, [/房屋坐落[:：]?\s*([^\n，,。；;]{4,40})/, /位于\s*([^\n，,。；;]{4,40})/, /地址[:：]?\s*([^\n，,。；;]{4,40})/]),
          value: null,
        }),
      },
      {
        key: "rent", label: "月租金",
        extract: (t) => {
          const m = t.match(/月租金[:：]?\s*([0-9,]+)\s*元/) ||
            t.match(/租金为\s*([0-9,]+)\s*元\/月/) ||
            t.match(/每月[^0-9]*?([0-9,]+)\s*元/);
          if (!m) return { display: null, value: null };
          const v = window.H.parseCNY(m[1]);
          return { display: "¥" + v.toLocaleString() + "/月", value: v };
        },
      },
      {
        key: "deposit", label: "押金",
        extract: (t) => {
          const m = t.match(/押金[:：]?\s*([0-9,]+)\s*元/) || t.match(/保证金[:：]?\s*([0-9,]+)\s*元/);
          if (m) {
            const v = window.H.parseCNY(m[1]);
            return { display: "¥" + v.toLocaleString(), value: v };
          }
          const mm = t.match(/押\s*([0-9一二三四五六七八九十]+)\s*付/);
          if (mm) {
            const n = window.H.cnNum(mm[1]);
            return { display: "押" + mm[1] + "付…", value: n ? { depositMonths: n } : null };
          }
          return { display: null, value: null };
        },
      },
      {
        key: "term", label: "租赁期限",
        extract: (t) => {
          const m = t.match(/([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日)\s*[至到]\s*([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日)/);
          if (m) {
            const s = window.H.parseDate(m[1]), e = window.H.parseDate(m[2]);
            const y = window.H.yearsBetween(s, e);
            return { display: m[1] + " 至 " + m[2] + (y ? "（约" + y.toFixed(1) + "年）" : ""), value: { start: m[1], end: m[2], years: y } };
          }
          const ym = t.match(/租赁期限[:：]?\s*([0-9]+)\s*年/);
          if (ym) return { display: ym[1] + "年", value: { years: +ym[1] } };
          return { display: null, value: null };
        },
      },
      {
        key: "payment", label: "付款方式",
        extract: (t) => ({
          display: window.H.pick(t, [/押\s*[0-9一二三四五六七八九十]+\s*付\s*[0-9一二三四五六七八九十]+/, /按\s*(月|季|年|半年)\s*支付/, /租金\s*于\s*[^\n，,。；;]{2,12}支付/]),
          value: null,
        }),
      },
      {
        key: "rentIncrease", label: "租金调整条款",
        extract: (t) => ({ display: /涨租|上调租金|租金调整|租金上浮|随行就市/.test(t) ? "有" : "无", value: null }),
      },
      {
        key: "maintenance", label: "维修责任约定",
        extract: (t) => ({ display: /维修|修缮/.test(t) ? "有" : "无", value: null }),
      },
      {
        key: "breach", label: "违约/违约金条款",
        extract: (t) => ({ display: /违约|违约金|赔偿金/.test(t) ? "有" : "无", value: null }),
      },
      {
        key: "earlyTerm", label: "提前退租条款",
        extract: (t) => ({ display: /提前退租|提前解除|中途退租|提前终止/.test(t) ? "有" : "无", value: null }),
      },
      {
        key: "sublet", label: "转租约定",
        extract: (t) => ({
          display: /不得转租|禁止转租|不允许转租|不能转租/.test(t) ? "禁止转租" : (/可转租|允许转租|经同意可转租/.test(t) ? "允许转租" : "未约定"),
          value: null,
        }),
      },
    ],
    risks: [
      {
        id: "term20", title: "租赁期限超过 20 年", severity: "high",
        law: "《民法典》第705条：租赁期限不得超过20年，超过部分的约定无效。",
        check: (t, fields, by) => { const v = by.term.value; return v && v.years && v.years > 20; },
      },
      {
        id: "deposit2", title: "押金超过两个月租金", severity: "high",
        law: "法律未明文规定押金上限，但超过两个月租金明显偏高，议价时易处劣势，可协商下调。",
        check: (t, fields, by) => { const d = by.deposit.value, r = by.rent.value; return d && r && !isNaN(d) && !isNaN(r) && d > 2 * r; },
      },
      {
        id: "noTerm", title: "未明确租赁起止日期", severity: "high",
        law: "未约定租赁期限将影响合同成立与履行，建议补正具体起止日期。",
        check: (t, fields, by) => { return !by.term.value; },
      },
      {
        id: "noMaintain", title: "未约定维修责任", severity: "info",
        law: "《民法典》第712条：出租人应当履行租赁物的维修义务；建议书面明确，避免日后纠纷。",
        check: (t) => (/维修|修缮/.test(t) ? null : true),
      },
      {
        id: "rentAdj", title: "存在租金调整条款，需复核", severity: "mid",
        law: "请确认是否限定调整幅度与频率，避免出租人单方大幅涨租。",
        check: (t) => (/涨租|上调租金|租金调整|租金上浮|随行就市/.test(t) ? true : null),
      },
      {
        id: "earlyPenalty", title: "提前退租违约金需复核", severity: "mid",
        law: "《民法典》第585条：违约金过分高于造成的损失的，可请求法院或仲裁机构予以适当减少。",
        check: (t) => (/提前退租|提前解除|中途退租|提前终止/.test(t) ? true : null),
      },
      {
        id: "disclaimer", title: "含免责 / 责任豁免条款", severity: "high",
        law: "《民法典》第506条：造成对方人身损害或因故意、重大过失造成对方财产损失的免责条款无效。",
        check: (t) => (/免责|概不负责|不承担责任|后果自负|风险自负/.test(t) ? true : null),
      },
      {
        id: "depositReturn", title: "未约定押金退还条件", severity: "mid",
        law: "建议明确押金退还的时间与扣减情形，保障承租人权益。",
        check: (t, fields, by) => { const d = by.deposit.value; return d && !/退还|退回|返还/.test(t); },
      },
      {
        id: "sublet", title: "约定不得转租", severity: "info",
        law: "承租人需遵守不得转租约定，否则出租人有权解除合同。",
        check: (t) => (/不得转租|禁止转租|不允许转租|不能转租/.test(t) ? true : null),
      },
      {
        id: "priority", title: "涉及优先购买权", severity: "info",
        law: "《民法典》第726条：出租人出卖租赁房屋的，承租人在同等条件下享有优先购买权。",
        check: (t) => (/优先购买权/.test(t) ? true : null),
      },
    ],
  },

  // ---- Demo of extensibility: 劳动合同 (config-only addition) ----
  labor: {
    id: "labor",
    name: "劳动合同",
    blurb: "抽取用人单位、期限、工资、社保等条款，并研判试用期、违约金等风险。",
    fields: [
      {
        key: "employer", label: "用人单位",
        extract: (t) => ({ display: window.H.pick(t, [/用人单位[:：]?\s*([^\n，,。；;]{2,20})/, /甲方[:：]\s*([^\n，,。；;]{2,20})/]), value: null }),
      },
      {
        key: "employee", label: "劳动者",
        extract: (t) => ({ display: window.H.pick(t, [/劳动者[:：]?\s*([^\n，,。；;]{2,20})/, /乙方[:：]\s*([^\n，,。；;]{2,20})/]), value: null }),
      },
      {
        key: "period", label: "合同期限",
        extract: (t) => {
          if (/无固定期限/.test(t)) return { display: "无固定期限", value: null };
          const v = window.H.pick(t, [/合同期限[:：]?\s*([^\n，,。；;]{2,16})/, /固定期限\s*([^\n，,。；;]{2,16})/]);
          return { display: v, value: null };
        },
      },
      {
        key: "probation", label: "试用期",
        extract: (t) => ({ display: window.H.pick(t, [/试用期[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*个月/]), value: null }),
      },
      {
        key: "salary", label: "月工资",
        extract: (t) => {
          const m = t.match(/工资[:：]?\s*([0-9,]+)\s*元/) || t.match(/月薪\s*([0-9,]+)\s*元/);
          if (!m) return { display: null, value: null };
          const v = window.H.parseCNY(m[1]);
          return { display: "¥" + v.toLocaleString(), value: v };
        },
      },
      {
        key: "social", label: "社保约定",
        extract: (t) => ({ display: /社会保险|社保|公积金/.test(t) ? "有" : "无", value: null }),
      },
    ],
    risks: [
      {
        id: "noSocial", title: "未约定社会保险", severity: "high",
        law: "《社会保险法》及《劳动合同法》规定用人单位必须为劳动者缴纳社保，未约定违法。",
        check: (t) => (/社会保险|社保|公积金/.test(t) ? null : true),
      },
      {
        id: "probationIllegal", title: "试用期约定可能违法", severity: "mid",
        law: "《劳动合同法》第19条：合同期<1年试用≤1月；1-3年≤2月；≥3年及无固定期限≤6月，且只能约定一次。",
        check: (t) => {
          const m = t.match(/试用期[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*个月/);
          if (!m) return null;
          const p = parseFloat(m[1]);
          const ym = t.match(/合同期限[:：]?\s*([0-9]+)\s*年/) || t.match(/固定期限\s*([0-9]+)\s*年/);
          const yrs = ym ? +ym[1] : null;
          if (yrs && yrs >= 3 && p > 6) return true;
          if (yrs && yrs < 3 && yrs >= 1 && p > 2) return true;
          if (yrs && yrs < 1 && p > 1) return true;
          return null;
        },
      },
      {
        id: "illegalPenalty", title: "违约金约定可能违法", severity: "mid",
        law: "《劳动合同法》第25条：除培训服务期与竞业限制外，不得约定由劳动者承担违约金。",
        check: (t) => (/违约金/.test(t) && !/竞业限制|培训服务期|服务期/.test(t) ? true : null),
      },
    ],
  },
};
