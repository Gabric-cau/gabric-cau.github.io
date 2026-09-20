(() => {
  "use strict";

  const TEXT = {
    zh: {
      flow: [["后台采样", "与控制循环并行"], ["最新目标", "替换待处理姿态"], ["滤波与在线插值", "延续当前运动状态"], ["FR3 执行", "125 Hz ServoJ"]],
      tabs: ["滤波前后", "目标与连续指令", "实际跟随"],
      descriptions: [
        "我记录原始输入和 Kalman 输出，在同一时间轴上比较滤波前后的变化。调参时同时检查小幅抖动和快速转向的跟随延迟，平衡平稳程度与响应速度。",
        "我采用最新待处理目标，避免逐个追赶已经过时的姿态。满足到位、超时等切换条件后，复用样条 SDK 的五次插值，从当前的位置、速度和加速度接续轨迹。",
        "我将采样线程与控制循环分开，以 125 Hz 下发 ServoJ 指令，并记录实测关节位置。对照指令与实际曲线，检查快速动作、方向切换时的跟随误差，再回到滤波和插值参数调试。",
      ],
      labels: { raw: "原始输入", filtered: "Kalman 输出", target: "更新的目标", command: "连续指令", actual: "实际关节位置" },
      plotTitle: ["输入处理", "在线五次插值", "指令跟随"],
      joint: "关节", full: "完整记录", detail: "4 秒细节", window: "时间范围", seek: "记录时间",
      video: "FR3 真机抓取", videoNote: "真机演示与右侧记录为独立素材。", degrees: "角度变化 / °",
      recording: "同一次运行记录", paused: "已暂停", playing: "播放中", play: "播放记录", pause: "暂停记录", restart: "回到片段起点",
      source: "实测记录 · Kalman + Quintic", note: "原始时间戳与配对信号，使用相同角度基准。", loading: "正在载入实验记录", error: "实验记录暂时未能载入", retry: "重新载入", view: "对比阶段", time: "时间", difference: "两条曲线的差值",
    },
    en: {
      flow: [["Background sampling", "Concurrent with control"], ["Latest target", "Replace pending pose"], ["Filter + interpolate", "Continue the current motion"], ["FR3 execution", "125 Hz ServoJ"]],
      tabs: ["Before / after filtering", "Target / continuous command", "Actual tracking"],
      descriptions: [
        "Responsive motion matters as much to me as a clean signal. I compare raw input and Kalman output on the same timeline, tuning for less jitter without making quick changes feel sluggish.",
        "I reuse my SDK's quintic interpolation and keep only the latest pending pose. Reaching a target, timeout or another switching condition triggers replanning, preserving current position, velocity and acceleration for the next motion segment.",
        "I separated background sampling from the 125 Hz ServoJ loop, so reads run alongside control. Comparing commands with measured joints shows where fast moves and reversals lose accuracy, guiding my filter and trajectory tuning.",
      ],
      labels: { raw: "Raw input", filtered: "Kalman output", target: "Updated target", command: "Continuous command", actual: "Actual joint position" },
      plotTitle: ["Input processing", "Online quintic interpolation", "Command tracking"],
      joint: "Joint", full: "Full recording", detail: "4 s detail", window: "Time range", seek: "Recording time",
      video: "FR3 hardware grasping", videoNote: "Hardware video and signal recording are separate runs.", degrees: "Angle change / °",
      recording: "Paired signals from one run", paused: "Paused", playing: "Playing", play: "Play recording", pause: "Pause recording", restart: "Return to window start",
      source: "RECORDED · KALMAN + QUINTIC", note: "Original timestamps; paired signals share the same angular reference.", loading: "Loading experiment recording", error: "Experiment recording could not be loaded", retry: "Retry", view: "Comparison", time: "Time", difference: "Difference between signals",
    },
  };
  const MODES = [
    { id: "filter", signals: ["raw", "filtered"], colors: ["#a6c8dc", "#d8f263"] },
    { id: "interpolation", signals: ["target", "command"], colors: ["#a6c8dc", "#d8f263"] },
    { id: "tracking", signals: ["command", "actual"], colors: ["#d8f263", "#ff8978"] },
  ];
  const state = { host: null, lang: "zh", data: null, loading: null, error: false, mode: 0, joint: 0, detail: false, time: 7, playing: false, lastFrame: 0, animation: 0, observer: null };
  const text = () => TEXT[state.lang];
  const find = (selector) => state.host?.querySelector(selector);
  const finite = (value) => Number.isFinite(value);
  const duration = () => state.data?.time_s.at(-1) || 1;

  function domain(values) {
    let min = Infinity, max = -Infinity;
    for (const value of values) if (finite(value)) { min = Math.min(min, value); max = Math.max(max, value); }
    if (!finite(min)) return [-1, 1];
    const padding = Math.max((max - min) * .12, .25);
    return [min - padding, max + padding];
  }

  function nearestIndex(times, time) {
    let low = 0, high = times.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (times[mid] < time) low = mid + 1; else high = mid;
    }
    return low && Math.abs(times[low - 1] - time) < Math.abs(times[low] - time) ? low - 1 : low;
  }

  function windowRange() {
    if (!state.detail) return [0, duration()];
    const start = Math.max(0, Math.min(duration() - 4, state.detailStart ?? Math.floor(state.time - 2)));
    return [start, Math.min(duration(), start + 4)];
  }

  function validData(data) {
    return data?.schema === "portfolio-teleop-paired-v1" && Array.isArray(data.time_s) && data.time_s.length > 1
      && data.time_s.every((time, index, values) => finite(time) && (!index || time > values[index - 1]))
      && Array.isArray(data.joints) && data.joints.length === 6
      && data.joints.every((joint) => ["raw", "filtered", "target", "command", "actual"].every((key) =>
        Array.isArray(joint[key]) && joint[key].length === data.time_s.length
        && joint[key].every(value => value === null || finite(value)) && joint[key].some(finite)));
  }

  function render(language = "zh", retryFailed = true) {
    state.lang = language === "en" ? "en" : "zh";
    const host = document.getElementById("teleop-lab");
    if (!host) return;
    state.host = host;
    const previousVideo = find("#ctl-teleop-video");
    stop();
    state.observer?.disconnect();
    const t = text();
    host.classList.add("ctl-teleop");
    host.dataset.evidenceMode = state.data ? "recorded" : state.error ? "error" : "loading";
    host.innerHTML = `
      <ol class="ctl-teleop-flow">${t.flow.map(([title, detail], i) => `<li><span class="ctl-teleop-number">0${i + 1}</span><div><strong>${title}</strong><span>${detail}</span></div></li>`).join("")}</ol>
      <div class="ctl-teleop-body">
        <figure class="ctl-teleop-video">
          <video id="ctl-teleop-video" src="assets/media/arm-teleop-grasp.mp4" poster="assets/media/arm-teleop-grasp-poster.jpg" controls muted playsinline preload="metadata" aria-label="${t.video}"></video>
          <figcaption><strong>${t.video}</strong><span>${t.videoNote}</span></figcaption>
        </figure>
        <div class="ctl-teleop-analysis">
          <div class="ctl-teleop-tabs" role="tablist" aria-label="${t.view}">${t.tabs.map((label, i) => `<button type="button" role="tab" id="ctl-teleop-tab-${i}" aria-controls="ctl-teleop-panel" aria-selected="${state.mode === i}" tabindex="${state.mode === i ? 0 : -1}" data-teleop-mode="${i}">${label}</button>`).join("")}</div>
          <div id="ctl-teleop-panel" role="tabpanel" aria-labelledby="ctl-teleop-tab-${state.mode}">
            <div class="ctl-teleop-topline"><strong>${t.plotTitle[state.mode]}</strong><label>${t.joint}<select id="ctl-teleop-joint" aria-label="${t.joint}">${Array.from({ length: 6 }, (_, i) => `<option value="${i}"${state.joint === i ? " selected" : ""}>J${i + 1}</option>`).join("")}</select></label><div class="ctl-teleop-window" role="group" aria-label="${t.window}"><button type="button" data-teleop-window="full" aria-pressed="${!state.detail}">${t.full}</button><button type="button" data-teleop-window="detail" aria-pressed="${state.detail}">${t.detail}</button></div></div>
            <div class="ctl-teleop-legend">${MODES[state.mode].signals.map((key, i) => `<span><i style="--signal-color:${MODES[state.mode].colors[i]}"></i>${t.labels[key]}</span>`).join("")}<small>${t.recording}</small></div>
            <div class="ctl-teleop-plot"><canvas id="ctl-teleop-canvas" aria-label="${t.plotTitle[state.mode]} · J${state.joint + 1}"></canvas><p class="ctl-teleop-load"${state.data ? " hidden" : ""}>${state.error ? t.error : t.loading}${state.error ? `<button type="button" data-teleop-retry>${t.retry}</button>` : ""}</p></div>
            <div class="ctl-teleop-transport"><button type="button" id="ctl-teleop-play" class="ctl-teleop-icon" aria-label="${t.play}" title="${t.play}" aria-pressed="false">&#9654;</button><button type="button" id="ctl-teleop-restart" class="ctl-teleop-icon" aria-label="${t.restart}" title="${t.restart}">&#8634;</button><input id="ctl-teleop-seek" type="range" min="0" max="${duration()}" step="0.001" value="${state.time}" aria-label="${t.seek}"><output id="ctl-teleop-time">${state.time.toFixed(2)} s</output></div>
            <div class="ctl-teleop-readout" aria-live="off"></div>
            <p class="ctl-teleop-explanation">${t.descriptions[state.mode]}</p>
            <p class="ctl-teleop-source"><span>${t.source}</span>${t.note}</p>
          </div>
        </div>
      </div>`;
    if (previousVideo) {
      previousVideo.setAttribute("aria-label", t.video);
      find("#ctl-teleop-video").replaceWith(previousVideo);
    }
    bind();
    state.observer = new ResizeObserver(draw);
    state.observer.observe(find(".ctl-teleop-plot"));
    updateReadout();
    draw();
    if (!state.data && !state.loading && retryFailed) load();
  }

  function bind() {
    state.host.querySelectorAll("[data-teleop-mode]").forEach((button) => {
      button.addEventListener("click", () => { state.mode = Number(button.dataset.teleopMode); render(state.lang); find(`#ctl-teleop-tab-${state.mode}`).focus({ preventScroll: true }); });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        state.mode = event.key === "Home" ? 0 : event.key === "End" ? 2 : (state.mode + (event.key === "ArrowRight" ? 1 : 2)) % 3;
        render(state.lang); find(`#ctl-teleop-tab-${state.mode}`).focus({ preventScroll: true });
      });
    });
    find("#ctl-teleop-joint").addEventListener("change", (event) => { state.joint = Number(event.target.value); draw(); updateReadout(); });
    state.host.querySelectorAll("[data-teleop-window]").forEach((button) => button.addEventListener("click", () => {
      state.detail = button.dataset.teleopWindow === "detail";
      state.detailStart = Math.max(0, Math.min(duration() - 4, state.time - 2));
      render(state.lang);
    }));
    find("#ctl-teleop-play").addEventListener("click", () => {
      if (state.playing) { stop(); return; }
      if (!state.data) return;
      const [start, end] = windowRange();
      if (state.time >= end || state.time < start) state.time = start;
      state.playing = true; state.lastFrame = 0; updatePlay(); state.animation = requestAnimationFrame(tick);
    });
    find("#ctl-teleop-restart").addEventListener("click", () => { stop(); state.time = windowRange()[0]; updateReadout(); draw(); });
    find("#ctl-teleop-seek").addEventListener("input", (event) => { stop(); state.time = Number(event.target.value); updateReadout(); draw(); });
    find("[data-teleop-retry]")?.addEventListener("click", load);
  }

  function stop() {
    state.playing = false;
    cancelAnimationFrame(state.animation);
    state.lastFrame = 0;
    updatePlay();
  }

  function updatePlay() {
    const button = find("#ctl-teleop-play");
    if (!button) return;
    const label = state.playing ? text().pause : text().play;
    button.innerHTML = state.playing ? "&#10074;&#10074;" : "&#9654;";
    button.setAttribute("aria-pressed", String(state.playing)); button.setAttribute("aria-label", label); button.title = label;
  }

  function tick(now) {
    if (!state.playing) return;
    const rect = state.host.getBoundingClientRect();
    if (document.hidden || !rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) { stop(); return; }
    const delta = state.lastFrame ? Math.min(.05, (now - state.lastFrame) / 1000) : 0;
    state.lastFrame = now;
    state.time = Math.min(windowRange()[1], state.time + delta);
    updateReadout(); draw();
    if (state.time >= windowRange()[1]) { stop(); return; }
    state.animation = requestAnimationFrame(tick);
  }

  function updateReadout() {
    if (!state.data || !find(".ctl-teleop-readout")) return;
    const index = nearestIndex(state.data.time_s, state.time), joint = state.data.joints[state.joint], mode = MODES[state.mode];
    const number = (value) => finite(value) ? `${value.toFixed(2)}°` : "-";
    const a = joint[mode.signals[0]][index], b = joint[mode.signals[1]][index];
    find(".ctl-teleop-readout").innerHTML = mode.signals.map((key, i) => `<div><span><i style="--signal-color:${mode.colors[i]}"></i>${text().labels[key]}</span><b>${number(joint[key][index])}</b></div>`).join("") + `<div><span>${text().difference}</span><b>${number(finite(a) && finite(b) ? b - a : NaN)}</b></div>`;
    const seek = find("#ctl-teleop-seek"), [start, end] = windowRange();
    seek.min = String(start); seek.max = String(end); seek.value = String(state.time);
    find("#ctl-teleop-time").textContent = `${state.time.toFixed(2)} s`;
  }

  function draw() {
    const canvas = find("#ctl-teleop-canvas");
    if (!canvas) return;
    canvas.setAttribute("aria-label", `${text().plotTitle[state.mode]} · J${state.joint + 1}`);
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ratio = Math.min(devicePixelRatio || 1, 2), width = rect.width, height = rect.height;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
    context.fillStyle = "#092a23"; context.fillRect(0, 0, width, height);
    if (!state.data) return;
    const left = width < 500 ? 48 : 62, right = 22, top = 30, bottom = 36, w = width - left - right, h = height - top - bottom;
    const [start, end] = windowRange(), joint = state.data.joints[state.joint], mode = MODES[state.mode], times = state.data.time_s;
    const first = Math.max(0, nearestIndex(times, start) - 1), last = Math.min(times.length - 1, nearestIndex(times, end) + 1);
    const [min, max] = domain(mode.signals.flatMap((key) => joint[key].slice(first, last + 1)));
    const x = (time) => left + (time - start) / (end - start) * w;
    const y = (value) => top + h - (value - min) / (max - min) * h;
    context.font = "12px system-ui, sans-serif";
    context.fillStyle = "#a4bdb4"; context.textAlign = "left"; context.fillText(text().degrees, left, 16);
    for (let tick = 0; tick <= 4; tick++) {
      const gy = top + h * tick / 4;
      context.strokeStyle = "rgba(192,218,205,.15)"; context.lineWidth = 1; context.beginPath(); context.moveTo(left, gy); context.lineTo(left + w, gy); context.stroke();
      context.fillStyle = "#b7c8c0"; context.textAlign = "right"; context.fillText((max - (max - min) * tick / 4).toFixed(max - min < 2 ? 2 : 0), left - 10, gy + 4);
    }
    for (let tick = 0; tick <= 4; tick++) {
      const gx = left + w * tick / 4;
      context.strokeStyle = "rgba(192,218,205,.1)"; context.beginPath(); context.moveTo(gx, top); context.lineTo(gx, top + h); context.stroke();
      context.fillStyle = "#b7c8c0"; context.textAlign = "center"; context.fillText(`${(start + (end - start) * tick / 4).toFixed(1)} s`, gx, top + h + 23);
    }
    context.save(); context.beginPath(); context.rect(left, top, w, h); context.clip();
    mode.signals.forEach((key, signalIndex) => {
      context.strokeStyle = mode.colors[signalIndex]; context.lineWidth = signalIndex ? 2.3 : 1.65; context.lineJoin = "round";
      context.beginPath(); let active = false;
      for (let i = first; i <= last; i++) {
        if (!finite(joint[key][i])) { active = false; continue; }
        const px = x(times[i]), py = y(joint[key][i]);
        if (!active) context.moveTo(px, py);
        else {
          if (key === "target") context.lineTo(px, y(joint[key][i - 1]));
          context.lineTo(px, py);
        }
        active = true;
      }
      context.stroke();
    });
    const index = nearestIndex(times, state.time), cursorX = x(times[index]);
    context.strokeStyle = "rgba(244,248,235,.65)"; context.lineWidth = 1; context.setLineDash([3, 4]); context.beginPath(); context.moveTo(cursorX, top); context.lineTo(cursorX, top + h); context.stroke(); context.setLineDash([]);
    mode.signals.forEach((key, i) => { if (!finite(joint[key][index])) return; context.fillStyle = mode.colors[i]; context.strokeStyle = "#092a23"; context.lineWidth = 2; context.beginPath(); context.arc(cursorX, y(joint[key][index]), 4.5, 0, Math.PI * 2); context.fill(); context.stroke(); });
    context.restore();
  }

  async function load() {
    if (state.data || state.loading) return state.loading;
    state.error = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    state.loading = fetch("assets/data/teleop-evidence.json", { signal: controller.signal, cache: "no-cache" }).then((response) => {
      if (!response.ok) throw new Error(`Teleop record HTTP ${response.status}`);
      return response.json();
    }).then((data) => {
      if (!validData(data)) throw new Error("Invalid paired teleop record");
      state.data = data; state.time = Math.min(state.time, duration());
    }).catch(() => { state.error = true; }).finally(() => {
      clearTimeout(timeout); state.loading = null; render(state.lang, false);
    });
    render(state.lang, false);
    return state.loading;
  }

  function init() { render(document.documentElement.lang.startsWith("en") ? "en" : "zh"); return load(); }
  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else { draw(); if (state.error && state.host?.getBoundingClientRect().width) load(); }
    });
    window.addEventListener("online", () => { if (state.error) load(); });
    window.addEventListener("pageshow", draw);
    window.PortfolioTeleop = { init, render, pause: () => { stop(); find("#ctl-teleop-video")?.pause(); } };
  }
  if (typeof module !== "undefined") module.exports = { domain, nearestIndex, validData };
})();
