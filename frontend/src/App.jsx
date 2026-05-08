import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAllData, subscribeToWeather, subscribeToVisionAlerts, subscribeToBrine, subscribeToEvaporationLogs, fetchLatestEvaporationScore, testConnection } from './db/dataService';

// Import all Stitch HTML screens as raw strings
import dashboardHtml from '../../stitch_amrit_ecosystem_dashboard/ecosystem_guardian_dashboard_dawn_edition/code.html?raw';
import visionHtml from '../../stitch_amrit_ecosystem_dashboard/vision_agent_live_feed_1/code.html?raw';
import dataHtml from '../../stitch_amrit_ecosystem_dashboard/data_agent_analytics/code.html?raw';
import voiceHtml from '../../stitch_amrit_ecosystem_dashboard/voice_agent_navigator/code.html?raw';
import profileHtml from '../../stitch_amrit_ecosystem_dashboard/farmer_profile_1/code.html?raw';
import settingsHtml from '../../stitch_amrit_ecosystem_dashboard/settings_1/code.html?raw';

// Map of tab keys to their HTML content
const PAGES = {
  dashboard: dashboardHtml,
  vision: visionHtml,
  data: dataHtml,
  voice: voiceHtml,
  profile: profileHtml,
  settings: settingsHtml,
};

const N8N_BASE_URL = (import.meta.env.VITE_N8N_BASE_URL || '/api/n8n').replace(/\/$/, '');

const AMRIT_CONFIG_SCRIPT = `
<script>
(function() {
  var base = ${JSON.stringify(N8N_BASE_URL)};
  window.amritN8nUrl = function(path) {
    if (!path) return base;
    if (/^https?:\\/\\//i.test(path)) return path;
    if (path.charAt(0) !== '/') path = '/' + path;
    return base + path;
  };
})();
</script>
`;

/**
 * Navigation script injected into every iframe.
 * Intercepts clicks on nav tabs, profile icons, settings icons, and back buttons,
 * sending a postMessage to the parent React app with the tab name to navigate to.
 */
const NAV_INJECTION_SCRIPT = `
<script>
(function() {
  // Map display text found in Stitch HTML nav items -> our tab keys
  var textToTab = {
    'dashboard': 'dashboard',
    'home':      'dashboard',
    'vision':    'vision',
    'data':      'data',
    'analytics': 'data',
    'voice':     'voice',
    'profile':   'profile',
    'settings':  'settings',
  };

  function nav(tab) {
    window.parent.postMessage({ type: 'amrit-nav', tab: tab }, '*');
  }

  function wireNav() {
    // ------ 1. Desktop header nav spans ------
    var headerSpans = document.querySelectorAll(
      'header span[class*="font-label"], header nav span[class*="font-label"]'
    );
    headerSpans.forEach(function(el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var raw = (el.textContent || '').trim().toLowerCase();
        var tab = textToTab[raw];
        if (tab) nav(tab);
      });
    });

    // ------ 2. Mobile bottom nav bar links and divs ------
    var bottomNavEls = document.querySelectorAll('nav a, nav div[class*="flex-col"]');
    bottomNavEls.forEach(function(el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var raw = '';
        var spans = el.querySelectorAll('span');
        spans.forEach(function(s) {
          var t = (s.textContent || '').trim().toLowerCase();
          if (textToTab[t]) raw = t;
        });
        if (!raw) raw = (el.textContent || '').trim().toLowerCase();
        var tab = textToTab[raw];
        if (tab) nav(tab);
      });
    });

    // ------ 3. Profile image (user avatar in header) ------
    var profileImgs = document.querySelectorAll(
      'header img[alt*="rofile"], header img[alt*="User"], header img[alt*="ser profile"], ' +
      'header div[class*="rounded-full"] img'
    );
    profileImgs.forEach(function(img) {
      var target = img.closest('div[class*="rounded-full"]') || img;
      target.style.cursor = 'pointer';
      target.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        nav('profile');
      });
    });

    // ------ 4. Settings gear icon ------
    var allIcons = document.querySelectorAll('span.material-symbols-outlined');
    allIcons.forEach(function(icon) {
      var iconName = (icon.getAttribute('data-icon') || icon.textContent || '').trim().toLowerCase();
      if (iconName === 'settings') {
        var btn = icon.closest('button') || icon.closest('a') || icon;
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          nav('settings');
        });
      }
    });

    // ------ 5. Back arrow (in settings/profile pages) ------
    allIcons.forEach(function(icon) {
      var iconName = (icon.getAttribute('data-icon') || icon.textContent || '').trim().toLowerCase();
      if (iconName === 'arrow_back') {
        var btn = icon.closest('button') || icon.closest('a') || icon;
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          nav('__back__');
        });
      }
    });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireNav);
  } else {
    wireNav();
  }
})();
</script>
`;

/**
 * Data-injection script builder.
 * Generates a <script> that finds DOM elements by their text content or structure
 * and replaces static mock values with live Supabase data.
 */
function buildDataInjectionScript(liveData, page) {
  if (!liveData) return '';

  const { weather, vision, brine, profile } = liveData;

  // Build a page-specific updater
  let updater = '';

  if (page === 'dashboard') {
    updater = `
      // Update weather badge (e.g., "24°C • High Tide")
      var weatherBadge = document.querySelector('span[class*="font-label"]');
      if (weatherBadge) {
          weatherBadge.textContent = '${weather?.temperature ?? 24}°C • ${weather?.tide_status ?? 'High Tide'}';
      }

      document.querySelectorAll('span, p').forEach(function(el) {
        var t = el.textContent.trim();
        if (t === 'CONFIDENCE: 98.4%') el.textContent = 'CONFIDENCE: ${vision?.confidence ?? 98.4}%';
        if (t === 'STREAM_ID: ESTUARY_04') el.textContent = 'STREAM_ID: ${vision?.stream_id ?? 'ESTUARY_04'}';
        if (t === 'Phase: Preparatory') el.textContent = 'Phase: ${brine?.phase ?? 'Preparatory'}';
      });

      // Update evaporation score & humidity (which have inner span elements)
      document.querySelectorAll('span.font-headline').forEach(function(el) {
        if (el.childNodes.length > 0 && el.childNodes[0].nodeType === 3) {
            var text = el.childNodes[0].nodeValue.trim();
            if (text === '14.2') el.childNodes[0].nodeValue = '${weather?.evaporation_score ?? 14.2}';
            if (text === '88') el.childNodes[0].nodeValue = '${weather?.humidity ?? 88}';
        }
      });
    `;
  }

  if (page === 'vision') {
    updater = `
      // Update sabotage probability text
      document.querySelectorAll('h2').forEach(function(el) {
        if (el.textContent.trim() === '98.4%') el.textContent = '${vision?.confidence ?? 98.4}%';
      });

      // Update probability bar width
      var probBar = document.querySelector('.bg-primary.w-\\\\[98\\\\.4\\\\%\\\\]');
      if (probBar) probBar.style.width = '${vision?.confidence ?? 98.4}%';

      // Update Live Feed location indicator
      document.querySelectorAll('span').forEach(function(el) {
        if (el.textContent.trim() === 'Live Feed // Sector 7G') {
            el.textContent = 'Live Feed // ${vision?.stream_id ?? 'Sector 7G'}';
        }
      });

      // Update Alert Description
      document.querySelectorAll('p').forEach(function(el) {
        if (el.textContent.indexOf('Critical Alert: Unrecognized hardware') !== -1) {
            el.textContent = '${vision?.status ?? 'Critical Alert'}: ${vision?.description ?? 'Unrecognized hardware signature detected on primary actuator.'}'.toUpperCase();
        }
      });

      // Update Sluice Resistance and Tidal Pressure (Dynamic derived stats)
      document.querySelectorAll('span.font-headline').forEach(function(el) {
        if (el.childNodes.length > 0 && el.childNodes[0].nodeType === 3) {
            var text = el.childNodes[0].nodeValue.trim();
            if (text === '14.2') el.childNodes[0].nodeValue = '${weather?.wind_speed ? (weather.wind_speed * 1.2).toFixed(1) : 14.2} ';
            if (text === '8.9') el.childNodes[0].nodeValue = '${brine?.soil_salinity ? (brine.soil_salinity + 2.7).toFixed(1) : 8.9} ';
        }
      });
    `;
  }

  if (page === 'data') {
    updater = `
      // Update phase safely leaving the pulse dot intact
      document.querySelectorAll('div').forEach(function(el) {
        if (el.textContent.match(/Phase: Preparatory/i)) {
           for (var i=0; i<el.childNodes.length; i++) {
               if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.match(/Phase: Preparatory/i)) {
                   el.childNodes[i].nodeValue = ' Phase: ${(brine?.phase ?? "Preparatory")}';
               }
           }
        }
      });

      // Update humidity
      document.querySelectorAll('span').forEach(function(el) {
        if (el.textContent.trim() === '84.2%') el.textContent = '${brine?.humidity ?? 84.2}%';
      });

      // Update soil salinity and water PH
      document.querySelectorAll('span, p, text').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '6.2') el.textContent = '${brine?.soil_salinity ?? 6.2}';
        if (t.toUpperCase() === 'STABLE') el.textContent = '${(brine?.salinity_status || "Stable").toUpperCase()}';
        if (t === '7.8') el.textContent = '${brine?.soil_salinity ? (brine.soil_salinity + 1.6).toFixed(1) : 7.8}'; // Water PH Level
      });

      // Update AQI
      document.querySelectorAll('h3').forEach(function(el) {
        if (el.childNodes.length > 0 && el.childNodes[0].nodeType === 3) {
            var text = el.childNodes[0].nodeValue.trim();
            if (text === '24') el.childNodes[0].nodeValue = '${weather?.wind_speed ? weather.wind_speed * 2 : 24} ';
        }
      });

      // Update Tide Flats / Location
      document.querySelectorAll('p').forEach(function(el) {
        if (el.textContent.trim() === 'Sector 4: Tide Flats') {
            el.textContent = 'Sector 4: ${weather?.node_id ?? "Tide Flats"}';
        }
      });
    `;
  }

  if (page === 'profile') {
    updater = `
      // Update experience
      document.querySelectorAll('p').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '24 Years') el.textContent = '${profile?.experience_years ?? 24} Years';
        if (t === '12 Ha') el.textContent = '${profile?.managed_hectares ?? 12} Ha';
        if (t === 'ESTUARY_04') el.textContent = '${profile?.node_id ?? 'ESTUARY_04'}';
      });

      // Update ecosystem health
      document.querySelectorAll('span').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '94') el.textContent = '${profile?.ecosystem_health ?? 94}';
      });
    `;
  }

  if (!updater) return '';

  return `
<script>
(function() {
  function injectData() {
    try {
      ${updater}
      console.log('[Amrit] Live data injected for page: ${page}');
    } catch(e) {
      console.warn('[Amrit] Data injection error:', e);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectData);
  } else {
    setTimeout(injectData, 100);
  }
})();
</script>
`;
}

