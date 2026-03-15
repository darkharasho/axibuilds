(function() {
"use strict";

var app = document.getElementById("app");

// ---- Utilities ----

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function base64urlDecode(str) {
  var base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  var pad = base64.length % 4;
  if (pad) base64 += "====".slice(pad);
  var bin = atob(base64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---- SPA Routing ----

function init() {
  // Check sessionStorage for redirect from 404.html
  var redirect = null;
  try {
    var stored = sessionStorage.getItem("spa-redirect");
    if (stored) {
      redirect = JSON.parse(stored);
      sessionStorage.removeItem("spa-redirect");
    }
  } catch(e) {}

  var hash = redirect ? redirect.hash : location.hash;
  var path = redirect ? redirect.path : getBuildPath();

  if (!hash || hash.length < 2) {
    showLanding();
    return;
  }

  var fragment = hash.substring(1);
  var dotIndex = fragment.indexOf(".");
  if (dotIndex < 1) {
    showError("Invalid build link. Expected format: #fileId.key");
    return;
  }

  var fileId = fragment.substring(0, dotIndex);
  var key = fragment.substring(dotIndex + 1);

  showLoading();
  loadBuild(fileId, key);
}

function getBuildPath() {
  var seg = location.pathname.split("/").filter(Boolean);
  return seg.slice(1).join("/");
}

function showLanding() {
  app.innerHTML = '<div class="landing"><h1>AxiForge Builds</h1><p>Share your Guild Wars 2 builds with encrypted links.</p></div>';
}

function showLoading() {
  app.innerHTML = '<div class="loading">Loading build&hellip;</div>';
}

function showError(msg) {
  app.innerHTML = '<div class="error-box">' + escapeHtml(msg) + '</div>';
}

// ---- Fetch & Decrypt ----

function loadBuild(fileId, base64urlKey) {
  fetch("builds/" + fileId + ".enc", { cache: "no-store" })
    .then(function(res) {
      if (!res.ok) throw new Error("Build not found (HTTP " + res.status + ")");
      return res.text();
    })
    .then(function(base64Data) {
      return decryptPayload(base64Data, base64urlKey);
    })
    .then(function(buildData) {
      renderBuild(buildData);
    })
    .catch(function(err) {
      showError(err.message || String(err));
    });
}

function decryptPayload(base64Data, base64urlKey) {
  var combined = Uint8Array.from(atob(base64Data), function(c) { return c.charCodeAt(0); });
  var iv = combined.slice(0, 12);
  var ciphertext = combined.slice(12);
  var keyBytes = base64urlDecode(base64urlKey);

  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"])
    .then(function(cryptoKey) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, cryptoKey, ciphertext);
    })
    .then(function(plainBuf) {
      var decoder = new TextDecoder();
      return JSON.parse(decoder.decode(plainBuf));
    });
}

// ---- Render ----

function renderBuild(build) {
  var html = [];

  // Header
  html.push('<div class="build-header">');
  html.push('<h1>' + escapeHtml(build.title || "Untitled Build") + '</h1>');
  html.push('<div class="build-meta">');
  if (build.profession) html.push(escapeHtml(build.profession));
  if (build.gameMode) html.push(' &middot; ' + escapeHtml(build.gameMode));
  html.push('</div>');
  if (Array.isArray(build.tags) && build.tags.length) {
    html.push('<div class="tag-pills">');
    for (var i = 0; i < build.tags.length; i++) {
      html.push('<span class="tag-pill">' + escapeHtml(build.tags[i]) + '</span>');
    }
    html.push('</div>');
  }
  html.push('</div>');

  // Tabs
  html.push('<div class="tab-bar">');
  html.push('<button class="tab active" data-tab="build">BUILD</button>');
  html.push('<button class="tab" data-tab="equipment">EQUIPMENT</button>');
  html.push('</div>');

  // BUILD tab content
  html.push('<div class="tab-content active" id="tab-build">');
  html.push(renderSpecializations(build.specializations));
  html.push(renderSkills(build.skills, build));
  html.push('</div>');

  // EQUIPMENT tab content
  html.push('<div class="tab-content" id="tab-equipment">');
  html.push(renderEquipment(build.equipment));
  html.push('</div>');

  app.innerHTML = html.join("");

  // Tab switching
  var tabs = app.querySelectorAll(".tab");
  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener("click", onTabClick);
  }
}

function onTabClick(e) {
  var tabName = e.currentTarget.getAttribute("data-tab");
  var tabs = app.querySelectorAll(".tab");
  var contents = app.querySelectorAll(".tab-content");
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove("active");
  for (var j = 0; j < contents.length; j++) contents[j].classList.remove("active");
  e.currentTarget.classList.add("active");
  var target = document.getElementById("tab-" + tabName);
  if (target) target.classList.add("active");
}

function renderSpecializations(specs) {
  if (!Array.isArray(specs) || !specs.length) return '<p class="section-heading">No specializations.</p>';
  var html = '<h3 class="section-heading">Specializations</h3>';
  for (var i = 0; i < specs.length; i++) {
    var s = specs[i];
    if (!s) continue;
    html += '<div class="spec-row">';
    if (s.icon) {
      html += '<img class="spec-icon" src="' + escapeAttr(s.icon) + '" alt="" loading="lazy" />';
    }
    html += '<div class="spec-info">';
    html += '<span class="spec-name">' + escapeHtml(s.name || "Unknown");
    if (s.elite) html += '<span class="elite-badge">ELITE</span>';
    html += '</span>';
    html += renderTraitGrid(s);
    html += '</div>';
    html += '</div>';
  }
  return html;
}

function renderTraitGrid(s) {
  var html = '<div class="trait-grid">';
  var tiers = [1, 2, 3];
  for (var t = 0; t < tiers.length; t++) {
    var tier = tiers[t];
    if (t > 0) html += '<span class="tier-sep"></span>';
    // Minor trait
    if (s.minorTraits && s.minorTraits[t]) {
      var mt = s.minorTraits[t];
      html += '<span class="minorTrait" data-name="' + escapeAttr(mt.name || "") + '" data-desc="' + escapeAttr(mt.description || "") + '">';
      if (mt.icon) html += '<img src="' + escapeAttr(mt.icon) + '" alt="" loading="lazy" />';
      html += '</span>';
    }
    // Major traits
    html += '<span class="tier-group">';
    var majors = (s.majorTraitsByTier && s.majorTraitsByTier[tier]) || [];
    var selectedId = (s.majorChoices && s.majorChoices[tier]) || null;
    for (var m = 0; m < majors.length; m++) {
      var tr = majors[m];
      var sel = (tr.id === selectedId) ? " trait-icon--selected" : "";
      html += '<span class="trait-icon' + sel + '" data-name="' + escapeAttr(tr.name || "") + '" data-desc="' + escapeAttr(tr.description || "") + '">';
      if (tr.icon) html += '<img class="trait-img" src="' + escapeAttr(tr.icon) + '" alt="" loading="lazy" />';
      html += '</span>';
    }
    html += '</span>';
  }
  html += '</div>';
  return html;
}

function renderSkills(skills, build) {
  if (!skills) return '';
  var html = '<h3 class="section-heading">Skills</h3><div class="skill-bar">';
  // Heal
  if (skills.heal) html += renderSkillSlot(skills.heal, "heal");
  html += '<span class="skill-sep"></span>';
  // Utilities
  if (Array.isArray(skills.utility)) {
    for (var i = 0; i < skills.utility.length; i++) {
      if (skills.utility[i]) html += renderSkillSlot(skills.utility[i], "utility");
    }
  }
  html += '<span class="skill-sep"></span>';
  // Elite
  if (skills.elite) html += renderSkillSlot(skills.elite, "elite");
  html += '</div>';

  // Underwater skills
  if (build && build.underwaterSkills) {
    var uw = build.underwaterSkills;
    html += '<div class="uw-section">';
    html += '<h3 class="section-heading">Underwater Skills</h3><div class="skill-bar">';
    if (uw.heal) html += renderSkillSlot(uw.heal, "heal");
    html += '<span class="skill-sep"></span>';
    if (Array.isArray(uw.utility)) {
      for (var u = 0; u < uw.utility.length; u++) {
        if (uw.utility[u]) html += renderSkillSlot(uw.utility[u], "utility");
      }
    }
    html += '<span class="skill-sep"></span>';
    if (uw.elite) html += renderSkillSlot(uw.elite, "elite");
    html += '</div></div>';
  }

  // Profession mechanics
  if (build) {
    if (build.selectedLegends && build.selectedLegends.length) {
      html += '<div class="mechanic-section"><strong>Legends:</strong> ' + escapeHtml(build.selectedLegends.join(", ")) + '</div>';
    }
    if (build.selectedPets && build.selectedPets.length) {
      html += '<div class="mechanic-section"><strong>Pets:</strong> ' + escapeHtml(build.selectedPets.join(", ")) + '</div>';
    }
    if (build.activeAttunement) {
      var att = escapeHtml(build.activeAttunement);
      if (build.activeAttunement2) att += " / " + escapeHtml(build.activeAttunement2);
      html += '<div class="mechanic-section"><strong>Attunement:</strong> ' + att + '</div>';
    }
  }

  return html;
}

function renderSkillSlot(skill, slotType) {
  var bundleAttr = '';
  if (skill.bundle) {
    bundleAttr = ' data-bundle="' + escapeAttr(JSON.stringify(skill.bundle)) + '"';
  }
  var icon = skill.icon
    ? '<img class="skill-icon" src="' + escapeAttr(skill.icon) + '" alt="" loading="lazy" />'
    : '';
  return '<div class="skill-slot" data-slot="' + escapeAttr(slotType || "") + '" data-name="' + escapeAttr(skill.name || "") + '" data-desc="' + escapeAttr(skill.description || "") + '"' + bundleAttr + '>'
    + icon + '<span>' + escapeHtml(skill.name || "Unknown Skill") + '</span>'
    + '<div class="bundle-expand"></div>'
    + '</div>';
}

function renderEquipment(equip) {
  if (!equip || typeof equip !== "object") return '<p class="section-heading">No equipment data.</p>';
  var html = '<h3 class="section-heading">Equipment</h3><div class="eq-panel">';

  // Left column
  html += '<div class="eq-col">';

  // Stat package card
  if (equip.statPackage) {
    html += '<div class="eq-card"><div class="eq-label">Stat Package</div><div class="eq-value">' + escapeHtml(equip.statPackage) + '</div></div>';
  }

  // Armor slots
  var armorSlots = ["head", "shoulders", "chest", "hands", "legs", "feet"];
  html += '<div class="eq-card"><div class="eq-label">Armor</div>';
  for (var a = 0; a < armorSlots.length; a++) {
    var slotName = armorSlots[a];
    var slotStat = (equip.slots && equip.slots[slotName]) || "";
    var slotRune = (equip.runes && equip.runes[slotName]) || "";
    html += '<div class="eq-slot">';
    html += '<span class="eq-slot-name">' + escapeHtml(slotName) + '</span>';
    html += '<span class="eq-slot-stat">' + escapeHtml(slotStat) + '</span>';
    if (slotRune) html += '<span class="eq-slot-rune">' + escapeHtml(slotRune) + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // Trinkets
  var trinketSlots = ["back", "amulet", "ring1", "ring2", "accessory1", "accessory2"];
  html += '<div class="eq-card"><div class="eq-label">Trinkets</div>';
  for (var tr = 0; tr < trinketSlots.length; tr++) {
    var tName = trinketSlots[tr];
    var tStat = (equip.slots && equip.slots[tName]) || "";
    html += '<div class="eq-slot">';
    html += '<span class="eq-slot-name">' + escapeHtml(tName) + '</span>';
    html += '<span class="eq-slot-stat">' + escapeHtml(tStat) + '</span>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div>'; // end left col

  // Right column
  html += '<div class="eq-col">';

  // Weapons
  var weaponSets = [
    { label: "Set 1", slots: ["mainhand1", "offhand1"] },
    { label: "Set 2", slots: ["mainhand2", "offhand2"] },
    { label: "Aquatic 1", slots: ["aquaticMainhand1", "aquaticOffhand1"] },
    { label: "Aquatic 2", slots: ["aquaticMainhand2", "aquaticOffhand2"] }
  ];
  html += '<div class="eq-card"><div class="eq-label">Weapons</div>';
  for (var ws = 0; ws < weaponSets.length; ws++) {
    var wset = weaponSets[ws];
    var hasWeapon = false;
    for (var wi = 0; wi < wset.slots.length; wi++) {
      if (equip.weapons && equip.weapons[wset.slots[wi]]) { hasWeapon = true; break; }
    }
    if (!hasWeapon) continue;
    html += '<div class="eq-label" style="margin-top:6px">' + escapeHtml(wset.label) + '</div>';
    for (var wj = 0; wj < wset.slots.length; wj++) {
      var wSlot = wset.slots[wj];
      var wName = (equip.weapons && equip.weapons[wSlot]) || "";
      if (!wName) continue;
      html += '<div class="eq-weapon-row">';
      html += '<span class="eq-slot-name">' + escapeHtml(wSlot) + '</span>';
      html += '<span>' + escapeHtml(wName) + '</span>';
      // Sigils
      var sigils = (equip.sigils && equip.sigils[wSlot]) || [];
      if (sigils.length) {
        html += '<span class="eq-sigils">';
        for (var si = 0; si < sigils.length; si++) {
          if (sigils[si]) html += '<span class="eq-sigil">' + escapeHtml(sigils[si]) + '</span>';
        }
        html += '</span>';
      }
      html += '</div>';
    }
  }
  html += '</div>';

  // Rune summary
  if (equip.runes) {
    var runeCounts = {};
    var runeKeys = Object.keys(equip.runes);
    for (var ri = 0; ri < runeKeys.length; ri++) {
      var rv = equip.runes[runeKeys[ri]];
      if (rv) runeCounts[rv] = (runeCounts[rv] || 0) + 1;
    }
    var runeNames = Object.keys(runeCounts);
    if (runeNames.length) {
      html += '<div class="eq-card"><div class="eq-label">Runes</div>';
      for (var rn = 0; rn < runeNames.length; rn++) {
        html += '<div class="eq-value">' + runeCounts[runeNames[rn]] + '\u00d7 ' + escapeHtml(runeNames[rn]) + '</div>';
      }
      html += '</div>';
    }
  }

  // Relic, food, utility, enrichment
  var consumables = [
    { key: "relic", label: "Relic" },
    { key: "food", label: "Food" },
    { key: "utility", label: "Utility" },
    { key: "enrichment", label: "Enrichment" }
  ];
  for (var ci = 0; ci < consumables.length; ci++) {
    var cv = equip[consumables[ci].key];
    if (cv) {
      html += '<div class="eq-card"><div class="eq-label">' + escapeHtml(consumables[ci].label) + '</div><div class="eq-value">' + escapeHtml(cv) + '</div></div>';
    }
  }

  // Infusions summary
  if (equip.infusions) {
    var infCounts = {};
    var infKeys = Object.keys(equip.infusions);
    for (var ii = 0; ii < infKeys.length; ii++) {
      var infVal = equip.infusions[infKeys[ii]];
      if (Array.isArray(infVal)) {
        for (var ij = 0; ij < infVal.length; ij++) {
          if (infVal[ij]) infCounts[infVal[ij]] = (infCounts[infVal[ij]] || 0) + 1;
        }
      } else if (infVal) {
        infCounts[infVal] = (infCounts[infVal] || 0) + 1;
      }
    }
    var infNames = Object.keys(infCounts);
    if (infNames.length) {
      html += '<div class="eq-card"><div class="eq-label">Infusions</div>';
      for (var ink = 0; ink < infNames.length; ink++) {
        html += '<div class="eq-value">' + infCounts[infNames[ink]] + '\u00d7 ' + escapeHtml(infNames[ink]) + '</div>';
      }
      html += '</div>';
    }
  }

  html += '</div>'; // end right col
  html += '</div>'; // end eq-panel
  return html;
}

// ---- Tooltip System ----

function initTooltip() {
  var tip = document.createElement("div");
  tip.className = "tooltip";
  tip.innerHTML = '<div class="tooltip__name"></div><div class="tooltip__desc"></div>';
  document.body.appendChild(tip);

  document.addEventListener("mouseover", function(e) {
    var el = e.target.closest("[data-name]");
    if (!el) return;
    var name = el.getAttribute("data-name");
    var description = el.getAttribute("data-desc");
    if (!name && !description) return;
    tip.querySelector(".tooltip__name").textContent = name || "";
    tip.querySelector(".tooltip__desc").textContent = description || "";
    var rect = el.getBoundingClientRect();
    tip.style.left = (rect.left + window.scrollX) + "px";
    tip.style.top = (rect.bottom + window.scrollY + 6) + "px";
    tip.classList.add("visible");
  });

  document.addEventListener("mouseout", function(e) {
    var el = e.target.closest("[data-name]");
    if (el) tip.classList.remove("visible");
  });
}

// ---- Bundle Expansion ----

function initBundleExpansion() {
  document.addEventListener("click", function(e) {
    var slot = e.target.closest("[data-bundle]");
    if (!slot) return;
    var expand = slot.querySelector(".bundle-expand");
    if (!expand) return;
    if (expand.classList.contains("open")) {
      expand.classList.remove("open");
      expand.innerHTML = "";
      return;
    }
    try {
      var bundle = JSON.parse(slot.getAttribute("data-bundle"));
      var bhtml = "";
      for (var b = 0; b < bundle.length; b++) {
        var bs = bundle[b];
        bhtml += '<div class="bundle-skill">';
        if (bs.icon) bhtml += '<img src="' + escapeAttr(bs.icon) + '" alt="" loading="lazy" />';
        bhtml += '<span>' + escapeHtml(bs.name || "") + '</span>';
        bhtml += '</div>';
      }
      expand.innerHTML = bhtml;
      expand.classList.add("open");
    } catch(ex) {}
  });
}

// ---- Start ----
init();
initTooltip();
initBundleExpansion();

})();
