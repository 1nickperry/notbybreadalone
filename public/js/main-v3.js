(function () {
  "use strict";

  // Swap these constants (and matching data-* on #donateFab) when handles arrive.
  var VENMO_HANDLE = "VENMO_HANDLE";
  var PAYPAL_HANDLE = "perrynick";

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Gentle hero phone float + synced soft contact shadow (GSAP CDN).
  (function initHeroFloat() {
    var floatEl = document.getElementById("heroPhoneFloat");
    var shadowEl = document.getElementById("heroPhoneShadow");
    if (!floatEl) return;
    
    var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      return;
    }
    
    function start() {
      if (!window.gsap) return false;
      gsap.to(floatEl, {
        y: -14,
        duration: 3.2,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
      if (shadowEl) {
        gsap.set(shadowEl, { transformOrigin: "50% 50%" });
        gsap.fromTo(
          shadowEl,
          { scale: 1, opacity: 0.95 },
          {
            scale: 0.82,
            opacity: 0.4,
            duration: 3.2,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          }
        );
      }
      return true;
    }
    
    if (!start()) {
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        if (start() || tries > 40) clearInterval(timer);
      }, 50);
    }
  })();

  // Typed.js message sequence for hero iPhone mockup
  (function initTypedMessages() {
    var chip1 = document.getElementById("chip1");
    var chip1Mobile = document.getElementById("chip1-mobile");
    var chip1Desktop = document.getElementById("chip1-desktop");
    var bubble1 = document.getElementById("bubble1");
    var verse1 = document.getElementById("verse1");
    var bubble2 = document.getElementById("bubble2");
    var verse2 = document.getElementById("verse2");
    
    if (!chip1 || !verse1) return;
    
    var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var isMobile = window.innerWidth <= 900;
    
    // Show final text immediately if reduced motion
    if (prefersReduced) {
      if (chip1Mobile) chip1Mobile.textContent = chip1Mobile.getAttribute("data-text");
      if (chip1Desktop) chip1Desktop.textContent = chip1Desktop.getAttribute("data-text");
      verse1.textContent = verse1.getAttribute("data-text");
      chip1.style.opacity = "1";
      bubble1.style.opacity = "1";
      
      if (!isMobile && verse2) {
        verse2.textContent = verse2.getAttribute("data-text");
        bubble2.style.opacity = "1";
      }
      return;
    }
    
    // Hide elements initially
    chip1.style.opacity = "0";
    bubble1.style.opacity = "0";
    if (bubble2) bubble2.style.opacity = "0";
    
    function waitForTyped(callback, maxTries) {
      if (!maxTries) maxTries = 40;
      if (window.Typed) {
        callback();
      } else {
        var tries = 0;
        var timer = setInterval(function() {
          tries += 1;
          if (window.Typed || tries > maxTries) {
            clearInterval(timer);
            if (window.Typed) callback();
          }
        }, 50);
      }
    }
    
    waitForTyped(function() {
      var activeChipTarget = isMobile ? "#chip1-mobile" : "#chip1-desktop";
      var activeChipElement = isMobile ? chip1Mobile : chip1Desktop;
      var activeChipText = activeChipElement ? activeChipElement.getAttribute("data-text") : "";
      var verse1Text = verse1.getAttribute("data-text");
      
      // Show chip1, then type "Faith"
      chip1.style.opacity = "1";
      var typed1 = new Typed(activeChipTarget, {
        strings: [activeChipText],
        typeSpeed: 35,
        showCursor: false,
        onComplete: function() {
          // Show bubble1, then type verse1
          bubble1.style.opacity = "1";
          setTimeout(function() {
            var typedVerse1 = new Typed("#verse1", {
              strings: [verse1Text],
              typeSpeed: 18,
              showCursor: false,
              onComplete: function() {
                // Desktop only: show second bubble and type verse 2 (no chip)
                if (!isMobile && bubble2 && verse2) {
                  setTimeout(function() {
                    bubble2.style.opacity = "1";
                    setTimeout(function() {
                      var verse2Text = verse2.getAttribute("data-text");
                      var typedVerse2 = new Typed("#verse2", {
                        strings: [verse2Text],
                        typeSpeed: 18,
                        showCursor: false,
                      });
                    }, 200);
                  }, 400);
                }
              }
            });
          }, 200);
        }
      });
    });
  })();

  // Optional slow depth drift (navy blobs) — few px, behind content.
  (function initDepthDrift() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    var items = [
      { id: "depthBlobHero", x: 10, y: 14, dur: 7.5 },
      { id: "depthBlobAbout", x: -12, y: 10, dur: 8.5 },
    ];
    function start() {
      if (!window.gsap) return false;
      items.forEach(function (item, i) {
        var el = document.getElementById(item.id);
        if (!el) return;
        gsap.to(el, {
          x: item.x,
          y: item.y,
          duration: item.dur,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: i * 0.35,
        });
      });
      return true;
    }
    if (!start()) {
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        if (start() || tries > 40) clearInterval(timer);
      }, 50);
    }
  })();


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
      /* keep donate visible */ donateFab.hidden = false;
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

  function loadSlotCounts() {
    if (!timeEl) return;
    
    // Map slot values to display windows (display only; values unchanged)
    var slotDisplayMap = {
      "6:00 AM": "6:00-6:10",
      "7:00 AM": "7:00-7:10",
      "8:00 AM": "8:00-8:10",
      "12:00 PM": "12:00-12:10",
      "6:00 PM": "6:00-6:10",
      "9:00 PM": "9:00-9:10"
    };
    
    fetch("/slot-counts.php", { method: "GET", credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) return;
        return res.json();
      })
      .then(function (counts) {
        if (!counts || typeof counts !== "object") return;
        var options = timeEl.querySelectorAll("option");
        for (var i = 0; i < options.length; i++) {
          var option = options[i];
          var slot = option.value;
          if (counts.hasOwnProperty(slot)) {
            var count = counts[slot] || 0;
            var displayWindow = slotDisplayMap[slot] || slot;
            option.textContent = displayWindow + " (" + count + " others)";
          }
        }
      })
      .catch(function () {
        // Silently ignore fetch errors
      });
  }

  loadSlotCounts();

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