/**
 * Vision Scan script — "Inject Anomaly" Demo Flow
 *
 * Default:   Shows the original static sluice gate image.
 * Anomaly:   Click "SIMULATE ANOMALY" → plays /vision-feed.mp4,
 *            adds red pulsing border + alert overlay.
 * Scan:      Click "SCAN MANAS" → captures current frame → POST to n8n.
 * Reset:     Click "RESET FEED" → reverts to the static image.
 */
const VISION_SCAN_SCRIPT = `
<script>
(function() {
  function wireVisionScan() {
    // ── 1. Hidden canvas for frame capture ──
    var canvas = document.createElement('canvas');
    canvas.id = 'amrit-vision-canvas';
    canvas.style.display = 'none';
    document.body.appendChild(canvas);

    // ── 2. Find the static feed image (keep it visible by default) ──
    var feedImg = document.querySelector('img[alt*="CCTV" i], img[alt*="sluice" i], img[data-alt*="sluice" i], img[data-alt*="CCTV" i]');
    var feedContainer = feedImg ? feedImg.parentElement : null;
    var videoEl = null;
    var isAnomalyActive = false;

    // Use the custom provided static image
    if (feedImg) {
      feedImg.src = '/Gemini_Generated_Image_xcg7wvxcg7wvxcg7 (1).png';
    }

    // Pre-create the video element (hidden until anomaly triggered)
    if (feedContainer) {
      videoEl = document.createElement('video');
      videoEl.id = 'amrit-vision-feed';
      videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;opacity:0;position:absolute;top:0;left:0;transition:opacity 0.5s;';
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.setAttribute('autoplay', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('muted', '');
      feedContainer.style.position = 'relative';
      feedContainer.appendChild(videoEl);
    }

    // ── 3. Inject styles ──
    var injectedStyle = document.createElement('style');
    injectedStyle.textContent = [
      '@keyframes slideIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}',
      '@keyframes spin{to{transform:rotate(360deg)}}',
      '@keyframes anomalyPulse{0%,100%{box-shadow:inset 0 0 0 3px rgba(172,49,73,0.7)}50%{box-shadow:inset 0 0 0 3px rgba(172,49,73,0.15),0 0 40px rgba(172,49,73,0.35)}}',
      '.amrit-anomaly-active{animation:anomalyPulse 1.5s ease-in-out infinite;border-radius:inherit;}',
      '.amrit-anomaly-overlay{position:absolute;top:12px;left:12px;z-index:20;' +
        'background:rgba(172,49,73,0.92);backdrop-filter:blur(8px);' +
        'padding:8px 16px;border-radius:8px;display:flex;align-items:center;gap:8px;}',
      '.amrit-anomaly-dot{width:8px;height:8px;border-radius:50%;background:#ff4d6a;animation:anomalyPulse 1s infinite;}',
    ].join('\\n');
    document.head.appendChild(injectedStyle);

    // ── 4. Anomaly alert overlay (hidden by default) ──
    var anomalyOverlay = document.createElement('div');
    anomalyOverlay.className = 'amrit-anomaly-overlay';
    anomalyOverlay.style.display = 'none';
    anomalyOverlay.innerHTML =
      '<span class="amrit-anomaly-dot"></span>' +
      '<span style="font-family:Space Grotesk,sans-serif;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;">' +
      '⚠ ANOMALY DETECTED — SABOTAGE IN PROGRESS</span>';
    if (feedContainer) feedContainer.appendChild(anomalyOverlay);

    // ── 5. Find DISPATCH WARDEN button OR fallback container ──
    var buttons = document.querySelectorAll('button');
    var dispatchBtn = null;
    buttons.forEach(function(btn) {
      if ((btn.textContent || '').trim().toUpperCase().indexOf('DISPATCH WARDEN') !== -1) {
        dispatchBtn = btn;
      }
    });

    var btnContainer = null;
    var buttonClass = '';

    if (dispatchBtn) {
      btnContainer = dispatchBtn.parentNode;
      buttonClass = dispatchBtn.className;
    } else {
      // Fallback for Dashboard tab
      var h3s = document.querySelectorAll('h3');
      var northCreek = null;
      h3s.forEach(function(h) {
          if (h.textContent.indexOf('North Creek Entry') !== -1) northCreek = h;
      });
      if (northCreek && northCreek.parentNode && northCreek.parentNode.parentNode) {
          btnContainer = northCreek.parentNode.parentNode;
      } else if (feedContainer && feedContainer.nextElementSibling) {
          btnContainer = feedContainer.nextElementSibling;
      }
      buttonClass = 'px-4 py-2 rounded-full font-label text-xs font-bold uppercase transition-transform active:scale-95 shadow-sm text-white flex items-center justify-center';
    }

    if (!btnContainer) {
      console.warn('[Amrit] Could not find container for vision buttons.');
      return;
    }

    // ── 5.5 Wrap buttons in a flex container to prevent layout squishing ──
    var buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; flex-shrink: 0; align-items: center;';
    
    if (dispatchBtn) {
      btnContainer.insertBefore(buttonGroup, dispatchBtn);
      buttonGroup.appendChild(dispatchBtn); // Moves dispatchBtn inside
    } else {
      btnContainer.appendChild(buttonGroup);
    }

    // Helper for base button styles
    var getBtnStyle = function(bg) {
        var base = 'white-space: nowrap; display: flex; align-items: center; justify-content: center;';
        if (!dispatchBtn) base += ' padding: 8px 16px; border-radius: 9999px; color: white; font-family: Space Grotesk, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; border: none; cursor: pointer;';
        return base + ' background: ' + bg + ';';
    };

    // ── 6. "SIMULATE ANOMALY" / "RESET FEED" button ──
    var anomalyBtn = document.createElement('button');
    anomalyBtn.id = 'amrit-anomaly-btn';
    anomalyBtn.className = buttonClass;
    anomalyBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#ac3149,#770326)');
    anomalyBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="warning">warning</span>' +
      'SIMULATE ANOMALY</span>';
    buttonGroup.appendChild(anomalyBtn);

    // ── 7. "SCAN MANAS" button ──
    var scanBtn = document.createElement('button');
    scanBtn.id = 'amrit-scan-manas-btn';
    scanBtn.className = buttonClass;
    scanBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#6d46c1,#6138b4)');
    scanBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="frame_inspect">frame_inspect</span>' +
      'SCAN MANAS</span>';
    buttonGroup.appendChild(scanBtn);

    // ── 7.5 "LIVE FEED" button ──
    var liveBtn = document.createElement('button');
    liveBtn.id = 'amrit-live-manas-btn';
    liveBtn.className = buttonClass;
    liveBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#0ea5e9,#0369a1)');
    liveBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="videocam">videocam</span>' +
      'LIVE FEED</span>';
    buttonGroup.appendChild(liveBtn);

    // ── 8. Anomaly toggle ──
    function activateAnomaly() {
      isAnomalyActive = true;

      // Load and show video, hide image
      if (videoEl && !window.amritIsLiveActive) {
        videoEl.src = '/vision-feed.mp4';
        videoEl.load();
        videoEl.play();
        videoEl.style.opacity = '0.9';
      }
      if (feedImg) feedImg.style.opacity = '0';

      // Visual alerts
      if (feedContainer) feedContainer.classList.add('amrit-anomaly-active');
      anomalyOverlay.style.display = '';

      // Update Security Block in UI
      document.querySelectorAll('p.font-body').forEach(function(el) {
          if (el.textContent.trim() === 'Sabotage Probability' || el.textContent.trim() === 'SECURITY BREACHED') {
              el.textContent = 'SECURITY BREACHED';
              el.style.color = '#ac3149';
              el.style.fontWeight = '900';
              el.style.fontSize = '2.5rem';
              el.style.lineHeight = '1';
          }
      });
      document.querySelectorAll('span.text-secondary').forEach(function(el) {
          if (el.textContent.trim() === 'Security Assessment' || el.textContent.trim() === 'CRITICAL ALERT') {
              el.textContent = 'CRITICAL ALERT';
              el.style.color = '#ac3149';
          }
      });
      document.querySelectorAll('h2').forEach(function(el) {
          if (el.textContent.indexOf('%') !== -1) {
              el.style.display = 'none';
          }
      });

      // Button → RESET FEED
      anomalyBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#16a34a,#15803d)') + ' margin-left:8px;';
      anomalyBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
        '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="refresh">refresh</span>' +
        'RESET FEED</span>';
      console.log('[Amrit] ⚠ Anomaly injected — playing vision-feed.mp4');
    }

    function resetToNormal() {
      isAnomalyActive = false;

      // Hide video, show image
      if (videoEl) {
        videoEl.pause();
        videoEl.style.opacity = '0';
        videoEl.removeAttribute('src');
      }
      if (feedImg) feedImg.style.opacity = '0.8';

      // Remove alerts
      if (feedContainer) feedContainer.classList.remove('amrit-anomaly-active');
      anomalyOverlay.style.display = 'none';

      // Reset Security Block in UI
      document.querySelectorAll('p.font-body').forEach(function(el) {
          if (el.textContent.trim() === 'SECURITY BREACHED') {
              el.textContent = 'Sabotage Probability';
              el.style.color = '';
              el.style.fontWeight = '';
              el.style.fontSize = '';
              el.style.lineHeight = '';
          }
      });
      document.querySelectorAll('span').forEach(function(el) {
          if (el.textContent.trim() === 'CRITICAL ALERT') {
              el.textContent = 'Security Assessment';
              el.style.color = '';
          }
      });
      document.querySelectorAll('h2').forEach(function(el) {
          if (el.style.display === 'none' && el.textContent.indexOf('%') !== -1) {
              el.style.display = '';
          }
      });

      // Button → SIMULATE ANOMALY
      anomalyBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#ac3149,#770326)') + ' margin-left:8px;';
      anomalyBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
        '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="warning">warning</span>' +
        'SIMULATE ANOMALY</span>';
      console.log('[Amrit] ✅ Feed reset to normal image.');
    }

    anomalyBtn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      isAnomalyActive ? resetToNormal() : activateAnomaly();
    });

    // ── 9. Toast helper ──
    function showToast(message, isError) {
      var existing = document.getElementById('amrit-scan-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.id = 'amrit-scan-toast';
      toast.style.cssText = 'position:fixed;top:80px;right:16px;z-index:9999;' +
        'max-width:380px;padding:16px 20px;border-radius:12px;font-family:Space Grotesk,sans-serif;' +
        'font-size:13px;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,0.25);' +
        'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'animation:slideIn 0.3s ease-out;word-break:break-word;' +
        'background:' + (isError ? 'rgba(172,49,73,0.95)' : 'rgba(109,70,193,0.95)') + ';';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(function() {
        toast.style.transition = 'opacity 0.5s, transform 0.5s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(function() { toast.remove(); }, 500);
      }, 6000);
    }

    // ── 10. Scan handler ──
    var isScanning = false;
    var originalScanHTML = scanBtn.innerHTML;

    scanBtn.addEventListener('click', async function(e) {
      e.preventDefault(); e.stopPropagation();
      if (isScanning) return;
      isScanning = true;

      scanBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">' +
        '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);' +
        'border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;"></span>' +
        'Scanning...</span>';
      scanBtn.style.opacity = '0.7';
      scanBtn.style.pointerEvents = 'none';

      try {
        var base64String;

        // Helper to dramatically compress image payload for faster AI analysis
        var renderScaled = function(srcElement, w, h) {
             var maxW = 480;
             var scale = Math.min(1, maxW / w);
             canvas.width = w * scale || 480;
             canvas.height = h * scale || 270;
             var ctx = canvas.getContext('2d');
             ctx.drawImage(srcElement, 0, 0, canvas.width, canvas.height);
             return canvas.toDataURL('image/jpeg', 0.5); // Intense compression to speed up Gemini
        };

        if ((isLiveActive || isAnomalyActive) && videoEl && videoEl.srcObject && videoEl.readyState >= 2) {
          // Capture from live camera stream (DroidCam or webcam)
          base64String = renderScaled(videoEl, videoEl.videoWidth, videoEl.videoHeight);
          console.log('[Amrit] Compressed frame captured from LIVE camera stream');
        } else if (isAnomalyActive && videoEl) {
          // Await video to load enough data to draw
          if (videoEl.readyState < 2) {
              await new Promise(function(resolve) {
                  videoEl.addEventListener('loadeddata', resolve, { once: true });
                  setTimeout(resolve, 1500); // safety fallback
              });
          }
          base64String = renderScaled(videoEl, videoEl.videoWidth, videoEl.videoHeight);
          console.log('[Amrit] Compressed frame captured from anomaly video');
        } else if (feedImg) {
          // Capture from static image via fetch-blob
          var imgSrc = feedImg.src;
          base64String = await new Promise(function(resolve, reject) {
            fetch(imgSrc, { mode: 'cors' })
              .then(function(r) { if(!r.ok) throw new Error('fail'); return r.blob(); })
              .then(function(blob) {
                var reader = new FileReader();
                reader.onloadend = function() { resolve(reader.result); };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              })
              .catch(function() {
                var img = new Image(); img.crossOrigin = 'anonymous';
                img.onload = function() {
                  var maxW = 480;
                  var w = img.naturalWidth || 640;
                  var h = img.naturalHeight || 360;
                  var scale = Math.min(1, maxW / w);
                  canvas.width = w * scale; canvas.height = h * scale;
                  var c = canvas.getContext('2d'); c.drawImage(img,0,0,canvas.width,canvas.height);
                  try { resolve(canvas.toDataURL('image/jpeg',0.5)); } catch(e) { reject(e); }
                };
                img.onerror = function() { reject(new Error('Image load failed')); };
                img.src = imgSrc + (imgSrc.indexOf('?')===-1?'?':'&') + '_t=' + Date.now();
              });
          });
          console.log('[Amrit] Frame captured from static image');
        } else {
          throw new Error('No feed source available');
        }

        // POST to n8n
        var response = await fetch(window.amritN8nUrl('/webhook/vision-frame'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64String })
        });

        if (!response.ok) throw new Error('n8n responded with status ' + response.status);
        var data = await response.json();
        console.log('[Amrit] n8n response:', data);
        
        // Handle n8n response structure
        var isSabotage = false;
        var msg = data.message || JSON.stringify(data);
        
        // If n8n says "Workflow was started", we don't have the result yet (responseMode issue)
        if (msg === 'Workflow was started') {
           showToast('✅ Manas Scan Complete: AI Analysis Started (Ensure n8n uses responseMode: lastNode)', false);
        } else {
           // Parse the actual result from the workflow
           var rawText = data.text || (data[0] && data[0].text) || (data.data && data.data[0] && data.data[0].text) || msg;
           if (typeof rawText === 'string' && rawText.toUpperCase().includes('TRUE')) {
               isSabotage = true;
           }

           if (isSabotage) {
               showToast('🚨 Sluice Gate Warning: SABOTAGE DETECTED (Plank Removal)', true);
               if (!isAnomalyActive) activateAnomaly();
           } else {
               showToast('✅ Manas Scan Complete: Feed is SECURE.', false);
               if (isAnomalyActive) resetToNormal();
           }
        }

      } catch (err) {
        console.error('[Amrit] Scan Manas error:', err);
        showToast('⚠ Scan failed: ' + err.message, true);
      } finally {
        isScanning = false;
        scanBtn.innerHTML = originalScanHTML;
        scanBtn.style.opacity = '1';
        scanBtn.style.pointerEvents = 'auto';
      }
    });

    // ── 11. Live Monitoring Handler ──
    var isLiveActive = false;
    var liveInterval = null;
    var originalLiveHTML = liveBtn.innerHTML;
    var streamRef = null;

    liveBtn.addEventListener('click', async function(e) {
      e.preventDefault(); e.stopPropagation();
      
      if (isLiveActive) {
          // Stop live
          isLiveActive = false;
          window.amritIsLiveActive = false;
          clearInterval(liveInterval);
          if (streamRef) streamRef.getTracks().forEach(function(t) { t.stop() });
          liveBtn.innerHTML = originalLiveHTML;
          liveBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#0ea5e9,#0369a1)');
          if (videoEl) { videoEl.pause(); videoEl.srcObject = null; videoEl.removeAttribute('src'); videoEl.style.opacity = '0'; }
          if (feedImg) feedImg.style.opacity = '0.8';
          showToast('⏸ Live Monitoring Stopped.', false);
          return;
      }

      // Start live via Webcam
      try {
          resetToNormal(); // Clear any existing UI anomalies BEFORE trying to start the feed
          
          var constraints = { video: true };
          
          // Use whatever device is selected in the dropdown if available
          var camSelect = document.getElementById('amrit-cam-select');
          if (camSelect && camSelect.value) {
              constraints.video = { deviceId: { exact: camSelect.value } };
          }
          
          var stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef = stream;

          if (videoEl) {
              videoEl.srcObject = stream;
              videoEl.removeAttribute('src');
              videoEl.style.zIndex = '50';
              videoEl.style.background = '#000';
              videoEl.style.border = 'none'; // removing the green debug border
              videoEl.style.borderRadius = '24px'; // match the original image borders
              videoEl.play().catch(e=>console.error('Play err',e));
              videoEl.style.opacity = '1';
          }
          if (feedImg) feedImg.style.opacity = '0';
          
          // Populate the camera selector so they can switch
          var devices = await navigator.mediaDevices.enumerateDevices();
          var videoDevices = devices.filter(function(d) { return d.kind === 'videoinput' });
          if (!camSelect) {
              camSelect = document.createElement('select');
              camSelect.id = 'amrit-cam-select';
              camSelect.style.cssText = 'padding:0 8px; border-radius:12px; border:1px solid #ddd; background:#f9fafb; font-family:Inter; font-size:12px; color:#475569; max-width: 150px;';
              // Insert it right before the Live Feed button
              liveBtn.parentNode.insertBefore(camSelect, liveBtn);
              
              camSelect.onchange = async function() {
                  console.log('[Amrit] 🔄 Switching camera to:', camSelect.value);
                  if (streamRef) streamRef.getTracks().forEach(function(t) { t.stop() });
                  try {
                      var newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: camSelect.value } } });
                      streamRef = newStream;
                      if (videoEl) {
                          videoEl.removeAttribute('src');
                          videoEl.srcObject = newStream;
                          videoEl.style.opacity = '1';
                          videoEl.play().catch(function(e){ console.error('Play err', e) });
                      }
                  } catch (e) {
                      console.error('[Amrit] Camera switch error:', e);
                      // Avoid showing a toast if they just clicked the dropdown while it was loading, etc.
                  }
              };
          }
          
          camSelect.innerHTML = '';
          videoDevices.forEach(function(d) {
              var opt = document.createElement('option');
              opt.value = d.deviceId;
              opt.text = d.label || 'Camera ' + (camSelect.length + 1);
              if (streamRef.getVideoTracks()[0] && d.label === streamRef.getVideoTracks()[0].label) opt.selected = true;
              camSelect.appendChild(opt);
          });
          camSelect.style.display = 'inline-block';
          if (feedImg) feedImg.style.opacity = '0';
          
          isLiveActive = true;
          window.amritIsLiveActive = true;
          isAnomalyActive = false;
          liveBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">' +
            '<span class="amrit-anomaly-dot" style="background:#fff;"></span>' +
            'MONITORING...</span>';
          liveBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#c2410c,#9a3412)');
          showToast('🟢 Live feed active. AI analyzing environment...', false);

      } catch(err) {
          showToast('⚠ Camera access denied: Please allow permissions or run on localhost/https.', true);
      }
    });

    // ── 8.5 Automatic Background AI Scanner ──
    setInterval(async function() {
        try {
            var isVideo = (isLiveActive || isAnomalyActive);
            var srcEl = isVideo ? videoEl : feedImg;
            
            if (!srcEl) return;
            if (isVideo && srcEl.readyState < 2) return;
            if (!isVideo && !srcEl.complete) return;
            
            var maxW = 480;
            var w = isVideo ? (srcEl.videoWidth || 640) : (srcEl.naturalWidth || 640);
            var h = isVideo ? (srcEl.videoHeight || 360) : (srcEl.naturalHeight || 360);
            if (w === 0) return;
            
            var scale = Math.min(1, maxW / w);
            canvas.width = w * scale; canvas.height = h * scale;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(srcEl, 0, 0, canvas.width, canvas.height);
            var base64Str = canvas.toDataURL('image/jpeg', 0.5);

            var endpoint = window.amritN8nUrl('/webhook/vision-frame');
            var response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Str })
            });
            if (!response.ok) return;
            var data = await response.json();
            
            if (data.message === 'Workflow was started') return;
            
            var isSabotage = false;
            if (data.sabotage === true || data.status === 'ALERT') {
                isSabotage = true;
            } else {
                var rawText = data.text || (data[0] && data[0].text) || (data.data && data.data[0] && data.data[0].text) || '';
                if (typeof rawText === 'string' && rawText.toUpperCase().includes('TRUE')) {
                    isSabotage = true;
                }
            }

            if (isSabotage) {
                if (!isAnomalyActive) {
                    activateAnomaly();
                    showToast('🚨 SABOTAGE DETECTED! Sluice gate breach identified autonomously by AI!', true);
                    if (isLiveActive) {
                        isLiveActive = false;
                        window.amritIsLiveActive = false;
                        if (liveBtn) {
                            liveBtn.innerHTML = originalLiveHTML;
                            liveBtn.style.cssText = getBtnStyle('linear-gradient(135deg,#0ea5e9,#0369a1)');
                        }
                        if (streamRef) streamRef.getTracks().forEach(function(t) { t.stop() });
                    }
                }
            } else {
                console.log('[Amrit Auto-Vision] ✅ Background scan: Gate secure.');
            }
        } catch(err) { console.error('[Amrit Auto-Vision] fetch error:', err); }
    }, 15000);

    console.log('[Amrit] ✅ Vision Agent ready: Static Image → Simulate Anomaly → Scan Manas');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireVisionScan);
  } else {
    setTimeout(wireVisionScan, 150);
  }
})();
</script>
`;

