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
      // Update phase
      document.querySelectorAll('span').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t.match(/PHASE: PREPARATORY/i)) el.textContent = 'PHASE: ${(brine?.phase ?? 'Preparatory').toUpperCase()}';
        if (t === '84.2%') el.textContent = '${brine?.humidity ?? 84.2}%';
      });

      // Update soil salinity
      document.querySelectorAll('span, p, text').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '6.2') el.textContent = '${brine?.soil_salinity ?? 6.2}';
        if (t === 'STABLE') el.textContent = '${brine?.salinity_status ?? 'STABLE'}';
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
            el.textContent = 'Sector 4: ${weather?.node_id ?? 'Tide Flats'}';
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
      videoEl.loop = true;
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

    // ── 5. Find DISPATCH WARDEN button ──
    var buttons = document.querySelectorAll('button');
    var dispatchBtn = null;
    buttons.forEach(function(btn) {
      if ((btn.textContent || '').trim().toUpperCase().indexOf('DISPATCH WARDEN') !== -1) {
        dispatchBtn = btn;
      }
    });
    if (!dispatchBtn) {
      console.warn('[Amrit] Could not find DISPATCH WARDEN button.');
      return;
    }
    var btnContainer = dispatchBtn.parentNode;

    // ── 5.5 Wrap buttons in a flex container to prevent layout squishing ──
    var buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; flex-shrink: 0;';
    btnContainer.insertBefore(buttonGroup, dispatchBtn);
    buttonGroup.appendChild(dispatchBtn); // Moves dispatchBtn inside

    // ── 6. "SIMULATE ANOMALY" / "RESET FEED" button ──
    var anomalyBtn = document.createElement('button');
    anomalyBtn.id = 'amrit-anomaly-btn';
    anomalyBtn.className = dispatchBtn.className;
    anomalyBtn.style.cssText = 'background:linear-gradient(135deg,#ac3149,#770326); white-space: nowrap;';
    anomalyBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="warning">warning</span>' +
      'SIMULATE ANOMALY</span>';
    buttonGroup.appendChild(anomalyBtn);

    // ── 7. "SCAN MANAS" button ──
    var scanBtn = document.createElement('button');
    scanBtn.id = 'amrit-scan-manas-btn';
    scanBtn.className = dispatchBtn.className;
    scanBtn.style.cssText = 'background:linear-gradient(135deg,#6d46c1,#6138b4); white-space: nowrap;';
    scanBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="frame_inspect">frame_inspect</span>' +
      'SCAN MANAS</span>';
    buttonGroup.appendChild(scanBtn);

    // ── 8. Anomaly toggle ──
    function activateAnomaly() {
      isAnomalyActive = true;

      // Load and show video, hide image
      if (videoEl) {
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
      anomalyBtn.style.cssText = 'background:linear-gradient(135deg,#16a34a,#15803d);margin-left:8px;';
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
      anomalyBtn.style.cssText = 'background:linear-gradient(135deg,#ac3149,#770326);margin-left:8px;';
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

        if (isAnomalyActive && videoEl && videoEl.readyState >= 2) {
          // Capture from anomaly video (same-origin, no CORS issue)
          canvas.width = videoEl.videoWidth || 640;
          canvas.height = videoEl.videoHeight || 360;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          base64String = canvas.toDataURL('image/jpeg', 0.85);
          console.log('[Amrit] Frame captured from anomaly video');
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
                  canvas.width = img.naturalWidth || 640; canvas.height = img.naturalHeight || 360;
                  var c = canvas.getContext('2d'); c.drawImage(img,0,0,canvas.width,canvas.height);
                  try { resolve(canvas.toDataURL('image/jpeg',0.85)); } catch(e) { reject(e); }
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
        var response = await fetch('/api/n8n/webhook/vision-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64String })
        });

        if (!response.ok) throw new Error('n8n responded with status ' + response.status);
        var data = await response.json();
        console.log('[Amrit] n8n response:', data);
        showToast('✅ Manas Scan Complete: ' + (data.message || data.result || JSON.stringify(data)), false);

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
      '.amrit-status-banner{align-self:center;display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;margin-bottom:12px;font-family:Space Grotesk,Inter,sans-serif;font-size:11px;font-weight:600;}',
      '.amrit-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}',
      '.amrit-status-banner.connected{background:rgba(34,197,94,0.1);color:#15803d;}',
      '.amrit-status-banner.disconnected{background:rgba(239,68,68,0.1);color:#b91c1c;}',
      '.amrit-status-banner.connected .amrit-status-dot{background:#22c55e;animation:amritPulse 2s infinite}',
      '.amrit-status-banner.disconnected .amrit-status-dot{background:#ef4444;}',
      '.amrit-recording .audio-wave-bar{animation-name:amritWaveFast !important;animation-duration:0.5s !important;}',
      '.amrit-recording-pulse{animation:amritMicRecord 1.2s ease-in-out infinite;}'
    ].join('\\n');
    document.head.appendChild(vs);

    var webhookUrl = '/api/n8n/webhook/amrit-voice-agent';
    
    var banner = document.createElement('div');
    banner.id = 'amrit-webhook-status';
    banner.className = 'amrit-status-banner connected';
    banner.style.display = 'none';
    banner.innerHTML = '<span class="amrit-status-dot"></span><span id="amrit-status-text">Active</span>';
    historyDiv.parentNode.insertBefore(banner, historyDiv);

    var isWorkflowActive = false;
    var retryInterval = null;

    async function checkWebhookHealth() {
      try {
        var res = await fetch(webhookUrl, { method: 'HEAD' });
        // Any response means n8n is reachable
        isWorkflowActive = true;
        banner.style.display = 'flex';
        banner.className = 'amrit-status-banner connected';
        var txt = document.getElementById('amrit-status-text');
        if(txt) txt.textContent = 'Active';
        if (retryInterval) { clearInterval(retryInterval); retryInterval = null; }
      } catch(err) {
        isWorkflowActive = false;
        banner.style.display = 'flex';
        banner.className = 'amrit-status-banner disconnected';
        var txt = document.getElementById('amrit-status-text');
        if(txt) txt.textContent = 'Inactive';
        if (!retryInterval) retryInterval = setInterval(checkWebhookHealth, 30000);
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
      d.innerHTML = '<div class="flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-primary text-sm" data-icon="auto_awesome">auto_awesome</span><span class="font-label text-[10px] uppercase tracking-tighter text-primary font-bold">Amrit Voice Agent</span></div>' +
        '<audio controls autoplay style="width:100%;border-radius:12px;margin-top:8px;"><source src="' + url + '" type="audio/wav">Your browser does not support audio.</audio>';
      historyDiv.appendChild(d);
      historyDiv.scrollTop = historyDiv.scrollHeight;
    }

    // ── Text-to-Speech via Google Translate TTS (real audio) ──
    var ttsQueue = [];
    var ttsPlaying = false;

    function speakText(text) {
      if (!text) return;
      // Clean the text
      text = text.replace(/[\\*\\#\\[\\]\\(\\)]/g, '').trim();
      if (!text) return;
      
      // Split into chunks of ~190 chars (Google TTS limit is ~200)
      var chunks = [];
      while (text.length > 0) {
        if (text.length <= 190) {
          chunks.push(text);
          break;
        }
        // Find a good break point
        var cut = text.lastIndexOf('.', 190);
        if (cut < 50) cut = text.lastIndexOf(' ', 190);
        if (cut < 50) cut = 190;
        chunks.push(text.substring(0, cut + 1).trim());
        text = text.substring(cut + 1).trim();
      }
      
      ttsQueue = chunks;
      ttsPlaying = false;
      playNextChunk();
    }

    function playNextChunk() {
      if (ttsPlaying || ttsQueue.length === 0) return;
      ttsPlaying = true;
      var chunk = ttsQueue.shift();
      // Use Marathi (mr) — closest to Konkani available in Google TTS
      var url = '/api/tts/translate_tts?ie=UTF-8&tl=mr&client=gtx&q=' + encodeURIComponent(chunk);
      
      var audio = new Audio(url);
      audio.volume = 1.0;
      audio.onended = function() {
        ttsPlaying = false;
        playNextChunk(); // play next chunk
      };
      audio.onerror = function(e) {
        console.warn('[Amrit TTS] Audio chunk failed, trying Hindi fallback:', e);
        // Fallback to Hindi
        var fallbackUrl = '/api/tts/translate_tts?ie=UTF-8&tl=hi&client=gtx&q=' + encodeURIComponent(chunk);
        var fallback = new Audio(fallbackUrl);
        fallback.volume = 1.0;
        fallback.onended = function() { ttsPlaying = false; playNextChunk(); };
        fallback.onerror = function() { 
          console.warn('[Amrit TTS] Hindi fallback also failed');
          ttsPlaying = false; 
          playNextChunk(); 
        };
        fallback.play().catch(function(err) { console.warn('[Amrit TTS] Play failed:', err); ttsPlaying = false; playNextChunk(); });
      };
      audio.play().catch(function(err) { 
        console.warn('[Amrit TTS] Play failed:', err); 
        ttsPlaying = false; 
        playNextChunk(); 
      });
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
            formData.append('user_audio', audioBlob, 'voice.webm');

            var r = await fetch(webhookUrl, {
              method: 'POST',
              body: formData,
              signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (!r.ok) throw new Error('Webhook returned ' + r.status);
            
            ld.remove();
            
            var ct = r.headers.get('content-type') || '';
            if (ct.indexOf('audio') !== -1) {
              // n8n returned actual audio — play it directly
              var respBlob = await r.blob();
              appendAudioPlayer(respBlob);
            } else {
              // n8n returned text/JSON — extract the AI reply and speak it aloud
              var raw = await r.text();
              var data; try { data = JSON.parse(raw); } catch(e) { data = raw; }
              var reply = typeof data === 'string' ? data : (
                data?.choices?.[0]?.message?.content ||
                data?.output || data?.response || data?.message || data?.text || 
                JSON.stringify(data)
              );
              // Show the text reply in the chat
              appendMessage(reply, false);
              // Speak it aloud as audio output
              speakText(reply);
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

    var webhookUrl = '/api/n8n/webhook/amrit-voice-agent';
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
      if (tapLabel) tapLabel.textContent = on ? 'Tap again to stop and send' : 'Tap to speak in Konkani or Marathi.';
    }

    async function startRec() {
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = async function() {
          stream.getTracks().forEach(function(t){ t.stop(); });
          var blob = new Blob(audioChunks, { type: 'audio/webm' });
          setRecordingUI(false);
          if (listeningLabel) listeningLabel.textContent = 'SENDING...';
          if (tapLabel) tapLabel.textContent = 'Processing your voice...';
          showToast('🎤 Sending voice to Amrit AI...', false);
          
          try {
            var controller = new AbortController();
            var tmout = setTimeout(function(){ controller.abort(); }, 120000);
            
            var formData = new FormData();
            formData.append('user_audio', blob, 'voice.webm');

            var r = await fetch(webhookUrl, { method:'POST', body: formData, signal: controller.signal });
            clearTimeout(tmout);
            
            if (!r.ok) throw new Error('Status ' + r.status);
            
            var ct = r.headers.get('content-type') || '';
            if (ct.indexOf('audio') !== -1) {
              var audioBlob = await r.blob();
              var url = URL.createObjectURL(audioBlob);
              var audio = new Audio(url);
              audio.play();
              showToast('🔊 Playing response from Amrit AI', false);
            } else {
              var raw = await r.text();
              var data; try{data=JSON.parse(raw);}catch(e){data=raw;}
              var reply = typeof data==='string' ? data : (
                data?.choices?.[0]?.message?.content ||
                data?.output||data?.response||data?.message||data?.text||JSON.stringify(data)
              );
              showToast('🔊 Speaking response...', false);
              // Speak using Google Translate TTS (real audio)
              var cleanReply = reply.replace(/[\\*\\#\\[\\]\\(\\)]/g, '').trim();
              if (cleanReply) {
                var ttsUrl = '/api/tts/translate_tts?ie=UTF-8&tl=mr&client=gtx&q=' + encodeURIComponent(cleanReply.substring(0, 200));
                var ttsAudio = new Audio(ttsUrl);
                ttsAudio.volume = 1.0;
                ttsAudio.onerror = function() {
                  // Fallback to Hindi
                  var hiFallback = new Audio('/api/tts/translate_tts?ie=UTF-8&tl=hi&client=gtx&q=' + encodeURIComponent(cleanReply.substring(0, 200)));
                  hiFallback.volume = 1.0;
                  hiFallback.play().catch(function(err){ console.warn('[Amrit TTS] Fallback failed:', err); });
                };
                ttsAudio.play().catch(function(err){ console.warn('[Amrit TTS] Play failed:', err); });
              }
            }
          } catch(e) {
            var emsg = e.name === 'AbortError' ? 'Timed out (120s)' : e.message;
            showToast('⚠ Voice agent error: ' + emsg, true);
          }
          if (listeningLabel) listeningLabel.textContent = 'LISTENING...';
          if (tapLabel) tapLabel.textContent = 'Tap to speak in Konkani or Marathi.';
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
    var fab = document.createElement('div');
    fab.id = 'amrit-global-chat-fab';
    fab.style.cssText = 'position:fixed; bottom: 100px; right: 24px; z-index: 9999; animation: slideIn 0.3s ease-out;';
    fab.innerHTML = '<button style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#ad350a,#9b2a00);color:white;box-shadow:0 8px 32px rgba(173,53,10,0.4);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:transform 0.2s;" onmouseover="this.style.transform=\\'scale(1.05)\\'" onmouseout="this.style.transform=\\'scale(1)\\'" onmousedown="this.style.transform=\\'scale(0.95)\\'">' + 
                    '<span class="material-symbols-outlined" style="font-size:28px;">smart_toy</span></button>';
    
    if (!document.getElementById('amrit-animations')) {
      var style = document.createElement('style');
      style.id = 'amrit-animations';
      style.innerHTML = '@keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }';
      document.head.appendChild(style);
    }
    
    fab.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      window.parent.postMessage({ type: 'amrit-nav', tab: 'voice' }, '*');
    };
    
    document.body.appendChild(fab);
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', injectFAB); } else { injectFAB(); }
})();
</script>
`;

function injectScripts(html, liveData, page) {
  const dataScript = buildDataInjectionScript(liveData, page);
  const scanScript = (page === 'dashboard' || page === 'vision') ? VISION_SCAN_SCRIPT : '';
  const chatScript = page === 'voice' ? CHATBOT_SCRIPT : '';
  const dashMicScript = page === 'dashboard' ? DASHBOARD_MIC_SCRIPT : '';
  const fabScript = page !== 'voice' ? FAB_SCRIPT : '';
  return html.replace('</body>', NAV_INJECTION_SCRIPT + dataScript + scanScript + chatScript + dashMicScript + fabScript + '</body>');
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
