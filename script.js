const header = document.querySelector(".site-header");
const animatedGroups = document.querySelectorAll(".reveal, .reveal-stagger");
const modal = document.querySelector("#consultation-modal");
const modalPanel = modal?.querySelector(".modal-panel");
const consultationForm = modal?.querySelector(".consultation-form");
const formMessage = consultationForm?.querySelector(".form-message");
const openModalButtons = document.querySelectorAll("[data-open-consultation]");
const closeModalButtons = document.querySelectorAll("[data-close-consultation]");
const noticeModal = document.querySelector("#notice-modal");
const closeNoticeButtons = document.querySelectorAll("[data-close-notice]");
const hideNoticeDayButton = document.querySelector("[data-hide-notice-day]");
const heroMedia = document.querySelector(".hero-media");
const heroVideos = Array.from(document.querySelectorAll(".hero-video"));
const proofTrack = document.querySelector(".proof-track");
let lastFocusedElement = null;

function syncHeaderState() {
  const isFixedPage = document.body.classList.contains("faq-page");
  header?.classList.toggle("is-scrolled", isFixedPage || window.scrollY > 24);
}

syncHeaderState();
window.addEventListener("scroll", syncHeaderState, { passive: true });

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.16,
    },
  );

  animatedGroups.forEach((element) => observer.observe(element));
} else {
  animatedGroups.forEach((element) => element.classList.add("is-visible"));
}

function setupHeroVideos() {
  if (!heroVideos.length) return;

  let activeIndex = 0;

  function activateVideo(index) {
    heroVideos.forEach((video, videoIndex) => {
      video.classList.toggle("is-active", videoIndex === index);
      if (videoIndex !== index) {
        video.pause();
        video.currentTime = 0;
      }
    });

    const activeVideo = heroVideos[index];
    activeVideo.play().catch(() => {
      // Browser autoplay can fail before metadata is ready; the placeholder remains visible.
    });
  }

  heroVideos.forEach((video, index) => {
    video.playbackRate = 0.82;

    video.addEventListener("loadeddata", () => {
      heroMedia?.classList.add("has-video");
      if (index === activeIndex) {
        activateVideo(activeIndex);
      }
    });

    video.addEventListener("ended", () => {
      activeIndex = (activeIndex + 1) % heroVideos.length;
      activateVideo(activeIndex);
    });

    video.addEventListener("error", () => {
      video.classList.remove("is-active");
    });
  });
}

setupHeroVideos();

if (proofTrack) {
  Array.from(proofTrack.children).forEach((card) => {
    proofTrack.appendChild(card.cloneNode(true));
  });
}

function openNoticeModal() {
  if (!noticeModal) return;
  noticeModal.classList.add("is-open");
  noticeModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeNoticeModal() {
  if (!noticeModal) return;
  noticeModal.classList.remove("is-open");
  noticeModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function shouldShowNotice() {
  const hiddenUntil = Number(localStorage.getItem("noticeHiddenUntil") || 0);
  return Date.now() > hiddenUntil;
}

if (shouldShowNotice()) {
  window.setTimeout(openNoticeModal, 620);
}

closeNoticeButtons.forEach((button) => {
  button.addEventListener("click", closeNoticeModal);
});

hideNoticeDayButton?.addEventListener("click", () => {
  const oneDay = 24 * 60 * 60 * 1000;
  localStorage.setItem("noticeHiddenUntil", String(Date.now() + oneDay));
  closeNoticeModal();
});

function openConsultationModal() {
  if (!modal) return;
  lastFocusedElement = document.activeElement;
  const startedAtInput = consultationForm?.querySelector("input[name='formStartedAt']");
  if (startedAtInput) startedAtInput.value = String(Date.now());
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => {
    modal.querySelector("input[name='name']")?.focus();
  }, 80);
}

function closeConsultationModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (formMessage) formMessage.textContent = "";
  lastFocusedElement?.focus?.();
}

openModalButtons.forEach((button) => {
  button.addEventListener("click", openConsultationModal);
});

