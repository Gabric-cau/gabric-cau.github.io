(() => {
  "use strict";

  const M = 1, OMEGA = 2, PERIOD = 2 * Math.PI / OMEGA;
  const TEXT = {
    en: {
      model: "1D conceptual model", evidence: "Illustrative model, separate from hardware recordings.",
      forceTitle: "Motion out. Contact force back.", controlTitle: "Two directions through the same dynamics",
      leader: "Leader", follower: "Follower", wall: "Contact", command: "Position command", feedback: "Reflected force",
      position: "Leader position", contact: "Contact surface", actual: "Follower position", reflected: "Force on leader",
      forceNote: "Quasi-static spring contact. The follower yields at the surface; the reflected force opposes the push.",
      forceEquation: "Coupling: 80 N/m · Surface: 240 N/m · Surface position: 70 mm",
      impedance: "Impedance", admittance: "Admittance", mode: "Control relation",
      stiffness: "Stiffness K", damping: "Damping B", displacement: "Displacement x", reaction: "Reaction force", external: "External force",
      imposed: "Prescribed motion", compliant: "Compliant motion", forceInput: "Prescribed force",
      impedanceNote: "Motion is prescribed. Stiffness and damping change the opposing force required by this virtual impedance.",
      admittanceNote: "External force is prescribed. Stiffness and damping change the resulting motion and phase lag.",
      steady: "Sinusoidal steady state · M = 1 kg · ω = 2 rad/s",
      input: "Input", output: "Output", displacementAxis: "x / mm", forceAxis: "F / N", time: "t / s",
      play: "Play model", pause: "Pause model", reset: "Reset model", chart: "Displacement and force over one cycle",
      forceScene: "Leader and follower with compliant contact and reflected force", scene: "Moving end effector and force direction",
    },
    zh: {
      model: "一维原理模型", evidence: "原理示意，与真机实验记录分开展示。",
      forceTitle: "运动传向从端，接触力返回主端", controlTitle: "同一动力学关系的两种方向",
      leader: "主端", follower: "从端", wall: "接触面", command: "位置指令", feedback: "力反馈",
      position: "主端位置", contact: "接触面", actual: "从端位置", reflected: "主端反馈力",
      forceNote: "准静态弹簧接触模型。从端在接触后产生柔顺位移，反馈力与推动方向相反。",
      forceEquation: "主从耦合：80 N/m · 接触刚度：240 N/m · 接触位置：70 mm",
      impedance: "阻抗", admittance: "导纳", mode: "控制关系",
      stiffness: "刚度 K", damping: "阻尼 B", displacement: "位移 x", reaction: "反作用力", external: "外力",
      imposed: "给定位移", compliant: "柔顺位移", forceInput: "给定外力",
      impedanceNote: "给定运动后，刚度与阻尼决定这一虚拟阻抗对应的反作用力。",
      admittanceNote: "给定外力后，刚度与阻尼决定位移幅值及其相位滞后。",
      steady: "正弦稳态响应 · M = 1 kg · ω = 2 rad/s",
      input: "输入", output: "输出", displacementAxis: "x / mm", forceAxis: "F / N", time: "t / s",
      play: "播放模型", pause: "暂停模型", reset: "重置模型", chart: "一个周期内的位移与力",
      forceScene: "主从端柔顺接触与反向力反馈", scene: "末端运动与力的方向",
    },
  };

  // Closed-form steady-state responses; these curves contain no recorded signals.
  function response(mode, time, stiffness, damping) {
    const phase = OMEGA * time, dynamicStiffness = stiffness - M * OMEGA ** 2;
    if (mode === "impedance") {
      const x = .04 * Math.sin(phase);
      const velocity = .04 * OMEGA * Math.cos(phase);
      const acceleration = -(OMEGA ** 2) * x;
      return { x, force: -(M * acceleration + damping * velocity + stiffness * x), velocity, acceleration };
    }
    const denominator = dynamicStiffness ** 2 + (damping * OMEGA) ** 2;
    const x = 2 * (dynamicStiffness * Math.sin(phase) - damping * OMEGA * Math.cos(phase)) / denominator;
    const velocity = 2 * OMEGA * (dynamicStiffness * Math.cos(phase) + damping * OMEGA * Math.sin(phase)) / denominator;
    return { x, force: 2 * Math.sin(phase), velocity, acceleration: -(OMEGA ** 2) * x };
  }

  function contact(position, enabled) {
    const follower = enabled && position > 70 ? (80 * position + 240 * 70) / 320 : position;
    return { follower, force: enabled ? -240 * Math.max(0, follower - 70) / 1000 : 0 };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { response, contact, mass: M, omega: OMEGA, period: PERIOD };
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const force = { kind: "force", hostId: "force-interaction-demo", time: .3, position: 50 + 50 * Math.sin(.6), contact: true, playing: !reducedMotion.matches, visible: false };
  const control = { kind: "control", hostId: "contact-control-demo", time: .3, stiffness: 60, damping: 10, mode: "impedance", playing: !reducedMotion.matches, visible: false };
  const models = [force, control];
  const ICONS = {
    play: "assets/icons/contact-play.svg",
    pause: "assets/icons/contact-pause.svg",
    reset: "assets/icons/contact-reset.svg",
  };
  let lang = "en", active = false, frame = 0, previous = 0, observer = null, resizeObserver = null;
  const text = () => TEXT[lang];
  const get = (item, selector) => item.host?.querySelector(selector);
  const format = (value, digits = 1) => (Math.abs(value) < .5 * 10 ** -digits ? 0 : value).toFixed(digits);
  const icon = (name) => `<img src="${ICONS[name]}" alt="" width="18" height="18">`;

  function transport(item) {
    const t = text(), label = item.playing ? t.pause : t.play;
    return `<div class="contact-transport"><button type="button" class="contact-icon" data-contact-play aria-label="${label}" title="${label}" aria-pressed="${item.playing}">${icon(item.playing ? "pause" : "play")}</button><button type="button" class="contact-icon" data-contact-reset aria-label="${t.reset}" title="${t.reset}">${icon("reset")}</button><span class="contact-model-label">${t.model}</span></div>`;
  }

  function slider(name, label, min, max, value, unit) {
    return `<label class="contact-slider"><span>${label}<output data-value="${name}">${value} ${unit}</output></span><input type="range" data-contact-input="${name}" min="${min}" max="${max}" step="1" value="${value}" aria-label="${label}"></label>`;
  }

  function renderTool(item) {
    const t = text();
    item.host.classList.add("contact-demo");
    item.host.dataset.evidence = "conceptual-model";
    if (item.kind === "force") {
      item.host.innerHTML = `<div class="contact-demo-heading"><h3>${t.forceTitle}</h3>${transport(item)}</div><div class="contact-demo-grid"><div class="contact-visual"><canvas class="contact-force-scene" role="img" aria-label="${t.forceScene}"></canvas><div class="contact-readouts"><div><span>${t.actual}</span><output data-readout="follower"></output></div><div><span>${t.reflected}</span><output data-readout="force"></output></div></div></div><div class="contact-settings">${slider("position", t.position, 0, 100, Math.round(item.position), "mm")}<label class="contact-toggle"><input type="checkbox" data-contact-surface${item.contact ? " checked" : ""}><span>${t.contact}</span></label><p class="contact-equation">${t.forceEquation}</p><p class="contact-description">${t.forceNote}</p></div></div><p class="contact-evidence">${t.evidence}</p>`;
    } else {
      item.host.innerHTML = `<div class="contact-demo-heading"><h3>${t.controlTitle}</h3>${transport(item)}</div><div class="contact-mode" role="group" aria-label="${t.mode}"><button type="button" data-contact-mode="impedance" aria-pressed="${item.mode === "impedance"}">${t.impedance}</button><button type="button" data-contact-mode="admittance" aria-pressed="${item.mode === "admittance"}">${t.admittance}</button></div><div class="contact-demo-grid"><div class="contact-visual"><div class="contact-relation"><span><small>${t.input}</small>${item.mode === "impedance" ? t.imposed : t.forceInput}</span><span class="contact-relation-arrow" aria-hidden="true">→</span><span><small>${t.output}</small>${item.mode === "impedance" ? t.reaction : t.compliant}</span></div><canvas class="contact-control-scene" role="img" aria-label="${t.scene}"></canvas><canvas class="contact-response-chart" role="img" aria-label="${t.chart}"></canvas><div class="contact-readouts"><div><span>${t.displacement}</span><output data-readout="x"></output></div><div><span>${item.mode === "impedance" ? t.reaction : t.external}</span><output data-readout="force"></output></div></div></div><div class="contact-settings">${slider("stiffness", t.stiffness, 20, 120, item.stiffness, "N/m")}${slider("damping", t.damping, 2, 30, item.damping, "N·s/m")}<p class="contact-equation">${item.mode === "impedance" ? "F<sub>reaction</sub> = −(Mẍ + Bẋ + Kx)" : "Mẍ + Bẋ + Kx = F<sub>external</sub>"}</p><p class="contact-constants">${t.steady}</p><p class="contact-description">${item.mode === "impedance" ? t.impedanceNote : t.admittanceNote}</p></div></div><p class="contact-evidence">${t.evidence}</p>`;
    }
    item.host.querySelectorAll("[data-contact-input]").forEach((input) => input.addEventListener("input", () => {
      const key = input.dataset.contactInput;
      item[key] = Number(input.value);
      if (key === "position") item.playing = false;
      draw(item); syncTransport(item); schedule();
    }));
    get(item, "[data-contact-surface]")?.addEventListener("change", (event) => { item.contact = event.target.checked; draw(item); });
    item.host.querySelectorAll("[data-contact-mode]").forEach((button) => button.addEventListener("click", () => {
      item.mode = button.dataset.contactMode;
      renderTool(item); draw(item);
      get(item, `[data-contact-mode="${item.mode}"]`).focus();
    }));
    get(item, "[data-contact-play]").addEventListener("click", () => {
      if (!item.playing && item.kind === "force") item.time = Math.asin(Math.max(-1, Math.min(1, (item.position - 50) / 50))) / OMEGA;
      item.playing = !item.playing; syncTransport(item); schedule();
    });
    get(item, "[data-contact-reset]").addEventListener("click", () => {
      item.time = 0; item.playing = false;
      if (item.kind === "force") { item.position = 50; item.contact = true; }
      else { item.stiffness = 60; item.damping = 10; }
      renderTool(item); draw(item); get(item, "[data-contact-reset]").focus(); schedule();
    });
    draw(item);
  }

  function syncTransport(item) {
    const button = get(item, "[data-contact-play]");
    if (!button) return;
    const label = item.playing ? text().pause : text().play;
    button.setAttribute("aria-label", label); button.title = label;
    button.setAttribute("aria-pressed", String(item.playing));
    button.innerHTML = icon(item.playing ? "pause" : "play");
    item.host.dataset.playing = String(item.playing);
  }

  function canvas(item, selector) {
    const node = get(item, selector), width = node.clientWidth, height = node.clientHeight;
    if (!width || !height) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (node.width !== Math.round(width * ratio) || node.height !== Math.round(height * ratio)) {
      node.width = Math.round(width * ratio); node.height = Math.round(height * ratio);
    }
    const ctx = node.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1.5; ctx.font = "12px system-ui, sans-serif"; ctx.textBaseline = "middle";
    return { ctx, width, height };
  }

  function line(ctx, x1, y1, x2, y2, color, dash = []) {
    ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  }
  function arrow(ctx, x1, y, x2, color) {
    if (Math.abs(x2 - x1) < 2) return;
    line(ctx, x1, y, x2, y, color);
    const direction = Math.sign(x2 - x1);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x2, y); ctx.lineTo(x2 - direction * 7, y - 4); ctx.lineTo(x2 - direction * 7, y + 4); ctx.closePath(); ctx.fill();
  }
  function label(ctx, value, x, y, color = "#426357", align = "left") {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); ctx.textAlign = "left";
  }
  function block(ctx, x, y, color) {
    ctx.fillStyle = color; ctx.fillRect(x - 8, y - 15, 16, 30);
    line(ctx, x, y - 21, x, y + 21, "#183e31");
  }

  function drawForce(item) {
    const surface = canvas(item, ".contact-force-scene");
    if (!surface) return;
    const { ctx, width: w } = surface, t = text(), data = contact(item.position, item.contact);
    const compact = w < 500, left = 28, right = w - 28, gap = 48;
    const trackWidth = compact ? right - left : (right - left - gap) / 2;
    const leaderStart = left, followerStart = compact ? left : left + trackWidth + gap;
    const leaderY = compact ? 62 : 89, followerY = compact ? 220 : 89;
    const leaderX = leaderStart + item.position / 100 * trackWidth;
    const followerX = followerStart + data.follower / 100 * trackWidth;
    const wallX = followerStart + .7 * trackWidth;
    label(ctx, t.leader, leaderStart, leaderY - 32, "#183e31");
    label(ctx, t.follower, followerStart, followerY - 32, "#183e31");
    line(ctx, leaderStart, leaderY, leaderStart + trackWidth, leaderY, "#80958a");
    line(ctx, followerStart, followerY, followerStart + trackWidth, followerY, "#80958a");
    if (item.contact) {
      ctx.fillStyle = "#f3d6ce"; ctx.fillRect(wallX, followerY - 22, followerStart + trackWidth - wallX, 44);
      line(ctx, wallX, followerY - 25, wallX, followerY + 25, "#b64d3c");
      label(ctx, t.wall, wallX, followerY + 41, "#a64132", "center");
    }
    block(ctx, leaderX, leaderY, "#bdda54"); block(ctx, followerX, followerY, "#183e31");
    const commandX = followerStart + item.position / 100 * trackWidth;
    line(ctx, commandX, followerY - 25, commandX, followerY + 25, "#638633", [3, 3]);
    const reactionLength = Math.min(45, Math.abs(data.force) * 24);
    arrow(ctx, leaderX, leaderY + 27, leaderX - reactionLength, "#be4e3b");
    arrow(ctx, followerX, followerY - 32, followerX - reactionLength, "#be4e3b");
    const flowStart = compact ? left + 14 : left + 45, flowEnd = compact ? right - 14 : right - 45;
    const forwardY = compact ? 118 : 157, reverseY = compact ? 153 : 212;
    arrow(ctx, flowStart, forwardY, flowEnd, "#638633");
    label(ctx, t.command, w / 2, forwardY - 13, "#426357", "center");
    arrow(ctx, flowEnd, reverseY, flowStart, Math.abs(data.force) > .001 ? "#be4e3b" : "#acb7b0");
    label(ctx, t.feedback, w / 2, reverseY + 15, "#a64132", "center");
    get(item, '[data-readout="follower"]').textContent = `${format(data.follower)} mm`;
    get(item, '[data-readout="force"]').textContent = `${format(data.force, 2)} N`;
    get(item, '[data-value="position"]').textContent = `${format(item.position, 0)} mm`;
    get(item, '[data-contact-input="position"]').value = item.position;
  }

  function drawControl(item) {
    const current = response(item.mode, item.time, item.stiffness, item.damping), t = text();
    const scene = canvas(item, ".contact-control-scene");
    if (scene) {
      const { ctx, width: w, height: h } = scene, center = w / 2, y = h / 2 - 5;
      const x = center + current.x / .14 * (w / 2 - 34);
      line(ctx, 24, y, w - 24, y, "#8da397");
      line(ctx, center, y - 23, center, y + 24, "#a7b6ad", [3, 3]);
      block(ctx, x, y, "#183e31");
      arrow(ctx, x, y - 26, x + current.force / 6 * Math.min(w / 4, 100), "#bc4b38");
      label(ctx, "−140 mm", 24, h - 14); label(ctx, "0", center, h - 14, "#426357", "center"); label(ctx, "+140 mm", w - 24, h - 14, "#426357", "right");
    }
    const chart = canvas(item, ".contact-response-chart");
    if (chart) {
      const { ctx, width: w } = chart, left = 47, right = w - 16, length = right - left;
      const phase = ((item.time % PERIOD) + PERIOD) % PERIOD;
      const markerX = left + phase / PERIOD * length;
      for (const [key, middle, limit, color, title] of [["x", 52, .14, "#254b3c", t.displacementAxis], ["force", 137, 6, "#bc4b38", t.forceAxis]]) {
        label(ctx, title, left, middle - 38, color);
        line(ctx, left, middle, right, middle, "#b7c6bb");
        line(ctx, left, middle - 27, right, middle - 27, "#d9e1da");
        line(ctx, left, middle + 27, right, middle + 27, "#d9e1da");
        label(ctx, key === "x" ? "+140" : "+6", left - 6, middle - 27, "#647d6e", "right");
        label(ctx, key === "x" ? "−140" : "−6", left - 6, middle + 27, "#647d6e", "right");
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= 180; i++) {
          const data = response(item.mode, i / 180 * PERIOD, item.stiffness, item.damping);
          const px = left + i / 180 * length, py = middle - data[key] / limit * 27;
          if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke(); ctx.lineWidth = 1;
        line(ctx, markerX, middle - 29, markerX, middle + 29, "#849987", [2, 3]);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(markerX, middle - current[key] / limit * 27, 4, 0, 2 * Math.PI); ctx.fill();
      }
      label(ctx, "0", left, 185); label(ctx, "π", right, 185, "#426357", "right"); label(ctx, t.time, (left + right) / 2, 185, "#426357", "center");
    }
    get(item, '[data-readout="x"]').textContent = `${format(current.x * 1000)} mm`;
    get(item, '[data-readout="force"]').textContent = `${format(current.force, 2)} N`;
    for (const [key, unit] of [["stiffness", "N/m"], ["damping", "N·s/m"]]) get(item, `[data-value="${key}"]`).textContent = `${item[key]} ${unit}`;
    item.host.dataset.mode = item.mode;
  }

  function draw(item) {
    if (!item.host) return;
    item.host.dataset.modelTime = item.time.toFixed(3);
    item.host.dataset.playing = String(item.playing);
    if (item.kind === "force") drawForce(item); else drawControl(item);
  }

  function shouldAnimate(item) { return active && !document.hidden && item.host?.isConnected && item.visible && item.playing; }
  function schedule() {
    if (!models.some(shouldAnimate)) { cancelAnimationFrame(frame); frame = 0; previous = 0; return; }
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function tick(timestamp) {
    frame = 0;
    const delta = previous ? Math.min((timestamp - previous) / 1000, .05) : 0;
    previous = timestamp;
    for (const item of models) {
      if (!shouldAnimate(item)) continue;
      item.time += delta;
      if (item.kind === "force") item.position = 50 + 50 * Math.sin(OMEGA * item.time);
      draw(item);
    }
    schedule();
  }

  function render(language = "en") {
    lang = language === "zh" ? "zh" : "en"; active = true;
    observer?.disconnect(); resizeObserver?.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const item = models.find((candidate) => candidate.host === entry.target);
        if (item) item.visible = entry.isIntersecting;
      }
      schedule();
    }, { threshold: .05 });
    resizeObserver = new ResizeObserver(() => models.forEach(draw));
    for (const item of models) {
      item.host = document.getElementById(item.hostId); item.visible = false;
      if (!item.host) continue;
      renderTool(item); observer.observe(item.host); resizeObserver.observe(item.host);
    }
    schedule();
  }
  function pause() { active = false; cancelAnimationFrame(frame); frame = 0; previous = 0; }
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) for (const item of models) { item.playing = false; syncTransport(item); }
    schedule();
  });
  window.PortfolioContact = Object.freeze({ render, pause });
})();
