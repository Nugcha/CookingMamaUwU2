import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged }
                         from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc,
         query, where, orderBy, onSnapshot, serverTimestamp, Timestamp }
                         from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CFG = {
  apiKey:"AIzaSyCEAcwTKoSnUkbaGvjrsy1QZ-Duj12WImk",
  authDomain:"cookingmamauwu-9902c.firebaseapp.com",
  projectId:"cookingmamauwu-9902c",
  storageBucket:"cookingmamauwu-9902c.firebasestorage.app",
  messagingSenderId:"18763902036",
  appId:"1:18763902036:web:a8703f75e5ddf1d1b791c1"
};

const ROLES = {
  "danielaiscool6128@gmail.com":  "Owner",
  "mateusstavares2008@gmail.com": "Manager",
  "thehecklolwhat15@gmail.com":   "Chef",
  "jv101607@gmail.com":           "Waiter",
};
function roleOf(email) { return ROLES[email] || "Staff"; }

const NAV_LINKS = {
  Owner:   [{l:"Customer Menu",  h:"../customer/customer.html"},
            {l:"Chef Dashboard", h:"../chef/chef.html"},
            {l:"Manager",        h:"../manager/manager.html"},
            {l:"Owner HQ",       h:"../owner/owner.html"}],
  Manager: [{l:"Customer Menu",  h:"../customer/customer.html"},
            {l:"Chef Dashboard", h:"../chef/chef.html"},
            {l:"Manager",        h:"../manager/manager.html"}],
  Chef:    [{l:"Customer Menu",  h:"../customer/customer.html"},
            {l:"Chef Dashboard", h:"../chef/chef.html"}],
  Waiter:  [{l:"Customer Menu",  h:"../customer/customer.html"}],
  Staff:   [{l:"Customer Menu",  h:"../customer/customer.html"}],
};

const app  = initializeApp(CFG);
const auth = getAuth(app);
const db   = getFirestore(app);

let clockedIn = false, clockInTime = null, activeSessionId = null;
let timerInterval = null, currentUser = null;

/* ── Theme ── */
const th = localStorage.getItem("mama-theme") || "dark";
document.documentElement.setAttribute("data-theme", th);
document.getElementById("themeBtn").textContent = th === "dark" ? "Light Mode" : "Dark Mode";
document.getElementById("themeBtn").addEventListener("click", () => {
  const c = document.documentElement.getAttribute("data-theme");
  const n = c === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", n);
  localStorage.setItem("mama-theme", n);
  document.getElementById("themeBtn").textContent = n === "dark" ? "Light Mode" : "Dark Mode";
  if (document.getElementById("mobileThemeBtn"))
    document.getElementById("mobileThemeBtn").textContent = n === "dark" ? "Light Mode" : "Dark Mode";
});

/* ── Hamburger ── */
document.getElementById("hamburger")?.addEventListener("click", () => {
  document.getElementById("mobileMenu").classList.toggle("open");
});

/* ── Auth ── */
onAuthStateChanged(auth, user => {
  document.getElementById("authLoader").style.display = "none";
  if (!user) { window.location.href = "../signup/signup.html"; return; }

  currentUser = user;
  const role  = roleOf(user.email);

  document.getElementById("navAvatar").src = user.photoURL || "";
  document.getElementById("navName").textContent    = user.displayName?.split(" ")[0] || "Staff";
  document.getElementById("empNameBig").textContent = user.displayName || "Employee";
  document.getElementById("roleTag").textContent    = role;
  document.getElementById("mainNav").style.display  = "flex";
  document.getElementById("pageContent").style.display = "block";

  buildNav(role);
  listenAllActive();
  listenMySessions(user.uid);
  checkOpenSession(user.uid);
});

document.getElementById("btnSignOut").addEventListener("click", async () => {
  if (clockedIn) await clockOut();
  await signOut(auth);
  window.location.href = "../signup/signup.html";
});

function buildNav(role) {
  const links = NAV_LINKS[role] || NAV_LINKS.Staff;

  // Desktop dropdown
  if (links.length) {
    document.getElementById("navDropdown").style.display = "block";
    document.getElementById("navDdMenu").innerHTML =
      links.map(k => `<button class="nav-dd-item" onclick="window.location.href='${k.h}'">${k.l}</button>`).join("");
  }
  document.getElementById("navDdBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("navDdMenu").classList.toggle("open");
  });
  document.addEventListener("click", () => document.getElementById("navDdMenu")?.classList.remove("open"));

  // Mobile menu
  const mob = document.getElementById("mobileMenu");
  const mobileLinks = links.map(k =>
    `<button class="nav-dd-item-mobile" onclick="window.location.href='${k.h}'">${k.l}</button>`).join("");
  mob.innerHTML = mobileLinks
    + `<button class="theme-btn" id="mobileThemeBtn">${document.documentElement.getAttribute("data-theme") === "dark" ? "Light Mode" : "Dark Mode"}</button>`
    + `<button class="sign-out-btn" id="mobileSignOut">Sign Out</button>`;

  document.getElementById("mobileThemeBtn")?.addEventListener("click", () => document.getElementById("themeBtn").click());
  document.getElementById("mobileSignOut")?.addEventListener("click", async () => {
    if (clockedIn) await clockOut();
    await signOut(auth);
    window.location.href = "../signup/signup.html";
  });
}

