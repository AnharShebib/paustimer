/* =========================================================
   FikaTime + LunchTime (Stockholm-tid)
   - LUNCH: 11:00–12:00 (JA 🥪)
     * Check-in klickbar 10:45–12:00
     * Efter check-in: lunch till 13:00
   - FIKA: 15:00–15:15 (JA ☕)
     * Check-in klickbar 14:45–15:15
     * Efter check-in: fika till 16:00
   - Mode-switch:
     * 12:00–16:00 => FIKA-läge (timer/fika-regler)
     * annars => LUNCH-läge (timer/lunch-regler)
   - Fredag: helg efter fika (15:15 eller 16:00 om check-in)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const ui = {
    result: document.getElementById("result"),
    countdown: document.getElementById("countdown"),
    nameday: document.getElementById("nameday"),
    checkinWrap: document.getElementById("checkinWrap"),
    checkinBtn: document.getElementById("checkinBtn"),
    checkinStatus: document.getElementById("checkinStatus"),
    modeBadge: document.getElementById("modeBadge"),
    clock: document.getElementById("clock"),
  };

  const CONFIG = {
    tz: "Europe/Stockholm",

    fika: {
      key: "fika",
      label: "Fika",
      emoji: "☕",
      start: { h: 15, m: 0 },
      end: { h: 15, m: 15 },
      extendedEnd: { h: 16, m: 0 },
      soonMinutes: 5,
      missed: { start: { h: 15, m: 30 }, end: { h: 15, m: 45 } },
      checkinClickableFrom: { h: 14, m: 45 }, // klickbar 14:45
      checkinClickableTo: { h: 15, m: 15 },   // klickbar 15:15
    },

    lunch: {
      key: "lunch",
      label: "Lunch",
      emoji: "🥪",
      start: { h: 11, m: 0 },
      end: { h: 12, m: 0 },
      extendedEnd: { h: 13, m: 0 },
      soonMinutes: 5,
      missed: { start: { h: 12, m: 15 }, end: { h: 12, m: 45 } }, // "missade lunch" efter lunch
      checkinClickableFrom: { h: 10, m: 45 }, // klickbar 10:45
      checkinClickableTo: { h: 12, m: 0 },    // klickbar 12:00
    }
  };

  // ---------- Tid i Stockholm (med fallback) ----------
  function getSwedishDate() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: CONFIG.tz }));
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function atTime(now, h, m, s = 0, ms = 0) {
    const t = new Date(now);
    t.setHours(h, m, s, ms);
    return t;
  }
  function atHM(now, hm) { return atTime(now, hm.h, hm.m, 0, 0); }

  function isWeekend(now) {
    const day = now.getDay(); // 0=sön, 6=lör
    return day === 0 || day === 6;
  }

  // ---------- Dagnycklar ----------
  function todayKey(now) {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  function checkedInKey(modeKey, now) {
    return `${modeKey}_checkedin_${todayKey(now)}`;
  }
  function getCheckedIn(modeKey, now) {
    return localStorage.getItem(checkedInKey(modeKey, now)) === "1";
  }
  function setCheckedIn(modeKey, now, value) {
    localStorage.setItem(checkedInKey(modeKey, now), value ? "1" : "0");
  }

  // ---------- Namnsdag (cachad) ----------
  async function loadNameday() {
    const now = getSwedishDate();
    const key = `nameday_${todayKey(now)}`;
    const cached = localStorage.getItem(key);
    if (cached) { ui.nameday.textContent = cached; return; }

    const y = now.getFullYear();
    const m = pad2(now.getMonth() + 1);
    const d = pad2(now.getDate());

    try {
      const r = await fetch(`https://api.dryg.net/dagar/v2.1/${y}/${m}/${d}`);
      const data = await r.json();
      const names = data?.dagar?.[0]?.namnsdag ?? [];
      const text = names.length ? `Namnsdag: ${names.join(", ")}` : "Namnsdag saknas";
      ui.nameday.textContent = text;
      localStorage.setItem(key, text);
    } catch {
      ui.nameday.textContent = "Namnsdag saknas";
    }
  }

  // ---------- Mode: 12:00–16:00 => fika, annars lunch ----------
  function getActiveMode(now) {
    const twelve = atTime(now, 12, 0, 0, 0);
    const sixteen = atTime(now, 16, 0, 0, 0);
    return (now >= twelve && now < sixteen) ? "fika" : "lunch";
  }

  function setResultState(stateClass) {
    ui.result.classList.remove("state-YES", "state-NO", "state-SOON", "state-WEEKEND", "pulse");
    ui.result.classList.add(stateClass);
  }

  function formatCountdown(ms, prefix) {
    const diff = Math.max(0, ms);
    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 0) return `${prefix} om ${hours}h ${mins}m ${secs}s`;
    return `${prefix} om ${mins}m ${secs}s`;
  }

  function isWithin(now, start, end) {
    return now >= start && now < end;
  }

  function updateCheckinUI(cfg, now, checkedIn) {
    const clickableStart = atHM(now, cfg.checkinClickableFrom);
    const clickableEnd = atHM(now, cfg.checkinClickableTo);

    // knappen visas under hela klickfönstret (du vill den klickbar)
    const visible = isWithin(now, clickableStart, clickableEnd);

    ui.checkinWrap.style.display = visible ? "block" : "none";
    if (!visible) return;

    ui.checkinBtn.disabled = checkedIn;
    ui.checkinBtn.textContent = checkedIn ? "Incheckad ✅" : `Checka in till ${cfg.label}`;

    if (checkedIn) {
      ui.checkinStatus.textContent =
        `Du har checkat in till ${cfg.label} ✅ (${cfg.label.toLowerCase()} till ${pad2(cfg.extendedEnd.h)}:${pad2(cfg.extendedEnd.m)})`;
    } else {
      ui.checkinStatus.textContent =
        `Checka in nu för att förlänga ${cfg.label.toLowerCase()} till ${pad2(cfg.extendedEnd.h)}:${pad2(cfg.extendedEnd.m)}`;
    }
  }

  ui.checkinBtn.addEventListener("click", () => {
    const now = getSwedishDate();
    const mode = getActiveMode(now);
    const cfg = CONFIG[mode];

    const clickableStart = atHM(now, cfg.checkinClickableFrom);
    const clickableEnd = atHM(now, cfg.checkinClickableTo);

    if (isWithin(now, clickableStart, clickableEnd)) {
      setCheckedIn(cfg.key, now, true);
      render();
    }
  });

  // ---------- Fredags-helg (baserat på FIKA, som i din tidigare logik) ----------
  function isFridayWeekend(now) {
    const friday = now.getDay() === 5;
    if (!friday) return false;

    const fika = CONFIG.fika;
    const checkedInFika = getCheckedIn(fika.key, now);

    const fikaEnd = atHM(now, fika.end);
    const fikaExtendedEnd = atHM(now, fika.extendedEnd);

    const weekendStart = checkedInFika ? fikaExtendedEnd : fikaEnd;
    return now >= weekendStart;
  }

  // ---------- Render (hjärtat) ----------
  function render() {
    const now = getSwedishDate();

    // klocka + badge
    ui.clock.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

    // reset
    ui.countdown.textContent = "";
    ui.checkinWrap.style.display = "none";
    ui.checkinStatus.textContent = "";

    // HELG
    if (isWeekend(now) || isFridayWeekend(now)) {
      ui.modeBadge.textContent = "HELG";
      ui.result.textContent = "NU ÄR DET HELG 🎉";
      setResultState("state-WEEKEND");
      return;
    }

    const mode = getActiveMode(now);
    const cfg = CONFIG[mode];
    const checkedIn = getCheckedIn(cfg.key, now);

    ui.modeBadge.textContent = `${cfg.label}-läge`;

    const start = atHM(now, cfg.start);
    const end = atHM(now, cfg.end);
    const extendedEnd = atHM(now, cfg.extendedEnd);

    // 1) Checkad in => JA tills extendedEnd
    if (checkedIn && now < extendedEnd) {
      ui.result.textContent = `JA ${cfg.emoji}`;
      setResultState("state-YES");
      ui.checkinStatus.textContent =
        `Du har checkat in till ${cfg.label} ✅ (${cfg.label.toLowerCase()} till ${pad2(cfg.extendedEnd.h)}:${pad2(cfg.extendedEnd.m)})`;
      return;
    }

    // 2) Vanligt fönster => JA
    if (now >= start && now < end) {
      ui.result.textContent = `JA ${cfg.emoji}`;
      setResultState("state-YES");
      updateCheckinUI(cfg, now, checkedIn);
      return;
    }

    // 3) SOON
    const soonStart = new Date(start.getTime() - cfg.soonMinutes * 60 * 1000);
    if (now >= soonStart && now < start) {
      ui.result.textContent = `SNART ${cfg.emoji}`;
      setResultState("state-SOON");
      ui.result.classList.add("pulse");
      ui.countdown.textContent = formatCountdown(start - now, `Nästa ${cfg.label.toLowerCase()}`);
      updateCheckinUI(cfg, now, checkedIn); // om man är inom checkin-fönstret
      return;
    }

    // 4) MISSADE
    const missedStart = atHM(now, cfg.missed.start);
    const missedEnd = atHM(now, cfg.missed.end);
    if (now >= missedStart && now < missedEnd) {
      ui.result.textContent = `DU MISSADE ${cfg.label.toUpperCase()}`;
      setResultState("state-NO");
      return;
    }

    // 5) NEJ + countdown till nästa start i detta läge
    ui.result.textContent = "NEJ";
    setResultState("state-NO");

    let target = new Date(start);
    // Om vi redan passerat dagens start i detta läge, så blir nästa target nästa dag
    if (now >= end) {
      target.setDate(target.getDate() + 1);
      target = atHM(target, cfg.start);
    }

    ui.countdown.textContent = formatCountdown(target - now, `Nästa ${cfg.label.toLowerCase()}`);
    updateCheckinUI(cfg, now, checkedIn);
  }

  // ---------- Start ----------
  loadNameday();
  render();
  setInterval(render, 1000);
});
