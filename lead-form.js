// Briefing form for /cities, /partners and /fleets.
// Embeds the Tally form named in the box's data-tally attribute (the code after
// tally.so/r/ in the form's share link); while it is empty, shows an email button.
// The ID lives in the HTML because *.js is cached as immutable for a year (_headers).
// Tally hidden fields expected: role, city, source.
(function () {
  var EMAIL = "victor" + "@" + "defensivepedal.com";

  var box = document.getElementById("lead-form");
  if (!box) return;

  var TALLY_FORM_ID = (box.getAttribute("data-tally") || "").trim();
  var role = box.getAttribute("data-role") || "Other";
  var event = box.getAttribute("data-event") || "lead-submit";
  var city = (new URLSearchParams(location.search).get("city") || "").trim().slice(0, 80);

  function track(name) {
    if (window.umami && typeof window.umami.track === "function") window.umami.track(name);
  }

  function showEmailButton() {
    var a = document.createElement("a");
    a.className = "btn btn--install btn--lg";
    a.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent((box.getAttribute("data-subject") || "Briefing request") + (city ? ": " + city : ""));
    a.textContent = box.getAttribute("data-fallback") || "Email Victor";
    a.addEventListener("click", function () { track(event + "-email"); });
    box.appendChild(a);
  }

  if (!TALLY_FORM_ID) {
    showEmailButton();
    return;
  }

  var query = new URLSearchParams({
    alignLeft: "1", hideTitle: "1", transparentBackground: "1", dynamicHeight: "1",
    role: role, city: city, source: location.pathname
  });
  var src = "https://tally.so/embed/" + TALLY_FORM_ID + "?" + query.toString();

  var iframe = document.createElement("iframe");
  iframe.setAttribute("data-tally-src", src);
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("title", "Book a briefing");
  iframe.width = "100%";
  iframe.height = "560";
  iframe.style.border = "0";
  box.appendChild(iframe);

  var script = document.createElement("script");
  script.src = "https://tally.so/widgets/embed.js";
  script.onload = function () { if (window.Tally) window.Tally.loadEmbeds(); else iframe.src = src; };
  script.onerror = function () { iframe.src = src; };
  document.body.appendChild(script);

  window.addEventListener("message", function (e) {
    if (e.origin !== "https://tally.so" || typeof e.data !== "string") return;
    if (e.data.indexOf("Tally.FormSubmitted") !== -1) track(event);
  });
})();
