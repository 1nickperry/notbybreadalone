(function () {
  "use strict";

  // Swap these constants (and matching data-* on #donateFab) when handles arrive.
  var VENMO_HANDLE = "VENMO_HANDLE";
  var PAYPAL_HANDLE = "perrynick";

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var accountBtn = document.getElementById("accountBtn");
  var accountMenu = document.getElementById("accountMenu");
  if (accountBtn && accountMenu) {
    accountBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = accountMenu.hasAttribute("hidden");
      if (open) {
        accountMenu.removeAttribute("hidden");
        accountBtn.setAttribute("aria-expanded", "true");
      } else {
        accountMenu.setAttribute("hidden", "");
        accountBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("click", function () {
      accountMenu.setAttribute("hidden", "");
      accountBtn.setAttribute("aria-expanded", "false");
    });
    accountMenu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatDisplay(digits) {
    var d = digits.slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
  }

  function normalizeUsPhone(raw) {
    var d = digitsOnly(raw);
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    if (d.length !== 10) return null;
    return d;
  }

  function bindPhoneFormatting(phoneInput) {
    if (!phoneInput) return;
    phoneInput.addEventListener("input", function () {
      var d = digitsOnly(phoneInput.value);
      if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
      phoneInput.value = formatDisplay(d);
    });
  }

  // --- Floating donate control ---
  var donateFab = document.getElementById("donateFab");
  var donateToggle = document.getElementById("donateFabToggle");
  var donateMenu = document.getElementById("donateFabMenu");
  var donateVenmo = document.getElementById("donateVenmo");
  var donatePaypal = document.getElementById("donatePaypal");

  function isDonatePlaceholder(v) {
    return (
      !v ||
      v === "VENMO_HANDLE" ||
      v === "PAYPAL_HANDLE" ||
      v === "PLACEHOLDER"
    );
  }

  function resolveDonateHandles() {
    var venmo =
      (donateFab && donateFab.getAttribute("data-venmo-handle")) || VENMO_HANDLE;
    var paypal =
      (donateFab && donateFab.getAttribute("data-paypal-handle")) || PAYPAL_HANDLE;
    if (donateVenmo) {
      if (!isDonatePlaceholder(venmo)) {
        donateVenmo.href = "https://venmo.com/u/" + encodeURIComponent(venmo);
        donateVenmo.hidden = false;
      } else {
        donateVenmo.hidden = true;
        donateVenmo.removeAttribute("href");
      }
    }
    if (donatePaypal) {
      if (!isDonatePlaceholder(paypal)) {
        donatePaypal.href = "https://paypal.me/" + encodeURIComponent(paypal);
        donatePaypal.hidden = false;
      } else {
        donatePaypal.hidden = true;
        donatePaypal.removeAttribute("href");
      }
    }
  }

  resolveDonateHandles();

  // Hide the floating donate control until at least one real handle is set.
  (function hideDonateUntilConfigured() {
    if (!donateFab) return;
    var venmo =
      (donateFab.getAttribute("data-venmo-handle") || VENMO_HANDLE || "").trim();
    var paypal =
      (donateFab.getAttribute("data-paypal-handle") || PAYPAL_HANDLE || "").trim();
    if (isDonatePlaceholder(venmo) && isDonatePlaceholder(paypal)) {
      donateFab.hidden = true;
      donateFab.setAttribute("aria-hidden", "true");
    } else {
      donateFab.hidden = false;
      donateFab.removeAttribute("aria-hidden");
    }
  })();


  // Force-show donate when PayPal is configured (defensive).
  if (donateFab && !isDonatePlaceholder(PAYPAL_HANDLE)) {
    donateFab.hidden = false;
    donateFab.removeAttribute("aria-hidden");
    donateFab.style.display = "";
  }

  if (donateToggle && donateMenu) {
    donateToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = donateMenu.hasAttribute("hidden");
      if (open) {
        donateMenu.removeAttribute("hidden");
        donateToggle.setAttribute("aria-expanded", "true");
      } else {
        donateMenu.setAttribute("hidden", "");
        donateToggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("click", function () {
      donateMenu.setAttribute("hidden", "");
      donateToggle.setAttribute("aria-expanded", "false");
    });
    donateMenu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  // --- Signup form ---
  var phoneInput = document.getElementById("phone");
  bindPhoneFormatting(phoneInput);

  var form = document.getElementById("signupForm");
  var message = document.getElementById("formMessage");
  var versionEl = document.getElementById("version");
  var timeEl = document.getElementById("time");

  function setMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("ok", "err");
    if (kind) el.classList.add(kind);
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var phone = normalizeUsPhone(phoneInput && phoneInput.value);
      if (!phone) {
        setMessage(message, "Enter a valid 10-digit US phone number.", "err");
        if (phoneInput) phoneInput.focus();
        return;
      }

      // Only KJV is selectable in the UI; force KJV and do not send theme.
      var version = "KJV";
      if (versionEl && versionEl.value === "KJV") {
        version = "KJV";
      }
      var time = timeEl ? timeEl.value : "12:00 PM";

      var btn = form.querySelector(".signup-btn");
      if (btn) btn.disabled = true;
      setMessage(message, "Signing you up…", "");

      var url =
        "/add?=" +
        encodeURIComponent("1" + phone) +
        "&version=" +
        encodeURIComponent(version) +
        "&time=" +
        encodeURIComponent(time);

      fetch(url, { method: "GET", credentials: "same-origin" })
        .then(function (res) {
          return res.text().then(function (text) {
            return { ok: res.ok, status: res.status, text: text };
          });
        })
        .then(function (result) {
          var text = (result.text || "").trim();
          if (!result.ok) {
            setMessage(
              message,
              text || "Something went wrong. Please try again.",
              "err"
            );
            return;
          }
          if (/already on the list/i.test(text)) {
            setMessage(
              message,
              "You are already signed up. Preferences updated for +" +
                "1" +
                phone +
                ".",
              "ok"
            );
          } else {
            setMessage(
              message,
              "You are signed up! Watch for a verse at " +
                time +
                " Mountain Time.",
              "ok"
            );
          }
          if (phoneInput) phoneInput.value = "";
        })
        .catch(function () {
          setMessage(
            message,
            "Could not reach the signup service. Check your connection and try again.",
            "err"
          );
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  // --- Unsubscribe form ---
  var unsubForm = document.getElementById("unsubscribeForm");
  var unsubMessage = document.getElementById("unsubscribeMessage");
  var reasonEl = document.getElementById("reason");

  if (unsubForm) {
    unsubForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var phone = normalizeUsPhone(phoneInput && phoneInput.value);
      if (!phone) {
        setMessage(
          unsubMessage,
          "Enter a valid 10-digit US phone number.",
          "err"
        );
        if (phoneInput) phoneInput.focus();
        return;
      }

      var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
      if (reason.length < 10) {
        setMessage(
          unsubMessage,
          "Please share a reason with at least 10 characters.",
          "err"
        );
        if (reasonEl) reasonEl.focus();
        return;
      }

      var btn = unsubForm.querySelector(".unsubscribe-submit");
      if (btn) btn.disabled = true;
      setMessage(unsubMessage, "Removing your number…", "");

      var url =
        "/remove?=" +
        encodeURIComponent("1" + phone) +
        "&number=" +
        encodeURIComponent("1" + phone) +
        "&reason=" +
        encodeURIComponent(reason);

      fetch(url, { method: "GET", credentials: "same-origin" })
        .then(function (res) {
          return res.text().then(function (text) {
            return { ok: res.ok, status: res.status, text: text };
          });
        })
        .then(function (result) {
          var text = (result.text || "").trim();
          if (!result.ok) {
            setMessage(
              unsubMessage,
              text || "Something went wrong. Please try again.",
              "err"
            );
            return;
          }
          if (/not on the list/i.test(text)) {
            setMessage(
              unsubMessage,
              "That number was not on the list. If you still get texts, email hi@notbybreadalone.app.",
              "err"
            );
            return;
          }
          setMessage(
            unsubMessage,
            "You have been unsubscribed. You will no longer receive daily verse texts.",
            "ok"
          );
          if (phoneInput) phoneInput.value = "";
          if (reasonEl) reasonEl.value = "";
        })
        .catch(function () {
          setMessage(
            unsubMessage,
            "Could not reach the remove service. Check your connection and try again.",
            "err"
          );
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }
})();