closeModalButtons.forEach((button) => {
  button.addEventListener("click", closeConsultationModal);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && noticeModal?.classList.contains("is-open")) {
    closeNoticeModal();
    return;
  }

  if (event.key === "Escape" && modal?.classList.contains("is-open")) {
    closeConsultationModal();
  }
});

modalPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});

consultationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!consultationForm.checkValidity()) {
    consultationForm.reportValidity();
    return;
  }

  const endpoint = consultationForm.dataset.endpoint;
  const startedAtInput = consultationForm.querySelector("input[name='formStartedAt']");
  if (startedAtInput && !startedAtInput.value) {
    startedAtInput.value = String(Date.now());
  }
  const payload = Object.fromEntries(new FormData(consultationForm).entries());
  const submitButton = consultationForm.querySelector("button[type='submit']");

  if (formMessage) formMessage.textContent = "상담 신청을 전송하고 있습니다.";
  submitButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Request failed");
    }

    consultationForm.reset();
    if (formMessage) {
      formMessage.textContent = "상담 신청이 접수되었습니다. 빠르게 확인하겠습니다.";
    }
  } catch (error) {
    if (formMessage) {
      formMessage.textContent =
        "현재 로컬 미리보기에서는 전송되지 않습니다. 배포 후 /api/consultation 엔드포인트를 연결해 주세요.";
    }
  } finally {
    submitButton.disabled = false;
  }
});

// 숫자 카운트업 애니메이션 (스크롤 진입 시 0 → 목표값으로 롤링)
function setupStatCountUp() {
  const band = document.querySelector(".stat-band");
  if (!band) return;
  const nums = Array.from(band.querySelectorAll(".stat-num"));
  if (!nums.length) return;

  const format = (el, value) => {
    const decimals = Number(el.dataset.decimals || 0);
    let text = value.toFixed(decimals);
    if (el.dataset.comma === "1") {
      text = Number(text).toLocaleString("en-US");
    }
    el.textContent = text;
  };

  const run = (el) => {
    const target = Number(el.dataset.count || 0);
    const duration = 1400;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      format(el, target * ease(progress));
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        format(el, target);
      }
    };
    requestAnimationFrame(tick);
  };

  const prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduce || !("IntersectionObserver" in window)) {
    nums.forEach((el) => format(el, Number(el.dataset.count || 0)));
    return;
  }

  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          nums.forEach(run);
          countObserver.disconnect();
        }
      });
    },
    { threshold: 0.4 },
  );
  countObserver.observe(band);
}

setupStatCountUp();

// 전화번호 클릭 추적 (sendBeacon: 전화 거는 동작을 막지 않음)
document.querySelectorAll("[data-track-call]").forEach((link) => {
  link.addEventListener("click", () => {
    try {
      const payload = JSON.stringify({ source: link.dataset.trackCall || "unknown" });
      navigator.sendBeacon("/api/track-call", new Blob([payload], { type: "application/json" }));
    } catch (error) {
      // 추적 실패해도 전화 동작에는 영향 없음
    }
  });
});

// 자료 다운로드(리드 게이트) 모달
const bookletModal = document.querySelector("#booklet-modal");
const bookletPanel = bookletModal?.querySelector(".modal-panel");
const bookletForm = bookletModal?.querySelector(".booklet-form");
const bookletMessage = bookletForm?.querySelector(".form-message");
const openBookletButtons = document.querySelectorAll("[data-open-booklet]");
const closeBookletButtons = document.querySelectorAll("[data-close-booklet]");
let lastBookletFocus = null;

function openBookletModal(trigger) {
  if (!bookletModal) return;
  lastBookletFocus = document.activeElement;
  // 트리거 버튼의 자료 slug를 폼에 반영(자료가 여러 개로 늘어나도 동작)
  const slug = trigger?.dataset?.booklet;
  if (slug && bookletForm) {
    const hidden = bookletForm.querySelector("input[name='booklet']");
    if (hidden) hidden.value = slug;
  }
  const startedAtInput = bookletForm?.querySelector("input[name='formStartedAt']");
  if (startedAtInput) startedAtInput.value = String(Date.now());
  bookletModal.classList.add("is-open");
  bookletModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => {
    bookletModal.querySelector("input[name='name']")?.focus();
  }, 80);
}