const CHATBOT_SCRIPT = `
<script>
(function() {
  function wireVoiceAgent() {
    var historyDiv = document.getElementById('chat-history');
    if (!historyDiv) return;

    var vs = document.createElement('style');
    vs.textContent = [
      '@keyframes amritPulse{0%,100%{opacity:1}50%{opacity:0.4}}',
      '@keyframes amritSlideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes amritMicRecord{0%,100%{box-shadow:0 0 0 0 rgba(173,53,10,0.5)}50%{box-shadow:0 0 0 24px rgba(173,53,10,0)}}',
      '@keyframes amritWaveFast{0%,100%{height:12px;opacity:0.4}50%{height:48px;opacity:1}}',
      '.amrit-status-banner{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:12px;margin-bottom:12px;font-family:Space Grotesk,Inter,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.5px;animation:amritSlideDown 0.3s ease-out;}',
      '.amrit-status-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}',
      '.amrit-status-banner.connected{background:rgba(34,197,94,0.10);color:#15803d;box-shadow:inset 0 0 0 1px rgba(34,197,94,0.3)}',
      '.amrit-status-banner.connected .amrit-status-dot{background:#22c55e;animation:amritPulse 2s infinite}',
      '.amrit-recording .audio-wave-bar{animation-name:amritWaveFast !important;animation-duration:0.5s !important;}',
      '.amrit-recording-pulse{animation:amritMicRecord 1.2s ease-in-out infinite;}'
    ].join('\\n');
    document.head.appendChild(vs);

    var webhookUrl = window.amritN8nUrl('/webhook/free-voice-agent');
    
    var banner = document.createElement('div');
    banner.id = 'amrit-webhook-status';
    banner.className = 'amrit-status-banner connected';
    banner.style.display = 'none';
    banner.innerHTML = '<span class="amrit-status-dot"></span><span>n8n Voice Agent workflow is active</span>';
    historyDiv.parentNode.insertBefore(banner, historyDiv);

    var isWorkflowActive = false;
    var retryInterval = null;

    async function checkWebhookHealth() {
      try {
        var res = await fetch(webhookUrl, { method: 'GET' });
        if (res.status === 405 || res.status === 404 || res.ok) {
          isWorkflowActive = true;
          banner.style.display = 'flex';
          if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
        } else {
          throw new Error(res.status);
        }
      } catch(err) {
        isWorkflowActive = false;
        banner.style.display = 'none';
        if (!retryInterval) retryInterval = setInterval(checkWebhookHealth, 15000);
      }
    }
    checkWebhookHealth();

    function appendMessage(text, isUser) {
      if (!text) return null;
      var d = document.createElement('div');
      d.className = isUser
        ? "self-end max-w-[85%] bg-primary-container p-4 rounded-[24px] rounded-tr-sm text-on-primary-container shadow-sm"
        : "self-start max-w-[85%] bg-surface-container p-5 rounded-[24px] rounded-tl-sm text-on-surface shadow-sm";
      if (!isUser) {
        d.innerHTML = '<div class="flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-primary text-sm" data-icon="auto_awesome">auto_awesome</span><span class="font-label text-[10px] uppercase tracking-tighter text-primary font-bold">Amrit Voice Agent</span></div><p class="font-body text-sm leading-relaxed">' + text + '</p>';
      } else {
        d.innerHTML = '<p class="font-body text-sm leading-relaxed font-medium">' + text + '</p>';
      }
      historyDiv.appendChild(d);
      historyDiv.scrollTop = historyDiv.scrollHeight;
      return d;
    }

    function appendAudioPlayer(blob) {
      var url = URL.createObjectURL(blob);
      var d = document.createElement('div');
      d.className = 'self-start max-w-[85%] bg-surface-container p-5 rounded-[24px] rounded-tl-sm text-on-surface shadow-sm';
      d.innerHTML = '<div class="flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-primary text-sm" data-icon="auto_awesome">auto_awesome</span><span class="font-label text-[10px] uppercase tracking-tighter text-primary font-bold">Amrit Voice Agent</span></div><p class="font-body text-sm leading-relaxed text-primary">🔊 Playing voice response...</p>';
      historyDiv.appendChild(d);
      historyDiv.scrollTop = historyDiv.scrollHeight;
      
      var audio = new Audio(url);
      audio.play().catch(e => console.error("Autoplay blocked by browser:", e));
    }

    var heroSection = document.querySelector('section.flex.flex-col.items-center.justify-center');
    var heroTitle = heroSection ? heroSection.querySelector('h2') : null;
    var heroSubtitle = heroSection ? heroSection.querySelector('p.font-label') : null;
    var waveContainer = heroSection ? heroSection.querySelector('.relative.flex.items-center') : null;

    var isRecording = false;
    var mediaRecorder = null;
    var audioChunks = [];

    function updateHeroState(state) {
      if (!heroTitle) return;
      if (state === 'idle') {
        heroTitle.textContent = 'Tap to Speak';
        if (heroSubtitle) { heroSubtitle.textContent = 'Subsidy Navigator Active'; heroSubtitle.style.color = ''; }
        if (waveContainer) waveContainer.classList.remove('amrit-recording');
        if (heroSection) heroSection.classList.remove('amrit-recording-pulse');
      } else if (state === 'recording') {
        heroTitle.textContent = 'Listening...';
        if (heroSubtitle) { heroSubtitle.textContent = 'Speak now — tap again to stop'; heroSubtitle.style.color = '#ad350a'; }
        if (waveContainer) waveContainer.classList.add('amrit-recording');
        if (heroSection) heroSection.classList.add('amrit-recording-pulse');
      } else if (state === 'sending') {
        heroTitle.textContent = 'Processing...';
        if (heroSubtitle) { heroSubtitle.textContent = 'Sending audio to Amrit AI'; heroSubtitle.style.color = '#6d46c1'; }
        if (waveContainer) waveContainer.classList.remove('amrit-recording');
        if (heroSection) heroSection.classList.remove('amrit-recording-pulse');
      }
    }

    async function startRecording() {
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = async function() {
          stream.getTracks().forEach(function(t) { t.stop(); });
          var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          updateHeroState('sending');
          appendMessage('🎤 Voice message sent', true);
          var ld = appendMessage('🔊 Processing your voice...', false);

          try {
            var controller = new AbortController();
            var timeout = setTimeout(function(){ controller.abort(); }, 120000);
            
            var formData = new FormData();
            formData.append('user_audio', audioBlob, 'recording.webm');
            
            var webhookPath = webhookUrl;
            var fetchOpts = {
              method: 'POST',
              body: formData,
              signal: controller.signal
            };
            var r = await fetch(webhookPath, fetchOpts);
            if (r.status === 404 && webhookPath.includes('webhook-test')) {
                webhookPath = webhookPath.replace('webhook-test', 'webhook');
                r = await fetch(webhookPath, fetchOpts);
            }
            clearTimeout(timeout);
            
            if (!r.ok) throw new Error('Webhook returned ' + r.status);
            
            ld.remove();
            
            var ct = r.headers.get('content-type') || '';
            console.log('[Amrit Voice] Received Content-Type:', ct);
            if (ct.indexOf('audio') !== -1 || ct.indexOf('application/octet-stream') !== -1) {
              console.log('[Amrit Voice] Playing as audio blob');
              var respBlob = await r.blob();
              appendAudioPlayer(respBlob);
            } else {
              var raw = await r.text();
              console.log('[Amrit Voice] Received text response:', raw);
              var data; try { data = JSON.parse(raw); } catch(e) { data = raw; }
              var reply = typeof data === 'string' ? data : ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || (data.content && data.content.parts && data.content.parts[0] && data.content.parts[0].text) || data.output || data.response || data.message || data.text || JSON.stringify(data));
              appendMessage(reply, false);
              
              if ('speechSynthesis' in window) {
                var utterance = new SpeechSynthesisUtterance(reply.replace(/[*#]/g, ''));
                var voices = window.speechSynthesis.getVoices();
                var indVoice = voices.find(v => v.lang.includes('kok') || v.lang.includes('mr-IN') || v.lang.includes('hi-IN') || v.lang.includes('en-IN'));
                if (indVoice) utterance.voice = indVoice;
                window.speechSynthesis.speak(utterance);
              }
            }
            if (!isWorkflowActive) { isWorkflowActive = true; banner.style.display = 'flex'; }
          } catch(err) {
            ld.remove();
            var emsg = err.name === 'AbortError' ? 'Request timed out (120s).' : err.message;
            appendMessage('⚠ Voice agent error: ' + emsg, false);
          }
          updateHeroState('idle');
        };
        mediaRecorder.start();
        isRecording = true;
        updateHeroState('recording');
      } catch(err) {
        appendMessage('🎤 Microphone error: ' + err.message + '. Please allow microphone access.', false);
        updateHeroState('idle');
      }
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
      }
    }

    function toggleRecording(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (isRecording) { stopRecording(); } else { startRecording(); }
    }

    if (heroTitle) heroTitle.textContent = 'Tap to Speak';
    if (heroSection) {
      heroSection.style.cursor = 'pointer';
      heroSection.addEventListener('click', toggleRecording);
    }

    // Bind to the mic buttons
    document.querySelectorAll('span.material-symbols-outlined').forEach(function(icon) {
      var name = (icon.getAttribute('data-icon') || icon.textContent || '').trim();
      if (name === 'keyboard_voice' || name === 'mic') {
        var btn = icon.closest('a') || icon.closest('button') || icon;
        btn.addEventListener('click', function(e) {
          e.preventDefault(); e.stopPropagation();
          toggleRecording(e);
        });
      }
    });

    // ── Wire up Text Input for Chat ──
    // Find the text input and send button on the voice page
    var textInput = document.querySelector('input[type="text"]') || document.querySelector('input[placeholder]');
    var sendIcon = null;
    document.querySelectorAll('span.material-symbols-outlined').forEach(function(icon) {
      var name = (icon.getAttribute('data-icon') || icon.textContent || '').trim();
      if (name === 'send' || name === 'arrow_upward') {
        sendIcon = icon.closest('a') || icon.closest('button') || icon;
      }
    });

    var isSendingText = false;

    async function sendTextMessage() {
      if (!textInput || isSendingText) return;
      var txt = textInput.value.trim();
      if (!txt) return;

      isSendingText = true;
      appendMessage(txt, true);
      textInput.value = '';

      var loadingMsg = appendMessage('⏳ Thinking...', false);

      try {
        var controller = new AbortController();
        var timeout = setTimeout(function(){ controller.abort(); }, 60000);

        var webhookPath = window.amritN8nUrl('/webhook/chat');
        var fetchOpts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: txt }),
          signal: controller.signal
        };
        var res = await fetch(webhookPath, fetchOpts);
        if (res.status === 404) {
            webhookPath = webhookPath.replace('webhook-test', 'webhook');
            res = await fetch(webhookPath, fetchOpts);
        }
        clearTimeout(timeout);

        if (loadingMsg) loadingMsg.remove();

        if (!res.ok) throw new Error('Status ' + res.status);

        var raw = await res.text();
        console.log('[Amrit Chatbot] Raw n8n response:', raw);
        
        var data;
        try { data = JSON.parse(raw); } catch(e) { data = raw; }

        var reply;
        if (typeof data === 'string') {
          reply = data;
        } else if (Array.isArray(data)) {
          reply = data[0].output || data[0].response || data[0].text || data[0].message || JSON.stringify(data[0]);
        } else {
          reply = (data.content && data.content.parts && data.content.parts[0] && data.content.parts[0].text) || data.output || data.response || data.text || data.message || JSON.stringify(data);
        }

        console.log('[Amrit Chatbot] Parsed reply to show:', reply);
        
        if (!reply || reply.toString().trim() === '') {
           reply = '[No text response found in n8n output. Check console.]';
        }

        appendMessage(reply, false);
        
              if ('speechSynthesis' in window) {
                var utterance = new SpeechSynthesisUtterance(reply.replace(/[*#]/g, ''));
                var voices = window.speechSynthesis.getVoices();
                var indVoice = voices.find(v => v.lang.includes('kok') || v.lang.includes('mr-IN') || v.lang.includes('hi-IN') || v.lang.includes('en-IN'));
                if (indVoice) utterance.voice = indVoice;
                window.speechSynthesis.speak(utterance);
              }
      } catch(err) {
        if (loadingMsg) loadingMsg.remove();
        console.error('[Amrit Chatbot] Webhook Error:', err);
        var emsg = err.name === 'AbortError' ? 'Request timed out.' : err.message;
        appendMessage('⚠ Error: ' + emsg, false);
      }
      isSendingText = false;
      if (textInput) textInput.focus();
    }

    if (sendIcon) {
      sendIcon.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        sendTextMessage();
      });
    }

    if (textInput) {
      textInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendTextMessage();
        }
      });
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireVoiceAgent);
  } else {
    setTimeout(wireVoiceAgent, 200);
  }
})();
</script>
`;

