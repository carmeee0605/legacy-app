/* ─────────────────────────────────────────
   Legacy — app.js  (Vision Edition)
   + Upload immagini con anteprima
   + Fumetti con foto in chat
   + Invio image_file al backend
   + Ripristino cronologia con immagini
───────────────────────────────────────── */

'use strict';

// ── Supabase ─────────────────────────────
const SUPABASE_URL = 'https://fytdzffdpxawjfxhorlz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dGR6ZmZkcHhhd2pmeGhvcmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODM1OTcsImV4cCI6MjA5MTA1OTU5N30.r3yZkAPJuitlAn3s3KZCj1B5KBwMbJw57eMjtwxDXHA';
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:    true,   // salva token in localStorage
    autoRefreshToken:  true,   // rinnova automaticamente il JWT
    detectSessionInUrl: true,  // gestisce redirect OAuth (Google)
  }
});

// ── API ──────────────────────────────────
// Si adatta automaticamente: localhost in sviluppo, IP reale da altri dispositivi
const API_BASE        = 'https://legacy-backend-wtx4.onrender.com';
const API_URL         = `${API_BASE}/api/chat`;
const API_BOOK_URL    = `${API_BASE}/api/generate_book`;
const API_HISTORY_URL = `${API_BASE}/api/history`;
const API_SESSIONS    = `${API_BASE}/api/sessions`;

// ── localStorage keys ────────────────────
const LS_VOICE        = 'legacy_voice';
const LS_AUTOPLAY     = 'legacy_autoplay';
const LS_LAST_SESSION = 'legacy_last_session';
const LS_AMBIENT      = 'legacy_ambient';
const LS_CLONED_VOICE = 'legacy_cloned_voice';  // 'true' se la sessione ha voce clonata
const LS_LANG         = 'legacy_lang';

// ── Stato globale ────────────────────────
let mediaRecorder     = null;
let audioChunks       = [];
let audioBlob         = null;
let micStream         = null;
let currentAudio      = null;

let USER_ID           = null;
let SESSION_ID        = null;
let userName          = 'Ospite';
let protagonistName   = '';
let protagonistGender = 'M';
let biographyTone     = 'Nostalgico ed Emozionale';

let currentBookContent = null;
let audiobookAudio     = null;   // Audio object corrente per l'audiolibro
let messagesSinceBook  = 0;

// Immagine in attesa di invio
let pendingImageFile = null;
// Subscription
let userSubscription = 'free';   // 'free' | 'premium' | 'ultra'
const FREE_SESSION_LIMIT = 1;
let pendingStoryType   = 'personale';   // tipo scelto nella path modal
let currentStoryType  = 'personale';   // tipo della sessione attualmente aperta

// ── Ambient audio ─────────────────────────────────────────────────────────────
const ambientAudio = new Audio();
ambientAudio.loop   = true;
ambientAudio.volume = 0.15;

// Mappa suoni → file locali nella cartella sounds/
const AMBIENT_TRACKS = {
  rain:  'sounds/rain.mp3',
  fire:  'sounds/fire.mp3',
  sea:   'sounds/sea.mp3',
  night: 'sounds/night.mp3',
};

let selectedAmbient = localStorage.getItem(LS_AMBIENT) || 'none';
let currentLang     = localStorage.getItem(LS_LANG)    || 'it';

let selectedVoice   = localStorage.getItem(LS_VOICE)    || 'shimmer';
let autoplayEnabled = localStorage.getItem(LS_AUTOPLAY) !== 'false';

// ── DOM — Views ──────────────────────────
const landingView = document.getElementById('landing-view');
const authView    = document.getElementById('auth-view');
const appLayout   = document.getElementById('app-layout');

// ── DOM — Landing ─────────────────────────
const btnHeroCTA      = document.getElementById('btnHeroCTA');
const btnFooterCTA    = document.getElementById('btnFooterCTA');
const btnLandingLogin = document.getElementById('btnLandingLogin');

// ── DOM — Auth ────────────────────────────
const btnAuthBack        = document.getElementById('btnAuthBack');
const btnGoogleLogin     = document.getElementById('btnGoogleLogin');
const tabLogin           = document.getElementById('tabLogin');
const tabRegister        = document.getElementById('tabRegister');
const authEmail          = document.getElementById('authEmail');
const authPassword       = document.getElementById('authPassword');
const authError          = document.getElementById('authError');
const btnLogin           = document.getElementById('btnLogin');
const btnLoginLabel      = document.getElementById('btnLoginLabel');
const btnLoginSpinner    = document.getElementById('btnLoginSpinner');
const btnRegister        = document.getElementById('btnRegister');
const btnRegisterLabel   = document.getElementById('btnRegisterLabel');
const btnRegisterSpinner = document.getElementById('btnRegisterSpinner');

// ── DOM — Sidebar ─────────────────────────
const btnNewInterview  = document.getElementById('btnNewInterview');
const btnSidebarLogout = document.getElementById('btnSidebarLogout');
const sidebarSettings  = document.getElementById('sidebarSettings');
const storiesList      = document.getElementById('storiesList');

// ── DOM — Panels ─────────────────────────
const panelSetup    = document.getElementById('panelSetup');
const panelChat     = document.getElementById('panelChat');
const panelBook     = document.getElementById('panelBook');
const bookVoiceSection = document.getElementById('bookVoiceSection');
const panelSettings = document.getElementById('panelSettings');

// ── DOM — Setup ───────────────────────────
// setupNameInput rimosso — sostituito da path modal
// setupToneSelect rimosso — sostituito da path modal
// setupError rimosso
// btnSetupStart rimosso
// genderPills setup rimossi — gestione spostata alla path modal

// ── DOM — Chat ────────────────────────────
const btnMic               = document.getElementById('btnMic');
const micIconDefault       = document.getElementById('micIconDefault');
const micIconStop          = document.getElementById('micIconStop');
const micRing              = document.getElementById('micRing');
const micStatus            = document.getElementById('micStatus');
const chatArea             = document.getElementById('chatArea');
const typingIndicator      = document.getElementById('typingIndicator');
const headerSubtitle       = document.getElementById('headerSubtitle');
const headerToneLabel      = document.getElementById('headerToneLabel');
const textInput            = document.getElementById('textInput');
const btnSendText          = document.getElementById('btnSendText');
// Book buttons
const bookButtonsContainer = document.getElementById('bookButtonsContainer');
const emptyState              = document.getElementById('empty-state');
const btnStartFirstJourney    = document.getElementById('btnStartFirstJourney');
const btnSetupCTA             = document.getElementById('btnSetupCTA');
const btnEmptyStateCTA   = document.getElementById('btnEmptyStateCTA');
const btnGenerateBook      = document.getElementById('btnGenerateBook');
const btnReadBook          = document.getElementById('btnReadBook');
const btnUpdateBook        = document.getElementById('btnUpdateBook');
// Image attach
const btnAttach            = document.getElementById('btnAttach');
const imageFileInput       = document.getElementById('imageFileInput');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreviewThumb    = document.getElementById('imagePreviewThumb');
const imagePreviewName     = document.getElementById('imagePreviewName');
const btnRemoveImage       = document.getElementById('btnRemoveImage');

// ── DOM — Book ────────────────────────────
const writingOverlay = document.getElementById('writingOverlay');
const bookPage       = document.getElementById('bookPage');
const bookContent    = document.getElementById('bookContent');
const btnBackToChat    = document.getElementById('btnBackToChat');
const btnDownloadPdf      = document.getElementById('btnDownloadPdf');
const btnEditArchive      = document.getElementById('btnEditArchive');
const btnEditArchiveLabel = document.getElementById('btnEditArchiveLabel');
const btnDownloadPdfLabel  = document.getElementById('btnDownloadPdfLabel');
// Audiolibro
const btnListenAudiobook   = document.getElementById('btnListenAudiobook');
const btnListenLabel       = document.getElementById('btnListenLabel');
const btnListenSpinner     = document.getElementById('btnListenSpinner');
const btnListenIcon        = document.getElementById('btnListenIcon');
const audiobookPlayer      = document.getElementById('audiobookPlayer');
const audiobookProgress    = document.getElementById('audiobookProgress');
const audiobookTime        = document.getElementById('audiobookTime');
const btnAudiobookPause    = document.getElementById('btnAudiobookPause');
const btnAudiobookStop     = document.getElementById('btnAudiobookStop');

// ── DOM — Settings ────────────────────────
const settingsVoice     = document.getElementById('settingsVoice');
const settingsAmbient   = document.getElementById('settingsAmbient');
const settingsLanguage      = document.getElementById('settingsLanguage');
// Voice cloning (pannello nella chat)
const voiceSampleInput      = document.getElementById('voiceSampleInput');
const voiceUploadZone       = document.getElementById('voiceUploadZone');
const voiceUploadLabel      = document.getElementById('voiceUploadLabel');
const btnCloneVoice         = document.getElementById('btnCloneVoice');
const btnCloneVoiceLabel    = document.getElementById('btnCloneVoiceLabel');
const btnCloneVoiceSpinner  = document.getElementById('btnCloneVoiceSpinner');
const voiceCloneFeedback    = document.getElementById('voiceCloneFeedback');
const btnRemoveClonedVoice  = document.getElementById('btnRemoveClonedVoice');
const voiceChatPanel        = null; // rimosso dall'header — ora in panelBook
const voicePanelStatus      = document.getElementById('voicePanelStatus');
const voicePanelBadge       = document.getElementById('voicePanelBadge');
const settingsAutoplay  = document.getElementById('settingsAutoplay');
const settingsEmail     = document.getElementById('settingsEmail');
const btnChangePassword = document.getElementById('btnChangePassword');
const btnDeleteAccount  = document.getElementById('btnDeleteAccount');
const passwordFeedback  = document.getElementById('passwordFeedback');

// ── DOM — Modal ───────────────────────────
const modalNewInterview     = document.getElementById('modalNewInterview');
// Legal checkboxes rimossi dall'auth form — gestiti dal terms gate
const pathSelectionModal    = document.getElementById('pathSelectionModal');
const modalProtagonistName  = document.getElementById('modalProtagonistName');
const modalTone             = document.getElementById('modalTone');
const modalError            = document.getElementById('modalError');
const btnModalCreate        = document.getElementById('btnModalCreate');
const btnModalCreateLabel   = document.getElementById('btnModalCreateLabel');
const btnModalCreateSpinner = document.getElementById('btnModalCreateSpinner');
const modalGenderPills      = document.querySelectorAll('.modal-gender-pill');

// ════════════════════════════════════════
//  GESTIONE IMMAGINE IN ATTESA
// ════════════════════════════════════════

btnAttach?.addEventListener('click', () => imageFileInput?.click());

// Limiti upload immagini per piano
const IMAGE_LIMITS = { free: 2, premium: 15, ultra: 50 };
let sessionImageCount = 0; // contatore immagini caricate in questa sessione

imageFileInput?.addEventListener('change', () => {
  const file = imageFileInput.files?.[0];
  if (!file) return;

  // Formato
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(file.type)) {
    alert('Formato non supportato. Usa JPEG, PNG, GIF o WebP.');
    imageFileInput.value = '';
    return;
  }

  // Dimensione max 5MB per tutti i piani
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    alert('File troppo grande. Dimensione massima: 5 MB.');
    imageFileInput.value = '';
    return;
  }

  // Limite numero file per piano
  const plan  = userSubscription || 'free';
  const limit = IMAGE_LIMITS[plan] ?? IMAGE_LIMITS.free;
  if (sessionImageCount >= limit) {
    if (plan === 'free') {
      openUpsell('premium', `Con il piano gratuito puoi allegare al massimo ${limit} immagini per sessione. Passa a Premium per 15 immagini.`);
    } else {
      addSystemNote(`// Limite immagini raggiunto per il tuo piano (${limit} per sessione).`);
    }
    imageFileInput.value = '';
    return;
  }

  pendingImageFile = file;

  // Mostra anteprima
  const reader = new FileReader();
  reader.onload = e => {
    if (imagePreviewThumb) imagePreviewThumb.src = e.target.result;
    if (imagePreviewName)  imagePreviewName.textContent  = file.name;
    imagePreviewContainer?.classList.add('visible');
  };
  reader.readAsDataURL(file);
});

btnRemoveImage?.addEventListener('click', () => clearPendingImage());

function clearPendingImage() {
  pendingImageFile = null;
  if (imageFileInput)  imageFileInput.value = '';
  if (imagePreviewThumb) imagePreviewThumb.src = '';
  if (imagePreviewName)  imagePreviewName.textContent = '';
  imagePreviewContainer?.classList.remove('visible');
}

// ════════════════════════════════════════
//  GESTIONE BOTTONI LIBRO
// ════════════════════════════════════════

function updateBookButtons(bookHtml) {
  currentBookContent = bookHtml || null;
  messagesSinceBook  = 0;

  if (!currentBookContent) {
    // Nessun archivio ancora → solo "Genera Archivio"
    btnGenerateBook?.classList.remove('hidden');
    btnReadBook?.classList.add('hidden');
    btnUpdateBook?.classList.add('hidden');
  } else {
    // Archivio già generato → solo "Aggiorna"
    btnGenerateBook?.classList.add('hidden');
    btnReadBook?.classList.add('hidden');
    btnUpdateBook?.classList.remove('hidden');
  }
}

function onMessageSent() {
  messagesSinceBook++;
  if (currentBookContent && messagesSinceBook > 0) {
    btnUpdateBook?.classList.remove('hidden');
  }
}

btnGenerateBook?.addEventListener('click', async () => {
  stopCurrentAudio();
  startBookGeneration();
  const html = await generateBook();
  if (html) { updateBookButtons(html); showBookContent(html); }
  else showPanel('chat');
});

btnReadBook?.addEventListener('click', () => {
  if (!currentBookContent) return;
  stopCurrentAudio();
  showPanel('book');
  writingOverlay.style.opacity       = '0';
  writingOverlay.style.pointerEvents = 'none';
  bookContent.innerHTML = currentBookContent;
  bookPage.style.transition    = 'none';
  bookPage.style.opacity       = '1';
  bookPage.style.pointerEvents = 'all';
  bookContent.scrollTo({ top: 0 });
});