/* ── Live active staff ── */
function listenAllActive() {
  onSnapshot(query(collection(db, "timeSessions"), where("clockOut", "==", null)), snap => {
    renderActiveStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderActiveStaff(active) {
  const grid  = document.getElementById("activeGrid");
  const badge = document.getElementById("onlineCount");
  badge.textContent = active.length + " online";
  if (!active.length) {
    grid.innerHTML = `<div class="empty-active">No staff currently clocked in</div>`;
    return;
  }
  grid.innerHTML = active.map(s => {
    const inDate = s.clockIn?.toDate ? s.clockIn.toDate() : null;
    const inStr  = inDate ? inDate.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "";
    return `<div class="active-pill">
      <div class="active-dot"></div>
      <div>
        <div class="active-name">${s.userName || "Staff"}</div>
        <div class="active-role">${s.role || "Staff"}</div>
        <div class="active-time">Since ${inStr}</div>
      </div>
    </div>`;
  }).join("");
}

/* ── My completed sessions (shift history) ── */
function listenMySessions(uid) {
  const q = query(
    collection(db, "timeSessions"),
    where("uid", "==", uid),
    orderBy("clockIn", "desc")
  );
  onSnapshot(q, snap => {
    renderSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderSessions(sessions) {
  const body    = document.getElementById("sessionsBody");
  const totalEl = document.getElementById("totalHrsLabel");

  const completed = sessions.filter(s => s.clockOut && s.hoursWorked != null);
  const totalHrs  = completed.reduce((s, sess) => s + (sess.hoursWorked || 0), 0);
  totalEl.textContent = fmtHrs(totalHrs) + " total";

  if (!sessions.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty-sessions">No shifts yet. Clock in to get started.</td></tr>`;
    return;
  }

  body.innerHTML = sessions.map(s => {
    const inDate  = s.clockIn?.toDate  ? s.clockIn.toDate()  : null;
    const outDate = s.clockOut?.toDate ? s.clockOut.toDate() : null;

    const dateStr = inDate
      ? inDate.toLocaleDateString([], {weekday:"short", month:"short", day:"numeric", year:"numeric"})
      : "—";
    const inStr  = inDate  ? inDate.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "—";
    const outStr = outDate ? outDate.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "Active";
    const hrsHtml = (outDate && s.hoursWorked != null)
      ? `<span class="hrs-badge">${fmtHrs(s.hoursWorked)}</span>`
      : `<span style="color:var(--text2)">In progress</span>`;

    return `<tr>
      <td>${dateStr}</td>
      <td>${inStr}</td>
      <td>${outStr}</td>
      <td>${hrsHtml}</td>
    </tr>`;
  }).join("");
}

function fmtHrs(h) {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0)  return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/* ── Open session recovery ── */
function checkOpenSession(uid) {
  const q = query(collection(db, "timeSessions"), where("uid","==",uid), where("clockOut","==",null));
  onSnapshot(q, snap => {
    if (!snap.empty && !clockedIn) {
      const d = snap.docs[0];
      activeSessionId = d.id;
      clockInTime     = d.data().clockIn.toDate();
      clockedIn       = true;
      startTimer();
      setUIClocked(true);
    }
  });
}

/* ── Clock In ── */
document.getElementById("clockInBtn").addEventListener("click", async () => {
  if (clockedIn || !currentUser) return;
  const ref = await addDoc(collection(db, "timeSessions"), {
    uid:        currentUser.uid,
    userName:   currentUser.displayName,
    email:      currentUser.email,
    role:       roleOf(currentUser.email),
    clockIn:    serverTimestamp(),
    clockOut:   null,
    hoursWorked:null,
  });
  activeSessionId = ref.id;
  clockInTime     = new Date();
  clockedIn       = true;
  document.getElementById("shiftSummary").classList.remove("show");
  startTimer();
  setUIClocked(true);
  showToast("Clocked in. Have a great shift!");
});

/* ── Clock Out ── */
document.getElementById("clockOutBtn").addEventListener("click", () => clockOut());

async function clockOut() {
  if (!clockedIn || !activeSessionId) return;
  clearInterval(timerInterval);
  const now         = new Date();
  const diffMs      = now - clockInTime;
  const hoursWorked = +(diffMs / 3600000).toFixed(4);

  await updateDoc(doc(db, "timeSessions", activeSessionId), {
    clockOut:    Timestamp.fromDate(now),
    hoursWorked,
  });

  const dateStr = clockInTime.toLocaleDateString([], {weekday:"long", month:"long", day:"numeric"});
  const inStr   = clockInTime.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const outStr  = now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  document.getElementById("shiftSummaryText").innerHTML =
    `<strong>${dateStr}</strong> &mdash; ${inStr} to ${outStr} &mdash; <strong>${fmtHrs(hoursWorked)} worked</strong>`;
  document.getElementById("shiftSummary").classList.add("show");

  clockedIn = false; activeSessionId = null; clockInTime = null;
  setUIClocked(false);
  document.getElementById("clockDisplay").textContent = "00:00:00";
  document.getElementById("clockDisplay").classList.remove("running");
  showToast("Clocked out. " + fmtHrs(hoursWorked) + " worked.");
}

function startTimer() {
  clearInterval(timerInterval);
  document.getElementById("clockDisplay").classList.add("running");
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - clockInTime.getTime()) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    document.getElementById("clockDisplay").textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function setUIClocked(on) {
  document.getElementById("clockInBtn").disabled  = on;
  document.getElementById("clockOutBtn").disabled = !on;
  const st = document.getElementById("clockStatus");
  if (on) {
    const inStr = clockInTime ? clockInTime.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "";
    st.textContent = "Clocked in since " + inStr;
    st.classList.add("on");
  } else {
    st.textContent = "Not clocked in";
    st.classList.remove("on");
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