function closeBookletModal() {
  if (!bookletModal) return;
  bookletModal.classList.remove("is-open");
  bookletModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (bookletMessage) bookletMessage.textContent = "";
  bookletForm?.querySelector(".booklet-download-link")?.remove();
  bookletForm?.querySelector(".booklet-referral-cta")?.remove();
  lastBookletFocus?.focus?.();
}

// 모바일·카톡 인앱 등 자동 다운로드가 막히는 환경을 위해 직접 누를 수 있는 다운로드 버튼을 표시
function showBookletDownloadLink(url) {
  if (!bookletForm) return;
  let link = bookletForm.querySelector(".booklet-download-link");
  if (!link) {
    link = document.createElement("a");
    link.className = "primary-button submit-button booklet-download-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "자료 다운로드 →";
    bookletForm.appendChild(link);
  }
  link.href = url;
}

openBookletButtons.forEach((button) => {
  button.addEventListener("click", () => openBookletModal(button));
});

closeBookletButtons.forEach((button) => {
  button.addEventListener("click", closeBookletModal);
});

bookletPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && bookletModal?.classList.contains("is-open")) {
    closeBookletModal();
  }
});

bookletForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!bookletForm.checkValidity()) {
    bookletForm.reportValidity();
    return;
  }

  const endpoint = bookletForm.dataset.endpoint;
  const startedAtInput = bookletForm.querySelector("input[name='formStartedAt']");
  if (startedAtInput && !startedAtInput.value) {
    startedAtInput.value = String(Date.now());
  }
  const payload = Object.fromEntries(new FormData(bookletForm).entries());
  // 누군가의 추천 링크(?ref=)로 들어왔다면 그 코드를 함께 보내 전환으로 집계
  const incomingRef = getIncomingRef();
  if (incomingRef) payload.ref = incomingRef;
  const submitButton = bookletForm.querySelector("button[type='submit']");

  if (bookletMessage) bookletMessage.textContent = "자료를 준비하고 있습니다.";
  submitButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok || !data.url) {
      throw new Error("Request failed");
    }

    bookletForm.reset();
    if (bookletMessage) {
      bookletMessage.textContent = "자료가 준비됐습니다. 다운로드가 시작되지 않으면 아래 버튼을 눌러 주세요.";
    }
    // 직접 누를 수 있는 다운로드 버튼 표시(아이폰·카톡 인앱 폴백)
    showBookletDownloadLink(data.url);
    // 데스크톱·안드로이드는 새 탭에서 자동 다운로드 (CSP navigation, connect-src 무관)
    window.open(data.url, "_blank", "noopener");
    // 발급받은 내 추천코드 저장 + 프리미엄 자료 유도(C-2 바이럴 루프)
    if (data.refCode) {
      saveMyRef(data.refCode);
      showReferralCtaInBooklet();
    }
  } catch (error) {
    if (bookletMessage) {
      bookletMessage.textContent =
        "현재 로컬 미리보기에서는 다운로드되지 않습니다. 배포 후 다시 시도해 주세요.";
    }
  } finally {
    submitButton.disabled = false;
  }
});

// ===== C-2 추천(referral) 바이럴 루프 =====
// 베이직 자료를 받은 사람은 추천코드(refCode)를 받는다. 그 사람이 내 추천 링크(?ref=CODE)를
// 공유해 친구가 무료 자료를 받으면 전환 1로 집계되고, 2명이면 프리미엄 자료가 해제된다.

const REFERRAL_ENDPOINT = "/api/referral";
const MY_REF_KEY = "mabasa_my_ref"; // 내가 발급받은 추천코드
const INCOMING_REF_KEY = "mabasa_incoming_ref"; // 내가 누군가의 링크로 들어왔을 때의 코드
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

function getMyRef() {
  try {
    return localStorage.getItem(MY_REF_KEY) || "";
  } catch (error) {
    return "";
  }
}

function saveMyRef(code) {
  try {
    localStorage.setItem(MY_REF_KEY, code);
  } catch (error) {
    /* 저장 실패해도 흐름엔 영향 없음 */
  }
}