btnUpdateBook?.addEventListener('click', async () => {
  stopCurrentAudio();
  startBookGeneration();
  const html = await generateBook();
  if (html) { updateBookButtons(html); showBookContent(html); }
  else showPanel('chat');
});

function startBookGeneration() {
  stopCurrentAudio();  // ferma eventuale audio chat
  showPanel('book');
  writingOverlay.style.transition    = 'opacity 0.3s ease';
  writingOverlay.style.opacity       = '1';
  writingOverlay.style.pointerEvents = 'all';
  bookPage.style.opacity             = '0';
  bookPage.style.pointerEvents       = 'none';
}

btnBackToChat?.addEventListener('click', () => {
  stopCurrentAudio();
  stopAudiobook();
  showPanel('chat');
});

// ════════════════════════════════════════
//  AUDIOLIBRO — /api/read_archive
// ════════════════════════════════════════

btnListenAudiobook?.addEventListener('click', async () => {
  if (userSubscription === 'free') { openUpsell('premium', t('upsell_audiobook')); return; }
  // Se audio è in riproduzione → pausa/riprendi
  if (audiobookAudio && !audiobookAudio.ended) {
    if (audiobookAudio.paused) {
      audiobookAudio.play();
      if (btnAudiobookPause) btnAudiobookPause.textContent = t('audiobook_pause');
    } else {
      audiobookAudio.pause();
      if (btnAudiobookPause) btnAudiobookPause.textContent = t('audiobook_resume');
    }
    return;
  }

  // Genera nuovo audio
  if (!currentBookContent || !SESSION_ID) return;

  // Estrai testo puro dall'HTML del libro
  const tmpDiv   = document.createElement('div');
  tmpDiv.innerHTML = currentBookContent;
  const plainText = tmpDiv.innerText || tmpDiv.textContent || '';
  if (!plainText.trim()) return;

  setAudiobookLoading(true);

  try {
    const fd = new FormData();
    fd.append('session_id',    SESSION_ID);
    fd.append('text',          plainText.trim());
    fd.append('voice_setting', localStorage.getItem('legacy_voice') || 'shimmer');

    const res  = await fetch(`${API_BASE}/api/read_archive`, { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

    setAudiobookLoading(false);
    playAudiobook('data:audio/mp3;base64,' + data.audio_base64);
    addSystemNote(`// Audiolibro — ${data.tts_provider === 'elevenlabs' ? 'Voce clonata ✦' : 'Voce standard'}`);

  } catch (err) {
    console.error('[Legacy] read_archive:', err);
    setAudiobookLoading(false);
    addAIBubble(t('audiobook_error'), true);
    showPanel('chat');
  }
});

function playAudiobook(src) {
  stopAudiobook();
  audiobookAudio = new Audio(src);

  // Mostra player
  audiobookPlayer?.classList.add('visible');
  if (btnListenLabel) btnListenLabel.textContent = t('audiobook_pause');
  if (btnListenIcon)  btnListenIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');

  // Aggiorna progress bar
  audiobookAudio.addEventListener('timeupdate', () => {
    if (!audiobookAudio.duration) return;
    const pct = (audiobookAudio.currentTime / audiobookAudio.duration) * 100;
    if (audiobookProgress) audiobookProgress.style.width = pct + '%';
    const cur = formatAudioTime(audiobookAudio.currentTime);
    const tot = formatAudioTime(audiobookAudio.duration);
    if (audiobookTime) audiobookTime.textContent = `${cur} / ${tot}`;
  });

  audiobookAudio.addEventListener('ended', () => {
    audiobookPlayer?.classList.remove('visible');
    if (btnListenLabel) btnListenLabel.textContent = t('btn_listen');
    if (btnListenIcon)  btnListenIcon.setAttribute('points', '5 3 19 12 5 21 5 3');
    audiobookAudio = null;
    if (audiobookProgress) audiobookProgress.style.width = '0%';
    if (audiobookTime)     audiobookTime.textContent = '0:00';
  });

  audiobookAudio.play().catch(err => console.error('[Legacy] Audiobook play error:', err));
}

function stopAudiobook() {
  if (audiobookAudio) {
    audiobookAudio.pause();
    audiobookAudio.currentTime = 0;
    audiobookAudio = null;
  }
  audiobookPlayer?.classList.remove('visible');
  if (btnListenLabel)    btnListenLabel.textContent = t('btn_listen');
  if (btnListenIcon)     btnListenIcon.setAttribute('points', '5 3 19 12 5 21 5 3');
  if (audiobookProgress) audiobookProgress.style.width = '0%';
  if (audiobookTime)     audiobookTime.textContent = '0:00';
}

function setAudiobookLoading(loading) {
  if (btnListenLabel)   btnListenLabel.textContent = loading ? t('btn_listen_loading') : t('btn_listen');
  if (btnListenSpinner) btnListenSpinner.classList.toggle('hidden', !loading);
  if (btnListenAudiobook) btnListenAudiobook.disabled = loading;
}

function formatAudioTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2,'0')}`;
}

// Pausa / Stop dall'audiolibro player
btnAudiobookPause?.addEventListener('click', () => {
  if (!audiobookAudio) return;
  if (audiobookAudio.paused) {
    audiobookAudio.play();
    btnAudiobookPause.textContent = t('audiobook_pause');
  } else {
    audiobookAudio.pause();
    btnAudiobookPause.textContent = t('audiobook_resume');
  }
});

btnAudiobookStop?.addEventListener('click', () => stopAudiobook());

// ════════════════════════════════════════
//  EDITOR MANUALE ARCHIVIO
// ════════════════════════════════════════

let archiveEditing = false;

btnEditArchive?.addEventListener('click', async () => {
  if (userSubscription === 'free') { openUpsell('premium', t('upsell_edit_archive')); return; }
  if (!archiveEditing) {
    // ── Entra in modalità modifica ──────────────────────────────
    archiveEditing = true;
    bookContent.setAttribute('contenteditable', 'true');
    bookContent.style.outline      = '1.5px solid rgba(255,200,50,0.5)';
    bookContent.style.borderRadius = '8px';
    bookContent.style.background   = 'rgba(255,200,50,0.03)';
    bookContent.style.cursor       = 'text';
    bookContent.focus();

    // Stile bottone → Salva
    btnEditArchive.style.background = 'rgba(255,200,50,0.18)';
    btnEditArchive.style.borderColor = 'rgba(255,200,50,0.7)';
    btnEditArchive.style.color       = 'rgba(255,200,50,1)';
    if (btnEditArchiveLabel) btnEditArchiveLabel.textContent = t('btn_save_archive');

  } else {
    // ── Salva e torna alla modalità lettura ─────────────────────
    archiveEditing = false;
    bookContent.setAttribute('contenteditable', 'false');
    bookContent.style.outline     = '';
    bookContent.style.borderRadius = '';
    bookContent.style.background  = '';
    bookContent.style.cursor      = '';

    // Ripristina stile bottone
    btnEditArchive.style.background  = 'rgba(255,200,50,0.08)';
    btnEditArchive.style.borderColor = 'rgba(255,200,50,0.3)';
    btnEditArchive.style.color       = 'rgba(255,200,50,0.8)';
    if (btnEditArchiveLabel) btnEditArchiveLabel.textContent = t('btn_edit_saving');
    btnEditArchive.disabled = true;

    // Aggiorna currentBookContent con il testo modificato
    const updatedHtml = bookContent.innerHTML;
    currentBookContent = updatedHtml;

    // Salva su Supabase tramite backend
    try {
      const res = await fetch(
        `${API_SESSIONS}/${encodeURIComponent(SESSION_ID)}/archive`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ new_content: updatedHtml }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      addSystemNote('// Archivio aggiornato ✓');
    } catch (err) {
      console.error('[Legacy] update_archive:', err);
      addSystemNote('// Errore salvataggio archivio — riprova.');
    } finally {
      if (btnEditArchiveLabel) btnEditArchiveLabel.textContent = t('btn_edit_archive');
      btnEditArchive.disabled = false;
    }
  }
});

// ── Scarica libro in PDF ──────────────────────────────────────────────────────
btnDownloadPdf?.addEventListener('click', async () => {
  if (userSubscription === 'free') { openUpsell('premium'); return; }
  if (!bookContent || !bookContent.innerHTML.trim()) return;

  // Feedback visivo
  if (btnDownloadPdfLabel) btnDownloadPdfLabel.textContent = t('btn_pdf_generating');
  if (btnDownloadPdf) btnDownloadPdf.disabled = true;

  // Nome file dinamico basato sul protagonista
  const safeName = (protagonistName || t('pdf_safename'))
    .replace(/[^a-zA-Z0-9_À-ÿ\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const filename = `Biografia_${safeName}_Legacy.pdf`;

  // Contenitore temporaneo clonato per il PDF (escluso il chrome dell'interfaccia)
  const clone = bookContent.cloneNode(true);
  clone.style.cssText = [
    'font-family: Georgia, serif',
    'font-size: 12pt',
    'line-height: 1.8',
    'color: #1a1a1a',
    'background: #ffffff',
    'padding: 0',
    'margin: 0',
  ].join(';');

  // Forza stili leggibili su sfondo bianco per tutti gli elementi
  clone.querySelectorAll('h1').forEach(el => {
    el.style.cssText = 'font-size:22pt;font-weight:700;color:#2d1b69;margin-bottom:14pt;font-family:Georgia,serif';
  });
  clone.querySelectorAll('h2').forEach(el => {
    el.style.cssText = 'font-size:15pt;font-weight:600;color:#4c1d95;margin:16pt 0 8pt;font-family:Georgia,serif';
  });
  clone.querySelectorAll('p').forEach(el => {
    el.style.cssText = 'font-size:11pt;line-height:1.85;color:#1a1a2e;margin-bottom:10pt;font-family:Georgia,serif';
  });
  clone.querySelectorAll('figure').forEach(el => {
    el.style.cssText = 'text-align:center;margin:16pt 0;page-break-inside:avoid';
  });
  clone.querySelectorAll('figure img').forEach(el => {
    el.style.cssText = 'max-width:80%;border-radius:8pt;border:1px solid #e0d7f5;display:block;margin:0 auto';
    // Assicura che l'immagine sia accessibile cross-origin per html2pdf
    el.crossOrigin = 'anonymous';
  });
  clone.querySelectorAll('figcaption').forEach(el => {
    el.style.cssText = 'font-size:9pt;color:#6d28d9;margin-top:4pt;font-style:italic';
  });

  const opt = {
    margin:      [15, 18, 15, 18],   // top, right, bottom, left — mm
    filename:    filename,
    image:       { type: 'jpeg', quality: 0.92 },
    html2canvas: {
      scale:           2,
      useCORS:         true,           // fondamentale per le immagini Supabase
      allowTaint:      false,
      backgroundColor: '#ffffff',
      logging:         false,
    },
    jsPDF: {
      unit:        'mm',
      format:      'a4',
      orientation: 'portrait',
    },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  try {
    await html2pdf().set(opt).from(clone).save();
  } catch (err) {
    console.error('[Legacy] Errore PDF:', err);
    alert('Errore durante la generazione del PDF. Riprova.');
  } finally {
    if (btnDownloadPdfLabel) btnDownloadPdfLabel.textContent = t('btn_pdf');
    if (btnDownloadPdf) btnDownloadPdf.disabled = false;
  }
});

// ════════════════════════════════════════
//  NAVIGAZIONE
// ════════════════════════════════════════

function showView(name) {
  const map = { landing: landingView, auth: authView, app: appLayout };
  Object.entries(map).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle('visible', k === name);
    el.classList.toggle('hidden',  k !== name);
  });
}

function showPanel(name) {
  // Ferma sempre l'audio chat quando si cambia panel
  stopCurrentAudio();
  // 1. Nasconde tutti i panel — preserva gli stili inline strutturali di panelChat
  [panelSetup, panelChat, panelBook, panelSettings].forEach(el => {
    if (!el) return;
    // Non rimuovere style su panelChat — ha flex-direction:column;height:100% inline
    if (el.id !== 'panelChat') el.removeAttribute('style');
    el.classList.remove('visible');
    el.classList.add('hidden');
  });
  // 2. Nasconde empty state
  if (emptyState) {
    emptyState.removeAttribute('style');
    emptyState.classList.remove('visible');
    emptyState.classList.add('hidden');
  }
  // 3. Attiva solo il panel richiesto
  const panels = { setup: panelSetup, chat: panelChat, book: panelBook, settings: panelSettings };
  const target = panels[name];
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('visible');
    // panelChat usa flex-direction:column inline — impostiamo solo display
    if (name === 'chat') target.style.display = 'flex';
    else if (name === 'book') {
      target.style.display = 'flex';
      if (bookVoiceSection) bookVoiceSection.classList.remove('hidden');
    }
  }
  sidebarSettings?.classList.toggle('active', name === 'settings');
  toggleSidebar(false);
}

function showEmptyState() {
  sessionImageCount = 0; // reset contatore immagini al cambio sessione
  // Nasconde tutti i panel con reset stili inline
  [panelSetup, panelChat, panelBook, panelSettings].forEach(el => {
    if (!el) return;
    el.removeAttribute('style');
    el.classList.remove('visible');
    el.classList.add('hidden');
  });
  // Mostra empty state
  if (emptyState) {
    emptyState.removeAttribute('style');
    emptyState.classList.remove('hidden');
    emptyState.classList.add('visible');
  }
  sidebarSettings?.classList.remove('active');
  toggleSidebar(false);
}

window.toggleSidebar = function(open) {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  sb?.classList.toggle('open', open);
  if (ov) ov.style.display = open ? 'block' : 'none';
};

// ════════════════════════════════════════
//  AVVIO APP
// ════════════════════════════════════════

let appInitialized = false;

async function initApp(session) {
  if (appInitialized) return;
  appInitialized = true;

  USER_ID  = session.user.id;
  userName = session.user.email?.split('@')[0] || 'Utente';
  if (settingsEmail) settingsEmail.textContent = session.user.email || '';

  // Nascondi auth, mostra app subito — non aspettare subscription/terms
  showView('app');

  // Esegui subscription e terms check in parallelo, senza bloccare la UI
  Promise.allSettled([
    loadUserSubscription(),
    checkAndShowTermsGate(),
  ]);

  // Carica sessioni e ripristina ultima chat
  let sessions = [];
  try { sessions = await loadSessions() || []; }
  catch (e) { console.warn('[Legacy] loadSessions:', e.message); }

  const lastId = localStorage.getItem(LS_LAST_SESSION);
  if (lastId) {
    try {
      const history = await fetchHistory(lastId);
      if (history && history.length > 0) {
        SESSION_ID = lastId;
      sessionImageCount = 0; // reset contatore per sessione ripristinata
        const savedSetup = loadSetupFromStorage();
        if (savedSetup) {
          protagonistName  = savedSetup.name;
          protagonistGender = savedSetup.gender;
          biographyTone    = savedSetup.tone;
        }
        const sessionData = sessions.find(s => s.session_id === lastId);
        updateBookButtons(sessionData?.book_content || null);
        currentStoryType = sessionData?.story_type || 'personale';
        updateChatHeader();
        showPanel('chat');
        renderHistory(history, currentStoryType);
        addSystemNote(t('session_restored'));
        scrollDown();
        markActiveSession(lastId);
        return;
      }
    } catch (e) { console.warn('[Legacy] fetchHistory:', e.message); }
  }

  showEmptyState();
}

// Controlla sessione immediatamente al caricamento
async function checkInitialSession() {
  try {
    const { data: { session }, error } = await sbClient.auth.getSession();
    if (error) throw error;
    if (session) {
      await initApp(session);
    } else {
      showView('landing');
    }
  } catch (e) {
    console.error('[Legacy] checkInitialSession error:', e);
    showView('landing');
  }
}

// onAuthStateChange: gestisce login/logout/OAuth successivi
sbClient.auth.onAuthStateChange(async (event, session) => {
  console.log('[Legacy] auth event:', event);
  if (event === 'SIGNED_OUT') {
    appInitialized = false;
    USER_ID = null;
    showView('landing');
  } else if (session && !appInitialized) {
    // Scatta per SIGNED_IN (login classico, Google OAuth redirect)
    await initApp(session);
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  applySettingsToUI();
  await checkInitialSession(); // chiamata immediata, senza timeout
});

// ════════════════════════════════════════
//  SESSIONI — LISTA SIDEBAR
// ════════════════════════════════════════

async function loadSessions() {
  if (!USER_ID) return [];
  try {
    const res  = await fetch(`${API_SESSIONS}/${encodeURIComponent(USER_ID)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    renderSessionsList(data.sessions || []);
    return data.sessions || [];
  } catch (err) {
    console.error('[Legacy] loadSessions error:', err.message);
    if (storiesList) storiesList.innerHTML = `<div class="font-mono text-[10px] px-2 py-3 text-center" style="color:rgba(255,45,85,0.5)">${t('stories_error')}: ${err.message}</div>`;
    return [];
  }
}