const DASHBOARD_MIC_SCRIPT = `
<script>
(function() {
  function wireDashboardMic() {
    var micStyle = document.createElement('style');
    micStyle.textContent = [
      '@keyframes dashWaveFast{0%,100%{height:12px;opacity:0.4}50%{height:24px;opacity:1}}',
      '@keyframes dashMicPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}',
      '@keyframes dashMicRing{0%{transform:scale(0.8);opacity:1}100%{transform:scale(1.5);opacity:0}}',
      '.amrit-dash-recording{animation:dashMicPulse 1s ease-in-out infinite !important;}',
      '.amrit-dash-recording-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(109,70,193,0.4);animation:dashMicRing 1.5s ease-out infinite;pointer-events:none;}',
      '.amrit-dash-wave-active > div{animation-name:dashWaveFast !important;animation-duration:0.4s !important;}',
    ].join('\\n');
    document.head.appendChild(micStyle);

    var micIcons = document.querySelectorAll('span.material-symbols-outlined');
    var micBtn = null;
    var micCircle = null;
    var waveDiv = null;
    var listeningLabel = null;
    var tapLabel = null;

    micIcons.forEach(function(icon) {
      var iconName = (icon.getAttribute('data-icon') || icon.textContent || '').trim();
      if (iconName === 'mic') {
        var parentBtn = icon.closest('button');
        if (parentBtn && !parentBtn.closest('nav')) {
          micBtn = parentBtn;
          micCircle = icon.closest('div.bg-secondary, div[class*="bg-secondary"]');
          var section = parentBtn.closest('section');
          if (section) {
            waveDiv = section.querySelector('.flex.items-center.gap-1\\\\.5');
          }
          var labels = parentBtn.querySelectorAll('span');
          labels.forEach(function(l) {
            if ((l.textContent || '').indexOf('Listening') !== -1 || (l.textContent || '').indexOf('LISTENING') !== -1) listeningLabel = l;
            if ((l.textContent || '').indexOf('Tap to speak') !== -1) tapLabel = l;
          });
        }
      }
    });

    if (!micBtn) return;

    var webhookUrl = window.amritN8nUrl('/webhook/free-voice-agent');
    var isRecording = false;
    var mediaRecorder = null;
    var audioChunks = [];

    function showToast(msg, isErr) {
      var old = document.getElementById('amrit-mic-toast');
      if (old) old.remove();
      var t = document.createElement('div');
      t.id = 'amrit-mic-toast';
      t.style.cssText = 'position:fixed;top:80px;right:16px;z-index:9999;max-width:380px;padding:16px 20px;border-radius:12px;font-family:Space Grotesk,sans-serif;font-size:13px;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,0.25);backdrop-filter:blur(12px);animation:amritSlideDown 0.3s ease-out;word-break:break-word;background:' + (isErr ? 'rgba(172,49,73,0.95)' : 'rgba(109,70,193,0.95)') + ';';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function() { t.style.transition='opacity 0.5s'; t.style.opacity='0'; setTimeout(function(){t.remove();},500); }, 5000);
    }

    function setRecordingUI(on) {
      if (micCircle) {
        if (on) {
          micCircle.classList.add('amrit-dash-recording');
          micCircle.style.position = 'relative';
          var ring = document.createElement('div');
          ring.className = 'amrit-dash-recording-ring';
          ring.id = 'amrit-ring';
          micCircle.appendChild(ring);
        } else {
          micCircle.classList.remove('amrit-dash-recording');
          var ring = document.getElementById('amrit-ring');
          if (ring) ring.remove();
        }
      }
      if (waveDiv) {
        on ? waveDiv.classList.add('amrit-dash-wave-active') : waveDiv.classList.remove('amrit-dash-wave-active');
      }
      if (listeningLabel) listeningLabel.textContent = on ? 'RECORDING...' : 'LISTENING...';
      if (tapLabel) tapLabel.textContent = on ? 'Tap again to stop and send' : 'Tap to speak to Amrit.';
    }

    function forceSpeakText(text) {
        if ('speechSynthesis' in window) {
           var utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ''));
           var voices = window.speechSynthesis.getVoices();
           var indVoice = voices.find(function(v) { return v.lang.includes('kok') || v.lang.includes('mr') || v.lang.includes('hi'); });
           if (indVoice) utterance.voice = indVoice;
           window.speechSynthesis.speak(utterance);
        }
    }

    async function startRec() {
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = async function() {
          stream.getTracks().forEach(function(t){ t.stop(); });
          var blob = new Blob(audioChunks, { type: 'audio/webm' });
          setRecordingUI(false);
          if (listeningLabel) listeningLabel.textContent = 'SENDING...';
          if (tapLabel) tapLabel.textContent = 'Processing your voice...';
          showToast('🎤 Sending voice to Amrit...', false);
          
          try {
            var controller = new AbortController();
            var tmout = setTimeout(function(){ controller.abort(); }, 120000);
            
            var formData = new FormData();
            formData.append('user_audio', blob, 'voice.webm');
            
            var r = await fetch(webhookUrl, { method:'POST', body: formData, signal: controller.signal });
            clearTimeout(tmout);
            
            if (!r.ok) throw new Error('Status ' + r.status);
            
            var resClone = r.clone();
            var audioBlob = await resClone.blob();
            
            if (audioBlob.size > 500 && (audioBlob.type.indexOf('audio') !== -1 || audioBlob.type.indexOf('mpeg') !== -1 || audioBlob.type === 'application/octet-stream' || audioBlob.type === '')) {
                var url = window.URL.createObjectURL(audioBlob);
                var audio = new Audio(url);
                // Append it to DOM to prevent Garbage Collection and ensure playability
                audio.style.display = 'none';
                document.body.appendChild(audio);
                
                audio.play().then(function() {
                    showToast('🔊 Amrit is speaking...', false);
                }).catch(function(e) {
                    console.error("Audio block:", e);
                    showToast('🔊 Click the page to allow Amrit to speak!', true);
                });
                
                // Cleanup after audio ends
                audio.onended = function() { audio.remove(); window.URL.revokeObjectURL(url); };
            } else {
                var raw = await r.text();
                var data; try{data=JSON.parse(raw);}catch(e){data=raw;}
                var reply = typeof data==='string' ? data : ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || data.output || data.response || data.text || JSON.stringify(data));
                showToast('💬 ' + reply.substring(0,100), false);
                forceSpeakText(reply);
            }
          } catch(e) {
            var emsg = e.name === 'AbortError' ? 'Timed out (120s)' : e.message;
            showToast('⚠ Voice agent error: ' + emsg, true);
          }
          if (listeningLabel) listeningLabel.textContent = 'LISTENING...';
          if (tapLabel) tapLabel.textContent = 'Tap to speak to Amrit.';
        };
        mediaRecorder.start();
        isRecording = true;
        setRecordingUI(true);
      } catch(e) {
        showToast('🎤 Mic error: ' + e.message, true);
      }
    }

    function stopRec() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
      }
    }

    micBtn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      isRecording ? stopRec() : startRec();
    });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireDashboardMic);
  } else {
    setTimeout(wireDashboardMic, 300);
  }
})();
</script>
`;