function getIncomingRef() {
  try {
    return localStorage.getItem(INCOMING_REF_KEY) || "";
  } catch (error) {
    return "";
  }
}

function buildReferralUrl(code) {
  return `${window.location.origin}/?ref=${code}`;
}

// 페이지 진입 시 ?ref= 가 있으면 저장하고 방문 카운트(통계). URL에서는 깔끔히 제거.
function captureIncomingRef() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("ref") || "").trim().toUpperCase();
  if (!REFERRAL_CODE_PATTERN.test(raw)) return;
  // 내 코드로 내가 들어온 경우는 무시(자기추천 방지 1차)
  if (raw === getMyRef()) {
    cleanRefFromUrl(params);
    return;
  }
  try {
    localStorage.setItem(INCOMING_REF_KEY, raw);
  } catch (error) {
    /* noop */
  }
  fetch(REFERRAL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "visit", ref: raw }),
  }).catch(() => {});
  cleanRefFromUrl(params);
}

function cleanRefFromUrl(params) {
  params.delete("ref");
  const query = params.toString();
  const newUrl = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
  window.history.replaceState(null, "", newUrl);
}

const referralModal = document.querySelector("#referral-modal");
const referralPanel = referralModal?.querySelector(".referral-panel");
const referralNeedBasic = referralModal?.querySelector(".referral-need-basic");
const referralLinkInput = referralModal?.querySelector(".referral-link-input");
const referralCopyButton = referralModal?.querySelector(".referral-copy-button");
const referralShareButton = referralModal?.querySelector(".referral-share-button");
const referralRefreshButton = referralModal?.querySelector(".referral-refresh-button");
const referralDownloadButton = referralModal?.querySelector(".referral-download-button");
const referralDotsEl = referralModal?.querySelector(".referral-progress-dots");
const referralTextEl = referralModal?.querySelector(".referral-progress-text");
const referralMessageEl = referralModal?.querySelector(".referral-message");
let lastReferralFocus = null;

function setReferralMessage(text) {
  if (referralMessageEl) referralMessageEl.textContent = text || "";
}

function renderReferralProgress(conversions, threshold, unlocked) {
  const total = threshold || 2;
  const done = Math.min(conversions || 0, total);
  if (referralDotsEl) {
    referralDotsEl.innerHTML = "";
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement("i");
      if (i < done) dot.classList.add("is-on");
      referralDotsEl.appendChild(dot);
    }
  }
  if (referralTextEl) {
    referralTextEl.textContent = unlocked
      ? "프리미엄 잠금 해제 완료! 🎉"
      : `친구 ${done} / ${total}명`;
  }
  if (referralDownloadButton) referralDownloadButton.hidden = !unlocked;
}

async function fetchReferralProgress(code) {
  const res = await fetch(`${REFERRAL_ENDPOINT}?ref=${encodeURIComponent(code)}`);
  return res.json();
}

async function openReferralModal() {
  if (!referralModal) return;
  lastReferralFocus = document.activeElement;
  const myCode = getMyRef();

  if (!myCode) {
    if (referralNeedBasic) referralNeedBasic.hidden = false;
    if (referralPanel) referralPanel.hidden = true;
  } else {
    if (referralNeedBasic) referralNeedBasic.hidden = true;
    if (referralPanel) referralPanel.hidden = false;
    if (referralLinkInput) referralLinkInput.value = buildReferralUrl(myCode);
    setReferralMessage("");
    renderReferralProgress(0, 2, false);
    try {
      const data = await fetchReferralProgress(myCode);
      renderReferralProgress(data.conversions || 0, data.threshold || 2, !!data.unlocked);
    } catch (error) {
      /* 조회 실패는 조용히 무시(0/2로 표시) */
    }
  }

  referralModal.classList.add("is-open");
  referralModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeReferralModal() {
  if (!referralModal) return;
  referralModal.classList.remove("is-open");
  referralModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  lastReferralFocus?.focus?.();
}

async function shareReferralLink(url) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "마바사 정부지원금 무료 자료",
        text: "내 회사가 받을 수 있는 정부지원금, 1분이면 확인할 수 있어요.",
        url,
      });
      return true;
    } catch (error) {
      return false; // 사용자가 공유 취소 등
    }
  }
  return false;
}