function renderSessionsList(sessions) {
  if (!storiesList) return;
  if (sessions.length === 0) {
    storiesList.innerHTML = `<div class="font-mono text-[10px] px-2 py-3 text-center" style="color:rgba(255,255,255,0.2)">${t('stories_empty')}</div>`;
    return;
  }
  storiesList.innerHTML = sessions.map(s => {
    const hasVoice = !!localStorage.getItem(`${LS_CLONED_VOICE}_${s.session_id}`);
    return `
    <div class="story-item ${s.session_id === SESSION_ID ? 'active' : ''}"
         data-session-id="${s.session_id}"
         data-book="${s.book_content ? '1' : '0'}"
         onclick="openSession('${s.session_id}', '${escapeAttr(s.title)}')">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
           stroke="${s.book_content ? 'rgba(168,85,247,0.6)' : 'currentColor'}"
           stroke-width="2" stroke-linecap="round" style="flex-shrink:0">
        ${s.book_content
          ? '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>'
          : '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>'}
      </svg>
      ${hasVoice ? '<span class="voice-dot" title="Voce clonata"></span>' : ''}
      <span class="truncate flex-1">${escapeHtml(s.title)}</span>
      <button class="btn-rename" onclick="renameSession(event,'${s.session_id}','${escapeAttr(s.title)}')" title="Rinomina">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(0,245,255,0.45)" stroke-width="2" stroke-linecap="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn-trash" onclick="deleteSession(event,'${s.session_id}','${escapeAttr(s.title)}')" title="Elimina">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,45,85,0.5)" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>`;
  }).join('');
}

function markActiveSession(sessionId) {
  document.querySelectorAll('.story-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sessionId === sessionId);
  });
}

async function openSession(sessionId, title) {
  if (sessionId === SESSION_ID) { showPanel('chat'); return; }
  // Primo click utente → avvia ambient se impostato
  if (selectedAmbient !== 'none' && ambientAudio.paused) applyAmbient(selectedAmbient);
  // empty state viene nascosto da showPanel
  stopCurrentAudio();
  SESSION_ID      = sessionId;
  protagonistName = title;
  biographyTone   = 'Nostalgico ed Emozionale';
  currentBookContent = null;
  messagesSinceBook  = 0;
  localStorage.setItem(LS_LAST_SESSION, sessionId);
  markActiveSession(sessionId);

  const [history, sessions] = await Promise.all([fetchHistory(sessionId), loadSessions()]);
  const sessionData = (sessions || []).find(s => s.session_id === sessionId);
  updateBookButtons(sessionData?.book_content || null);
  currentStoryType = sessionData?.story_type || 'personale';

  if (chatArea) chatArea.innerHTML = '';
  renderHistory(history, currentStoryType);
  addSystemNote(t('session_loaded') + title);
  scrollDown();
  updateChatHeader();
  // Aggiorna UI voice clone per la sessione appena aperta
  const hasVoice = !!localStorage.getItem(`${LS_CLONED_VOICE}_${sessionId}`);
  updateVoiceCloneUI(hasVoice);
  showPanel('chat');
}
window.openSession = openSession;

async function fetchHistory(sessionId) {
  try {
    const res = await fetch(`${API_HISTORY_URL}/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  } catch { return []; }
}

function renderHistory(messages, storyType) {
  if (!chatArea) return;
  if (messages.length === 0) {
    // Chat vuota — inietta messaggio di benvenuto contestuale
    addWelcomeMessageForType(storyType || currentStoryType || 'personale');
    return;
  }
  messages.forEach(msg => {
    if (msg.role === 'user') addUserBubble(msg.content, msg.image_url || null);
    else addAIBubble(msg.content, false);
  });
}

async function deleteSession(event, sessionId, title) {
  event.stopPropagation();
  if (!confirm(`Sei sicuro di voler eliminare l'archivio di "${title}"?\nQuesta azione è irreversibile.`)) return;
  try {
    const res = await fetch(`${API_SESSIONS}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (sessionId === SESSION_ID) {
      SESSION_ID = null; currentBookContent = null; messagesSinceBook = 0;
      localStorage.removeItem(LS_LAST_SESSION);
      if (chatArea) chatArea.innerHTML = '';
      updateBookButtons(null);
      showEmptyState();
    }
    await loadSessions();
  } catch (err) {
    console.error('[Legacy] deleteSession:', err);
    alert('Errore durante l\'eliminazione. Riprova.');
  }
}
window.deleteSession = deleteSession;

async function renameSession(event, sessionId, currentTitle) {
  event.stopPropagation();
  const newTitle = prompt('Inserisci il nuovo nome per questa storia:', currentTitle);
  if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) return;

  try {
    const res = await fetch(`${API_SESSIONS}/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }

    // Se è la sessione corrente aggiorna anche l'header
    if (sessionId === SESSION_ID) {
      protagonistName = newTitle.trim();
      updateChatHeader();
    }

    await loadSessions();
  } catch (err) {
    console.error('[Legacy] renameSession:', err);
    alert('Errore durante la rinomina. Riprova.');
  }
}
window.renameSession = renameSession;

// ════════════════════════════════════════
//  MODAL: NUOVA INTERVISTA
// ════════════════════════════════════════

function openNewInterviewModal() {
  // Apre prima la path selection modal
  openPathSelectionModal();
}
window.openNewInterviewModal = openNewInterviewModal;

// ── Path Selection Modal ──────────────────────────────────────────────────────
function openPathSelectionModal() {
  if (!pathSelectionModal) return;
  pathSelectionModal.classList.add('open');
}

function closePathSelectionModal(event) {
  if (event && event.target !== pathSelectionModal) return;
  pathSelectionModal?.classList.remove('open');
}
window.closePathSelectionModal = closePathSelectionModal;

window.selectPathType = function(type) {
  pendingStoryType = type;
  pathSelectionModal?.classList.remove('open');

  // Piccolo delay per la transizione, poi apre la modale nome
  setTimeout(() => {
    if (!modalNewInterview) return;
    if (modalProtagonistName) modalProtagonistName.value = '';
    if (modalError) modalError.textContent = '';
    modalGenderPills.forEach(p => p.classList.remove('active'));
    modalGenderPills[0]?.classList.add('active');

    // Aggiorna sottotitolo e label nome in base allo story_type
    const subtitleEl = modalNewInterview.querySelector('[data-i18n="modal_subtitle"]');
    if (subtitleEl) {
      const promptKey = {
        personale: 'path_name_prompt_personal',
        coppia:    'path_name_prompt_couple',
        famiglia:  'path_name_prompt_family',
      }[type] || 'path_name_prompt_personal';
      subtitleEl.textContent = t(promptKey);
    }
    // Aggiorna anche la label del campo nome
    const nameLabelEl = modalNewInterview.querySelector('[data-i18n="modal_name_label"]');
    if (nameLabelEl) {
      const labelKey = {
        personale: 'path_label_personal',
        coppia:    'path_label_couple',
        famiglia:  'path_label_family',
      }[type] || 'path_label_personal';
      nameLabelEl.textContent = t(labelKey);
    }

    modalNewInterview.classList.add('open');
    setTimeout(() => modalProtagonistName?.focus(), 100);
  }, 150);
};

btnNewInterview?.addEventListener('click', async () => {
  // Paywall: free può avere max 1 sessione
  if (userSubscription === 'free') {
    const sessions = await loadSessions();
    if (sessions && sessions.length >= FREE_SESSION_LIMIT) {
      openUpsell('premium', 'Con il piano gratuito puoi avere solo 1 storia attiva. Passa a Premium per storie illimitate.');
      return;
    }
  }
  openNewInterviewModal();
});
window.closeNewInterviewModal = function(event) {
  if (event && event.target !== modalNewInterview) return;
  modalNewInterview?.classList.remove('open');
};

modalGenderPills.forEach(pill => {
  pill.addEventListener('click', () => {
    modalGenderPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  });
});

modalProtagonistName?.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnModalCreate?.click();
  if (e.key === 'Escape') closeNewInterviewModal();
});

