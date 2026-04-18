import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAllData, subscribeToWeather, subscribeToVisionAlerts, subscribeToBrine, testConnection } from './db/dataService';

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
      document.querySelectorAll('span').forEach(function(el) {
        var t = el.textContent || '';
        if (t.match(/\\d+°C/)) {
          el.textContent = '${weather?.temperature ?? 24}°C • ${weather?.tide_status ?? 'High Tide'}';
        }
      });

      // Update evaporation score
      document.querySelectorAll('p, span').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '14.2') el.textContent = '${weather?.evaporation_score ?? 14.2}';
        if (t === '88') el.textContent = '${weather?.humidity ?? 88}';
      });

      // Update confidence score
      document.querySelectorAll('span, p').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === 'CONFIDENCE: 98.4%') el.textContent = 'CONFIDENCE: ${vision?.confidence ?? 98.4}%';
      });

      // Update stream ID
      document.querySelectorAll('span, p').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === 'STREAM_ID: ESTUARY_04') el.textContent = 'STREAM_ID: ${vision?.stream_id ?? 'ESTUARY_04'}';
      });

      // Update phase badge
      document.querySelectorAll('span').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === 'Phase: Preparatory') el.textContent = 'Phase: ${brine?.phase ?? 'Preparatory'}';
      });
    `;
  }

  if (page === 'vision') {
    updater = `
      // Update sabotage probability
      document.querySelectorAll('p, span, h2, h3').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '98.4%') el.textContent = '${vision?.confidence ?? 98.4}%';
      });
    `;
  }

  if (page === 'data') {
    updater = `
      // Update phase
      document.querySelectorAll('span').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t.match(/PHASE: PREPARATORY/i)) el.textContent = 'PHASE: ${(brine?.phase ?? 'Preparatory').toUpperCase()}';
      });

      // Update efficiency peak
      document.querySelectorAll('span, p').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '84.2%') el.textContent = '${brine?.humidity ?? 84.2}%';
      });

      // Update soil salinity
      document.querySelectorAll('span, p, text').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (t === '6.2') el.textContent = '${brine?.soil_salinity ?? 6.2}';
        if (t === 'STABLE') el.textContent = '${brine?.salinity_status ?? 'STABLE'}';
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
    var feedImg = document.querySelector('img[alt*="CCTV"], img[alt*="sluice"], img[data-alt]');
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

    // ── 6. "SIMULATE ANOMALY" / "RESET FEED" button ──
    var anomalyBtn = document.createElement('button');
    anomalyBtn.id = 'amrit-anomaly-btn';
    anomalyBtn.className = dispatchBtn.className;
    anomalyBtn.style.cssText = 'background:linear-gradient(135deg,#ac3149,#770326);margin-left:8px;';
    anomalyBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="warning">warning</span>' +
      'SIMULATE ANOMALY</span>';
    btnContainer.insertBefore(anomalyBtn, dispatchBtn.nextSibling);

    // ── 7. "SCAN MANAS" button ──
    var scanBtn = document.createElement('button');
    scanBtn.id = 'amrit-scan-manas-btn';
    scanBtn.className = dispatchBtn.className;
    scanBtn.style.cssText = 'background:linear-gradient(135deg,#6d46c1,#6138b4);margin-left:8px;';
    scanBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;">' +
      '<span class="material-symbols-outlined" style="font-size:16px;" data-icon="frame_inspect">frame_inspect</span>' +
      'SCAN MANAS</span>';
    btnContainer.insertBefore(scanBtn, anomalyBtn.nextSibling);

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

function injectScripts(html, liveData, page) {
  const dataScript = buildDataInjectionScript(liveData, page);
  const scanScript = (page === 'dashboard' || page === 'vision') ? VISION_SCAN_SCRIPT : '';
  return html.replace('</body>', NAV_INJECTION_SCRIPT + dataScript + scanScript + '</body>');
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