async function copyReferralLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    if (referralLinkInput) {
      referralLinkInput.select();
      try {
        return document.execCommand("copy");
      } catch (innerError) {
        return false;
      }
    }
    return false;
  }
}

async function downloadPremium(code) {
  setReferralMessage("자료를 준비하고 있습니다.");
  try {
    const res = await fetch(REFERRAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlock", ref: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.url) {
      if (referralDownloadButton) referralDownloadButton.href = data.url;
      window.open(data.url, "_blank", "noopener");
      setReferralMessage("프리미엄 가이드 다운로드가 시작됐습니다. 시작되지 않으면 위 버튼을 다시 눌러 주세요.");
    } else {
      renderReferralProgress(data.conversions || 0, data.threshold || 2, !!data.unlocked);
      setReferralMessage("아직 잠금이 풀리지 않았어요. 친구 2명이 무료 자료를 받아야 합니다.");
    }
  } catch (error) {
    setReferralMessage("현재 로컬 미리보기에서는 다운로드되지 않습니다. 배포 후 다시 시도해 주세요.");
  }
}

// 베이직 다운로드 직후, 폼 안에 "프리미엄도 받기" 유도 버튼 추가
function showReferralCtaInBooklet() {
  if (!bookletForm) return;
  let cta = bookletForm.querySelector(".booklet-referral-cta");
  if (!cta) {
    cta = document.createElement("button");
    cta.type = "button";
    cta.className = "referral-refresh-button booklet-referral-cta";
    cta.style.textDecoration = "none";
    cta.style.fontWeight = "700";
    cta.style.color = "var(--primary-deep)";
    cta.textContent = "🎁 친구 2명 추천하고 프리미엄 가이드도 받기 →";
    cta.addEventListener("click", () => {
      closeBookletModal();
      openReferralModal();
    });
    bookletForm.appendChild(cta);
  }
}

document.querySelectorAll("[data-open-referral]").forEach((button) => {
  button.addEventListener("click", openReferralModal);
});
referralModal?.querySelectorAll("[data-close-referral]").forEach((button) => {
  button.addEventListener("click", closeReferralModal);
});
referralModal?.querySelector(".modal-panel")?.addEventListener("click", (event) => {
  event.stopPropagation();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && referralModal?.classList.contains("is-open")) {
    closeReferralModal();
  }
});

referralCopyButton?.addEventListener("click", async () => {
  const url = referralLinkInput?.value || "";
  if (!url) return;
  const ok = await copyReferralLink(url);
  if (ok) {
    referralCopyButton.classList.add("is-done");
    referralCopyButton.textContent = "복사됨";
    window.setTimeout(() => {
      referralCopyButton.classList.remove("is-done");
      referralCopyButton.textContent = "복사";
    }, 1800);
  }
});

referralShareButton?.addEventListener("click", async () => {
  const url = referralLinkInput?.value || "";
  if (!url) return;
  const shared = await shareReferralLink(url);
  if (!shared) {
    const copied = await copyReferralLink(url);
    setReferralMessage(
      copied
        ? "링크를 복사했어요. 카카오톡 등에 붙여넣어 친구에게 공유해 주세요."
        : "링크 복사에 실패했어요. 위 링크를 직접 복사해 주세요.",
    );
  }
});

referralRefreshButton?.addEventListener("click", async () => {
  const myCode = getMyRef();
  if (!myCode) return;
  setReferralMessage("확인 중…");
  try {
    const data = await fetchReferralProgress(myCode);
    renderReferralProgress(data.conversions || 0, data.threshold || 2, !!data.unlocked);
    setReferralMessage(data.unlocked ? "잠금이 풀렸어요! 아래 버튼으로 받으세요." : "");
  } catch (error) {
    setReferralMessage("확인에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
});

referralDownloadButton?.addEventListener("click", async (event) => {
  event.preventDefault();
  const myCode = getMyRef();
  if (!myCode) return;
  await downloadPremium(myCode);
});

captureIncomingRef();

// AI 시연 영상: 무음 자동재생(반복). 소리는 컨트롤바로 켤 수 있음.