btnModalCreate?.addEventListener('click', async () => {
  const name = modalProtagonistName?.value.trim();
  if (!name) { if (modalError) modalError.textContent = '// Inserisci il nome del protagonista.'; return; }
  if (modalError) modalError.textContent = '';

  const gender = document.querySelector('.modal-gender-pill.active')?.dataset.gender || 'M';
  const tone   = modalTone?.value || 'Nostalgico ed Emozionale';

  if (btnModalCreateLabel) btnModalCreateLabel.textContent = t('modal_creating');
  if (btnModalCreateSpinner) btnModalCreateSpinner.classList.remove('hidden');
  if (btnModalCreate) btnModalCreate.disabled = true;

  try {
    const fd = new FormData();
    fd.append('user_id',    USER_ID);
    fd.append('title',      name);
    fd.append('story_type', pendingStoryType || 'personale');
    const res  = await fetch(API_SESSIONS, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Errore creazione sessione');

    SESSION_ID = data.session_id;
    protagonistName = name; protagonistGender = gender; biographyTone = tone; userName = name;
    currentStoryType = pendingStoryType;   // applica il tipo scelto alla sessione corrente
    pendingStoryType = 'personale';        // reset per la prossima sessione
    updateBookButtons(null);
    saveSetupToStorage(name, gender, tone);
    localStorage.setItem(LS_LAST_SESSION, SESSION_ID);
    modalNewInterview?.classList.remove('open');
    if (chatArea) chatArea.innerHTML = '';
    updateChatHeader();
    await loadSessions();
    markActiveSession(SESSION_ID);
    showPanel('chat');
    setTimeout(() => addWelcomeMessage(), 300);
  } catch (err) {
    console.error('[Legacy]', err);
    if (modalError) modalError.textContent = '// ' + err.message;
  } finally {
    if (btnModalCreateLabel) btnModalCreateLabel.textContent = t('modal_cta');
    if (btnModalCreateSpinner) btnModalCreateSpinner.classList.add('hidden');
    if (btnModalCreate) btnModalCreate.disabled = false;
  }
});

// ════════════════════════════════════════
//  SETUP (primo accesso)
// ════════════════════════════════════════

// Bottoni onboarding (empty state + panel setup) → aprono la path modal
function handleStartJourney() {
  // Paywall: free con 1+ sessione → upsell
  if (userSubscription === 'free') {
    loadSessions().then(sessions => {
      if (sessions && sessions.length >= FREE_SESSION_LIMIT) {
        openUpsell('premium', 'Con il piano gratuito puoi avere solo 1 storia attiva. Passa a Premium per storie illimitate.');
      } else {
        openPathSelectionModal();
      }
    });
  } else {
    openPathSelectionModal();
  }
}

btnStartFirstJourney?.addEventListener('click', handleStartJourney);
btnSetupCTA?.addEventListener('click', handleStartJourney);

function updateChatHeader() {
  if (headerSubtitle)  headerSubtitle.textContent  = protagonistName || userName;
  if (headerToneLabel) headerToneLabel.textContent = t('header_tone_prefix') + biographyTone;
}

// ════════════════════════════════════════
//  IMPOSTAZIONI
// ════════════════════════════════════════


// ════════════════════════════════════════
//  INTERNAZIONALIZZAZIONE (i18n)
// ════════════════════════════════════════

const translations = {
  it: {
    // Auth
    auth_google_btn:      'Continua con Google',
    auth_divider:         'oppure',
    auth_login_tab:       'Accedi',
    auth_register_tab:    'Crea Account',
    auth_login_btn:       'Accedi',
    auth_register_btn:    'Crea Account',
    // Sidebar
    sidebar_new_interview:'Nuova Intervista',
    sidebar_interview:    'Intervista',
    sidebar_my_stories:   'Le mie Storie',
    sidebar_settings:     'Impostazioni',
    sidebar_logout:       'Esci',
    // Empty state
    empty_title:          'Caveau dei Ricordi',
    // Onboarding unificato
    onboarding_title:     'Benvenuto su Legacy.',
    onboarding_sub:       "Scegli un percorso e inizia a trasformare i tuoi ricordi in un'eredità senza tempo.",
    onboarding_cta:       'Inizia un nuovo percorso',
    onboarding_hint:      'o seleziona una storia dalla sidebar',
    empty_subtitle:       'Il tuo archivio biografico personale',
    empty_body:           'Seleziona una storia dalla sidebar oppure inizia subito a registrare un nuovo ricordo.',
    empty_cta:            'Crea Nuova Intervista',
    // Setup
    setup_title:          'Setup Sessione',
    setup_subtitle:       'Personalizza la tua esperienza',
    setup_cta:            'Crea la tua Legacy',
    // Chat
    chat_header_title:    'Intervista in corso',
    chat_input_placeholder:'Scrivi il tuo ricordo...',
    mic_status:           'Oppure tocca per parlare',
    mic_recording:        'Registrazione…',
    mic_processing:       'Elaborazione…',
    btn_generate:         'Genera Biografia',
    btn_generate_short:   'Crea archivio',
    btn_read:             'Leggi Archivio',
    btn_update:           'Aggiorna',
    btn_back:             'Torna',
    btn_copy:             'Copia',
    btn_copied:           '✓ Copiato!',
    btn_replay:           'Riascolta',
    btn_pdf:              'PDF',
    btn_edit_archive:     'Modifica',
    btn_save_archive:     'Salva',
    btn_edit_saving:      'Salvataggio…',
    btn_pdf_generating:   'Generazione…',
    // Modal
    modal_title:          'Nuova Intervista',
    modal_subtitle:       'A chi appartengono questi ricordi?',
    modal_cta:            'Crea e Inizia',
    modal_creating:       'Creazione…',
    // Settings
    settings_title:       'Impostazioni',
    settings_subtitle:    'Personalizza la tua esperienza Legacy',
    settings_section_experience: 'Esperienza',
    settings_section_account:    'Account',
    settings_language:    'Lingua',
    settings_language_sub:'Cambia la lingua dell\'interfaccia',
    settings_change_pw:   'Cambia',
    // System notes
    session_restored:     '// Sessione ripristinata — puoi continuare.',
    session_loaded:       '// Caricata: ',
    // Sidebar lista
    stories_empty:        'Nessuna storia ancora',
    stories_loading:      'Caricamento…',
    stories_error:        'Errore caricamento',
    // Modal nuova intervista
    modal_name_label:     'Nome del protagonista',
    modal_name_placeholder: 'Es. Nonno Antonio, Nonna Maria…',
    // Setup
    setup_name_label:     'Inserisci il tuo nome',
    setup_name_placeholder: 'Come ti chiami?',
    // Genere
    label_gender:         'Genere',
    gender_m:             'Uomo',
    gender_f:             'Donna',
    gender_other:         'Altro',
    // Stile
    label_style:          'Stile del Biografo',
    tone_nostalgic:       'Nostalgico ed Emozionale',
    tone_adventurous:     'Avventuroso e Dinamico',
    tone_light:           'Leggero e Divertente',
    // Settings voce
    settings_voice_label: "Voce dell'IA",
    settings_voice_sub:   'Seleziona la voce per le risposte',
    voice_shimmer:        'Shimmer — Calda',
    voice_onyx:           'Onyx — Profonda',
    voice_nova:           'Nova — Vivace',
    voice_alloy:          'Alloy — Neutrale',
    // Settings ambient
    settings_ambient_label: 'Atmosfera Sonora',
    settings_ambient_sub: "Musica di sottofondo durante l'intervista",
    ambient_none:         '— Nessuna —',
    ambient_rain:         '🌧 Pioggia',
    ambient_fire:         '🔥 Camino',
    ambient_sea:          '🌊 Mare',
    ambient_night:        '🌙 Notte',
    // Settings autoplay
    settings_autoplay_label: 'Riproduzione Automatica',
    settings_autoplay_sub: "Riproduci l'audio dell'IA automaticamente",
    // Settings account
    settings_email_label: 'Email',
    settings_password_label: 'Password',
    settings_password_sub: 'Aggiorna le credenziali',
    settings_danger_zone: 'Zona Pericolosa',
    settings_delete_label: 'Elimina Account',
    settings_delete_sub:  'Azione irreversibile. Tutti i dati verranno persi.',
    settings_delete_btn:  'Elimina',
    // Auth
    auth_email_label:     'Email',
    auth_password_label:  'Password',
    auth_email_placeholder: 'nome@email.com',
    auth_pw_placeholder:  '••••••••',
    btn_back_auth:        'Indietro',
    // Book
    book_brand:           'LEGACY //',
    book_datapad:         'Data-Pad',
    badge_live:           'Live',
    // Chat tone label
    header_tone_prefix:   'Stile: ',
    // Welcome message
    welcome_greeting:     'Ciao',
    welcome_body:         'Sono qui per aiutarti a custodire la tua storia.',
    welcome_question:     'Cominciamo dall\'inizio. Dove sei nato e cresciuto?',
    // Welcome per tipo storia
    welcome_personal: 'Ciao! Sono qui per aiutarti a scrivere la tua storia. Partiamo dall\'inizio: qual è il tuo primo ricordo in assoluto, o il momento in cui hai capito cosa volevi fare da grande?',
    welcome_couple:   'Benvenuti! Le storie d\'amore sono le mie preferite. Rompiamo il ghiaccio: vi ricordate il giorno esatto e il luogo in cui vi siete visti per la prima volta?',
    welcome_family:   'Ciao. È un onore aiutarvi a custodire questa eredità. Da dove vogliamo iniziare? Raccontatemi un aneddoto lontano nel tempo, magari legato ai vostri nonni o a una vecchia casa di famiglia.',
    // Errori
    err_connection:       '// ERRORE: connessione interrotta.',
    err_mic_denied:       '// Permesso microfono negato.',
    err_mic_notfound:     '// Nessun microfono rilevato.',
    err_mic_browser:      '// Browser non supportato.',
    err_mic_generic:      '// Microfono non accessibile.',
    err_timeout:          '// TIMEOUT: riprova.',
    // Auth loading
    auth_loading_login:   'Accesso…',
    auth_loading_register:'Creazione…',
    // Fumetto AI label
    ai_label:             'Legacy AI',
    // Book overlay
    book_compiling:       'Compilazione in corso',
    book_analyzing:       'Analisi dei ricordi… ~15 sec',
    // PDF
    pdf_safename:         'Biografia',
    // Landing
    landing_login:        'Accedi',
    landing_nav_cta:      'Inizia Gratis',
    landing_badge:        'Startup del 2026 — Powered by AI',
    landing_hero_1:       'Custodisci le Voci.',
    landing_hero_2:       'Stampa i Ricordi.',
    landing_hero_sub:     'Legacy è il biografo AI che trasforma i tuoi ricordi e le tue foto in un libro romanzato, pronto da leggere e scaricare in PDF. Gratis.',
    landing_cta_hero:     'Inizia Ora — È Gratis',
    landing_scroll:       'Scopri di più ↓',
    landing_trust_1:      'Fine-to-end cifrato',
    landing_trust_2:      'Nessuna carta richiesta',
    landing_trust_3:      'Export PDF incluso',
    landing_stat1:        'Storie salvate',
    landing_stat2:        'Soddisfazione',
    landing_stat3:        'Memoria',
    landing_how_title:    'Come funziona',
    landing_how_sub:      'Tre passi. Una vita intera preservata.',
    landing_step1_num:    'Passo 01',
    landing_step2_num:    'Passo 02',
    landing_step3_num:    'Passo 03',
    landing_step1_title:  'Parla o scrivi in modo naturale',
    landing_step2_title:  'Aggiungi le tue foto più care',
    landing_step3_title:  'Il tuo libro, pronto da scaricare',
    landing_step1_body:   "Il nostro biografo AI ti fa domande empatiche e guidate. Rispondi con la voce o con la tastiera — anche in dialetto.",
    landing_step2_body:   "Carica le immagini direttamente dalla chat. L'IA le vede, le commenta e le inserisce nel libro al momento giusto.",
    landing_step3_body:   "Claude impagina tutto in un capitolo biografico romanzato. Un click e hai il PDF da stampare, regalare, conservare per sempre.",
    landing_for_badge:    'Per chi è Legacy',
    landing_for_title:    'Ogni storia merita',
    landing_for_title2:   'di essere raccontata.',
    landing_for1_label:   'Per le Coppie',
    landing_for2_label:   'Per la Famiglia',
    landing_for3_label:   'Per Te',
    landing_for1_title:   "Rivivi la vostra storia d'amore",
    landing_for2_title:   "Custodisci l'eredità di chi ami",
    landing_for3_title:   'Un diario terapeutico della tua crescita',
    landing_for1_body:    'Dal primo incontro alle avventure condivise. Trasforma i vostri ricordi in un romanzo da rileggere ogni anniversario.',
    landing_for2_body:    'Le storie della tua famiglia sono un tesoro che rischia di andare perduto. Legacy le preserva in un libro che i tuoi cari leggeranno per sempre.',
    landing_for3_body:    'Metti a fuoco chi eri, chi sei e dove stai andando. Scrivere di sé è il primo passo per capirsi davvero.',
    landing_for1_tag:     'Perfetto come regalo di nozze ✦',
    landing_for2_tag:     "Il regalo più prezioso per la famiglia ✦",
    landing_for3_tag:     'Riflessione e crescita personale ✦',
    landing_reviews_badge:'★★★★★ 4.9/5 — Oltre 12.000 storie salvate',
    landing_reviews_title:'Chi ha già lasciato la sua Legacy.',
    landing_footer_badge: 'Gratuito per sempre · Nessuna carta',
    landing_footer_title: 'La loro storia merita di esistere.',
    landing_footer_sub:   'Ogni giorno che passa, un ricordo rischia di andare perduto. Inizia oggi. Bastano 10 minuti.',
    landing_cta_footer:   'Crea la tua Legacy gratis →',
    landing_g1:           '✓ Zero pubblicità',
    landing_g2:           '✓ I tuoi dati restano tuoi',
    landing_g3:           '✓ PDF illimitati',
    landing_copyright:    '© 2026 Legacy — Tutti i diritti riservati',
    // Sezione Magia
    magic_badge:          'Scopri la Magia',
    magic_title_1:        'Il risultato finale,',
    magic_title_2:        'in anteprima.',
    magic_sub:            'Questo è ciò che otterrai. Una storia. Una voce. Un libro.',
    magic_audio_badge:    'Voce Originale · Clonata con IA',
    magic_audio_title:    'Il ricordo di un viaggio',
    magic_audio_sub:      'Capitolo I · Il nostro primo viaggio',
    magic_book_title:     'La tua storia, impaginata',
    magic_book_sub:       'Pronto da stampare o condividere',
    magic_book_cta:       'Export PDF · Alta qualità · Un click',
    // Voice cloning
    settings_section_voice_clone: 'Voce Originale',
    voice_clone_label:    'Clona la tua Voce',
    voice_clone_sub:      "L'IA risponderà con la tua voce reale",
    voice_clone_active:   'Attiva',
    voice_upload_label:   'Carica audio campione (MP3 / WAV)',
    voice_upload_hint:    'Min. 30 secondi · Parlato pulito, senza musica',
    voice_clone_btn:      'Clona questa Voce',
    voice_clone_remove:   'Rimuovi voce clonata',
    voice_clone_success:  "✓ Voce clonata con successo! L'IA parlerà con la tua voce.",
    voice_clone_removed:  '// Voce rimossa — si usa di nuovo OpenAI TTS.',
    voice_clone_cloning:  'Clonazione in corso…',
    // Audiolibro
    btn_listen:           'Ascolta',
    btn_listen_loading:   'Generazione…',
    audiobook_playing:    'In riproduzione',
    audiobook_pause:      'Pausa',
    audiobook_resume:     'Riprendi',
    audiobook_stop:       'Stop',
    audiobook_error:      '// Errore generazione audio. Riprova.',
    // Path selection modal
    path_modal_title:     'Cosa vuoi creare oggi?',
    path_modal_sub:       'Scegli il tuo percorso narrativo',
    path_personal_title:  'La mia Biografia',
    path_personal_sub:    'Un percorso introspettivo per te stesso',
    path_couple_title:    'Storia di Coppia',
    path_couple_sub:      "Rivivi la vostra storia d'amore",
    path_family_title:    'Ricordi di Famiglia',
    path_family_sub:      "Custodisci l'eredità della tua famiglia",
    path_cancel:          'Annulla',
    path_name_prompt_personal:  'Come ti chiami?',
    path_label_personal: 'Inserisci il tuo nome o il titolo della tua biografia:',
    path_label_couple:   'Inserisci i vostri nomi (es. Marco e Giulia):',
    path_label_family:   'A quale famiglia o membro appartengono questi ricordi (es. Nonno Antonio)?',
    path_name_prompt_couple:    'Come vuoi chiamare la vostra storia?',
    path_name_prompt_family:    'A quale famiglia appartiene questa storia?',
    voice_panel_title:    'Voce per questa storia',
    voice_panel_status_default: 'Voce standard in uso',
    voice_panel_status_active:  'Voce originale attiva',
    // Landing extra
    landing_how_h2_1:     'Tre passi.',
    landing_how_h2_2:     'Una vita intera preservata.',
    landing_how_desc:     'Nessun corso di scrittura richiesto. Solo i tuoi ricordi.',
    landing_footer_h2_1:  'La loro storia',
    landing_footer_h2_2:  'merita di esistere.',
    landing_review1:      `"Io e mia moglie festeggiamo i 10 anni insieme. Legacy ha trasformato i nostri ricordi in un romanzo d'amore che ci ha fatto piangere e ridere. Lo rileggiamo ogni anniversario."`,
    landing_review1_name: 'Luca & Sara',
    landing_review1_meta: 'Coppia · Firenze',
    landing_review2:      `"Mio padre ha 82 anni e temevo che le sue storie si perdessero. In due pomeriggi abbiamo fatto l'intervista e il libro era pronto. Ora tutta la famiglia ha il suo pezzo di storia."`,
    landing_review2_name: 'Marco T.',
    landing_review2_meta: 'Figlio devoto · Milano',
    landing_review3:      `"Usavo Legacy come diario terapeutico dopo un momento difficile. Scrivere di me, farmi fare domande dall'IA… ha cambiato il modo in cui mi vedo. Grazie Legacy."`,
    landing_review3_name: 'Sofia R.',
    landing_review3_meta: 'Designer · Roma',
  },
  en: {
    // Auth
    auth_google_btn:      'Continue with Google',
    auth_divider:         'or',
    auth_login_tab:       'Sign In',
    auth_register_tab:    'Create Account',
    auth_login_btn:       'Sign In',
    auth_register_btn:    'Create Account',
    // Sidebar
    sidebar_new_interview:'New Interview',
    sidebar_interview:    'Interview',
    sidebar_my_stories:   'My Stories',
    sidebar_settings:     'Settings',
    sidebar_logout:       'Log Out',
    // Empty state
    empty_title:          'Memory Vault',
    // Onboarding
    onboarding_title:     'Welcome to Legacy.',
    onboarding_sub:       'Choose a path and start turning your memories into a timeless legacy.',
    onboarding_cta:       'Start a new journey',
    onboarding_hint:      'or select a story from the sidebar',
    empty_subtitle:       'Your personal biographical archive',
    empty_body:           'Select a story from the sidebar or start recording a new memory right now.',
    empty_cta:            'Create New Interview',
    // Setup
    setup_title:          'Session Setup',
    setup_subtitle:       'Customise your experience',
    setup_cta:            'Create your Legacy',
    // Chat
    chat_header_title:    'Interview in progress',
    chat_input_placeholder:'Write your memory...',
    mic_status:           'Or tap to speak',
    mic_recording:        'Recording…',
    mic_processing:       'Processing…',
    btn_generate:         'Generate Biography',
    btn_generate_short:   'Create archive',
    btn_read:             'Read Archive',
    btn_update:           'Update',
    btn_back:             'Back',
    btn_copy:             'Copy',
    btn_copied:           '✓ Copied!',
    btn_replay:           'Replay',
    btn_pdf:              'PDF',
    btn_edit_archive:     'Edit',
    btn_save_archive:     'Save',
    btn_edit_saving:      'Saving…',
    btn_edit_archive:     'Modifica',
    btn_save_archive:     'Salva',
    btn_edit_saving:      'Salvataggio…',
    btn_pdf_generating:   'Generating…',
    // Modal
    modal_title:          'New Interview',
    modal_subtitle:       'Whose memories are these?',
    modal_cta:            'Create & Start',
    modal_creating:       'Creating…',
    // Settings
    settings_title:       'Settings',
    settings_subtitle:    'Customise your Legacy experience',
    settings_section_experience: 'Experience',
    settings_section_account:    'Account',
    settings_language:    'Language',
    settings_language_sub:'Change the interface language',
    settings_change_pw:   'Change',
    // System notes
    session_restored:     '// Session restored — you can continue.',
    session_loaded:       '// Loaded: ',
    // Sidebar list
    stories_empty:        'No stories yet',
    stories_loading:      'Loading…',
    stories_error:        'Loading error',
    // Modal new interview
    modal_name_label:     'Protagonist name',
    modal_name_placeholder: 'E.g. Grandpa Antonio, Grandma Mary…',
    // Setup
    setup_name_label:     'Enter your name',
    setup_name_placeholder: 'What is your name?',
    // Gender
    label_gender:         'Gender',
    gender_m:             'Man',
    gender_f:             'Woman',
    gender_other:         'Other',
    // Style
    label_style:          'Biographer Style',
    tone_nostalgic:       'Nostalgic & Emotional',
    tone_adventurous:     'Adventurous & Dynamic',
    tone_light:           'Light & Fun',
    // Settings voice
    settings_voice_label: 'AI Voice',
    settings_voice_sub:   'Select the voice for responses',
    voice_shimmer:        'Shimmer — Warm',
    voice_onyx:           'Onyx — Deep',
    voice_nova:           'Nova — Lively',
    voice_alloy:          'Alloy — Neutral',
    // Settings ambient
    settings_ambient_label: 'Sound Atmosphere',
    settings_ambient_sub: 'Background music during the interview',
    ambient_none:         '— None —',
    ambient_rain:         '🌧 Rain',
    ambient_fire:         '🔥 Fireplace',
    ambient_sea:          '🌊 Sea',
    ambient_night:        '🌙 Night',
    // Settings autoplay
    settings_autoplay_label: 'Auto-play Audio',
    settings_autoplay_sub: 'Automatically play AI audio responses',
    // Settings account
    settings_email_label: 'Email',
    settings_password_label: 'Password',
    settings_password_sub: 'Update your credentials',
    settings_danger_zone: 'Danger Zone',
    settings_delete_label: 'Delete Account',
    settings_delete_sub:  'This action is irreversible. All data will be lost.',
    settings_delete_btn:  'Delete',
    // Auth
    auth_email_label:     'Email',
    auth_password_label:  'Password',
    auth_email_placeholder: 'name@email.com',
    auth_pw_placeholder:  '••••••••',
    btn_back_auth:        'Back',
    // Book
    book_brand:           'LEGACY //',
    book_datapad:         'Data-Pad',
    badge_live:           'Live',
    // Chat tone label
    header_tone_prefix:   'Style: ',
    // Welcome message
    welcome_greeting:     'Hello',
    welcome_body:         'I\'m here to help you preserve your story.',
    welcome_question:     'Let\'s start from the beginning. Where were you born and raised?',
    // Welcome per tipo storia
    welcome_personal: "Hello! I'm here to help you write your story. Let's start from the beginning: what is your very first memory, or the moment you realised what you wanted to do with your life?",
    welcome_couple:   "Welcome! Love stories are my favourite. Let's break the ice: do you remember the exact day and place where you first saw each other?",
    welcome_family:   "Hello. It is an honour to help you preserve this legacy. Where shall we begin? Tell me an anecdote from long ago, perhaps linked to your grandparents or an old family home.",
    // Errors
    err_connection:       '// ERROR: connection lost.',
    err_mic_denied:       '// Microphone permission denied.',
    err_mic_notfound:     '// No microphone detected.',
    err_mic_browser:      '// Browser not supported.',
    err_mic_generic:      '// Microphone not accessible.',
    err_timeout:          '// TIMEOUT: please retry.',
    // Auth loading
    auth_loading_login:   'Signing in…',
    auth_loading_register:'Creating…',
    // AI bubble label
    ai_label:             'Legacy AI',
    // Book overlay
    book_compiling:       'Compiling…',
    book_analyzing:       'Analysing memories… ~15 sec',
    // PDF
    pdf_safename:         'Biography',
    // Landing
    landing_login:        'Sign In',
    landing_nav_cta:      'Start Free',
    landing_badge:        '2026 Startup — Powered by AI',
    landing_hero_1:       'Preserve the Voices.',
    landing_hero_2:       'Print the Memories.',
    landing_hero_sub:     'Legacy is the AI biographer that turns your memories and photos into a novelised book, ready to read and download as PDF. Free.',
    landing_cta_hero:     "Start Now — It's Free",
    landing_scroll:       'Learn more ↓',
    landing_trust_1:      'End-to-end encrypted',
    landing_trust_2:      'No credit card needed',
    landing_trust_3:      'PDF export included',
    landing_stat1:        'Stories saved',
    landing_stat2:        'Satisfaction',
    landing_stat3:        'Memory',
    landing_how_title:    'How it works',
    landing_how_sub:      'Three steps. An entire life preserved.',
    landing_step1_num:    'Step 01',
    landing_step2_num:    'Step 02',
    landing_step3_num:    'Step 03',
    landing_step1_title:  'Speak or type naturally',
    landing_step2_title:  'Add your most precious photos',
    landing_step3_title:  'Your book, ready to download',
    landing_step1_body:   'Our AI biographer asks empathetic, guided questions. Answer with your voice or keyboard — in any language.',
    landing_step2_body:   'Upload images directly in the chat. The AI sees them, comments on them and places them in the book at the right moment.',
    landing_step3_body:   'Claude formats everything into a novelised biographical chapter. One click and you have a PDF to print, gift or keep forever.',
    landing_for_badge:    'Who is Legacy for',
    landing_for_title:    'Every story deserves',
    landing_for_title2:   'to be told.',
    landing_for1_label:   'For Couples',
    landing_for2_label:   'For Families',
    landing_for3_label:   'For You',
    landing_for1_title:   'Relive your love story',
    landing_for2_title:   'Pass your family heritage to future generations',
    landing_for3_title:   'A therapeutic diary of your growth',
    landing_for1_body:    'From the first meeting to shared adventures. Turn your memories into a novel to re-read every anniversary.',
    landing_for2_body:    "Your family's stories are a treasure at risk of being lost. Legacy preserves them in a book your loved ones will read forever.",
    landing_for3_body:    'Focus on who you were, who you are and where you are going. Writing about yourself is the first step to truly understanding yourself.',
    landing_for1_tag:     'Perfect as a wedding gift ✦',
    landing_for2_tag:     'The most precious gift ✦',
    landing_for3_tag:     'Reflection and personal growth ✦',
    landing_reviews_badge:'★★★★★ 4.9/5 — Over 12,000 stories saved',
    landing_reviews_title:'Who has already left their Legacy.',
    landing_footer_badge: 'Free forever · No credit card',
    landing_footer_title: 'Their story deserves to exist.',
    landing_footer_sub:   'Every passing day, a memory risks being lost forever. Start today. It only takes 10 minutes.',
    landing_cta_footer:   'Create your Legacy for free →',
    landing_g1:           '✓ Zero ads',
    landing_g2:           '✓ Your data stays yours',
    landing_g3:           '✓ Unlimited PDFs',
    landing_copyright:    '© 2026 Legacy — All rights reserved',
    // Magic section
    magic_badge:          'Discover the Magic',
    magic_title_1:        'The final result,',
    magic_title_2:        'previewed.',
    magic_sub:            'This is what you will get. A story. A voice. A book.',
    magic_audio_badge:    'Original Voice · Cloned with AI',
    magic_audio_title:    'A Travel Memory',
    magic_audio_sub:      'Chapter I · Our first trip',
    magic_book_title:     'Your story, typeset',
    magic_book_sub:       'Ready to print or share',
    magic_book_cta:       'PDF Export · High quality · One click',
    // Voice cloning
    settings_section_voice_clone: 'Original Voice',
    voice_clone_label:    'Clone your Voice',
    voice_clone_sub:      'The AI will respond with your real voice',
    voice_clone_active:   'Active',
    voice_upload_label:   'Upload audio sample (MP3 / WAV)',
    voice_upload_hint:    'Min. 30 seconds · Clean speech, no music',
    voice_clone_btn:      'Clone this Voice',
    voice_clone_remove:   'Remove cloned voice',
    voice_clone_success:  "✓ Voice cloned successfully! The AI will now speak with your voice.",
    voice_clone_removed:  '// Voice removed — OpenAI TTS restored.',
    voice_clone_cloning:  'Cloning…',
    // Audiobook
    btn_listen:           'Listen',
    btn_listen_loading:   'Generating…',
    audiobook_playing:    'Playing',
    audiobook_pause:      'Pause',
    audiobook_resume:     'Resume',
    audiobook_stop:       'Stop',
    audiobook_error:      '// Audio generation error. Please retry.',
    // Path selection modal
    path_modal_title:     "What do you want to create today?",
    path_modal_sub:       'Choose your narrative path',
    path_personal_title:  'My Biography',
    path_personal_sub:    'An introspective journey for yourself',
    path_couple_title:    'Our Love Story',
    path_couple_sub:      'Relive your story together',
    path_family_title:    'Family Memories',
    path_family_sub:      "Preserve your family's legacy",
    path_cancel:          'Cancel',
    path_name_prompt_personal:  'What is your name?',
    path_label_personal: 'Enter your name or the title of your biography:',
    path_label_couple:   'Enter your names (e.g. Marco and Giulia):',
    path_label_family:   'Who does this story belong to? (e.g. Grandpa Antonio)',
    path_name_prompt_couple:    'What do you want to call your story?',
    path_name_prompt_family:    'Which family does this story belong to?',
    voice_panel_title:    'Voice for this story',
    voice_panel_status_default: 'Standard voice in use',
    voice_panel_status_active:  'Original voice active',
    // Landing extra
    landing_how_h2_1:     'Three steps.',
    landing_how_h2_2:     'An entire life preserved.',
    landing_how_desc:     'No writing course needed. Just your memories.',
    landing_footer_h2_1:  'Their story',
    landing_footer_h2_2:  'deserves to exist.',
    landing_review1:      '"My partner and I are celebrating 10 years together. Legacy turned our memories into a love story that made us laugh and cry. We read it every anniversary."',
    landing_review1_name: 'Luca & Sara',
    landing_review1_meta: 'Couple · Florence',
    landing_review2:      '"My father is 82 and I was afraid his stories would be lost. In two afternoons we did the interview and the book was ready. Now the whole family has a piece of his history."',
    landing_review2_name: 'Marco T.',
    landing_review2_meta: 'Devoted son · Milan',
    landing_review3:      '"I used Legacy as a therapeutic journal after a difficult time. Being asked questions by the AI… it changed the way I see myself. Thank you Legacy."',
    landing_review3_name: 'Sofia R.',
    landing_review3_meta: 'Designer · Rome',
  },
};

function t(key) {
  return translations[currentLang]?.[key] ?? translations['it'][key] ?? key;
}

function cambiaLingua(lang) {
  currentLang = lang;
  localStorage.setItem(LS_LANG, lang);

  // Aggiorna elementi con data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.dataset.i18n);
    if (val !== undefined) el.textContent = val;
  });

  // Aggiorna placeholder degli input
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = t(el.dataset.i18nPlaceholder);
    if (val !== undefined) el.placeholder = val;
  });

  // Aggiorna testo delle <option> con data-i18n-option
  document.querySelectorAll('[data-i18n-option]').forEach(el => {
    const val = t(el.dataset.i18nOption);
    if (val !== undefined) el.textContent = val;
  });

  // Aggiorna il select della lingua
  if (settingsLanguage) settingsLanguage.value = lang;

  // Aggiorna header tone se la chat è aperta
  updateChatHeader();

  // Aggiorna sorgente audio del player landing se presente
  if (typeof window.updateDemoAudioLang === 'function') {
    window.updateDemoAudioLang(lang);
  }
}

