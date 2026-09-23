(() => {
  "use strict";

  const english = Object.fromEntries(
    [...document.querySelectorAll("[data-text]")].map(element => [element.dataset.text, element.textContent])
  );
  const copy = {
    en: { ...english, language: "Language", title: "Yangyi Guo | Resume", description: "Yangyi Guo's research and engineering experience in robot motion control, teleoperation, humanoid deployment and egocentric research." },
    zh: {
      title: "郭阳溢 | 求职摘要",
      description: "郭阳溢的研究与工程经历：机械臂运动控制、遥操作、人形机器人部署与 Egocentric 研究。",
      skip: "跳到正文", back: "返回作品集", language: "语言", print: "打印",
      eyebrow: "研究与工程经历", name: "郭阳溢", location: "新加坡", portfolio: "项目作品集",
      focus: "机器人运动控制、遥操作与人形机器人部署",
      summary: "新加坡国立大学硕士在读，方向为 Robotics and Automation。经历涵盖机械与嵌入式系统、视觉部署、机械臂控制和人体动作数据，关注系统在真实硬件上的运行与验证。",
      education: "教育经历", university: "新加坡国立大学", degree: "硕士在读 · 2026–2028", track: "方向：Robotics and Automation",
      experience: "主要经历", current: "当前研究 · NUS", egoTitle: "Egocentric 研究",
      egoCopy: "研究方向为多模态人体数据采集，个人职责包括系统集成、实验支持与数据质量。项目处于早期阶段。",
      armsTitle: "机械臂运动控制与遥操作", armsContext: "中科慧灵 · 实习",
      armsCopy: "独立开发样条运动 SDK，已用于莆田 PUMA 鞋厂。搭建 FR3 主从遥操作，参与力交互工作，并在真实机械臂上验证运行效果。",
      humanoidTitle: "人体动作数据与人形机器人部署",
      humanoidCopy: "搭建人体数据同步采集与机器人回放，复现开源 MimicLite 在 G1 上的部署，并适配 A3U 的模型、动作数据和接口，用于策略训练与真机实验。",
      visionTitle: "视觉部署", visionContext: "边缘推理 · 现场验证",
      visionCopy: "为无人机亚洲象检测准备数据、训练并优化 YOLOv11，将模型部署到边缘设备，通过真实视频流和现场测试检查效果。",
      undergraduateTitle: "物流搬运机器人", undergraduateContext: "本科毕业设计",
      undergraduateCopy: "设计机械结构，集成 STM32 控制与树莓派上的 OpenCV 视觉，实现目标识别、搬运、定点放置与返回。",
      skills: "技术经验", controlSkillTitle: "机器人与控制",
      controlSkillCopy: "轨迹插值、实时指令下发、遥操作与真机调试。",
      dataSkillTitle: "数据与视觉", dataSkillCopy: "人体动作数据、机器人动作映射、同步回放、OpenCV、YOLOv11 与 HDF5。",
      hardwareSkillTitle: "系统与硬件", hardwareSkillCopy: "机器人模型与设备集成、仿真验证、STM32 与树莓派。",
      additional: "其他项目", drawryCopy: " · 在小绘书团队中完善功能与交互，参与 AI 故事产品原型设计，将儿童画作与家庭共读连接起来。",
      footer: "郭阳溢 · 研究与工程经历", contact: "联系",
    },
  };

  function initialLanguage() {
    const query = new URLSearchParams(location.search).get("lang");
    if (query === "en" || query === "zh") return query;
    try {
      const stored = localStorage.getItem("portfolio-language");
      if (stored === "en" || stored === "zh") return stored;
    } catch {}
    return "en";
  }

  function setLanguage(language) {
    const text = copy[language];
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.language = language;
    document.title = text.title;
    document.querySelector('meta[name="description"]').content = text.description;
    document.querySelectorAll("[data-text]").forEach(element => { element.textContent = text[element.dataset.text]; });
    document.querySelectorAll("[data-label]").forEach(element => { element.setAttribute("aria-label", text[element.dataset.label]); });
    document.querySelectorAll("[data-title]").forEach(element => { element.title = text[element.dataset.title]; });
    document.querySelectorAll("[data-language-choice]").forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.languageChoice === language)); });
    document.querySelectorAll("[data-portfolio-link]").forEach(link => { link.href = `index.html?lang=${language}`; });
    document.querySelectorAll("[data-project]").forEach(link => { link.href = `index.html?lang=${language}#project/${link.dataset.project}`; });
    document.querySelector("[data-contact-link]").href = `index.html?lang=${language}#contact`;
    const url = new URL(location.href);
    url.searchParams.set("lang", language);
    history.replaceState(null, "", url);
    try { localStorage.setItem("portfolio-language", language); } catch {}
  }

  document.querySelectorAll("[data-language-choice]").forEach(button => {
    button.addEventListener("click", () => setLanguage(button.dataset.languageChoice));
  });
  document.getElementById("print-resume").addEventListener("click", () => window.print());
  setLanguage(initialLanguage());
})();