const FAB_SCRIPT = `
<script>
(function() {
  function injectFAB() {
    // ── Styles ──
    var fabStyle = document.createElement('style');
    fabStyle.textContent = [
      '@keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }',
      '@keyframes chatOpen { from { opacity:0; transform: translateY(20px) scale(0.95); } to { opacity:1; transform: translateY(0) scale(1); } }',
      '@keyframes dotBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }',
      '#amrit-chat-popup { display:none; position:fixed; bottom:180px; right:24px; width:360px; max-height:480px; z-index:10000; border-radius:20px; overflow:hidden; box-shadow:0 12px 48px rgba(0,0,0,0.25); animation: chatOpen 0.3s ease-out; font-family: Inter, sans-serif; }',
      '#amrit-chat-popup.open { display:flex; flex-direction:column; }',
      '#amrit-chat-header { background:linear-gradient(135deg,#ad350a,#7c1d00); color:white; padding:16px 20px; display:flex; align-items:center; gap:10px; flex-shrink:0; }',
      '#amrit-chat-messages { flex:1; overflow-y:auto; padding:16px; background:#faf9f7; display:flex; flex-direction:column; gap:10px; min-height:200px; max-height:320px; }',
      '#amrit-chat-input-wrap { display:flex; padding:12px; background:#fff; border-top:1px solid #eee; gap:8px; flex-shrink:0; }',
      '#amrit-chat-input { flex:1; border:1px solid #ddd; border-radius:12px; padding:10px 14px; font-size:13px; font-family:Inter,sans-serif; outline:none; transition: border-color 0.2s; }',
      '#amrit-chat-input:focus { border-color:#ad350a; }',
      '#amrit-chat-send { width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,#ad350a,#9b2a00); color:white; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: transform 0.15s; flex-shrink:0; }',
      '#amrit-chat-send:hover { transform:scale(1.08); }',
      '#amrit-chat-send:disabled { opacity:0.5; cursor:not-allowed; transform:none; }',
      '.amrit-msg { padding:10px 14px; border-radius:16px; font-size:13px; line-height:1.5; max-width:85%; word-break:break-word; }',
      '.amrit-msg.user { align-self:flex-end; background:linear-gradient(135deg,#ad350a,#c44a1a); color:white; border-bottom-right-radius:4px; }',
      '.amrit-msg.bot { align-self:flex-start; background:white; color:#1e293b; border:1px solid #e2e8f0; border-bottom-left-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }',
      '.amrit-typing-dots { display:flex; gap:4px; padding:10px 14px; align-self:flex-start; }',
      '.amrit-typing-dots span { width:7px; height:7px; border-radius:50%; background:#ad350a; animation: dotBounce 1.2s ease-in-out infinite; }',
      '.amrit-typing-dots span:nth-child(2) { animation-delay: 0.15s; }',
      '.amrit-typing-dots span:nth-child(3) { animation-delay: 0.3s; }'
    ].join('\\n');
    document.head.appendChild(fabStyle);

    // ── Chat Popup ──
    var popup = document.createElement('div');
    popup.id = 'amrit-chat-popup';
    popup.innerHTML = '<div id="amrit-chat-header">' +
      '<span class="material-symbols-outlined" style="font-size:22px;">smart_toy</span>' +
      '<div><div style="font-weight:700;font-size:14px;">Amrit AI Assistant</div><div style="font-size:10px;opacity:0.8;">Ask about Khazan ecosystems</div></div>' +
      '<button id="amrit-chat-close" style="margin-left:auto;background:none;border:none;color:white;cursor:pointer;font-size:20px;line-height:1;">✕</button>' +
    '</div>' +
    '<div id="amrit-chat-messages"></div>' +
    '<div id="amrit-chat-input-wrap">' +
      '<input id="amrit-chat-input" type="text" placeholder="Type your question..." autocomplete="off" />' +
      '<button id="amrit-chat-send"><span class="material-symbols-outlined" style="font-size:18px;">send</span></button>' +
    '</div>';
    document.body.appendChild(popup);

    // ── Weather FAB Button ──
    function fabToast(message, isError) {
      var existing = document.getElementById('amrit-fab-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.id = 'amrit-fab-toast';
      toast.style.cssText = 'position:fixed;top:80px;right:16px;z-index:9999;' +
        'max-width:380px;padding:16px 20px 16px 24px;border-radius:12px;font-family:Space Grotesk,sans-serif;' +
        'font-size:13px;line-height:1.4;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,0.25);' +
        'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'animation:slideIn 0.3s ease-out;word-break:break-word;' +
        'display:flex;align-items:flex-start;gap:12px;' +
        'background:' + (isError ? 'rgba(172,49,73,0.95)' : 'rgba(14,165,233,0.95)') + ';';
      
      toast.innerHTML = '<div style="flex:1;">' + message + '</div>' + 
                        '<button id="amrit-fab-toast-close" title="Close" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;font-weight:bold;opacity:0.7;padding:0;line-height:1;margin-top:-2px;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">✕</button>';
      
      document.body.appendChild(toast);
      
      var closeBtn = document.getElementById('amrit-fab-toast-close');
      if (closeBtn) {
        closeBtn.onclick = function() {
          toast.style.transition = 'opacity 0.3s, transform 0.3s';
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(-20px)';
          setTimeout(function() { toast.remove(); }, 300);
        };
      }
    }

    var weatherFab = document.createElement('div');
    weatherFab.id = 'amrit-weather-fab';
    weatherFab.style.cssText = 'position:fixed; bottom: 100px; right: 104px; z-index: 9999; animation: slideIn 0.3s ease-out; animation-delay: 0.1s; animation-fill-mode: both;';
    weatherFab.innerHTML = '<button title="Check Weather Advisory" style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:white;box-shadow:0 8px 32px rgba(14,165,233,0.4);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:transform 0.2s;" onmouseover="this.style.transform=\\'scale(1.05)\\'" onmouseout="this.style.transform=\\'scale(1)\\'" onmousedown="this.style.transform=\\'scale(0.95)\\'">' +
                           '<span class="material-symbols-outlined" style="font-size:28px;">cloud</span></button>';
    document.body.appendChild(weatherFab);

    weatherFab.querySelector('button').addEventListener('click', async function() {
        fabToast('🌤 Fetching latest advisory...', false);
        this.style.transform = 'scale(0.9)';
        this.querySelector('.material-symbols-outlined').textContent = 'sync';
        this.querySelector('.material-symbols-outlined').style.animation = 'spin 1s linear infinite';
        
        try {
            var res = await fetch(window.amritN8nUrl('/webhook/salt-weather'), { method: 'GET' });
            if (!res.ok) {
                if (res.status === 404) {
                    res = await fetch(window.amritN8nUrl('/webhook-test/salt-weather'), { method: 'GET' });
                }
                if (!res.ok) throw new Error('API Error ' + res.status);
            }
            var data = await res.json();
            fabToast('🌤 Advisory: ' + (data.farmer_advisory || 'Check your n8n output format!'), false);
        } catch(e) {
            console.error('Weather error:', e);
            var mockAdvisory = 'Namaskar! Aiz tapman thode chodd asa (32°C). Vaaro barem asa, udak bhorpak heve sokoil dvorit. Suko divas asa, mhonje mitha lagim borro faido zatlo. Ghevpachi tayari korat!';
            fabToast('🌤 Advisory: ' + mockAdvisory, false);
        } finally {
            this.style.transform = 'scale(1)';
            this.querySelector('.material-symbols-outlined').textContent = 'cloud';
            this.querySelector('.material-symbols-outlined').style.animation = 'none';
        }
    });

    // ── Chat FAB Button ──
    var fab = document.createElement('div');
    fab.id = 'amrit-global-chat-fab';
    fab.style.cssText = 'position:fixed; bottom: 100px; right: 24px; z-index: 9999; animation: slideIn 0.3s ease-out;';
    fab.innerHTML = '<button title="Ask Amrit AI" style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#ad350a,#9b2a00);color:white;box-shadow:0 8px 32px rgba(173,53,10,0.4);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:transform 0.2s;" onmouseover="this.style.transform=\\'scale(1.05)\\'" onmouseout="this.style.transform=\\'scale(1)\\'" onmousedown="this.style.transform=\\'scale(0.95)\\'">' +
                    '<span class="material-symbols-outlined" style="font-size:28px;">smart_toy</span></button>';
    document.body.appendChild(fab);

    var isOpen = false;
    var msgDiv = popup.querySelector('#amrit-chat-messages');
    var input = popup.querySelector('#amrit-chat-input');
    var sendBtn = popup.querySelector('#amrit-chat-send');
    var closeBtn = popup.querySelector('#amrit-chat-close');

    // Welcome message
    addMsg('Hi! I am the **Amrit AI Assistant**. Ask me anything about the Khazan ecosystem, sluice gates, subsidies, or water quality. 🌊', false);

    function addMsg(text, isUser) {
      var d = document.createElement('div');
      d.className = 'amrit-msg ' + (isUser ? 'user' : 'bot');
      // Simple bold markdown
      var formatted = text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      d.innerHTML = formatted;
      msgDiv.appendChild(d);
      msgDiv.scrollTop = msgDiv.scrollHeight;
      return d;
    }

    function showTyping() {
      var d = document.createElement('div');
      d.className = 'amrit-typing-dots';
      d.id = 'amrit-typing';
      d.innerHTML = '<span></span><span></span><span></span>';
      msgDiv.appendChild(d);
      msgDiv.scrollTop = msgDiv.scrollHeight;
      return d;
    }

    function removeTyping() {
      var t = msgDiv.querySelector('#amrit-typing');
      if (t) t.remove();
    }

    async function sendMessage() {
      var txt = input.value.trim();
      if (!txt) return;

      addMsg(txt, true);
      input.value = '';
      sendBtn.disabled = true;
      showTyping();

      try {
        var controller = new AbortController();
        var timeout = setTimeout(function(){ controller.abort(); }, 60000);

        var res = await fetch(window.amritN8nUrl('/webhook/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: txt }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        removeTyping();

        if (!res.ok) throw new Error('Status ' + res.status);

        var raw = await res.text();
        console.log('[FAB Chatbot] Raw n8n response:', raw);
        var data;
        try { data = JSON.parse(raw); } catch(e) { data = raw; }

        var reply;
        if (typeof data === 'string') {
          reply = data;
        } else if (Array.isArray(data)) {
          reply = data[0].output || data[0].response || data[0].text || data[0].message || JSON.stringify(data[0]);
        } else {
          reply = data.output || data.response || data.text || data.message || JSON.stringify(data);
        }
        
        console.log('[FAB Chatbot] Parsed reply to show:', reply);
        if (!reply || reply.toString().trim() === '') {
           reply = '[No text response found in n8n output. Check console.]';
        }

        addMsg(reply, false);

      } catch(err) {
        removeTyping();
        console.error('[FAB Chatbot] Webhook Error:', err);
        var emsg = err.name === 'AbortError' ? 'Request timed out.' : err.message;
        addMsg('⚠ Error: ' + emsg, false);
      }
      sendBtn.disabled = false;
      input.focus();
    }

    // ── Events ──
    fab.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      isOpen = !isOpen;
      popup.className = isOpen ? 'open' : '';
      if (isOpen) input.focus();
    };

    closeBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      isOpen = false;
      popup.className = '';
    };

    sendBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      sendMessage();
    };

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', injectFAB); } else { injectFAB(); }
})();
</script>
`;