function applySettingsToUI() {
  if (settingsVoice)    settingsVoice.value     = selectedVoice;
  if (settingsAutoplay) settingsAutoplay.checked = autoplayEnabled;
  if (settingsAmbient)  settingsAmbient.value    = selectedAmbient;
  if (settingsLanguage) settingsLanguage.value   = currentLang;
  cambiaLingua(currentLang);
  // Aggiorna UI voice cloning
  updateVoiceCloneUI(SESSION_ID ? !!localStorage.getItem(`${LS_CLONED_VOICE}_${SESSION_ID}`) : false);
  // Aggiorna stile toggle landing
  if (typeof setLandingLang === 'function') setLandingLang(currentLang);
}

// Avvia / cambia / ferma l'audio ambient
function applyAmbient(value) {
  selectedAmbient = value;
  localStorage.setItem(LS_AMBIENT, value);
  if (value === 'none' || !AMBIENT_TRACKS[value]) {
    ambientAudio.pause();
  } else {
    // Cambia src solo se diverso per evitare restart inutili
    const newSrc = AMBIENT_TRACKS[value];
    if (ambientAudio.src !== newSrc) {
      ambientAudio.src = newSrc;
      ambientAudio.load();
    }
    ambientAudio.play().catch(() => {
      // Browser ha bloccato autoplay — riproveremo al primo click utente
      console.log('[Legacy] Ambient: autoplay bloccato, riprova al prossimo click');
    });
  }
}

