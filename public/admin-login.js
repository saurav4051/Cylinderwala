const formEl = document.querySelector("#admin-login-form");
const statusEl = document.querySelector("#login-status");
const recoveryStartFormEl = document.querySelector("#recovery-start-form");
const recoveryStartStatusEl = document.querySelector("#recovery-start-status");
const recoveryCompleteFormEl = document.querySelector("#recovery-complete-form");
const recoveryQuestionEl = document.querySelector("#recovery-question");
const recoveryCompleteStatusEl = document.querySelector("#recovery-complete-status");

let recoveryUsername = "";

const ensureSession = async () => {
  try {
    const response = await fetch("/api/admin/session");
    const data = await response.json();
    if (data.authenticated) {
      window.location.href = "/admin";
      return true;
    }
  } catch {}
  return false;
};

const applyStatus = (element, message, tone = "neutral") => {
  element.textContent = message;
  element.style.color =
    tone === "success" ? "var(--green)" : tone === "error" ? "#8d4b46" : "";
};

const setStatus = (message, tone = "neutral") => {
  applyStatus(statusEl, message, tone);
};

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(formEl);

  try {
    setStatus("Signing in...");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: String(formData.get("username") || ""),
        password: String(formData.get("password") || ""),
      }),
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };

    if (!response.ok) {
      throw new Error(
        data.error?.startsWith("<!DOCTYPE")
          ? "Something went wrong while signing in. Please restart the server and try again."
          : data.error || "Login failed",
      );
    }

    setStatus("Login successful. Opening dashboard...", "success");
    window.location.href = data.redirectTo || "/admin";
  } catch (error) {
    setStatus(error.message, "error");
  }
});

recoveryStartFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(recoveryStartFormEl);

  try {
    applyStatus(recoveryStartStatusEl, "Checking account details...");
    const response = await fetch("/api/admin/recovery/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: String(formData.get("username") || ""),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not start recovery");
    }

    recoveryUsername = data.username;
    recoveryQuestionEl.value = data.recoveryQuestion;
    recoveryCompleteFormEl.hidden = false;
    applyStatus(recoveryStartStatusEl, "Recovery question is ready.", "success");
  } catch (error) {
    applyStatus(recoveryStartStatusEl, error.message, "error");
  }
});

recoveryCompleteFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(recoveryCompleteFormEl);

  try {
    applyStatus(recoveryCompleteStatusEl, "Updating password...");
    const response = await fetch("/api/admin/recovery/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: recoveryUsername,
        recoveryAnswer: String(formData.get("recoveryAnswer") || ""),
        newPassword: String(formData.get("newPassword") || ""),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not reset password");
    }

    applyStatus(
      recoveryCompleteStatusEl,
      "Password updated. You can now sign in with the new password.",
      "success",
    );
  } catch (error) {
    applyStatus(recoveryCompleteStatusEl, error.message, "error");
  }
});

ensureSession().then((authenticated) => {
  if (!authenticated) {
    setStatus("Enter your admin credentials.");
  }
});
