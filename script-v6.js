(() => {
  "use strict";
  document.documentElement.classList.add("has-js");
  const CONTENT = window.PORTFOLIO_V6;
  if (!CONTENT) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const read = (object, path) => path.split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = navigator.connection?.saveData === true;
  const rootElement = document.documentElement;
  const previewMotion = { x: innerWidth * .68, y: innerHeight * .38, tx: innerWidth * .68, ty: innerHeight * .38, enabled: false };
  const cursorMotion = { x: -80, y: -80, tx: -80, ty: -80, enabled: false };
  const stateTransitionTimers = new WeakMap();
  const storedLanguage = (() => {
    const query = new URLSearchParams(location.search).get("lang");
    if (query === "zh" || query === "en") return query;
    try {
      const stored = localStorage.getItem("portfolio-language");
      if (stored === "zh" || stored === "en") return stored;
    } catch {}
    return "en";
  })();

  const state = {
    language: storedLanguage,
    project: null,



    a3u: "deployment",
    drawry: "upload",
    syncPlaying: false,
    syncRaf: 0,
    syncFocus: "all",
    humanoidTrack: "egohumanoid",
    lastScroll: 0,
    previewTimer: 0,
    a3uTimer: 0,
    menuOpener: null,
    projectOpener: null,
  };

  function copy() { return CONTENT[state.language]; }
  function applyCopy() {
    $$('[data-copy]').forEach((element) => {
      const value = read(copy(), element.dataset.copy);
      if (value != null) element.textContent = value;
    });
    $$('[data-copy-html]').forEach((element) => {
      const value = read(copy(), element.dataset.copyHtml);
      if (value != null) element.innerHTML = value;
    });
    $$('[data-copy-content]').forEach((element) => {
      const value = read(copy(), element.dataset.copyContent);
      if (value != null) element.setAttribute("content", value);
    });
    document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.language = state.language;
    $$('a[href^="resume.html"]').forEach(link => {
      const url = new URL(link.getAttribute("href"), location.href);
      url.searchParams.set("lang", state.language);
      link.setAttribute("href", `resume.html${url.search}${url.hash}`);
    });
    $("#hero-title")?.setAttribute("aria-label", copy().hero.titleText);
    $("#menu-panel")?.setAttribute("aria-label", state.language === "zh" ? "项目导航" : "Project navigation");
    $("#language-toggle")?.setAttribute("aria-label", state.language === "zh" ? "Switch to English" : "切换到中文");
    $("#language-toggle").textContent = state.language === "zh" ? "EN" : "中文";
    document.title = state.language === "zh" ? "郭阳溢｜机器人与具身智能" : "Yangyi Guo | Robotics & Embodied AI";
    updateVideoControl($("#hero-video"), $("#hero-play"));
    updateVideoControl($("#a3u-video"), $("#a3u-play"));
    updateVideoControl($("#mimiclite-g1-video"), $("#mimiclite-g1-play"));
    updateVideoControl($("#path-origin-video"), $("#path-origin-play"));
    $(".hero-scroll")?.setAttribute("aria-label", state.language === "zh" ? "滚动到近期工作" : "Scroll to current work");
    updateSyncControl();
    window.PortfolioMedia?.localize();
  }

  function setLanguage(language) {
    state.language = language;
    try { localStorage.setItem("portfolio-language", language); } catch {}
    const url = new URL(location.href);
    url.searchParams.set("lang", language);
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    applyCopy();

    renderA3U();
    renderControlLabs();
    renderDrawry();
    if (!reduceMotion && !state.project) {
      rootElement.classList.remove("is-ready");
      requestAnimationFrame(() => requestAnimationFrame(() => rootElement.classList.add("is-ready")));
    }
  }

  function setVideo(video, src, poster = "") {
    if (!video) return;
    window.PortfolioMedia?.setSource(video, src, poster);
    video.muted = true;
    video.playsInline = true;
  }

  function playQuiet(video) {
    if (!video || reduceMotion || saveData) return;
    window.PortfolioMedia?.hydrate(video);
    video.play().catch(() => {});
  }

  function updateVideoControl(video, button) {
    if (!video || !button) return;
    const playing = !video.paused && !video.ended;
    button.textContent = playing ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", state.language === "zh" ? (playing ? "暂停视频" : "播放视频") : (playing ? "Pause video" : "Play video"));
  }

  function bindVideoControl(video, button) {
    if (!video || !button || button.dataset.videoBound) return;
    button.dataset.videoBound = "true";
    ["play", "pause", "ended"].forEach((eventName) => video.addEventListener(eventName, () => updateVideoControl(video, button)));
    button.addEventListener("click", async () => {
      if (!video.paused) { video.pause(); return; }
      window.PortfolioMedia?.hydrate(video);
      try { await video.play(); } catch { updateVideoControl(video, button); }
    });
    updateVideoControl(video, button);
  }

  function updateSyncControl() {
    const button = $("#sync-play");
    if (!button) return;
    button.textContent = state.syncPlaying ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", state.language === "zh" ? (state.syncPlaying ? "暂停同步视频" : "播放同步视频") : (state.syncPlaying ? "Pause synchronized videos" : "Play synchronized videos"));
    updateSyncStatus();
  }

  function updateSyncStatus() {
    const output = $("#sync-status");
    if (!output) return;
    const videos = syncVideos();
    const base = videos[0];
    const hasDuration = Boolean(base && Number.isFinite(base.duration) && base.duration > 0);
    let aligned = true;
    if (hasDuration) {
      const ratio = base.currentTime / base.duration;
      aligned = videos.slice(1).every((video) => !video.duration || Math.abs(video.currentTime - ratio * video.duration) <= .08);
    }
    const status = state.syncPlaying ? (aligned ? "PLAYING · SYNCED" : "PLAYING · ALIGNING") : (hasDuration && base.currentTime > 0 ? (aligned ? "PAUSED · SYNCED" : "PAUSED") : "READY");
    output.textContent = state.language === "zh"
      ? ({ "PLAYING · SYNCED": "播放 · 已同步", "PLAYING · ALIGNING": "播放 · 对齐中", "PAUSED · SYNCED": "暂停 · 已同步", "PAUSED": "暂停", READY: "就绪" }[status] || status)
      : status;
    output.dataset.syncState = status.toLowerCase().replace(/[^a-z]+/g, "-");
  }

  function pausePreview(context) {
    const video = $(`#${context}-preview-video`);
    clearTimeout(state.previewTimer);
    video?.parentElement?.classList.remove("is-changing");
    if (video && !video.paused) video.pause();
    if (context === "work") $$('[data-work-preview]').forEach((preview) => preview.pause());
  }

  function setupWorkPreviews() {
    const rows = $$('.work-row--compact');
    const visibility = new Map();
    const requested = new Set();
    const touchPreview = matchMedia("(hover: none)");
    const refresh = () => {
      requested.clear();
      const blocked = document.hidden || state.project || document.body.classList.contains("menu-open") || reduceMotion || saveData;
      const candidates = rows.filter((row) => (visibility.get(row) || 0) > .25);
      const centerDistance = (row) => {
        const rect = $('.work-row-preview', row).getBoundingClientRect();
        return Math.abs(rect.top + rect.height / 2 - innerHeight / 2);
      };
      const touchRow = touchPreview.matches ? candidates.sort((a, b) => centerDistance(a) - centerDistance(b))[0] : null;
      rows.forEach((row) => {
        const video = $('[data-work-preview]', row);
        const active = !blocked && candidates.includes(row) && (touchRow === row || row.dataset.previewHover === "true" || row.contains(document.activeElement));
        if (active) {
          requested.add(video);
          window.PortfolioMedia?.hydrate(video);
          if (video.paused) video.play().then(() => { if (!requested.has(video)) video.pause(); }).catch(() => {});
        } else video.pause();
      });
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visibility.set(entry.target.closest('.work-row'), entry.intersectionRatio));
      refresh();
    }, { threshold: [0, .25, .5, .75, 1] });
    rows.forEach((row) => {
      const preview = $('.work-row-preview', row);
      const video = $('[data-work-preview]', row);
      if (!preview || !video) return;
      video.muted = true;
      observer.observe(preview);
      row.addEventListener("pointerenter", () => { row.dataset.previewHover = "true"; refresh(); });
      row.addEventListener("pointerleave", () => { row.dataset.previewHover = "false"; refresh(); });
      row.addEventListener("focusin", refresh);
      row.addEventListener("focusout", () => requestAnimationFrame(refresh));
    });
    document.addEventListener("visibilitychange", refresh);
    touchPreview.addEventListener("change", refresh);
    new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  function transitionState(root, update) {
    if (!root || reduceMotion) { update(); return; }
    clearTimeout(stateTransitionTimers.get(root));
    root.classList.add("is-state-changing");
    const timer = setTimeout(() => {
      update();
      requestAnimationFrame(() => root.classList.remove("is-state-changing"));
    }, 105);
    stateTransitionTimers.set(root, timer);
  }

  function setPreview(id, context = "work") {
    const item = CONTENT.shared.previews[id];
    if (!item) return;
    const prefix = context === "menu" ? "menu-preview" : "work-preview";
    const video = $(`#${prefix}-video`);
    const image = $(`#${prefix}-image`);
    const wrapper = video?.parentElement;
    wrapper?.classList.add("is-changing");
    clearTimeout(state.previewTimer);
    state.previewTimer=setTimeout(() => {
      wrapper?.classList.toggle("is-text-preview", item.type === "text");
      if (item.type === "text") {
        video.pause();
        video.hidden = true;
        image.hidden = true;
      } else if (item.type === "video") {
        image.hidden = true;
        video.hidden = false;
        setVideo(video, item.src, item.poster);
        video.setAttribute("aria-label", item.alt || item.title);
        playQuiet(video);
      } else {
        video.pause();
        video.hidden = true;
        image.hidden = false;
        image.src = item.src;
        image.alt = item.alt || item.title;
      }
      $(`#${prefix}-kicker`) && ($(`#${prefix}-kicker`).textContent = item.kicker);
      $(`#${prefix}-title`) && ($(`#${prefix}-title`).textContent = item.title);
      if (context === "work") {
        $("#work-preview-label").textContent = `${id === "egocentric" ? "CURRENT" : "PROJECT"} / ${id.toUpperCase()}`;
        $("#work-preview-caption").textContent = item.caption;
      }
      wrapper?.classList.remove("is-changing");
    }, 140);
    $$(".work-row").forEach((row) => row.classList.toggle("is-active", row.dataset.project === id));
    $$("[data-menu-preview]").forEach((button) => button.classList.toggle("is-active", button.dataset.menuPreview === id));
  }

  function toggleMenu(force, restoreFocus = true) {
    const menu = $("#menu-panel");
    const toggle = $("#menu-toggle");
    const open = force ?? !menu.classList.contains("is-open");
    const home = $("#home-view");
    const project = $("#project-view");
    if (open) state.menuOpener = document.activeElement;
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
    if (open) {
      home.inert = true;
      project.inert = true;
      setPreview(state.project || "egocentric", "menu");
      setTimeout(() => $("[data-menu-preview].is-active")?.focus(), 180);
    } else {
      pausePreview("menu");
      home.inert = Boolean(state.project);
      project.inert = !state.project;
      if (restoreFocus && state.menuOpener?.focus) requestAnimationFrame(() => state.menuOpener.focus({ preventScroll: true }));
    }
  }

  function refreshProjectVisuals(id) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const page = $(`[data-project-page="${id}"]`);
      $$('[data-scroll-reveal]', page || document).forEach((item) => item.classList.add("is-visible"));

      if (id === "manipulation") {
        renderControlLabs();
      }
    }));
  }

  function settleProjectTransition(transition, sourceTitle, targetTitle) {
    const cleanup = () => {
      sourceTitle?.style.removeProperty("view-transition-name");
      targetTitle?.style.removeProperty("view-transition-name");
    };
    // Browsers can skip an interrupted animation while completing navigation.
    transition.ready.catch(() => {});
    transition.finished.then(cleanup, cleanup);
  }

  function openProject(id, updateHistory = true) {
    if (!$( `[data-project-page="${id}"]`)) return;
    window.PortfolioMedia?.close();
    $("#hero-video")?.pause();
    $$("#project-view video").forEach(video => video.pause());
    $("#path-origin-video")?.pause();
    if (id !== "humanoid") { pauseSync(); $("#a3u-video")?.pause(); $("#mimiclite-g1-video")?.pause(); }
    if (id !== "manipulation") pauseControlLabs();
    const view = $("#project-view");
    const sourceTitle = $(`.work-row[data-project="${id}"] .work-name`);
    const targetTitle = $(`[data-project-page="${id}"] .project-hero h1`);
    state.projectOpener = sourceTitle?.closest(".work-row") || document.activeElement?.closest?.(`[data-open-project="${id}"]`) || document.activeElement;
    toggleMenu(false, false);
    pausePreview("work");
    $(".work-preview")?.classList.remove("is-visible");
    const activate = () => {
      state.project = id;
      $$('[data-project-page]').forEach((page) => { page.hidden = page.dataset.projectPage !== id; });
      view.hidden = false;
      view.inert = false;
      view.scrollTop = 0;
      view.classList.add("is-open");
      $("#home-view").inert = true;
      document.body.classList.add("project-open");
      state.lastScroll = 0;
      $("#site-header").classList.remove("is-hidden");
      if (updateHistory) history.pushState({ project: id }, "", `#project/${id}`);

      if (id === "humanoid") { renderA3U(); initSyncMedia(); }
      if (id === "manipulation") renderControlLabs();
      if (id === "drawry") renderDrawry();
      refreshProjectVisuals(id);
    };
    if (!reduceMotion && document.startViewTransition) {
      sourceTitle?.style.setProperty("view-transition-name","project-title");
      targetTitle?.style.setProperty("view-transition-name","project-title");
      const transition = document.startViewTransition(activate);
      settleProjectTransition(transition, sourceTitle, targetTitle);
    } else {
      view.hidden = false;
      view.inert = false;
      $$('[data-project-page]').forEach((page) => { page.hidden = page.dataset.projectPage !== id; });
      state.project = id;
      view.scrollTop = 0;
      $("#home-view").inert = true;
      document.body.classList.add("project-open");
      state.lastScroll = 0;
      $("#site-header").classList.remove("is-hidden");
      if (updateHistory) history.pushState({ project: id }, "", `#project/${id}`);

      if (id === "humanoid") { renderA3U(); initSyncMedia(); }
      if (id === "manipulation") renderControlLabs();
      if (id === "drawry") renderDrawry();
      refreshProjectVisuals(id);
      requestAnimationFrame(() => view.classList.add("is-open"));
    }
    setTimeout(() => $(`[data-project-page="${id}"] .project-back`)?.focus({ preventScroll: true }), 650);
  }

  function closeProject(updateHistory = true, restoreFocus = true) {
    const view = $("#project-view");
    window.PortfolioMedia?.close();
    $$("#project-view video").forEach(video => video.pause());
    pauseSync();
    $("#a3u-video")?.pause();
    $("#mimiclite-g1-video")?.pause();
    pauseControlLabs();
    const previousProject = state.project;
    const returnAnchor = "projects";
    const sourceTitle = previousProject ? $(`[data-project-page="${previousProject}"] .project-hero h1`) : null;
    const targetTitle = previousProject ? $(`.work-row[data-project="${previousProject}"] .work-name`) : null;
    const deactivate = () => {
      state.project = null;
      view.classList.remove("is-open");
      view.inert = true;
      document.body.classList.remove("project-open");
      $("#home-view").inert = false;
      if (updateHistory) history.pushState({}, "", `#${returnAnchor}`);
    };
    if (!reduceMotion && document.startViewTransition) {
      sourceTitle?.style.setProperty("view-transition-name","project-title");
      targetTitle?.style.setProperty("view-transition-name","project-title");
      const transition = document.startViewTransition(deactivate);
      settleProjectTransition(transition, sourceTitle, targetTitle);
    } else deactivate();
    setTimeout(() => {
      if (state.project) return;
      view.hidden = true;
      $$('[data-project-page]').forEach((page) => { page.hidden = true; });
      $("#home-view").inert = false;
      if (updateHistory) $(`#${returnAnchor}`)?.scrollIntoView({ block: "start" });
      if (restoreFocus && state.projectOpener?.focus) state.projectOpener.focus({ preventScroll: true });
    }, 700);
  }

  function routeFromHash() {
    const match = location.hash.match(/^#project\/(egocentric|humanoid|manipulation|drawry)$/);
    if (match) openProject(match[1], false);
    else if (state.project) closeProject(false);
  }

  const A3U_STAGE_ORDER = ["deployment", "model", "collision", "retarget", "policy", "stability", "teleop"];
  const A3U_STAGE_MEDIA = {
    deployment: { type: "video", sharedKey: "deployment", note: { zh: "REAL HARDWARE · G1 动作复现", en: "REAL HARDWARE · G1 MOTION REPLAY" } },
    model: { type: "image", sharedKey: "asset", note: { zh: "MODEL PREVIEW · MUJOCO", en: "MODEL PREVIEW · MUJOCO" } },
    collision: { type: "image", sharedKey: "collision", note: { zh: "COLLISION OVERLAY · FOOT MODEL", en: "COLLISION OVERLAY · FOOT MODEL" } },
    retarget: { type: "process", note: { zh: "RETARGET FLOW · SMPL → A3U DATA", en: "RETARGET FLOW · SMPL → A3U DATA" } },
    policy: { type: "video", sharedKey: "policy", badge: true, note: { zh: "SIM2SIM · POLICY RESPONSE", en: "SIM2SIM · POLICY RESPONSE" } },
    stability: { type: "image", sharedKey: "diagnosis", note: { zh: "DIAGNOSTIC PLOTS · RESPONSE / GAIN", en: "DIAGNOSTIC PLOTS · RESPONSE / GAIN" } },
    teleop: { type: "video", sharedKey: "teleopHardware", badge: true, badgeText: { zh: "REAL HARDWARE · PICO TELEOP", en: "REAL HARDWARE · PICO TELEOP" }, note: { zh: "REAL HARDWARE · PICO 操作者与 A3U 同画面", en: "REAL HARDWARE · PICO OPERATOR + A3U IN FRAME" } },
  };
  const A3U_STAGE_LABELS = {
    deployment: { zh: "G1 / DEPLOYMENT", en: "G1 / DEPLOYMENT" },
    model: { zh: "MODEL / URDF", en: "MODEL / URDF" },
    collision: { zh: "FOOT / COLLISION", en: "FOOT / COLLISION" },
    retarget: { zh: "RETARGET / DATA", en: "RETARGET / DATA" },
    policy: { zh: "POLICY / SIM", en: "POLICY / SIM" },
    stability: { zh: "STABILITY DEBUG", en: "STABILITY DEBUG" },
    teleop: { zh: "PICO TELEOP", en: "PICO TELEOP" },
  };

  function canonicalA3UStage(value) {
    const aliases = { asset: "model", diagnosis: "stability", control: "stability", realRobot: "stability" };
    const stage = aliases[value] || value;
    return A3U_STAGE_ORDER.includes(stage) ? stage : "deployment";
  }

  function getA3UStageCopy(stageKey) {
    const humanoid = copy().humanoid || {};
    const configured = humanoid.a3uStages;
    const configuredItem = Array.isArray(configured)
      ? configured.find((item) => item && (item.key === stageKey || item.id === stageKey || item.slug === stageKey))
      : configured?.[stageKey];
    const steps = humanoid.a3uSteps || [];
    const legacy = humanoid.a3u || {};
    const fallback = {
      deployment: { kicker: "01 / G1 / DEPLOYMENT", title: humanoid.g1Title || "G1 部署与真机验证", copy: humanoid.g1Copy || "先在电脑端完成 sim2sim，再将代码和模型部署到 Orin 做 inference。" },
      model: steps[0] || legacy.asset || { kicker: "02 / MODEL / URDF", title: "A3U 模型适配", copy: "先将新的 URDF 和机器人模型接入现有工程，再处理关节顺序、初始配置和部署接口。" },
      collision: { kicker: "03 / FOOT / COLLISION", title: "脚底与碰撞模型", copy: "这里记录 A3U 的脚底几何和碰撞体设置；真机出现抖动后，这部分又被重新检查。" },
      retarget: steps[1] || legacy.retarget || { kicker: "04 / RETARGET / DATA", title: "A3U 动作 retarget", copy: "一开始直接用 G1 的 policy 和 motion 在 A3U 上测试，流程能跑，但动作效果明显不好。后面重新针对 A3U 做 motion retarget，再用新的动作数据训练。" },
      policy: steps[2] || legacy.diagnosis || { kicker: "05 / POLICY / SIM", title: "A3U Policy 训练", copy: "第一版 A3U policy 已经可以完成 sim2sim 和 sim2real，也能执行行走动作，但站立稳定性和复杂动作表现仍然较差。" },
      stability: steps[3] || legacy.control || { kicker: "06 / STABILITY DEBUG", title: "真机稳定性调试", copy: "仿真中的准备姿态正常，但部署到真机后出现高频抖动。排查脚底碰撞、Kp / Kd 和 action_delay 后重新训练，明显抖动基本消失。" },
      teleop: steps[4] || { kicker: "07 / PICO TELEOP", title: "PICO 遥操作", copy: "PICO 操作者与 A3U 同时出现在真机画面中，可以直接核对人体输入与机器人手臂、身体和行走响应。" },
    }[stageKey];
    return { ...(fallback || {}), ...(configuredItem || {}) };
  }

  function getA3UMedia(stageKey, stage) {
    const meta = A3U_STAGE_MEDIA[stageKey] || A3U_STAGE_MEDIA.deployment;
    if (meta.type === "flow" || meta.type === "process") return { ...meta };
    const sharedMap = CONTENT.shared?.a3u || {};
    const requestedKey = stage?.mediaKey || stage?.media || meta.sharedKey;
    const sharedKey = sharedMap[requestedKey] ? requestedKey : meta.sharedKey;
    const shared = sharedMap[sharedKey] || {};
    return { ...meta, ...shared, type: shared.type || meta.type };
  }

  function renderA3U() {
    const explorer = $("#a3u-explorer"); if (!explorer) return;
    const selected = canonicalA3UStage(state.a3u);
    state.a3u = selected;
    const stage = getA3UStageCopy(selected);
    const media = $(".a3u-media", explorer);
    const visual = $(".a3u-visual", explorer);
    const flowVisual = $("#a3u-flow-visual");
    const processVisual = $("#a3u-process-visual");
    const image = $("#a3u-image");
    const imageLink = $("#a3u-image-link");
    const secondaryLink = $("#a3u-secondary-evidence");
    const secondaryImage = $("#a3u-secondary-image");
    const secondaryLabel = $("#a3u-secondary-label");
    const video = $("#a3u-video");
    const playButton = $("#a3u-play");
    const badge = $("#a3u-media-badge");
    const note = $("#a3u-media-note");
    const contextOutput = $("#a3u-context");
    const evidenceOutput = $("#a3u-evidence");
    const resultOutput = $("#a3u-result");
    const meta = getA3UMedia(selected, stage);
    const secondaryKey = stage.secondaryMedia;
    const secondary = secondaryKey ? CONTENT.shared?.a3u?.[secondaryKey] : null;
    const isVideo = meta.type === "video";
    const isImage = meta.type === "image";
    const isFlow = meta.type === "flow";
    const isProcess = meta.type === "process";
    const isDeployment = selected === "deployment";
    const language = state.language === "zh" ? "zh" : "en";
    const mediaNote = stage.caption || (typeof stage.mediaNote === "object" ? stage.mediaNote[language] : stage.mediaNote);
    media?.classList.add("is-changing");
    clearTimeout(state.a3uTimer);
    explorer.dataset.activeStage = selected;
    $("#mimic-journey")?.setAttribute("data-a3u-active", selected);
    $("[data-a3u-journey]")?.setAttribute("data-a3u-active", selected);
    $("#a3u-view-state") && ($("#a3u-view-state").textContent = A3U_STAGE_LABELS[selected][language]);
    $("#a3u-kicker") && ($("#a3u-kicker").textContent = stage.kicker || A3U_STAGE_LABELS[selected][language]);
    $("#a3u-title") && ($("#a3u-title").textContent = stage.title || A3U_STAGE_LABELS[selected][language]);
    $("#a3u-copy") && ($("#a3u-copy").textContent = stage.copy || "");
    if (contextOutput) contextOutput.textContent = stage.context || "";
    if (evidenceOutput) evidenceOutput.textContent = stage.evidence || "";
    if (resultOutput) resultOutput.textContent = stage.result || "";
    if (note) note.textContent = mediaNote || meta.note?.[language] || "";
    state.a3uTimer = setTimeout(() => {
      if (!visual) return;
      if (processVisual) {
        const processLabels = Array.isArray(stage.process) && stage.process.length
          ? stage.process
          : ["SMPL / MOTION", "RETARGET", "A3U DATA", "POLICY TRAINING"];
        $$('[data-process-node]', processVisual).forEach((node, index) => { node.textContent = processLabels[index] || ""; });
      }
      if (flowVisual) { const showFlow = isFlow || isDeployment; flowVisual.hidden = !showFlow; flowVisual.setAttribute("aria-hidden", String(!showFlow)); }
      if (processVisual) { processVisual.hidden = !isProcess; processVisual.setAttribute("aria-hidden", String(!isProcess)); }
      if (imageLink) imageLink.hidden = !isImage;
      if (secondaryLink) secondaryLink.hidden = !(isImage && secondary?.image && secondary.image !== meta.image);
      if (video) video.hidden = !isVideo;
      if (playButton) playButton.hidden = !isVideo;
      if (badge) {
        badge.hidden = !(isVideo && meta.badge);
        badge.textContent = meta.badgeText?.[language] || "SIMULATION-SIDE VALIDATION";
      }
      if (isImage && image && imageLink) {
        const source = meta.image || stage.image || "assets/media/mimiclite-a3u-mujoco.png";
        image.src = source;
        image.alt = meta.alt || stage.alt || "A3U model or diagnostic evidence";
        imageLink.href = source;
        imageLink.setAttribute("aria-label", humanoidOpenLabel());
        imageLink.title = humanoidOpenLabel();
      }
      if (secondaryLink && secondaryImage && secondary) {
        secondaryImage.src = secondary.image || "";
        secondaryImage.alt = secondary.alt || "Secondary diagnostic evidence";
        secondaryLink.href = secondary.image || "#";
        if (secondaryLabel) secondaryLabel.textContent = selected === "stability" ? "GAIN / Kp · Kd" : "SECONDARY EVIDENCE";
      }
      if (isVideo && video) {
        setVideo(video, meta.src || "assets/media/mimiclite-retarget-sim.mp4", meta.poster || "assets/media/mimiclite-retarget-sim-poster.jpg");
        video.setAttribute("aria-label", meta.alt || "PICO target motion and simulated policy response");
        if (state.project === "humanoid") playQuiet(video);
      } else video?.pause();
      window.PortfolioMedia?.attach(explorer);
      visual.dataset.mediaType = meta.type;
      media?.classList.remove("is-changing");
    }, 120);
    $$('[data-a3u]').forEach((button) => {
      const active = canonicalA3UStage(button.dataset.a3u) === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-current", active ? "step" : "false");
    });
    $$('[data-a3u-stage-card]').forEach((card) => card.classList.toggle("is-active", card.dataset.a3uStageCard === selected));
  }

  function humanoidOpenLabel() {
    return copy().humanoid?.a3uOpenLabel || (state.language === "zh" ? "查看原尺寸证据图" : "Open evidence image at full size");
  }

  function setHumanoidTrack(track, shouldScroll = true) {
    const selected = track === "mimiclite" ? "mimiclite" : "egohumanoid";
    state.humanoidTrack = selected;
    if (selected === "egohumanoid") {
      $("#mimiclite-g1-video")?.pause();
      $("#a3u-video")?.pause();
    }
    $$('[data-humanoid-track]').forEach((button) => {
      const active = button.dataset.humanoidTrack === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "true" : "false");
    });
    if (!shouldScroll) return;
    const target = selected === "mimiclite" ? $("#humanoid-mimic-chapter") : $("#humanoid-ego-chapter");
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function setSyncFocus(focus = "all") {
    const allowed = ["all", "zed", "pose", "g1"];
    state.syncFocus = allowed.includes(focus) ? focus : "all";
    const grid = $(".sync-grid");
    if (grid) grid.dataset.syncFocus = state.syncFocus;
    $$('[data-sync-focus]').forEach((button) => {
      const active = button.dataset.syncFocus === state.syncFocus;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function syncVideos() { return [$("#sync-zed"),$("#sync-pose"),$("#sync-g1")].filter(Boolean); }
  function initSyncMedia() {
    const videos=syncVideos(); if (!videos.length) return;
    videos.forEach((video) => { video.muted=true; video.playsInline=true;window.PortfolioMedia?.hydrate(video);if(!video.dataset.syncBound){video.addEventListener("ended",pauseSync);video.addEventListener("loadedmetadata",()=>{if(state.syncRatio!=null)setSyncRatio(state.syncRatio);updateSyncTime();});video.dataset.syncBound="true";} });
    updateSyncTime();
    updateSyncStatus();
  }
  function setSyncRatio(ratio) {
    state.syncRatio = ratio;
    syncVideos().forEach(video => window.PortfolioMedia?.hydrate(video));
    syncVideos().forEach((video)=>{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=ratio*video.duration;});
    $("#sync-scrubber").value=Math.round(ratio*1000);updateSyncTime();
  }
  function updateSyncTime() {
    const video=$("#sync-zed"), output=$("#sync-time"); if(!video||!output)return;
    const duration=Number.isFinite(video.duration)?video.duration:0,current=Number.isFinite(video.currentTime)?video.currentTime:0;
    const fmt=(s)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;
    output.textContent=`${fmt(current)} / ${fmt(duration)}`;
    updateSyncStatus();
  }
  function syncLoop() {
    if(!state.syncPlaying)return;const videos=syncVideos(),base=videos[0];
    if(base&&base.duration){const ratio=base.currentTime/base.duration;$("#sync-scrubber").value=Math.round(ratio*1000);videos.slice(1).forEach(v=>{const target=ratio*v.duration;if(v.duration&&Math.abs(v.currentTime-target)>.06)v.currentTime=target;});updateSyncTime();}
    state.syncRaf=requestAnimationFrame(syncLoop);
  }
  let syncPlayRequest = 0;
  async function playSync() {
    const request = ++syncPlayRequest;
    const videos = syncVideos();
    videos.forEach(video => window.PortfolioMedia?.hydrate(video));
    const results = await Promise.allSettled(videos.map((video) => video.play()));
    if (request !== syncPlayRequest || window.PortfolioMedia?.isOpen || state.project !== "humanoid") return;
    if (!results.some((result) => result.status === "fulfilled")) { pauseSync(); return; }
    state.syncPlaying = true;
    updateSyncControl();
    cancelAnimationFrame(state.syncRaf);
    syncLoop();
  }
  function pauseSync() { syncPlayRequest++;state.syncPlaying=false;syncVideos().forEach(v=>v?.pause());updateSyncControl();cancelAnimationFrame(state.syncRaf); }

  function renderControlLabs() {
    if (state.project !== "manipulation") return;
    [window.PortfolioMotion, window.PortfolioTeleop, window.PortfolioContact]
      .forEach((lab) => lab?.render(state.language));
  }

  function pauseControlLabs() {
    window.PortfolioMotion?.pause?.();
    window.PortfolioTeleop?.pause?.();
    window.PortfolioContact?.pause?.();
    $$("#project-manipulation video").forEach((video) => video.pause());
  }

  function renderDrawry() {
    const root=$("#drawry-experience");if(!root)return;
    const states=copy().drawry.states||{};
    const selected=states[state.drawry]?state.drawry:"upload";
    state.drawry=selected;
    root.dataset.drawryStage=selected;
    root.dataset.drawryReady="false";
    $$('[data-drawry]').forEach(b=>{const active=b.dataset.drawry===selected;b.classList.toggle("is-active",active);b.setAttribute("aria-pressed",String(active));});
    const item=states[selected]||{};
    $("#drawry-kicker").textContent=item.kicker||"01 / INPUT";
    $("#drawry-stage-title").textContent=item.title||"Original drawing";
    $("#drawry-stage-copy").textContent=item.copy||"Upload or capture the drawing and keep the source image.";
    $("#drawry-stage-output").textContent=item.output||"OUTPUT · ORIGINAL DRAWING";
    const src="assets/media/drawry-source-drawing.jpg",flow="assets/media/drawry-product-flow.png",poster="assets/media/drawry-prototype-poster.png",story1="assets/media/drawry-story-frame-01.jpg",story2="assets/media/drawry-story-frame-02.jpg",story3="assets/media/drawry-story-frame-03.jpg",story4="assets/media/drawry-story-frame-04.jpg";
    const phoneZh={
      upload:`<div class="phone-ui"><div class="appbar"><i>小绘书✎</i><span>···</span></div><div class="phone-card"><img src="${src}" alt=""><h4>上传一幅画</h4><p>保留孩子原本的笔触，确认方向与裁切。</p><p class="phone-preview-status">原始画作 · 已导入</p></div></div>`,
      understand:`<div class="phone-ui"><div class="appbar"><i>故事素材</i><span>2/4</span></div><div class="phone-card"><img src="${src}" alt=""><h4>画面里有什么</h4><div class="tag-row"><span>孩子</span><span>太阳</span><span>户外</span><span>快乐</span><span>冒险</span></div><p>这些线索会成为故事生成的输入。</p><p class="phone-preview-status">故事素材 · 已整理</p></div></div>`,
      story:`<div class="phone-ui"><div class="appbar"><i>晴天小欢喜</i><span>3/4</span></div><div class="phone-card"><img src="${story3}" alt="生成故事短片中的第三个画面"><h4>第 3 幕 · 发现</h4><p>角色沿着阳光继续向前，原画里的线索被展开成连续情节。</p><div class="story-list"><div><img src="${story1}" alt="故事短片的第一个画面"><span>第 1 幕 · 看见太阳</span></div><div><img src="${story2}" alt="故事短片的第二个画面"><span>第 2 幕 · 向上触碰</span></div></div></div></div>`,
      family:`<div class="phone-ui"><div class="appbar"><i>安安的小绘书屋</i><span>⌂</span></div><div class="phone-card"><h4>孩子空间</h4><div class="story-list"><div><img src="${poster}" alt="晴天小欢喜故事封面"><span>最近生成 · 晴天小欢喜</span></div><div><img src="${src}" alt="孩子上传的原始画作"><span>原始画作 · 已归档</span></div></div><div class="family-actions"><span>我的画册</span><span>收藏故事</span><span>生成记录</span></div></div></div>`,
    };
    const desktopZh={
      upload:`<figure class="drawry-art main"><img src="${src}" alt="Original child drawing"></figure><figure class="drawry-art secondary"><img src="${flow}" alt="Drawry product flow"></figure>`,
      understand:`<div class="drawry-board"><h4>从像素到故事要素</h4><div class="chips"><span>CHARACTER · CHILD</span><span>OBJECT · SUN</span><span>SCENE · OUTDOOR</span><span>MOOD · JOYFUL</span><span>THEME · DISCOVERY</span></div><img src="${flow}" alt="Product flow" style="width:72%;margin:35px auto 0"></div>`,
      story:`<div class="drawry-board"><h4>公开原型生成短片里的四个时刻</h4><div class="story-panels"><figure><img src="${story1}" alt="故事短片中孩子看向太阳"><figcaption>01 · 看见太阳</figcaption></figure><figure><img src="${story2}" alt="故事短片中孩子伸手触碰"><figcaption>02 · 伸手触碰</figcaption></figure><figure><img src="${story3}" alt="故事短片中的转场"><figcaption>03 · 情节转场</figcaption></figure><figure><img src="${story4}" alt="故事短片中的森林场景"><figcaption>04 · 走进森林</figcaption></figure></div></div>`,
      family:`<div class="family-board"><div class="family-profile"><img src="${src}" alt="孩子上传的原始画作"><div><h4>安安的小绘书屋</h4><p>孩子 · 画作 · 故事 · 共读</p></div></div><div class="family-albums"><article><img src="${poster}" alt="晴天小欢喜故事封面"><b>晴天小欢喜</b></article><article><img src="${story4}" alt="生成故事中的森林画面"><b>我们的故事旅程</b></article></div></div>`,
    };
    const phoneEn={
      upload:`<div class="phone-ui"><div class="appbar"><i>Drawry✎</i><span>···</span></div><div class="phone-card"><img src="${src}" alt=""><h4>Upload a drawing</h4><p>Keep the original strokes, then check orientation and crop.</p><p class="phone-preview-status">Original drawing · Imported</p></div></div>`,
      understand:`<div class="phone-ui"><div class="appbar"><i>Story elements</i><span>2/4</span></div><div class="phone-card"><img src="${src}" alt=""><h4>What's in the picture</h4><div class="tag-row"><span>Child</span><span>Sun</span><span>Outdoors</span><span>Joy</span><span>Adventure</span></div><p>These clues become the starting point for the story.</p><p class="phone-preview-status">Story elements · Prepared</p></div></div>`,
      story:`<div class="phone-ui"><div class="appbar"><i>A Little Sunshine</i><span>3/4</span></div><div class="phone-card"><img src="${story3}" alt="Third frame from the generated story video"><h4>Scene 3 · Discovery</h4><p>The character follows the sunshine as clues from the drawing unfold into a story.</p><div class="story-list"><div><img src="${story1}" alt="First frame from the story video"><span>Scene 1 · Seeing the sun</span></div><div><img src="${story2}" alt="Second frame from the story video"><span>Scene 2 · Reaching up</span></div></div></div></div>`,
      family:`<div class="phone-ui"><div class="appbar"><i>An'an's Drawry</i><span>⌂</span></div><div class="phone-card"><h4>Child's space</h4><div class="story-list"><div><img src="${poster}" alt="A Little Sunshine story cover"><span>Latest · A Little Sunshine</span></div><div><img src="${src}" alt="Original drawing uploaded by the child"><span>Original drawing · Saved</span></div></div><div class="family-actions"><span>My drawings</span><span>Saved stories</span><span>History</span></div></div></div>`,
    };
    const desktopEn={
      upload:desktopZh.upload,
      understand:`<div class="drawry-board"><h4>From pixels to story elements</h4><div class="chips"><span>CHARACTER · CHILD</span><span>OBJECT · SUN</span><span>SCENE · OUTDOOR</span><span>MOOD · JOYFUL</span><span>THEME · DISCOVERY</span></div><img src="${flow}" alt="Product flow" style="width:72%;margin:35px auto 0"></div>`,
      story:`<div class="drawry-board"><h4>Four moments from the prototype's story video</h4><div class="story-panels"><figure><img src="${story1}" alt="The child looks at the sun in the story video"><figcaption>01 · Seeing the sun</figcaption></figure><figure><img src="${story2}" alt="The child reaches up in the story video"><figcaption>02 · Reaching up</figcaption></figure><figure><img src="${story3}" alt="A transition in the story video"><figcaption>03 · A new scene</figcaption></figure><figure><img src="${story4}" alt="A forest scene in the story video"><figcaption>04 · Into the forest</figcaption></figure></div></div>`,
      family:`<div class="family-board"><div class="family-profile"><img src="${src}" alt="Original drawing uploaded by the child"><div><h4>An'an's Drawry</h4><p>Child · Drawings · Stories · Shared reading</p></div></div><div class="family-albums"><article><img src="${poster}" alt="A Little Sunshine story cover"><b>A Little Sunshine</b></article><article><img src="${story4}" alt="A forest scene from the generated story"><b>Our story journey</b></article></div></div>`,
    };
    const phone=state.language==="zh"?phoneZh:phoneEn;
    const desktop=state.language==="zh"?desktopZh:desktopEn;
    const phoneMarkup=phone[selected]||phone.upload;
    const desktopMarkup=desktop[selected]||desktop.upload;
    $("#drawry-phone-screen").innerHTML=phoneMarkup;
    $("#drawry-desktop").innerHTML=desktopMarkup;
    root.dataset.drawryReady="true";
  }

  function setupInteractions() {
    window.PortfolioMedia?.attach();
    document.addEventListener("portfolio:media-open", () => { pauseSync(); pauseControlLabs(); });
    document.addEventListener("portfolio:media-close", event => {
      if (syncVideos().includes(event.detail.video) && event.detail.duration) {
        setSyncRatio(event.detail.time / event.detail.duration);
      }
    });
    bindVideoControl($("#hero-video"), $("#hero-play"));
    bindVideoControl($("#a3u-video"), $("#a3u-play"));
    bindVideoControl($("#mimiclite-g1-video"), $("#mimiclite-g1-play"));
    bindVideoControl($("#path-origin-video"), $("#path-origin-play"));
    $("#language-toggle").addEventListener("click",()=>setLanguage(state.language==="zh"?"en":"zh"));
    $("#menu-toggle").addEventListener("click",()=>toggleMenu());
    $("[data-home-link]").addEventListener("click",event=>{event.preventDefault();const hadProject=Boolean(state.project);toggleMenu(false,false);if(hadProject)closeProject(false,false);history.pushState({},"","#home");setTimeout(()=>$("#home")?.scrollIntoView({block:"start"}),hadProject?720:0);});
    document.addEventListener("keydown",(event)=>{
      const menuOpen = $("#menu-panel").classList.contains("is-open");
      if (menuOpen && event.key === "Tab") {
        const focusable = [$("#menu-toggle"), ...$$('button:not([disabled]),a[href]', $("#menu-panel"))].filter((item) => item && item.offsetParent !== null);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        else if (!focusable.includes(document.activeElement)) { event.preventDefault(); first.focus(); }
      }
      if(event.key==="Escape"&&!window.PortfolioMedia?.isOpen){if(menuOpen)toggleMenu(false);else if(state.project)closeProject();}
    });
    $$('[data-menu-preview]').forEach(button=>{button.addEventListener("mouseenter",()=>setPreview(button.dataset.menuPreview,"menu"));button.addEventListener("focus",()=>setPreview(button.dataset.menuPreview,"menu"));});
    $$('[data-open-project]').forEach(button=>button.addEventListener("click",()=>openProject(button.dataset.openProject)));
    $$('[data-close-project]').forEach(button=>button.addEventListener("click",()=>closeProject()));
    $$('[data-home-anchor]').forEach(link=>link.addEventListener("click",()=>{if(state.project)closeProject(false,false);}));
    $$('[data-control-anchor]').forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById(link.dataset.controlAnchor)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }));
    $$('[data-humanoid-track]').forEach((button)=>button.addEventListener("click",()=>setHumanoidTrack(button.dataset.humanoidTrack)));
    $$('[data-sync-focus]').forEach((button)=>button.addEventListener("click",()=>setSyncFocus(button.dataset.syncFocus)));



    $$('[data-a3u]').forEach(button=>button.addEventListener("click",()=>{state.a3u=button.dataset.a3u;renderA3U();}));
    $("#sync-play").addEventListener("click",()=>state.syncPlaying?pauseSync():playSync());
    $("#sync-scrubber").addEventListener("input",event=>{pauseSync();setSyncRatio(Number(event.target.value)/1000);});
    $$('[data-drawry]').forEach(button=>button.addEventListener("click",()=>transitionState($("#drawry-experience"),()=>{state.drawry=button.dataset.drawry;renderDrawry();})));
    const heroFrame=$(".hero-media-frame");
    heroFrame?.addEventListener("pointermove",(event)=>{const bounds=heroFrame.getBoundingClientRect();heroFrame.style.setProperty("--pointer-x",`${((event.clientX-bounds.left)/bounds.width)*100}%`);heroFrame.style.setProperty("--pointer-y",`${((event.clientY-bounds.top)/bounds.height)*100}%`);});
    heroFrame?.addEventListener("pointerleave",()=>{heroFrame.style.setProperty("--pointer-x","50%");heroFrame.style.setProperty("--pointer-y","50%");});
    addEventListener("popstate",routeFromHash);
    addEventListener("hashchange",routeFromHash);
    addEventListener("resize",()=>{if(innerWidth<=980){$(".work-preview")?.classList.remove("is-visible");pausePreview("work");}});
  }

  function setupOpening() {
    if (reduceMotion) { rootElement.classList.add("is-ready"); return; }
    const video = $("#hero-video");
    const videoReady = !video || video.readyState >= 1
      ? Promise.resolve()
      : Promise.race([
          new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true })),
          new Promise((resolve) => setTimeout(resolve, 700)),
        ]);
    const fontsReady = document.fonts?.ready
      ? Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 700)),
        ])
      : Promise.resolve();
    Promise.allSettled([fontsReady, videoReady]).then(() => {
      requestAnimationFrame(() => rootElement.classList.add("is-ready"));
    });
  }

  function setupCursor() {
    // Native cursors stay visible without placing a label over project copy.
    document.body.classList.remove("custom-cursor");
    $("#cursor").hidden = true;
  }

  function setupProjectEntries() {
    $$(".now-card").forEach((row) => {
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openProject(row.dataset.openProject);
      });
    });
  }

  function setupScrollReveals() {
    const groups = [
      ...$$('[data-reveal-group]'),
      ...$$('.chapter-heading'),
      ...$$('.project-hero'),
    ];
    groups.forEach((group) => {
      const items = group.matches(".project-hero")
        ? [...group.children].filter((item) => item.matches(".micro, .project-lead"))
        : [...group.children];
      items.forEach((item, index) => {
        item.dataset.scrollReveal = "copy";
        item.style.setProperty("--reveal-delay", `${Math.min(index,3) * 85}ms`);
      });
    });
    const mediaSelectors = [
      ".ego-lab", ".infra-path", ".project-note", ".sync-player", ".humanoid-facts",
      ".mimic-journey", ".a3u-stage-shell", ".a3u-stage-rail", ".dex-lab", ".dex-boundary", ".dex-qc-lab", ".dex-qc-notes", ".motion-lab", ".evidence-note", ".teleop-architecture",
      ".teleop-lab", ".drawry-experience", ".contribution-grid",
      ".drawry-contribution > figure",
    ];
    $$(mediaSelectors.join(",")).forEach((item) => { item.dataset.scrollReveal = "media"; });
    const items = $$('[data-scroll-reveal]');
    if (reduceMotion || !("IntersectionObserver" in window)) { items.forEach((item) => item.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }), { threshold: .12, rootMargin: "0px 0px -10% 0px" });
    items.forEach((item) => observer.observe(item));
  }

  function onScroll() {
    const root=state.project?$("#project-view"):document.documentElement;const top=state.project?root.scrollTop:scrollY;const max=(state.project?root.scrollHeight:document.documentElement.scrollHeight)-(state.project?root.clientHeight:innerHeight);$("#page-progress-bar").style.width=`${max>0?top/max*100:0}%`;
    const delta=top-state.lastScroll;$("#site-header").classList.toggle("is-scrolled",top>14);$("#site-header").classList.toggle("is-hidden",delta>9&&top>130&&!$("#menu-panel").classList.contains("is-open"));if(delta<-5)$("#site-header").classList.remove("is-hidden");state.lastScroll=top;
    if (!state.project && !reduceMotion) $("#hero-media")?.style.setProperty("--hero-shift", `${clamp(top / innerHeight,0,1) * 16}px`);
  }

  function animate(time) {
    if (previewMotion.enabled) {
      previewMotion.x=lerp(previewMotion.x,previewMotion.tx,.14);previewMotion.y=lerp(previewMotion.y,previewMotion.ty,.14);
      const preview=$(".work-preview");preview?.style.setProperty("--preview-x",`${previewMotion.x}px`);preview?.style.setProperty("--preview-y",`${previewMotion.y}px`);
    }
    if (cursorMotion.enabled) {
      cursorMotion.x=lerp(cursorMotion.x,cursorMotion.tx,.2);cursorMotion.y=lerp(cursorMotion.y,cursorMotion.ty,.2);
      const cursor=$("#cursor");if(cursor){cursor.style.left=`${cursorMotion.x}px`;cursor.style.top=`${cursorMotion.y}px`;}
    }
    requestAnimationFrame(animate);
  }

  applyCopy();
  setupInteractions();
  setupOpening();
  setupCursor();
  setupProjectEntries();
  setupWorkPreviews();
  setupScrollReveals();
  setPreview("egocentric");

  renderA3U();
  setHumanoidTrack(state.humanoidTrack, false);
  setSyncFocus(state.syncFocus);
  renderControlLabs();
  renderDrawry();

  routeFromHash();
  $("#project-view").addEventListener("scroll",onScroll,{passive:true});
  addEventListener("scroll",onScroll,{passive:true});
  onScroll();
  if (!state.project) playQuiet($("#hero-video"));
  requestAnimationFrame(animate);
})();