settingsVoice?.addEventListener('change', () => {
  selectedVoice = settingsVoice.value;
  localStorage.setItem(LS_VOICE, selectedVoice);
});

settingsAmbient?.addEventListener('change', () => {
  applyAmbient(settingsAmbient.value);
});

settingsLanguage?.addEventListener('change', () => {
  cambiaLingua(settingsLanguage.value);
});

// ════════════════════════════════════════
//  VOICE CLONING — pannello nella chat
// ════════════════════════════════════════

// Toggle pannello ingranaggio
window.toggleVoicePanel = function(e) { return; // ingranaggio rimosso —
  e?.stopPropagation();
  if (!voiceChatPanel) return;
  voiceChatPanel.classList.toggle('open');
};
// Chiudi cliccando fuori
document.addEventListener('click', (e) => {
  if (voiceChatPanel?.classList.contains('open') &&
      !voiceChatPanel.contains(e.target) &&
      e.target.id !== 'btnVoicePanel') {
    voiceChatPanel.classList.remove('open');
  }
});

/**
 * Aggiorna l'intera UI voce:
 *  - stato nel pannello (testo + badge)
 *  - icona microfono nella sidebar accanto alla chat attiva
 * @param {boolean} hasClonedVoice
 */
function updateVoiceCloneUI(hasClonedVoice) {
  // Pannello chat
  if (voicePanelBadge)   voicePanelBadge.classList.toggle('hidden', !hasClonedVoice);
  if (btnRemoveClonedVoice) btnRemoveClonedVoice.classList.toggle('hidden', !hasClonedVoice);
  if (voicePanelStatus)  voicePanelStatus.textContent = hasClonedVoice
    ? t('voice_panel_status_active')
    : t('voice_panel_status_default');
  if (voicePanelStatus)  voicePanelStatus.style.color = hasClonedVoice
    ? 'rgba(0,245,255,0.7)'
    : 'rgba(255,255,255,0.3)';
  if (voiceUploadZone)   voiceUploadZone.style.opacity = hasClonedVoice ? '0.5' : '1';

  // Dot microfono nella sidebar per la sessione attiva
  updateSidebarVoiceDot(SESSION_ID, hasClonedVoice);
}

/** Mostra/rimuove il dot viola accanto al titolo della sessione nella sidebar */
function updateSidebarVoiceDot(sessionId, hasVoice) {
  if (!sessionId) return;
  const item = document.querySelector(`.story-item[data-session-id="${sessionId}"]`);
  if (!item) return;
  let dot = item.querySelector('.voice-dot');
  if (hasVoice && !dot) {
    dot = document.createElement('span');
    dot.className = 'voice-dot';
    dot.title = 'Voce clonata attiva';
    // Inserisci dopo l'icona ma prima del testo
    const span = item.querySelector('span.truncate');
    if (span) item.insertBefore(dot, span);
  } else if (!hasVoice && dot) {
    dot.remove();
  }
}

// Drag & drop upload
voiceUploadZone?.addEventListener('dragover', e => {
  e.preventDefault();
  voiceUploadZone.classList.add('dragover');
});
voiceUploadZone?.addEventListener('dragleave', () => voiceUploadZone.classList.remove('dragover'));
voiceUploadZone?.addEventListener('drop', e => {
  e.preventDefault();
  voiceUploadZone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleVoiceFileSelected(file);
});

voiceSampleInput?.addEventListener('change', () => {
  const file = voiceSampleInput.files?.[0];
  if (file) handleVoiceFileSelected(file);
});

function handleVoiceFileSelected(file) {
  const allowed = ['audio/mpeg','audio/mp3','audio/wav','audio/wave','audio/webm','audio/ogg','audio/m4a','audio/x-m4a'];
  if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
    showVoiceFeedback('// Formato non supportato. Usa MP3, WAV, M4A o WebM.', 'error');
    return;
  }
  if (voiceUploadLabel) voiceUploadLabel.textContent = `📎 ${file.name}`;
  if (voiceUploadZone)  voiceUploadZone.classList.add('has-file');
  if (btnCloneVoice)  { btnCloneVoice.disabled = false; btnCloneVoice.style.opacity = '1'; }
  if (voiceCloneFeedback) voiceCloneFeedback.classList.add('hidden');
}

// Clona voce — usa sempre il SESSION_ID attivo
btnCloneVoice?.addEventListener('click', async () => {
  if (userSubscription !== 'ultra') {
    openUpsell('ultra', 'La clonazione vocale con IA è disponibile esclusivamente nel piano Ultra.');
    return;
  }
  const file = voiceSampleInput?.files?.[0];
  if (!file) return;
  if (!SESSION_ID) {
    showVoiceFeedback('// Apri prima una sessione.', 'error');
    return;
  }
  setVoiceCloneLoading(true);
  try {
    const fd = new FormData();
    fd.append('session_id',  SESSION_ID);   // ← ID sessione attiva
    fd.append('sample_file', file, file.name);

    const res  = await fetch(`${API_BASE}/api/clone_voice`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

    // Salva flag nel localStorage associato alla sessione
    localStorage.setItem(`${LS_CLONED_VOICE}_${SESSION_ID}`, 'true');
    showVoiceFeedback(t('voice_clone_success'), 'success');
    updateVoiceCloneUI(true);
    // Aggiorna lista sessioni per mostrare il dot
    await loadSessions();

    // Reset input
    if (voiceSampleInput)  voiceSampleInput.value = '';
    if (voiceUploadLabel)  voiceUploadLabel.textContent = t('voice_upload_label');
    if (voiceUploadZone)   voiceUploadZone.classList.remove('has-file');
    if (btnCloneVoice)   { btnCloneVoice.disabled = true; btnCloneVoice.style.opacity = '0.4'; }

  } catch (err) {
    console.error('[Legacy] clone_voice:', err);
    showVoiceFeedback(`// Errore: ${err.message}`, 'error');
  } finally {
    setVoiceCloneLoading(false);
  }
});

btnRemoveClonedVoice?.addEventListener('click', () => {
  if (!confirm("Rimuovere la voce clonata? L'IA tornerà a usare OpenAI TTS.")) return;
  if (SESSION_ID) localStorage.removeItem(`${LS_CLONED_VOICE}_${SESSION_ID}`);
  updateVoiceCloneUI(false);
  showVoiceFeedback(t('voice_clone_removed'), 'info');
  loadSessions();
});

function setVoiceCloneLoading(loading) {
  if (btnCloneVoiceLabel)   btnCloneVoiceLabel.textContent = loading ? t('voice_clone_cloning') : t('voice_clone_btn');
  if (btnCloneVoiceSpinner) btnCloneVoiceSpinner.classList.toggle('hidden', !loading);
  if (btnCloneVoice)        btnCloneVoice.disabled = loading;
}

function showVoiceFeedback(msg, type = 'success') {
  if (!voiceCloneFeedback) return;
  voiceCloneFeedback.classList.remove('hidden');
  voiceCloneFeedback.textContent = msg;
  voiceCloneFeedback.style.color = type === 'error'
    ? 'rgba(255,45,85,0.85)'
    : type === 'info'
    ? 'rgba(255,255,255,0.45)'
    : 'rgba(0,245,255,0.8)';
  if (type === 'success') setTimeout(() => voiceCloneFeedback?.classList.add('hidden'), 6000);
}

// ════════════════════════════════════════
//  LANDING DEMO PLAYER
// ════════════════════════════════════════
(function() {
  // Sorgenti audio per lingua
  const demoAudios = {
    it: 'https://fytdzffdpxawjfxhorlz.supabase.co/storage/v1/object/public/public-assets/ElevenLabs_2026-04-12T19_49_09_Roberta%20-%20Persuasive%20and%20Expressive_pvc_sp100_s30_sb75_se0_b_m2.mp3',
    en: 'https://fytdzffdpxawjfxhorlz.supabase.co/storage/v1/object/public/public-assets/english%20audio.mp3',
  };

  let demoAudio   = null;
  let demoPlaying = false;
  let demoTimer   = null;

  const btnPlay  = document.getElementById('btnLandingPlay');
  const playIcon = document.getElementById('landingPlayIcon');
  const waveform = document.getElementById('landingWaveform');
  const fillEl   = document.getElementById('landingProgressFill');
  const timeEl   = document.getElementById('landingCurrentTime');

  if (!btnPlay) return;  // non siamo sulla landing

  const PLAY_SVG  = '<polygon points="5 3 19 12 5 21 5 3"/>';
  const PAUSE_SVG = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';

  function fmtTime(s) {
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  }

  function resetPlayer() {
    clearInterval(demoTimer);
    if (fillEl) fillEl.style.width = '0%';
    if (timeEl) timeEl.textContent = '0:00';
  }

  function setPlayState(playing) {
    demoPlaying = playing;
    playIcon.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
    playIcon.setAttribute('fill', 'rgba(0,245,255,0.9)');
    if (waveform) waveform.classList.toggle('playing', playing);
  }

  function startProgressUpdate() {
    clearInterval(demoTimer);
    demoTimer = setInterval(() => {
      if (!demoAudio || demoAudio.paused) return;
      const pct = demoAudio.duration
        ? (demoAudio.currentTime / demoAudio.duration) * 100
        : 0;
      if (fillEl) fillEl.style.width = pct + '%';
      if (timeEl) timeEl.textContent = fmtTime(demoAudio.currentTime);
    }, 300);
  }

  function buildAudio(lang) {
    const src = demoAudios[lang] || demoAudios.it;
    const audio = new Audio(src);
    audio.volume = 0.6;
    audio.addEventListener('ended', () => {
      setPlayState(false);
      resetPlayer();
    });
    return audio;
  }

  // Inizializza con la lingua corrente al caricamento
  demoAudio = buildAudio(currentLang);

  // Esponi una funzione per cambiare la sorgente dall'esterno (chiamata da cambiaLingua)
  window.updateDemoAudioLang = function(lang) {
    if (demoPlaying) {
      demoAudio.pause();
      setPlayState(false);
      resetPlayer();
    }
    demoAudio = buildAudio(lang);
  };

  btnPlay.addEventListener('click', () => {
    if (demoPlaying) {
      demoAudio.pause();
      setPlayState(false);
      clearInterval(demoTimer);
    } else {
      demoAudio.play().catch(() => {});
      setPlayState(true);
      startProgressUpdate();
    }
  });

  // Ferma il demo quando l'utente va all'auth
  const btnLL   = document.getElementById('btnLandingLogin');
  const btnHCTA = document.getElementById('btnHeroCTA');
  const btnFCTA = document.getElementById('btnFooterCTA');
  [btnLL, btnHCTA, btnFCTA].forEach(b => {
    b?.addEventListener('click', () => {
      if (demoAudio && demoPlaying) {
        demoAudio.pause();
        setPlayState(false);
        clearInterval(demoTimer);
      }
    });
  });
})();

// ════════════════════════════════════════
//  MODALI LEGALI
// ════════════════════════════════════════

window.openLegalModal = function(id) {
  document.getElementById(id)?.classList.add('open');
};
window.closeLegalModal = function(id) {
  document.getElementById(id)?.classList.remove('open');
};

// Toggle lingua landing (IT/EN nella navbar della landing page)
window.setLandingLang = function(lang) {
  cambiaLingua(lang);
  // Stile bottoni toggle
  const btnIT = document.getElementById('btnLandingIT');
  const btnEN = document.getElementById('btnLandingEN');
  if (btnIT && btnEN) {
    if (lang === 'it') {
      btnIT.style.background = 'rgba(0,245,255,0.12)'; btnIT.style.color = 'rgba(0,245,255,0.9)';
      btnEN.style.background = 'transparent';          btnEN.style.color = 'rgba(255,255,255,0.4)';
    } else {
      btnEN.style.background = 'rgba(0,245,255,0.12)'; btnEN.style.color = 'rgba(0,245,255,0.9)';
      btnIT.style.background = 'transparent';          btnIT.style.color = 'rgba(255,255,255,0.4)';
    }
  }
  // Sincronizza con il select impostazioni
  if (settingsLanguage) settingsLanguage.value = lang;
};

// Abilita/disabilita bottoni auth in base alle checkbox legali
// updateAuthButtons rimossa — logica spostata nel terms gate post-login

btnAuthBack?.addEventListener('click', () => showView('landing'));

settingsAutoplay?.addEventListener('change', () => {
  autoplayEnabled = settingsAutoplay.checked;
  localStorage.setItem(LS_AUTOPLAY, autoplayEnabled ? 'true' : 'false');
});

btnChangePassword?.addEventListener('click', async () => {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) return;
  const { error } = await sbClient.auth.resetPasswordForEmail(session.user.email);
  if (passwordFeedback) {
    passwordFeedback.classList.remove('hidden');
    passwordFeedback.textContent = error ? '// Errore: ' + error.message : '// Email di reset inviata.';
    passwordFeedback.style.color = error ? 'rgba(255,45,85,0.8)' : 'rgba(0,245,255,0.7)';
    setTimeout(() => passwordFeedback.classList.add('hidden'), 5000);
  }
});

