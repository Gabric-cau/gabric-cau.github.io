(() => {
  "use strict";
  const copy = {
    zh: {
      mechanism: "让接触阻力传回主臂", qualifier: "2-DoF 主从力反馈 · 原理示意",
      free: "自由运动", contact: "接触物体", leader: "主臂 · 操作者", follower: "从臂 · 环境",
      motion: "位置与速度", feedback: "接触力矩反馈", noFeedback: "无接触反馈", object: "物体",
      freeState: "主臂带动从臂运动；重力补偿减轻机械臂自身重量对操作的影响。",
      contactState: "从臂接触物体后，估算出的接触力矩经滤波返回主臂，形成与推动方向相反的阻力。",
      introTitle: "从位置跟随到力的交互",
      intro: "我希望操作者不只看见从臂动作，也能感到它碰到物体。为此，我把重力补偿、接触判断和力矩反馈接到主从控制中，重点调试反馈方向与噪声带来的抖动。",
      steps: [
        ["分离自重与接触", "我根据关节姿态计算重力力矩，再从电机力矩中减去它，估算外部接触的影响。"],
        ["抑制接触抖动", "我用迟滞判断减少接触状态反复切换，并以非对称低通分别处理力矩上升和回落。"],
        ["接入力矩控制", "主臂保留重力补偿，再减去处理后的接触力矩。我通过 MIT 指令把这一反馈送回主臂。"]
      ],
      original: "原始分析图",
      analysisTitle: "处理前后的力矩曲线", analysisType: "关节跟踪力矩 · 离线滤波对比",
      raw: "记录信号", filtered: "离线低通结果", joint1: "关节 1", joint2: "关节 2", time: "时间", torque: "力矩 (Nm)",
      caption: "我用关节跟踪力矩记录检查非对称低通处理前后的变化。该离线信号为 τpd = kp·位置误差 + kd·速度误差，与上方的接触力矩估计不同。",
      timing: "时间轴沿用原分析的 500 Hz 假设。", loading: "加载分析数据", chartLabel: "关节跟踪力矩记录与离线低通结果，使用相同坐标尺度。",
      failed: "互动曲线暂未载入，先展示原始分析图。", readingRaw: "记录", readingFiltered: "低通"
    },
    en: {
      mechanism: "Returning contact resistance", qualifier: "2-DoF FORCE FEEDBACK · CONCEPTUAL VIEW",
      free: "Free motion", contact: "In contact", leader: "Leader · operator", follower: "Follower · environment",
      motion: "Position + velocity", feedback: "Contact torque feedback", noFeedback: "No contact feedback", object: "Object",
      freeState: "The follower tracks the leader. Gravity compensation reduces the effect of the arms' own weight on the operator.",
      contactState: "When the follower meets an object, estimated contact torque is filtered and returned to the leader as resistance against the push.",
      introTitle: "From following motion to feeling contact",
      intro: "I want to feel when the remote arm meets an object. That led me to combine gravity compensation, contact detection and torque feedback, with particular attention to feedback direction and noise.",
      steps: [
        ["Separate weight from contact", "I estimate gravity torque from the follower pose, then subtract it from motor torque to estimate the external contribution."],
        ["Keep contact feedback stable", "Hysteresis reduces rapid contact-state switching. An asymmetric low-pass filter treats rising and falling torque differently."],
        ["Feed resistance back", "I retain gravity compensation on the leader and subtract the processed contact torque, sending the result through MIT torque commands."]
      ],
      original: "Original analysis",
      analysisTitle: "Torque before and after filtering", analysisType: "JOINT TRACKING TORQUE · OFFLINE FILTER COMPARISON",
      raw: "Recorded signal", filtered: "Offline low-pass result", joint1: "Joint 1", joint2: "Joint 2", time: "Time", torque: "Torque (Nm)",
      caption: "I compare this joint-tracking torque record before and after asymmetric low-pass filtering. Its signal is τpd = kp·position error + kd·velocity error, not measured contact torque.",
      timing: "The offline time axis assumes 500 Hz, as in the original analysis.", loading: "Loading analysis data", chartLabel: "Recorded joint tracking torque and offline low-pass output on the same scale.",
      failed: "Interactive data is unavailable; showing the original analysis plot.", readingRaw: "Recorded", readingFiltered: "Low-pass"
    }
  };
  let root;
  let language = "zh";
  let joint = 0;
  let contact = true;
  let data;
  let dataPromise;
  let failed = false;
  let hoveredIndex = null;
  let resizeObserver;
  let resizeFrame;
  const palette = { ink: "#17392e", muted: "#63766c", rule: "#d8e1da", blue: "#397cac", coral: "#d94f3c", raw: "#7898ab", green: "#2a6250", white: "#f8faf7" };
  const esc = (value) => String(value).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
  const c = () => copy[language];

  function setup(canvas) {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return null;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    return { context, width, height };
  }

  function text(context, value, x, y, options = {}) {
    context.font = `${options.bold ? "600 " : ""}${options.size || 13}px system-ui, sans-serif`;
    context.textAlign = options.align || "left";
    context.textBaseline = "middle";
    context.fillStyle = options.color || palette.ink;
    context.fillText(value, x, y);
  }

  function line(context, points, color, width = 2, dash = []) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.setLineDash(dash);
    context.beginPath();
    points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.stroke();
    context.setLineDash([]);
  }

  function arrow(context, x1, y1, x2, y2, color, width = 2) {
    line(context, [[x1, y1], [x2, y2]], color, width);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    line(context, [[x2 - 7 * Math.cos(angle - .45), y2 - 7 * Math.sin(angle - .45)], [x2, y2], [x2 - 7 * Math.cos(angle + .45), y2 - 7 * Math.sin(angle + .45)]], color, width);
  }

  function circle(context, x, y, radius, color, stroke) {
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = color; context.fill();
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = 2; context.stroke(); }
  }

  function arm(context, base, elbow, tip, active) {
    line(context, [[base[0] - 19, base[1] + 10], [base[0] + 19, base[1] + 10]], palette.muted, 3);
    line(context, [base, elbow, tip], "#bdd0c5", 15);
    line(context, [base, elbow, tip], palette.green, 3);
    [base, elbow].forEach(([x, y]) => circle(context, x, y, 7, palette.white, palette.green));
    circle(context, tip[0], tip[1], 6, active ? palette.coral : palette.blue);
  }

  function drawMechanism() {
    const canvas = root?.querySelector("[data-force-mechanism]");
    if (!canvas) return;
    const box = setup(canvas);
    if (!box) return;
    const { context: ctx, width: w, height: h } = box;
    const narrow = w < 520;
    const leftX = w * .19;
    const rightX = w * .68;
    const armSize = Math.min(w * .19, 138);
    const bottom = h * .64;
    const elbowY = bottom - armSize * .6;
    const tipY = elbowY - armSize * .2;
    const forward = contact ? .78 : .48;
    const leaderTip = [leftX + armSize * forward, tipY];
    const followerTip = [rightX + armSize * forward, tipY];
    const wallX = rightX + armSize * .78 + 8;
    text(ctx, c().leader, w * .23, 17, { bold: true, align: "center", size: narrow ? 12 : 15 });
    text(ctx, c().follower, w * .75, 17, { bold: true, align: "center", size: narrow ? 12 : 15 });
    const arrowY = 51;
    arrow(ctx, w * .34, arrowY, w * .59, arrowY, palette.blue);
    text(ctx, c().motion, w * .465, arrowY - 15, { align: "center", size: narrow ? 11 : 13, color: palette.blue });
    ctx.fillStyle = "#dde3dd";
    ctx.fillRect(wallX, tipY - 24, Math.max(14, w * .025), armSize + 20);
    ctx.save();
    ctx.beginPath(); ctx.rect(wallX, tipY - 24, Math.max(14, w * .025), armSize + 20); ctx.clip();
    for (let y = tipY - 40; y < bottom + 40; y += 10) line(ctx, [[wallX, y], [wallX + 25, y + 25]], "#a5b6aa", 1);
    ctx.restore();
    arm(ctx, [leftX, bottom], [leftX + armSize * .1, elbowY], leaderTip, contact);
    arm(ctx, [rightX, bottom], [rightX + armSize * .1, elbowY], followerTip, contact);
    if (contact) {
      circle(ctx, followerTip[0], followerTip[1], 15, "rgba(217,79,60,.14)");
      arrow(ctx, leaderTip[0] + 30, leaderTip[1] + 22, leaderTip[0] + 7, leaderTip[1] + 22, palette.coral, 3);
      arrow(ctx, followerTip[0] + 2, followerTip[1] - 16, followerTip[0] - 22, followerTip[1] - 16, palette.coral, 3);
    }
    const returnY = h - 48;
    const returnColor = contact ? palette.coral : "#a3b1a7";
    line(ctx, [[rightX, bottom + 20], [rightX, returnY], [leftX, returnY]], returnColor, contact ? 2.5 : 1.5, contact ? [] : [5, 5]);
    arrow(ctx, leftX, returnY, leftX, bottom + 24, returnColor, contact ? 2.5 : 1.5);
    text(ctx, contact ? c().feedback : c().noFeedback, (rightX + leftX) / 2, returnY + 20, { align: "center", color: returnColor, bold: contact, size: narrow ? 12 : 14 });
  }

  function drawPlot() {
    const canvas = root?.querySelector("[data-force-plot]");
    if (!canvas || !data) return;
    const box = setup(canvas);
    if (!box) return;
    const { context: ctx, width: w, height: h } = box;
    const margin = { left: 49, right: 12, top: 24, bottom: 39 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;
    const all = data.joints.flatMap((entry) => entry.raw.concat(entry.filtered));
    const extent = Math.ceil(Math.max(...all.map(Math.abs)) * 1.12 * 10) / 10;
    const x = (index) => margin.left + index / (data.samples - 1) * pw;
    const y = (value) => margin.top + (.5 - value / (extent * 2)) * ph;
    for (let i = 0; i <= 4; i += 1) {
      const value = extent - i * extent / 2;
      const yy = y(value);
      line(ctx, [[margin.left, yy], [w - margin.right, yy]], i === 2 ? "#bac8be" : palette.rule, 1);
      text(ctx, value.toFixed(1), margin.left - 8, yy, { align: "right", color: palette.muted, size: 11 });
    }
    const ticks = w < 500 ? 3 : 6;
    for (let i = 0; i <= ticks; i += 1) {
      const xx = margin.left + i / ticks * pw;
      line(ctx, [[xx, margin.top], [xx, h - margin.bottom]], palette.rule, 1);
      text(ctx, `${(data.duration_s * i / ticks).toFixed(1)}`, xx, h - 20, { align: i === ticks ? "right" : "center", color: palette.muted, size: 11 });
    }
    text(ctx, "Nm", margin.left, 9, { color: palette.muted, size: 11 });
    text(ctx, "s", w - 1, h - 20, { align: "right", color: palette.muted, size: 11 });
    const values = data.joints[joint];
    ctx.save(); ctx.beginPath(); ctx.rect(margin.left, margin.top, pw, ph); ctx.clip();
    line(ctx, values.raw.map((v, i) => [x(i), y(v)]), palette.raw, 1.2);
    line(ctx, values.filtered.map((v, i) => [x(i), y(v)]), palette.coral, 2);
    if (hoveredIndex !== null) {
      const px = x(hoveredIndex);
      line(ctx, [[px, margin.top], [px, h - margin.bottom]], palette.muted, 1, [4, 4]);
      circle(ctx, px, y(values.raw[hoveredIndex]), 4, palette.raw);
      circle(ctx, px, y(values.filtered[hoveredIndex]), 4, palette.coral);
    }
    ctx.restore();
    const reading = root.querySelector("[data-force-reading]");
    if (reading) {
      const i = hoveredIndex === null ? Math.floor(data.samples / 2) : hoveredIndex;
      reading.innerHTML = `<span>${esc(c().time)} ${(i / data.sample_rate_assumed_hz).toFixed(3)} s</span><span>${esc(c().readingRaw)} ${values.raw[i].toFixed(3)} Nm</span><span>${esc(c().readingFiltered)} ${values.filtered[i].toFixed(3)} Nm</span>`;
    }
  }

  function requestDraw() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { drawMechanism(); drawPlot(); });
  }

  function ensureData() {
    if (!data && !dataPromise) {
      failed = false;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      dataPromise = fetch("assets/data/force-filter-replay.json", { signal: controller.signal, cache: "no-cache" })
        .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
        .then((value) => {
          if (value.schema !== "portfolio-force-filter-replay-v1" || value.signal !== "tau_pd" || value.joints?.length !== 2
            || !Number.isInteger(value.samples) || value.samples < 2 || !Number.isFinite(value.sample_rate_assumed_hz) || value.sample_rate_assumed_hz <= 0) throw new Error("Invalid force analysis");
          if (value.joints.some((entry) => entry.raw.length !== value.samples || entry.filtered.length !== value.samples || entry.raw.some((v) => !Number.isFinite(v)) || entry.filtered.some((v) => !Number.isFinite(v)))) throw new Error("Invalid force samples");
          data = value;
        }).catch(() => { failed = true; }).finally(() => {
          clearTimeout(timeout); dataPromise = null; render(language, false);
        });
      render(language, false);
    }
    return dataPromise;
  }

  function render(nextLanguage = language, retryFailed = true) {
    language = nextLanguage === "en" ? "en" : "zh";
    root = document.getElementById("force-lab");
    if (!root) return;
    const t = c();
    root.classList.add("force-story");
    root.dataset.forceLoad = data ? "ready" : failed ? "error" : "loading";
    root.innerHTML = `
      <div class="force-story__top">
        <div class="force-story__mechanism">
          <div class="force-story__bar"><div><p class="force-story__eyebrow">${esc(t.qualifier)}</p><h3>${esc(t.mechanism)}</h3></div>
            <div class="force-story__segmented" role="group" aria-label="${esc(t.mechanism)}">
              <button type="button" data-force-contact="false" aria-pressed="${!contact}">${esc(t.free)}</button>
              <button type="button" data-force-contact="true" aria-pressed="${contact}">${esc(t.contact)}</button>
            </div>
          </div>
          <canvas data-force-mechanism role="img" aria-label="${esc(contact ? t.contactState : t.freeState)}"></canvas>
          <p class="force-story__state" data-force-state aria-live="polite">${esc(contact ? t.contactState : t.freeState)}</p>
        </div>
        <aside class="force-story__explanation">
          <h3>${esc(t.introTitle)}</h3><p>${esc(t.intro)}</p>
          <ol class="force-story__steps">${t.steps.map(([title, body]) => `<li><div><strong>${esc(title)}</strong><span>${esc(body)}</span></div></li>`).join("")}</ol>
        </aside>
      </div>
      <div class="force-story__analysis">
        <div class="force-story__bar"><div><p class="force-story__eyebrow">${esc(t.analysisType)}</p><h3>${esc(t.analysisTitle)}</h3></div>
          ${!failed ? `<div class="force-story__segmented" role="group" aria-label="${esc(t.analysisTitle)}"><button type="button" data-force-joint="0" aria-pressed="${joint === 0}">${esc(t.joint1)}</button><button type="button" data-force-joint="1" aria-pressed="${joint === 1}">${esc(t.joint2)}</button></div>` : ""}
        </div>
        ${failed ? `<p class="force-story__reading" role="status">${esc(t.failed)} <button type="button" data-force-retry title="${esc(t.loading)}" aria-label="${esc(t.loading)}">&#8635;</button></p><figure class="force-story__figure"><img src="assets/force-filter-offline.png" alt="${esc(t.failed)}" width="1800" height="900"></figure>` : `<div class="force-story__legend"><span><i></i>${esc(t.raw)}</span><span class="is-filtered"><i></i>${esc(t.filtered)}</span></div><canvas class="force-story__plot" data-force-plot role="img" aria-label="${esc(t.chartLabel)}"></canvas><p class="force-story__reading" data-force-reading>${data ? "" : esc(t.loading)}</p>`}
        <div class="force-story__caption"><p>${esc(t.caption)} ${esc(t.timing)}</p><div class="force-story__source"><a href="assets/force-filter-offline.png" target="_blank" rel="noreferrer">${esc(t.original)} ↗</a></div></div>
      </div>`;
    root.querySelectorAll("[data-force-contact]").forEach((button) => button.addEventListener("click", () => {
      contact = button.dataset.forceContact === "true";
      root.querySelectorAll("[data-force-contact]").forEach((item) => item.setAttribute("aria-pressed", String((item.dataset.forceContact === "true") === contact)));
      root.querySelector("[data-force-state]").textContent = contact ? c().contactState : c().freeState;
      root.querySelector("[data-force-mechanism]").setAttribute("aria-label", contact ? c().contactState : c().freeState);
      drawMechanism();
    }));
    root.querySelectorAll("[data-force-joint]").forEach((button) => button.addEventListener("click", () => {
      joint = Number(button.dataset.forceJoint);
      root.querySelectorAll("[data-force-joint]").forEach((item) => item.setAttribute("aria-pressed", String(Number(item.dataset.forceJoint) === joint)));
      drawPlot();
    }));
    root.querySelector("[data-force-retry]")?.addEventListener("click", ensureData);
    const canvas = root.querySelector("[data-force-plot]");
    canvas?.addEventListener("pointermove", (event) => {
      if (!data) return;
      const rect = canvas.getBoundingClientRect();
      hoveredIndex = Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left - 49) / (rect.width - 61))) * (data.samples - 1));
      drawPlot();
    });
    canvas?.addEventListener("pointerleave", () => { hoveredIndex = null; drawPlot(); });
    resizeObserver?.disconnect();
    if ("ResizeObserver" in window) { resizeObserver = new ResizeObserver(requestDraw); resizeObserver.observe(root); }
    requestDraw();
    if (retryFailed) ensureData();
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { requestDraw(); if (failed && root?.getBoundingClientRect().width) ensureData(); }
  });
  window.addEventListener("online", () => { if (failed) ensureData(); });
  window.addEventListener("pageshow", requestDraw);
  window.PortfolioForce = { init: () => render(document.documentElement.lang.startsWith("en") ? "en" : "zh"), render };
})();
