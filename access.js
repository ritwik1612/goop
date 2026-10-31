const app = document.querySelector("#app");
let access = { configured: false, unlocked: false, name: "there" };
try {
  const response = await fetch("/api/access", { cache: "no-store" });
  if (response.ok) access = await response.json();
} catch {}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
window.GOOPAccess = {
  unlocked: false,
  unlock: () => location.reload(),
  async lock() {
    await fetch("/api/access?action=lock", { method: "POST" });
    location.reload();
  },
};
async function start(personal) {
  window.GOOPAccess.unlocked = personal;
  const prefix = personal ? "goop:" : "goop-guest:";
  try {
    if (!personal)
      localStorage.setItem(prefix + "data-mode", JSON.stringify("demo"));
    else {
      localStorage.setItem(prefix + "data-mode", JSON.stringify("real"));
      if (!localStorage.getItem(prefix + "profile"))
        localStorage.setItem(
          prefix + "profile",
          JSON.stringify({ name: access.name, wake: "07:30" }),
        );
    }
  } catch {}
  document.querySelector("#access-screen")?.remove();
  document.body.classList.add("goop-ready");
  await import("./app.js");
}
if (access.unlocked) await start(true);
else {
  const screen = document.createElement("section");
  screen.id = "access-screen";
  screen.innerHTML = `<div class="access-card"><img src="/icon.svg" alt="GOOP" width="58" height="58"><span class="access-eyebrow">YOUR DAILY PERFORMANCE</span><h1>Welcome ${escape(access.name)}</h1><p>Enter your six-digit PIN to open your personal space.</p><form id="access-form"><label for="access-pin">PERSONAL ACCESS</label><input id="access-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" autocomplete="current-password" aria-label="Six-digit PIN" placeholder="••••••" required><p id="access-error" role="alert">${access.configured ? "" : "Personal access is being configured. Guest demo is available."}</p><button class="primary full" type="submit" ${access.configured ? "" : "disabled"}>UNLOCK MY DATA <span>→</span></button></form><div class="access-divider"><span>OR</span></div><button id="guest-demo" class="block-button full">EXPLORE GUEST DEMO</button><small>Your personal measurements stay separate from the demo.</small></div>`;
  document.body.append(screen);
  document
    .querySelector("#guest-demo")
    .addEventListener("click", () => start(false));
  document
    .querySelector("#access-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.target.querySelector("button");
      button.disabled = true;
      button.textContent = "UNLOCKING…";
      try {
        const response = await fetch("/api/access?action=unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: document.querySelector("#access-pin").value,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Unable to unlock.");
        await start(true);
      } catch (error) {
        document.querySelector("#access-error").textContent = error.message;
        button.disabled = false;
        button.textContent = "UNLOCK MY DATA →";
      }
    });
}

window.addEventListener("pageshow", async (event) => {
  if (event.persisted && window.GOOPAccess.unlocked) {
    try {
      const status = await (
        await fetch("/api/access", { cache: "no-store" })
      ).json();
      if (!status.unlocked) location.reload();
    } catch {
      location.reload();
    }
  }
});