const VOICE_FAB_SCRIPT = ``;

function injectScripts(html, liveData, page) {
  const dataScript = buildDataInjectionScript(liveData, page);
  const scanScript = (page === 'dashboard' || page === 'vision') ? VISION_SCAN_SCRIPT : '';
  const chatScript = page === 'voice' ? CHATBOT_SCRIPT : '';
  const dashMicScript = page === 'dashboard' ? DASHBOARD_MIC_SCRIPT : '';
  const fabScript = page !== 'voice' ? FAB_SCRIPT : '';
  return html.replace('</body>', AMRIT_CONFIG_SCRIPT + NAV_INJECTION_SCRIPT + dataScript + scanScript + chatScript + dashMicScript + fabScript + '</body>');
}

function App() {
  // Use sessionStorage to persist the active tab and navigation history across page reloads
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem('amrit-active-tab');
    return saved ? saved : 'dashboard';
  });

  const [history, setHistory] = useState(() => {
    const saved = sessionStorage.getItem('amrit-history');
    return saved ? JSON.parse(saved) : ['dashboard'];
  });

  const [liveData, setLiveData] = useState(null);
  const [evaporationScore, setEvaporationScore] = useState(14.2);
  const [dbStatus, setDbStatus] = useState('connecting');
  const iframeRef = useRef(null);

  // Save to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('amrit-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('amrit-history', JSON.stringify(history));
  }, [history]);

  // ── Connect to Supabase and fetch initial data ──
  useEffect(() => {
    async function init() {
      try {
        const result = await testConnection();
        if (result.connected && result.tablesExist) {
          setDbStatus('connected');
          console.log('[Amrit] ✅ Supabase connected. Tables exist.');
        } else {
          setDbStatus('no-tables');
          console.warn('[Amrit] ⚠️ Supabase reachable but tables not found. Using defaults. Run schema.sql in your Supabase SQL Editor.');
        }
      } catch {
        setDbStatus('error');
        console.warn('[Amrit] ❌ Could not reach Supabase. Using static defaults.');
      }

      // Fetch data either way (dataService falls back to defaults)
      const data = await fetchAllData();
      setLiveData(data);

      // Fetch the latest evaporation score
      const latestScore = await fetchLatestEvaporationScore();
      setEvaporationScore(latestScore);
    }

    init();
  }, []);

  // ── Real-time subscriptions ──
  useEffect(() => {
    const channels = [];

    channels.push(
      subscribeToWeather((newRow) => {
        setLiveData((prev) => prev ? { ...prev, weather: newRow } : prev);
      })
    );
    channels.push(
      subscribeToVisionAlerts((newRow) => {
        setLiveData((prev) => prev ? { ...prev, vision: newRow } : prev);
      })
    );
    channels.push(
      subscribeToBrine((newRow) => {
        setLiveData((prev) => prev ? { ...prev, brine: newRow } : prev);
      })
    );
    channels.push(
      subscribeToEvaporationLogs((newRow) => {
        if (newRow?.score != null) {
          setEvaporationScore(newRow.score);
          // Also update the weather.evaporation_score in liveData so the gauge syncs
          setLiveData((prev) => prev ? {
            ...prev,
            weather: { ...prev.weather, evaporation_score: newRow.score }
          } : prev);
          console.log('[Amrit] 📊 Evaporation Gauge updated in real-time:', newRow.score);
        }
      })
    );

    return () => {
      channels.forEach((ch) => ch.unsubscribe());
    };
  }, []);

  // Listen for postMessage navigation events from the iframe
  useEffect(() => {
    function onMessage(event) {
      if (event.data && event.data.type === 'amrit-nav') {
        const tab = event.data.tab;
        if (tab === '__back__') {
          setHistory((prev) => {
            if (prev.length <= 1) return prev;
            const newHistory = prev.slice(0, -1);
            setActiveTab(newHistory[newHistory.length - 1]);
            return newHistory;
          });
        } else if (PAGES[tab]) {
          setActiveTab(tab);
          setHistory((prev) => [...prev, tab]);
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Write iframe content whenever activeTab or liveData changes
  const writeIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const html = injectScripts(PAGES[activeTab], liveData, activeTab);
    doc.open();
    doc.write(html);
    doc.close();
  }, [activeTab, liveData]);

  useEffect(() => {
    writeIframe();
  }, [writeIframe]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Database connection indicator */}
      <div
        style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          zIndex: 9999,
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontFamily: 'monospace',
          color: '#fff',
          background:
            dbStatus === 'connected' ? '#16a34a' :
              dbStatus === 'connecting' ? '#ca8a04' :
                dbStatus === 'no-tables' ? '#ea580c' : '#dc2626',
          opacity: 0.85,
          pointerEvents: 'none',
        }}
      >
        {dbStatus === 'connected' && '● DB Connected'}
        {dbStatus === 'connecting' && '◌ Connecting...'}
        {dbStatus === 'no-tables' && '▲ No Tables (run schema.sql)'}
        {dbStatus === 'error' && '✕ DB Error'}
      </div>

      <iframe
        ref={iframeRef}
        title="Project Amrit"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}

export default App;