btnDeleteAccount?.addEventListener('click', async () => {
  if (!confirm('Sei sicuro? Azione irreversibile.')) return;
  if (!confirm('Conferma definitiva: eliminare il tuo account?')) return;
  alert('Contatta support@legacy.app per eliminare l\'account. Verrai disconnesso.');
  await sbClient.auth.signOut();
  window.location.reload();
});

// ════════════════════════════════════════
//  SUBSCRIPTION & UPSELL
// ════════════════════════════════════════

async function loadUserSubscription() {
  if (!USER_ID) return;
  try {
    // Timeout 4s — se il backend non risponde, si usa 'free' e l'app va avanti
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 4000);
    const res  = await fetch(`${API_BASE}/api/user/${encodeURIComponent(USER_ID)}`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      userSubscription = data.subscription_level || 'free';
    }
  } catch (e) {
    console.warn('[Legacy] subscription fetch fallito — default free:', e.message);
    userSubscription = 'free';
  }
  console.log(`[Legacy] subscription: ${userSubscription}`);
}

// ════════════════════════════════════════
//  TERMS GATE — accettazione post-login
// ════════════════════════════════════════

async function checkAndShowTermsGate() {
  if (!USER_ID) return;
  try {
    const { data, error } = await sbClient
      .from('profiles')
      .select('terms_accepted')
      .eq('id', USER_ID)
      .single();
    if (error || !data) return;  // se manca il profilo, non bloccare
    if (!data.terms_accepted) {
      openTermsGate();
    }
  } catch (e) {
    console.warn('[Legacy] checkTermsGate error — ignoro e vado avanti:', e);
    // Non bloccare l'app se Supabase non risponde
  }
}

function openTermsGate() {
  const modal = document.getElementById('termsGateModal');
  if (!modal) return;
  // Reset checkbox
  const gt = document.getElementById('gateCheckTerms');
  const gp = document.getElementById('gateCheckPrivacy');
  const btn = document.getElementById('btnConfirmTerms');
  if (gt) gt.checked = false;
  if (gp) gp.checked = false;
  if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
  modal.classList.add('open');
}

// Listener checkbox gate
document.getElementById('gateCheckTerms')?.addEventListener('change', updateGateButton);
document.getElementById('gateCheckPrivacy')?.addEventListener('change', updateGateButton);

function updateGateButton() {
  const gt  = document.getElementById('gateCheckTerms');
  const gp  = document.getElementById('gateCheckPrivacy');
  const btn = document.getElementById('btnConfirmTerms');
  if (!btn) return;
  const ok = gt?.checked && gp?.checked;
  btn.disabled     = !ok;
  btn.style.opacity = ok ? '1' : '0.4';
}

document.getElementById('btnConfirmTerms')?.addEventListener('click', async () => {
  const btn   = document.getElementById('btnConfirmTerms');
  const label = document.getElementById('btnConfirmTermsLabel');
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'Salvataggio…';

  try {
    const { error } = await sbClient
      .from('profiles')
      .update({ terms_accepted: true })
      .eq('id', USER_ID);
    if (error) throw error;
    document.getElementById('termsGateModal')?.classList.remove('open');
    console.log('[Legacy] terms_accepted salvato ✓');
  } catch (e) {
    console.error('[Legacy] salvataggio terms fallito:', e);
    if (label) label.textContent = 'Errore — riprova';
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
});

function openUpsell(highlight = 'premium', customMsg = null) {
  const modal = document.getElementById('upsellModal');
  if (!modal) return;

  // Reset highlights
  document.getElementById('planFree')?.classList.remove('highlighted', 'highlighted-ultra');
  document.getElementById('planPremium')?.classList.remove('highlighted', 'highlighted-ultra');
  document.getElementById('planUltra')?.classList.remove('highlighted', 'highlighted-ultra');

  // Applica highlight al piano suggerito
  const subtitle = document.getElementById('upsellSubtitle');
  if (highlight === 'ultra') {
    document.getElementById('planUltra')?.classList.add('highlighted-ultra');
    if (subtitle) subtitle.textContent = customMsg || 'La clonazione vocale è disponibile nel piano Ultra.';
  } else {
    document.getElementById('planPremium')?.classList.add('highlighted');
    if (subtitle) subtitle.textContent = customMsg || 'Genera il libro PDF con il piano Premium o superiore.';
  }

  modal.classList.add('open');
}

window.closeUpsell = function() {
  document.getElementById('upsellModal')?.classList.remove('open');
};

window.choosePlan = function(plan) {
  // Placeholder — integra Stripe o il tuo payment provider qui
  alert(`Redirect al checkout per il piano ${plan.toUpperCase()}.
(Integra il tuo payment provider in questa funzione)`);
  closeUpsell();
};

// ════════════════════════════════════════
//  SIDEBAR NAV
// ════════════════════════════════════════

// CTA empty state → apre modale nuova intervista
// btnEmptyStateCTA sostituito da btnStartFirstJourney — vedi handleStartJourney


sidebarSettings?.addEventListener('click', () => {
  stopCurrentAudio();
  stopAudiobook();
  showPanel('settings');
});

btnSidebarLogout?.addEventListener('click', async () => {
  if (!confirm('Vuoi uscire?')) return;
  stopCurrentAudio();
  sessionStorage.clear();
  localStorage.removeItem(LS_LAST_SESSION);
  await sbClient.auth.signOut();
  window.location.reload();
});

// ════════════════════════════════════════
//  LANDING / AUTH
// ════════════════════════════════════════

[btnHeroCTA, btnFooterCTA, document.getElementById('btnNavCTA')].forEach(b => b?.addEventListener('click', () => showView('auth')));
btnLandingLogin?.addEventListener('click', () => showView('auth'));
btnAuthBack?.addEventListener('click', () => showView('landing'));

// ── Google OAuth ──────────────────────────────────────────────────────────────
btnGoogleLogin?.addEventListener('click', async () => {
  try {
    const { error } = await sbClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,   // torna alla stessa pagina dopo auth
      },
    });
    if (error) {
      if (authError) authError.textContent = '// Errore Google: ' + error.message;
    }
  } catch (err) {
    console.error('[Legacy] Google OAuth error:', err);
    if (authError) authError.textContent = '// Errore di connessione. Riprova.';
  }
});

tabLogin.addEventListener('click', () => {
  tabLogin.style.background = 'rgba(0,245,255,0.12)'; tabLogin.style.color = 'rgba(0,245,255,0.9)';
  tabRegister.style.background = 'transparent'; tabRegister.style.color = 'rgba(255,255,255,0.3)';
  authError.textContent = '';
  // Mostra Accedi, nascondi consensi+Register
  if (btnLogin)  btnLogin.style.display = 'flex';
  document.getElementById('legalConsents').style.display = 'none';
  if (checkTerms)   checkTerms.checked = false;
  if (checkPrivacy) checkPrivacy.checked = false;
});
tabRegister.addEventListener('click', () => {
  tabRegister.style.background = 'rgba(168,85,247,0.15)'; tabRegister.style.color = 'rgba(168,85,247,0.9)';
  tabLogin.style.background = 'transparent'; tabLogin.style.color = 'rgba(255,255,255,0.3)';
  authError.textContent = '';
  // Nascondi Accedi, mostra consensi+Register
  if (btnLogin)  btnLogin.style.display = 'none';
  document.getElementById('legalConsents').style.display = 'block';
});

authEmail.addEventListener('keydown', e => { if (e.key === 'Enter') authPassword.focus(); });
authPassword.addEventListener('keydown', e => { if (e.key === 'Enter') btnLogin.click(); });

btnLogin.addEventListener('click', async () => {
  const email = authEmail.value.trim(), password = authPassword.value;
  if (!email || !password) { showAuthError('Inserisci email e password.'); return; }
  setAuthLoading('login', true); authError.textContent = '';

  try {
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) { showAuthError(translateAuthError(error.message)); return; }

    USER_ID  = data.user.id;
    userName = data.user.email.split('@')[0];
    if (settingsEmail) settingsEmail.textContent = data.user.email;

    await loadUserSubscription();
    await checkAndShowTermsGate();
    showView('app');

    const sessions = await loadSessions();
    const lastId = localStorage.getItem(LS_LAST_SESSION);
    if (lastId) {
      const history = await fetchHistory(lastId);
      if (history.length > 0) {
        SESSION_ID = lastId;
        const savedSetup = loadSetupFromStorage();
        if (savedSetup) { protagonistName = savedSetup.name; protagonistGender = savedSetup.gender; biographyTone = savedSetup.tone; }
        const sessionData = (sessions || []).find(s => s.session_id === lastId);
        updateBookButtons(sessionData?.book_content || null);
        currentStoryType = sessionData?.story_type || 'personale';
        updateChatHeader();
        showPanel('chat');
        renderHistory(history, currentStoryType);
        addSystemNote(t('session_restored'));
        scrollDown();
        markActiveSession(lastId);
        return;
      }
    }
    showEmptyState();
  } catch (err) {
    console.error('[Legacy] login error:', err);
    showAuthError('Errore imprevisto. Riprova.');
  } finally {
    // Resetta SEMPRE lo spinner — sia in caso di successo che di errore
    setAuthLoading('login', false);
  }
});

btnRegister.addEventListener('click', async () => {
  const email = authEmail.value.trim(), password = authPassword.value;
  if (!email || !password) { showAuthError('Inserisci email e password.'); return; }
  if (password.length < 6) { showAuthError('Password minimo 6 caratteri.'); return; }
  setAuthLoading('register', true); authError.textContent = '';

  try {
    const { data, error } = await sbClient.auth.signUp({ email, password });
    if (error) { showAuthError(translateAuthError(error.message)); return; }

    USER_ID  = data.user.id;
    userName = data.user.email.split('@')[0];
    if (settingsEmail) settingsEmail.textContent = data.user.email;
    showView('app');
    await loadSessions();
    showEmptyState();
  } catch (err) {
    console.error('[Legacy] register error:', err);
    showAuthError('Errore imprevisto. Riprova.');
  } finally {
    setAuthLoading('register', false);
  }
});

function showAuthError(msg) { authError.textContent = '// ' + msg; }
function setAuthLoading(which, loading) {
  if (which === 'login') { btnLoginLabel.textContent = loading ? t('auth_loading_login') : t('auth_login_btn'); btnLoginSpinner.classList.toggle('hidden', !loading); btnLogin.disabled = loading; }
  else { btnRegisterLabel.textContent = loading ? t('auth_loading_register') : t('auth_register_btn'); btnRegisterSpinner.classList.toggle('hidden', !loading); btnRegister.disabled = loading; }
}
function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o password errati.';
  if (msg.includes('Email not confirmed'))        return 'Conferma la tua email prima.';
  if (msg.includes('User already registered'))   return 'Email già registrata.';
  if (msg.includes('Password should be'))        return 'Password troppo corta (min 6).';
  return msg;
}

// ════════════════════════════════════════
//  STORAGE UTILS
// ════════════════════════════════════════

function saveSetupToStorage(name, gender, tone) {
  sessionStorage.setItem('legacy_setup', JSON.stringify({ name, gender, tone }));
}
function loadSetupFromStorage() {
  try { return JSON.parse(sessionStorage.getItem('legacy_setup')); } catch { return null; }
}

// ════════════════════════════════════════
//  AUDIO GLOBALE
// ════════════════════════════════════════

function stopCurrentAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
}

