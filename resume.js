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
      summary: "新加坡国立大学硕士在读，具备机械工程与数据科学背景。搭建遥操作系统、训练人形机器人策略，关注真机实验、故障诊断与系统改进。",
      availability: "全职实习：2026.12–2027.01、2027.05–08；Capstone：2027.08–2028.01。",
      education: "教育经历", university: "新加坡国立大学", degree: "预计 2028.02 毕业",
      nusDegree: "Smart Industries & Digital Transformation 硕士 · Robotics & Automation 方向",
      cauUniversity: "中国农业大学", cauDate: "2026.07", cauDegree: "第二学士学位 · 数据科学与大数据技术",
      ncistUniversity: "华北科技学院", ncistDate: "2024.06", ncistDegree: "工学学士 · 机械设计制造及其自动化",
      experience: "研究与工程经历", current: "2026.08–至今", egoTitle: "NUS LV Robotics Lab · 机器人研究",
      egoCopy: "主导第一视角机器人学习研究的系统集成，职责涵盖实验支持、采集故障诊断与数据质量检查。项目处于早期阶段。",
      humanoidTitle: "清华 AIR 与 RoboParty Lab · 算法工程师", humanoidDate: "2026.05–09",
      humanoidCopy: "将 VR/SMPL 示范映射为 G1 表征，微调 NVIDIA GR00T，参与 SONIC 集成，支持团队的导航与预抓取演示。采集约 300 条原始数据，将多频率数据同步到 50 Hz 训练时间线。",
      humanoidValidation: "将 MimicLite 适配至 31 自由度 A3Ultra，准备动作数据并训练 PPO 跟踪策略，分别完成 sim-to-sim 评估与 Orin 推理验证。协作减少受保护真机测试中的高频抖动，响应延迟仍未解决。",
      armsTitle: "中科慧灵 CASBOT · 机器人算法实习生", armsContext: "2025.12–2026.05",
      armsCopy: "搭建 125 Hz FR3 主从遥操作系统，结合滤波、在线五次插值与前瞻补偿，在受控对比中将关节跟踪 RMSE 从 5.95° 降至 1.30°；开发回放与调参工具。",
      sdkCopy: "独立开发可复用的示教回放 SDK，集成样条规划与约 4 ms 间隔的 ServoCart 指令流，通过执行日志诊断并处理 IK 跳变、姿态不连续与队列拥塞。",
      forceCopy: "在 2 自由度主从平台上实现重力补偿后的接触力矩反馈，将接触阻力回传给操作者。",
      projects: "项目经历", visionTitle: "中国铁塔 · 无人机亚洲象检测", visionContext: "2025.05–12",
      visionCopy: "通过难例迭代、数据增强与 YOLOv11/SimAM 训练调整，将误报降低 85%，完成边缘部署与试点验证。",
      undergraduateTitle: "自主搬运机器人", undergraduateContext: "优秀毕业设计 · 2024",
      undergraduateCopy: "集成 STM32、树莓派与 OpenCV，实现二维码/颜色识别、目标定位、抓取、放置与自主返回。",
      complianceTitle: "FAIRINO 阻抗与柔顺控制接口集成", complianceStatus: "真机验证待完成",
      complianceCopy: "开发可配置实验执行工具，加入参数检查与退出处理，通过 mock-SDK 测试验证指令序列。",
      award: "机器人与算法竞赛一等奖 · 2025",
      skills: "技能与工具", controlSkillTitle: "控制与学习",
      controlSkillCopy: "轨迹规划与伺服控制、主从遥操作、重力补偿、PPO 动作跟踪、人体动作重定向与机器人测试自动化。",
      dataSkillTitle: "工具与系统",
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