function handleAudioBase64(base64String, bubbleEl) {
  if (!base64String) return;
  if (autoplayEnabled) {
    stopCurrentAudio();
    try {
      currentAudio = new Audio('data:audio/mp3;base64,' + base64String);
      currentAudio.play().catch(() => {});
      currentAudio.addEventListener('ended', () => { currentAudio = null; });
    } catch {}
  } else if (bubbleEl) {
    const btn = document.createElement('button');
    btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;font-family:'DM Mono',monospace;font-size:0.68rem;letter-spacing:0.1em;color:rgba(168,85,247,0.7);cursor:pointer;padding:3px 8px;border-radius:6px;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2)"><svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(168,85,247,0.8)"><polygon points="5 3 19 12 5 21 5 3"/></svg>Ascolta</span>`;
    btn.className = 'mt-1.5 pl-1';
    btn.addEventListener('click', () => {
      stopCurrentAudio();
      try { currentAudio = new Audio('data:audio/mp3;base64,' + base64String); currentAudio.play().catch(() => {}); btn.remove(); } catch {}
    });
    bubbleEl.appendChild(btn);
  }
}

// ════════════════════════════════════════
//  FORMDATA — include immagine se presente
// ════════════════════════════════════════

function buildFormData() {
  const fd = new FormData();
  fd.append('session_id',         SESSION_ID);
  fd.append('user_id',            USER_ID || '');
  fd.append('protagonist_name',   protagonistName   || userName);
  fd.append('protagonist_gender', protagonistGender || 'Neutro');
  fd.append('biography_tone',     biographyTone     || 'Nostalgico ed Emozionale');
  fd.append('voice_setting',      localStorage.getItem(LS_VOICE) || 'shimmer');
  fd.append('ui_language',        currentLang === 'en' ? 'English' : 'Italiano');
  if (pendingImageFile) {
    fd.append('image_file', pendingImageFile, pendingImageFile.name);
  }
  return fd;
}

// ════════════════════════════════════════
//  REGISTRAZIONE AUDIO
// ════════════════════════════════════════

btnMic?.addEventListener('click', async () => {
  stopCurrentAudio();
  if (!mediaRecorder || mediaRecorder.state === 'inactive') await startRecording();
  else if (mediaRecorder.state === 'recording') stopRecording();
});

async function startRecording() {
  try {
    if (!micStream) micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(micStream);
    mediaRecorder.addEventListener('dataavailable', e => { if (e.data?.size > 0) audioChunks.push(e.data); });
    mediaRecorder.addEventListener('stop', onRecordingStop);
    mediaRecorder.start();
    setUIRecording(true);
  } catch (err) { handleMicError(err); }
}

function stopRecording() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
}

async function onRecordingStop() {
  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  audioBlob = new Blob(audioChunks, { type: mimeType });
  setUIRecording(false);
  await sendAudioToServer(audioBlob, mimeType);
}

// ════════════════════════════════════════
//  INVIO AUDIO
// ════════════════════════════════════════

async function sendAudioToServer(blob, mimeType) {
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'webm';
  const fd  = buildFormData();
  fd.append('audio', blob, `recording.${ext}`);

  // Snapshot immagine prima di pulire
  const imageForBubble = pendingImageFile ? URL.createObjectURL(pendingImageFile) : null;
  clearPendingImage();

  // ── 1. MOSTRA SUBITO il typing indicator (testo non ancora noto) ──────────
  showLoadingIndicator();
  scrollDown();

  // ── 2. CHIAMATA API ───────────────────────────────────────────────────────
  try {
    const res = await fetch(API_URL, { method: 'POST', body: fd });
    removeLoadingIndicator();
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      const detail = e.detail || '';
      if (res.status === 403 && detail.startsWith('UPGRADE_REQUIRED:')) {
        const parts = detail.split(':');
        openUpsell(parts[1] || 'premium', parts[2] || null);
        return null;
      }
      throw new Error(detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    // Per l'audio la trascrizione arriva dal server — aggiungi la bolla utente qui
    addUserBubble(data.user_text, data.image_url || imageForBubble);
    const el = addAIBubble(data.ai_reply, false, data.audio_base64 || null);
    handleAudioBase64(data.audio_base64, el);
    scrollDown();
    onMessageSent();
  } catch (err) {
    console.error('[Legacy]', err);
    removeLoadingIndicator();
    addAIBubble(t('err_connection'), true);
    scrollDown();
  }
}

// ════════════════════════════════════════
//  INVIO TESTO
// ════════════════════════════════════════

btnSendText?.addEventListener('click', () => sendTextMessage());
textInput?.addEventListener('keydown', e => { if (e.key === 'Enter') sendTextMessage(); });

function sendTextMessage() {
  const text = textInput?.value.trim();
  if (!text && !pendingImageFile) return;
  stopCurrentAudio();
  if (textInput) textInput.value = '';
  sendTextToServer(text || '');
}

async function sendTextToServer(text) {
  const fd = buildFormData();
  if (text) fd.append('text_input', text);

  // Snapshot immagine prima di pulire
  const imageForBubble = pendingImageFile ? URL.createObjectURL(pendingImageFile) : null;
  clearPendingImage();

  // ── 1. MOSTRA SUBITO la bolla utente ─────────────────────────────────────
  if (text || imageForBubble) {
    addUserBubble(text || '', imageForBubble);
    scrollDown();
  }

  // ── 2. MOSTRA SUBITO il typing indicator ──────────────────────────────────
  showLoadingIndicator();
  scrollDown();

  // ── 3. CHIAMATA API ───────────────────────────────────────────────────────
  try {
    const res = await fetch(API_URL, { method: 'POST', body: fd });
    removeLoadingIndicator();
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      const detail = e.detail || '';
      if (res.status === 403 && detail.startsWith('UPGRADE_REQUIRED:')) {
        const parts = detail.split(':');
        openUpsell(parts[1] || 'premium', parts[2] || null);
        return null;
      }
      if (res.status === 413 && detail.startsWith('FILE_TOO_LARGE:')) {
        addSystemNote('// ' + detail.split(':')[1]);
        return null;
      }
      if (res.status === 403 && detail.startsWith('IMAGE_LIMIT_REACHED:')) {
        const parts = detail.split(':');
        const plan = parts[1] || 'free';
        const msg  = parts[2] || '';
        if (plan === 'free') openUpsell('premium', msg);
        else addSystemNote('// ' + msg);
        return null;
      }
      throw new Error(detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    // La bolla utente è già nel DOM — aggiungi solo la risposta AI
    if (imageForBubble) sessionImageCount++; // incrementa contatore immagini
    const el = addAIBubble(data.ai_reply, false, data.audio_base64 || null);
    handleAudioBase64(data.audio_base64, el);
    scrollDown();
    onMessageSent();
  } catch (err) {
    console.error('[Legacy]', err);
    removeLoadingIndicator();
    addAIBubble(t('err_connection'), true);
    scrollDown();
  }
}

// ════════════════════════════════════════
//  GENERA LIBRO
// ════════════════════════════════════════

async function generateBook() {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 180000);
  try {
    const langParam = currentLang === 'en' ? 'English' : 'Italiano';
    const res = await fetch(`${API_BOOK_URL}?session_id=${encodeURIComponent(SESSION_ID)}&ui_language=${encodeURIComponent(langParam)}`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      const detail = e.detail || '';
      if (res.status === 403 && detail.startsWith('UPGRADE_REQUIRED:')) {
        const parts = detail.split(':');
        openUpsell(parts[1] || 'premium', parts[2] || null);
        clearTimeout(tid);
        return null;
      }
      throw new Error(detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    let html = (data.book_html || '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const bm = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bm) html = bm[1].trim();
    return html;
  } catch (err) {
    clearTimeout(tid);
    addAIBubble(err.name === 'AbortError' ? t('err_timeout') : `// ERRORE: ${err.message}`, true);
    return null;
  }
}

function showBookContent(html) {
  bookContent.innerHTML = html;
  writingOverlay.style.transition    = 'opacity 0.5s ease';
  writingOverlay.style.opacity       = '0';
  writingOverlay.style.pointerEvents = 'none';
  setTimeout(() => {
    bookPage.style.transition    = 'opacity 0.5s ease';
    bookPage.style.opacity       = '1';
    bookPage.style.pointerEvents = 'all';
    bookContent.scrollTo({ top: 0 });
  }, 350);
}

// ════════════════════════════════════════
//  FUMETTI CHAT
// ════════════════════════════════════════

/**
 * Aggiunge un fumetto utente.
 * @param {string} text — testo del messaggio
 * @param {string|null} imageUrl — URL pubblico o objectURL locale
 */
function addUserBubble(text, imageUrl = null) {
  if (!text && !imageUrl) return;
  const w = document.createElement('div');
  w.className = 'flex justify-end bubble-enter';

  const imgHtml = imageUrl
    ? `<img src="${imageUrl}" alt="foto condivisa"
           style="max-width:100%;max-height:220px;border-radius:10px;margin-bottom:${text ? '8px' : '0'};
                  border:1px solid rgba(0,245,255,0.25);object-fit:cover;display:block;
                  box-shadow:0 0 16px rgba(0,245,255,0.1)" />`
    : '';

  const textHtml = text
    ? `<div style="font-family:'DM Mono',monospace;font-size:0.85rem;line-height:1.6;color:rgba(255,255,255,0.92)">${escapeHtml(text)}</div>`
    : '';

  w.innerHTML = `
    <div class="max-w-[78%]">
      <div class="px-4 py-2.5 rounded-2xl rounded-br-sm"
        style="background:linear-gradient(135deg,rgba(0,180,255,0.22),rgba(124,58,237,0.22));
               border:1px solid rgba(0,245,255,0.22);
               box-shadow:0 0 20px rgba(0,245,255,0.06);">
        ${imgHtml}${textHtml}
      </div>
      <p class="text-[9px] font-mono tracking-widest uppercase mt-1 text-right pr-1"
         style="color:rgba(0,245,255,0.3)">${escapeHtml(protagonistName || userName)}</p>
    </div>`;
  chatArea?.appendChild(w);
  scrollDown();
}

function addAIBubble(text, isError = false, audioBase64 = null) {
  if (!text) return null;

  // Parsing markdown (solo per messaggi non-errore)
  const renderedText = isError
    ? escapeHtml(text)
    : (typeof marked !== 'undefined' ? marked.parse(text) : text);

  const w = document.createElement('div');
  w.className = 'flex justify-start bubble-enter';

  const bubbleColor = isError ? 'rgba(255,45,85,0.3)' : 'rgba(255,255,255,0.07)';
  const textColor   = isError ? 'rgba(255,100,120,0.9)' : 'rgba(200,220,255,0.82)';

  w.innerHTML = `
    <div class="max-w-[78%]">
      <div class="px-4 py-3 rounded-2xl rounded-bl-sm text-sm font-mono"
        style="background:rgba(0,0,0,0.4);border:1px solid ${bubbleColor};color:${textColor};">
        <div class="ai-md">${renderedText}</div>
      </div>
      <div class="flex items-center justify-between mt-1 pl-1">
        <p class="text-[9px] font-mono tracking-widest uppercase" style="color:rgba(168,85,247,0.35)">${t('ai_label')}</p>
        ${!isError ? `
        <div class="ai-action-bar">
          <button class="ai-action-btn btn-copy" title="Copia risposta">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span data-i18n="btn_copy">Copia</span>
          </button>
          ${audioBase64 ? `
          <button class="ai-action-btn btn-replay" title="Riascolta risposta">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span data-i18n="btn_replay">Riascolta</span>
          </button>` : ''}
        </div>` : ''}
      </div>
    </div>`;

  chatArea?.appendChild(w);

  // Collega i bottoni azione
  const btnCopy   = w.querySelector('.btn-copy');
  const btnReplay = w.querySelector('.btn-replay');

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        btnCopy.textContent = '✓ Copiato!';
        btnCopy.classList.add('copied');
        setTimeout(() => {
          btnCopy.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copia`;
          btnCopy.classList.remove('copied');
        }, 2000);
      }).catch(() => {});
    });
  }

  if (btnReplay && audioBase64) {
    btnReplay.addEventListener('click', () => {
      stopCurrentAudio();
      try {
        currentAudio = new Audio('data:audio/mp3;base64,' + audioBase64);
        currentAudio.play().catch(() => {});
        currentAudio.addEventListener('ended', () => { currentAudio = null; });
      } catch {}
    });
  }

  scrollDown();
  return w.querySelector('div');
}

function addWelcomeMessage() {
  // Fallback generico — usato solo se non si conosce lo story_type
  addWelcomeMessageForType(currentStoryType || 'personale');
}

function addWelcomeMessageForType(storyType) {
  const name = escapeHtml(protagonistName || userName);
  const msgKey = {
    personale: 'welcome_personal',
    coppia:    'welcome_couple',
    famiglia:  'welcome_family',
  }[storyType] || 'welcome_personal';

  // Per coppia/famiglia non mettere il nome (spesso è "Marco e Giulia" o "Famiglia Rossi")
  const greeting = storyType === 'personale'
    ? `${t('welcome_greeting')} <span style="color:rgba(0,245,255,0.9)">${name}</span>. `
    : '';

  addAIBubble(
    `${greeting}<em style="color:rgba(180,200,255,0.75)">${t(msgKey)}</em>`,
    false
  );
}

function addSystemNote(text) {
  const el = document.createElement('div');
  el.className = 'flex justify-center bubble-enter';
  el.innerHTML = `<span class="font-mono text-[9px] tracking-widest uppercase px-3 py-1 rounded-full"
    style="color:rgba(0,245,255,0.35);background:rgba(0,245,255,0.05);border:1px solid rgba(0,245,255,0.1)">${escapeHtml(text)}</span>`;
  chatArea?.appendChild(el);
}

// ════════════════════════════════════════
//  LOADING + UI MIC
// ════════════════════════════════════════

function showLoadingIndicator() {
  typingIndicator?.classList.remove('hidden');
  if (micStatus) micStatus.textContent = t('mic_processing');
  scrollDown();
}

function removeLoadingIndicator() {
  typingIndicator?.classList.add('hidden');
  if (micStatus) micStatus.textContent = t('mic_status');
}

function setUIRecording(on) {
  if (on) {
    btnMic.style.background  = 'linear-gradient(135deg,rgba(255,45,85,0.3),rgba(180,0,50,0.3))';
    btnMic.style.borderColor = 'rgba(255,45,85,0.5)';
    btnMic.classList.replace('mic-idle', 'mic-active');
    micIconDefault?.classList.add('hidden'); micIconStop?.classList.remove('hidden'); micRing?.classList.remove('hidden');
    if (micStatus) { micStatus.textContent = t('mic_recording'); micStatus.style.color = 'rgba(255,45,85,0.8)'; }
  } else {
    btnMic.style.background  = 'linear-gradient(135deg,rgba(0,245,255,0.15),rgba(124,58,237,0.2))';
    btnMic.style.borderColor = 'rgba(0,245,255,0.35)';
    btnMic.classList.replace('mic-active', 'mic-idle');
    micIconDefault?.classList.remove('hidden'); micIconStop?.classList.add('hidden'); micRing?.classList.add('hidden');
    if (micStatus) { micStatus.textContent = t('mic_status'); micStatus.style.color = 'rgba(0,245,255,0.4)'; }
  }
}

// ════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════

function scrollDown() { chatArea?.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' }); }

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function handleMicError(err) {
  const m = {
    NotAllowedError:       t('err_mic_denied'),
    PermissionDeniedError: t('err_mic_denied'),
    NotFoundError:         t('err_mic_notfound'),
    NotSupportedError:     t('err_mic_browser'),
  };
  addAIBubble(m[err.name] ?? t('err_mic_generic'), true);
  setUIRecording(false);
}