// API base resolution:
//   1. window.CIDB_API_BASE_URL, if a host page sets it before this script loads
//   2. same origin, when the page is served by the backend (the Docker setup)
//   3. http://localhost:8000, for local dev where the page is opened from disk
//      or from a separate static server (Live Server on 5500, Vite on 5173, ...)
const API_BASE_URL = (function resolveApiBaseUrl() {
  if (typeof window !== 'undefined' && window.CIDB_API_BASE_URL) {
    return window.CIDB_API_BASE_URL;
  }

  const DEV_STATIC_PORTS = ['3000', '5173', '5500'];

  if (
    typeof window === 'undefined' ||
    window.location.protocol === 'file:' ||
    DEV_STATIC_PORTS.includes(window.location.port)
  ) {
    return 'http://localhost:8000';
  }

  return window.location.origin;
})();
const WORKFLOW_CODE = 'CIDB_EMAIL_ID_CANCELLATION';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const FILE_POLICY = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
  allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
};
const MY_STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis',
  'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'];
const PRIORITY_STATE_ORDER = ['Selangor', 'Johor', 'W.P. Kuala Lumpur', 'Sarawak', 'Pulau Pinang'];
const PRIORITY_STATE_SET = new Set(PRIORITY_STATE_ORDER);

const messagesEl = document.getElementById('chatMessages');
const chatWrapperEl = document.querySelector('.chat-wrapper');
const inputEl = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const uploadArea = document.getElementById('uploadArea');
const uploadBtn = document.getElementById('uploadBtn');
const uploadTitle = document.getElementById('uploadTitle');
const quickRepliesShellEl = document.getElementById('quickRepliesShell');
const quickRepliesEl = document.getElementById('quickReplies');
const quickRepliesIndicatorEl = document.getElementById('quickRepliesIndicator');
const liveAgentViewEl = document.getElementById('liveAgentView');
const liveAgentLaunchBtnEl = document.getElementById('liveAgentLaunchBtn');
const liveAgentDemoRowEl = document.querySelector('.live-agent-demo-row');
const chatInputRowEl = document.querySelector('.chat-input-area > .input-row');
const liveAgentTitleEl = document.getElementById('liveAgentTitle');
const liveAgentSubtitleEl = document.getElementById('liveAgentSubtitle');
const liveAgentGreetingTitleEl = document.getElementById('liveAgentGreetingTitle');
const liveAgentGreetingTextEl = document.getElementById('liveAgentGreetingText');
const liveAgentBackBtnEl = document.getElementById('liveAgentBackBtn');
const sigOverlay = document.getElementById('sigOverlay');
const sigCanvas = document.getElementById('sigCanvas');
const sigUploadBtn = document.getElementById('sigUploadBtn');
const sigFileInput = document.getElementById('sigFileInput');
const sigSub = document.getElementById('sigSub');
const identityEditBtn = document.getElementById('identityEditBtn');
const identityEditOverlay = document.getElementById('identityEditOverlay');
const identityEditTitle = document.getElementById('identityEditTitle');
const identityEditSubtitle = document.getElementById('identityEditSubtitle');
const identityEditNameLabel = document.getElementById('identityEditNameLabel');
const identityEditNumberLabel = document.getElementById('identityEditNumberLabel');
const identityEditNameInput = document.getElementById('identityEditName');
const identityEditNumberInput = document.getElementById('identityEditNumber');
const identityEditSaveBtn = document.getElementById('identityEditSaveBtn');
const retryEditOverlay = document.getElementById('retryEditOverlay');
const retryEditTitle = document.getElementById('retryEditTitle');
const retryEditSubtitle = document.getElementById('retryEditSubtitle');
const retryEditSaveBtn = document.getElementById('retryEditSaveBtn');
const retryEditIndividualSection = document.getElementById('retryEditIndividualSection');
const retryEditCompanySection = document.getElementById('retryEditCompanySection');
const retryEditState = document.getElementById('retryEditState');
const retryEditFullName = document.getElementById('retryEditFullName');
const retryEditIdentityNumber = document.getElementById('retryEditIdentityNumber');
const retryEditMobile = document.getElementById('retryEditMobile');
const retryEditEmail = document.getElementById('retryEditEmail');
const retryEditCompanyPpkNumber = document.getElementById('retryEditCompanyPpkNumber');
const retryEditCompanyName = document.getElementById('retryEditCompanyName');
const retryEditCompanyEmail = document.getElementById('retryEditCompanyEmail');
const retryEditCompanyContactNumber = document.getElementById('retryEditCompanyContactNumber');
const retryEditCompanyState = document.getElementById('retryEditCompanyState');
const retryEditDirectorName = document.getElementById('retryEditDirectorName');
const retryEditDirectorIdentityNumber = document.getElementById('retryEditDirectorIdentityNumber');
const retryEditCompanyReason = document.getElementById('retryEditCompanyReason');

const FILE_SLOTS = ['front', 'back', 'certificate'];
const SLOT_DOC_TYPES = { front: 'IC_FRONT', back: 'IC_BACK', certificate: 'SSM_PPK_CERTIFICATE' };
const FINAL_VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000;
const DEBUG_RPA_FLOW = true;
const SUBMISSION_CONTEXT_STORAGE_KEY = 'cidb_submission_context';
let liveAgentDockResizeObserver = null;

const SUBMISSION_HOLD_MESSAGE = {
  en: 'We received your request, please hold while we are checking',
  ms: 'Kami telah menerima permintaan anda, sila tunggu sementara kami menyemak',
};

const SERVICE_OPTIONS = {
  en: [
    { value: 'individual', label: '1. Individual Email ID Cancellation' },
    { value: 'company', label: '2. Company Email ID Cancellation' },
    { value: 'faq', label: '3. PPK/SPKK/STB Renewal Process' },
  ],
  ms: [
    { value: 'individual', label: '1. Pembatalan Email IC Individu' },
    { value: 'company', label: '2. Pembatalan Email ID Syarikat' },
    { value: 'faq', label: '3. Proses Pembaharuan PPK/SPKK/STB' },
  ],
};

const state = {
  step: 'booting',
  uiMode: 'chatbot',
  widgetOpen: false,
  sessionId: null,
  languageCode: null,
  en: true,
  serviceType: 'individual',
  stateName: '',
  stateCode: '',
  name: '',
  identityType: '',
  identityNumber: '',
  companyPpkNumber: '',
  companyName: '',
  companyEmail: '',
  companyContactNumber: '',
  companyCategory: '',
  companyDirectorName: '',
  companyDirectorIdentityType: '',
  companyDirectorIdentityNumber: '',
  companyReason: '',
  faqEnquiryTitle: '',
  faqLastEnquiry: '',
  faqApplicantCategory: '',
  sigDataUrl: null,
  uploads: { front: null, back: null, certificate: null, signature: null },
  files: { front: null, back: null, certificate: null, signature: null },
  submission: null,
  requestNumber: null,
  retryRequestIdentifier: null,
  cancellationRetryInFlight: false,
  identityEditEnabled: false,
};

function isCompanyService() {
  return String(state.serviceType || '').toLowerCase() === 'company';
}

function getActiveIdentityType() {
  return isCompanyService() ? state.companyDirectorIdentityType : state.identityType;
}

function isPassportIdentityType(identityType = getActiveIdentityType()) {
  return String(identityType || '').trim().toUpperCase() === 'PASSPORT';
}

function requiresBackDocument(identityType = getActiveIdentityType()) {
  return !isPassportIdentityType(identityType);
}

function getFrontDocumentLabel(en = state.en) {
  return isPassportIdentityType() ? (en ? 'Passport Page' : 'Muka Surat Pasport') : (en ? 'IC Front' : 'IC Depan');
}

function getBackDocumentLabel(en = state.en) {
  return en ? 'IC Back' : 'IC Belakang';
}

function getSignatureInstructionLabel(en = state.en) {
  return en ? 'Tap to sign / upload' : 'Ketik untuk tandatangan / muat naik';
}

function getCertificateDocumentLabel(en = state.en) {
  return en ? 'SSM / PPK Certificate' : 'Sijil SSM / PPK';
}

function buildUploadExampleSectionHtml() {
  return (
    '<div class="upload-example-section">'
    + '<div class="upload-example-title">Example</div>'
    + '<div class="upload-example-grid">'
    + '<figure class="upload-example-card">'
    + '<img src="assets/images/ic-front-example.png" alt="IC Front Example" class="upload-example-img" loading="lazy">'
    + '<figcaption>IC Front Example</figcaption>'
    + '</figure>'
    + '<figure class="upload-example-card">'
    + '<img src="assets/images/ic-back-example.png" alt="IC Back Example" class="upload-example-img" loading="lazy">'
    + '<figcaption>IC Back Example</figcaption>'
    + '</figure>'
    + '</div>'
    + '</div>'
  );
}

function buildUploadTipHtml(messageHtml) {
  return `${messageHtml}${buildUploadExampleSectionHtml()}`;
}

function getIdentityEditUi(en = state.en) {
  if (isCompanyService()) {
    return en ? {
      button: 'Edit Name and IC Number',
      title: 'Edit Director Details',
      subtitle: 'Only update the director name and identification number previously entered. Uploaded documents will stay unchanged.',
      nameLabel: "Director's Full Name",
      numberLabel: "Director's IC / Passport Number",
    } : {
      button: 'Sunting Nama dan No. IC',
      title: 'Sunting Butiran Pengarah',
      subtitle: 'Kemas kini hanya nama pengarah dan nombor pengenalan yang telah dimasukkan sebelum ini. Dokumen yang dimuat naik kekal sama.',
      nameLabel: 'Nama Penuh Pengarah',
      numberLabel: 'Nombor IC / Pasport Pengarah',
    };
  }

  return en ? {
    button: 'Edit Name and IC Number',
    title: 'Edit Name and IC Number',
    subtitle: 'Only update the name and identification number previously entered. Uploaded documents will stay unchanged.',
    nameLabel: 'Full Name',
    numberLabel: 'IC / Passport Number',
  } : {
    button: 'Sunting Nama dan No. IC',
    title: 'Sunting Nama dan No. IC',
    subtitle: 'Kemas kini hanya nama dan nombor pengenalan yang telah dimasukkan sebelum ini. Dokumen yang dimuat naik kekal sama.',
    nameLabel: 'Nama Penuh',
    numberLabel: 'Nombor IC / Pasport',
  };
}

function syncIdentityEditUi() {
  const ui = getIdentityEditUi(state.en);
  if (identityEditBtn) identityEditBtn.textContent = ui.button;
  if (identityEditTitle) identityEditTitle.textContent = ui.title;
  if (identityEditSubtitle) identityEditSubtitle.textContent = ui.subtitle;
  if (identityEditNameLabel) identityEditNameLabel.textContent = ui.nameLabel;
  if (identityEditNumberLabel) identityEditNumberLabel.textContent = ui.numberLabel;
  if (identityEditSaveBtn) identityEditSaveBtn.textContent = state.en ? 'Save' : 'Simpan';
}

function updateIdentityEditVisibility() {
  if (!identityEditBtn) return;
  identityEditBtn.style.display = state.identityEditEnabled ? 'inline-flex' : 'none';
}

function getLiveAgentUi(en = state.en) {
  return en ? {
    subtitle: 'CIDB support desk',
    greetingTitle: 'Thank you for contacting CIDB Live Agent.',
    greetingText: 'How may I assist you today?',
    back: 'Back to Chatbot',
  } : {
    subtitle: 'Meja bantuan CIDB',
    greetingTitle: 'Terima kasih kerana menghubungi CIDB Live Agent.',
    greetingText: 'Bagaimanakah saya boleh membantu anda hari ini?',
    back: 'Kembali ke Chatbot',
  };
}

function syncLiveAgentUi() {
  const ui = getLiveAgentUi(state.en);
  if (liveAgentSubtitleEl) liveAgentSubtitleEl.textContent = ui.subtitle;
  if (liveAgentGreetingTitleEl) liveAgentGreetingTitleEl.textContent = ui.greetingTitle;
  if (liveAgentGreetingTextEl) liveAgentGreetingTextEl.textContent = ui.greetingText;
  if (liveAgentBackBtnEl) liveAgentBackBtnEl.textContent = ui.back;
  if (liveAgentTitleEl) liveAgentTitleEl.textContent = state.en ? 'Live Agent' : 'Live Agent';
}

function updateLiveAgentDockPosition() {
  if (!liveAgentDemoRowEl || !chatInputRowEl) {
    return;
  }

  const quickRepliesVisible = quickRepliesShellEl && getComputedStyle(quickRepliesShellEl).display !== 'none';
  const uploadVisible = uploadArea && getComputedStyle(uploadArea).display !== 'none';
  const quickRepliesHeight = quickRepliesVisible ? quickRepliesShellEl.offsetHeight : 0;
  const uploadHeight = uploadVisible ? uploadArea.offsetHeight : 0;
  const inputHeight = chatInputRowEl.offsetHeight || 0;
  const gap = 10;
  const bottomOffset = Math.max(0, inputHeight + quickRepliesHeight + uploadHeight + gap);

  liveAgentDemoRowEl.style.bottom = `${bottomOffset}px`;
}

function initLiveAgentDockTracking() {
  if (liveAgentDockResizeObserver || typeof ResizeObserver === 'undefined') {
    updateLiveAgentDockPosition();
    return;
  }

  liveAgentDockResizeObserver = new ResizeObserver(() => {
    updateLiveAgentDockPosition();
  });

  if (quickRepliesShellEl) {
    liveAgentDockResizeObserver.observe(quickRepliesShellEl);
  }
  if (uploadArea) {
    liveAgentDockResizeObserver.observe(uploadArea);
  }
  if (chatInputRowEl) {
    liveAgentDockResizeObserver.observe(chatInputRowEl);
  }

  window.addEventListener('resize', updateLiveAgentDockPosition);
  updateLiveAgentDockPosition();
}

function setChatWidgetOpen(isOpen) {
  state.widgetOpen = Boolean(isOpen);
  if (document?.body) {
    document.body.classList.toggle('chat-widget-open', state.widgetOpen);
  }
  if (chatWrapperEl) {
    chatWrapperEl.setAttribute('aria-hidden', state.widgetOpen ? 'false' : 'true');
  }
}

function openChatWidget() {
  setChatWidgetOpen(true);
  state.uiMode = 'chatbot';
  closeLiveAgentView();
  updateLiveAgentDockPosition();
  if (inputEl && typeof inputEl.focus === 'function') {
    inputEl.focus({ preventScroll: true });
  }
}

function closeChatWidget() {
  closeLiveAgentView();
  setChatWidgetOpen(false);
  state.uiMode = 'chatbot';
}

function openLiveAgentView() {
  if (!liveAgentViewEl) {
    return;
  }

  setChatWidgetOpen(true);
  updateLiveAgentDockPosition();
  syncLiveAgentUi();
  state.uiMode = 'live-agent';
  if (chatWrapperEl) {
    chatWrapperEl.classList.add('live-agent-open');
  }
  liveAgentViewEl.setAttribute('aria-hidden', 'false');
}

function closeLiveAgentView() {
  if (!liveAgentViewEl) {
    return;
  }

  state.uiMode = 'chatbot';
  if (chatWrapperEl) {
    chatWrapperEl.classList.remove('live-agent-open');
  }
  liveAgentViewEl.setAttribute('aria-hidden', 'true');
}

function getEditableIdentityValues() {
  if (isCompanyService()) {
    return {
      name: firstNonEmpty(state.companyDirectorName),
      identityNumber: firstNonEmpty(state.companyDirectorIdentityNumber),
    };
  }

  return {
    name: firstNonEmpty(state.name),
    identityNumber: firstNonEmpty(state.identityNumber),
  };
}

function applyEditableIdentityValues(name, identityNumber) {
  const normalizedName = firstNonEmpty(name);
  const normalizedIdentityNumber = firstNonEmpty(identityNumber);

  if (isCompanyService()) {
    state.companyDirectorName = normalizedName;
    state.companyDirectorIdentityNumber = normalizedIdentityNumber;
  } else {
    state.name = normalizedName;
    state.identityNumber = normalizedIdentityNumber;
  }
}

function setIdentityEditLoading(isLoading) {
  if (!identityEditSaveBtn) return;
  identityEditSaveBtn.disabled = isLoading;
  identityEditSaveBtn.textContent = isLoading
    ? (state.en ? 'Saving...' : 'Menyimpan...')
    : (state.en ? 'Save' : 'Simpan');
}

function openIdentityEditModal() {
  if (!identityEditOverlay) return;
  syncIdentityEditUi();
  const values = getEditableIdentityValues();
  identityEditNameInput.value = values.name || '';
  identityEditNumberInput.value = values.identityNumber || '';
  identityEditOverlay.classList.add('open');
  setTimeout(() => {
    identityEditNameInput.focus();
    identityEditNameInput.select();
  }, 0);
}

function closeIdentityEditModal(event) {
  if (event && event.target !== identityEditOverlay) {
    return;
  }

  if (!identityEditOverlay) return;
  identityEditOverlay.classList.remove('open');
  setIdentityEditLoading(false);
}

async function saveIdentityEdit() {
  const name = String(identityEditNameInput?.value || '').trim();
  const identityNumber = String(identityEditNumberInput?.value || '').trim();

  if (!name || !identityNumber) {
    await addMsg(state.en
      ? 'Please fill in both the name and identification number.'
      : 'Sila lengkapkan kedua-dua nama dan nombor pengenalan.', 'error');
    return;
  }

  setIdentityEditLoading(true);
  try {
    const payload = isCompanyService()
      ? {
          session_id: state.sessionId,
          director_full_name: name,
          director_identity_number: identityNumber,
          identity_type: state.companyDirectorIdentityType || null,
        }
      : {
          session_id: state.sessionId,
          full_name: name,
          identity_number: identityNumber,
          identity_type: state.identityType || null,
        };

    const response = await apiRequest('/session/identity-edit', {
      method: 'POST',
      body: payload,
    });

    const data = extractData(response);
    const updatedSession = isPlainObject(data.session) ? data.session : data;
    updateSessionStateFromSession(updatedSession);
    applyEditableIdentityValues(name, identityNumber);
    closeIdentityEditModal();
    syncIdentityEditUi();
    updateIdentityEditVisibility();
    checkAllFilled();
    await addMsg(state.en
      ? 'Your name and identification number have been updated. You can submit the documents again when ready.'
      : 'Nama dan nombor pengenalan anda telah dikemas kini. Anda boleh menghantar dokumen semula apabila bersedia.');
  } catch (error) {
    setIdentityEditLoading(false);
    await showApiError(error, state.en ? 'Unable to update identity details.' : 'Tidak dapat mengemas kini butiran pengenalan.');
  }
}

function getRetryEditUi(en = state.en) {
  if (isCompanyService()) {
    return en ? {
      title: 'Edit Data Before Resubmitting',
      subtitle: 'Review every company detail you entered before the retry is sent again.',
      saveLabel: 'Save and Retry',
      cancelLabel: 'Cancel',
      individualLabel: 'Individual details',
      companyLabel: 'Company details',
      stateLabel: 'State',
      ppkLabel: 'PPK / SSM Number',
      companyNameLabel: 'Company Name',
      companyEmailLabel: 'Company Email',
      companyContactLabel: 'Company Contact Number',
      directorNameLabel: 'Director\'s Full Name',
      directorIdentityLabel: 'Director\'s IC / Passport Number',
      reasonLabel: 'Reason',
    } : {
      title: 'Sunting Data Sebelum Hantar Semula',
      subtitle: 'Semak semula semua butiran syarikat yang telah anda isi sebelum percubaan semula dihantar.',
      saveLabel: 'Simpan dan Hantar Semula',
      cancelLabel: 'Batal',
      individualLabel: 'Butiran individu',
      companyLabel: 'Butiran syarikat',
      stateLabel: 'Negeri',
      ppkLabel: 'Nombor PPK / SSM',
      companyNameLabel: 'Nama Syarikat',
      companyEmailLabel: 'Emel Syarikat',
      companyContactLabel: 'Nombor Telefon Syarikat',
      directorNameLabel: 'Nama Penuh Pengarah',
      directorIdentityLabel: 'Nombor IC / Pasport Pengarah',
      reasonLabel: 'Sebab',
    };
  }

  return en ? {
    title: 'Edit Data Before Resubmitting',
    subtitle: 'Review every detail you entered before the retry is sent again.',
    saveLabel: 'Save and Retry',
    cancelLabel: 'Cancel',
    individualLabel: 'Your details',
    stateLabel: 'State',
    fullNameLabel: 'Full Name',
    identityLabel: 'IC / Passport Number',
    mobileLabel: 'Mobile Number',
    emailLabel: 'Email Address',
  } : {
    title: 'Sunting Data Sebelum Hantar Semula',
    subtitle: 'Semak semula semua butiran yang telah anda isi sebelum percubaan semula dihantar.',
    saveLabel: 'Simpan dan Hantar Semula',
    cancelLabel: 'Batal',
    individualLabel: 'Butiran anda',
    stateLabel: 'Negeri',
    fullNameLabel: 'Nama Penuh',
    identityLabel: 'Nombor IC / Pasport',
    mobileLabel: 'Nombor Telefon Bimbit',
    emailLabel: 'Alamat Emel',
  };
}

function fillRetryEditStateOptions() {
  const selects = [retryEditState, retryEditCompanyState].filter(Boolean);
  selects.forEach(select => {
    select.innerHTML = '';
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = state.en ? 'Select state' : 'Pilih negeri';
    select.appendChild(blankOption);
    getStateSelectionOptions().forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      select.appendChild(option);
    });
  });
}

function syncRetryEditUi() {
  if (!retryEditOverlay) return;
  const ui = getRetryEditUi(state.en);
  if (retryEditTitle) retryEditTitle.textContent = ui.title;
  if (retryEditSubtitle) retryEditSubtitle.textContent = ui.subtitle;
  if (retryEditSaveBtn) retryEditSaveBtn.textContent = ui.saveLabel;
  if (document.getElementById('retryEditCancelBtn')) {
    document.getElementById('retryEditCancelBtn').textContent = ui.cancelLabel;
  }
  if (document.getElementById('retryEditIndividualHeading')) {
    document.getElementById('retryEditIndividualHeading').textContent = ui.individualLabel;
  }
  if (document.getElementById('retryEditCompanyHeading')) {
    document.getElementById('retryEditCompanyHeading').textContent = ui.companyLabel;
  }

  const individualSection = retryEditIndividualSection;
  const companySection = retryEditCompanySection;
  if (individualSection) individualSection.style.display = isCompanyService() ? 'none' : 'block';
  if (companySection) companySection.style.display = isCompanyService() ? 'block' : 'none';

  if (!isCompanyService()) {
    if (document.getElementById('retryEditStateLabel')) document.getElementById('retryEditStateLabel').textContent = ui.stateLabel;
    if (document.getElementById('retryEditFullNameLabel')) document.getElementById('retryEditFullNameLabel').textContent = ui.fullNameLabel;
    if (document.getElementById('retryEditIdentityNumberLabel')) document.getElementById('retryEditIdentityNumberLabel').textContent = ui.identityLabel;
    if (document.getElementById('retryEditMobileLabel')) document.getElementById('retryEditMobileLabel').textContent = ui.mobileLabel;
    if (document.getElementById('retryEditEmailLabel')) document.getElementById('retryEditEmailLabel').textContent = ui.emailLabel;
  } else {
    if (document.getElementById('retryEditCompanyStateLabel')) document.getElementById('retryEditCompanyStateLabel').textContent = ui.stateLabel;
    if (document.getElementById('retryEditCompanyPpkNumberLabel')) document.getElementById('retryEditCompanyPpkNumberLabel').textContent = ui.ppkLabel;
    if (document.getElementById('retryEditCompanyNameLabel')) document.getElementById('retryEditCompanyNameLabel').textContent = ui.companyNameLabel;
    if (document.getElementById('retryEditCompanyEmailLabel')) document.getElementById('retryEditCompanyEmailLabel').textContent = ui.companyEmailLabel;
    if (document.getElementById('retryEditCompanyContactNumberLabel')) document.getElementById('retryEditCompanyContactNumberLabel').textContent = ui.companyContactLabel;
    if (document.getElementById('retryEditDirectorNameLabel')) document.getElementById('retryEditDirectorNameLabel').textContent = ui.directorNameLabel;
    if (document.getElementById('retryEditDirectorIdentityNumberLabel')) document.getElementById('retryEditDirectorIdentityNumberLabel').textContent = ui.directorIdentityLabel;
    if (document.getElementById('retryEditCompanyReasonLabel')) document.getElementById('retryEditCompanyReasonLabel').textContent = ui.reasonLabel;
  }

  fillRetryEditStateOptions();
}

function getRetryEditSnapshot() {
  if (isCompanyService()) {
    return {
      state: firstNonEmpty(state.stateName),
      company_ppk_number: firstNonEmpty(state.companyPpkNumber),
      company_name: firstNonEmpty(state.companyName),
      company_email: firstNonEmpty(state.companyEmail),
      company_contact_number: firstNonEmpty(state.companyContactNumber),
      director_full_name: firstNonEmpty(state.companyDirectorName),
      director_identity_number: firstNonEmpty(state.companyDirectorIdentityNumber),
      company_cancellation_reason: firstNonEmpty(state.companyReason),
      director_identity_type: firstNonEmpty(state.companyDirectorIdentityType),
    };
  }

  return {
    state: firstNonEmpty(state.stateName),
    full_name: firstNonEmpty(state.name),
    identity_number: firstNonEmpty(state.identityNumber),
    mobile: firstNonEmpty(state.mobile),
    email: firstNonEmpty(state.email),
    identity_type: firstNonEmpty(state.identityType),
  };
}

function setRetryEditValues() {
  const snapshot = getRetryEditSnapshot();
  if (isCompanyService()) {
    if (retryEditCompanyState) retryEditCompanyState.value = snapshot.state || '';
    if (retryEditCompanyPpkNumber) retryEditCompanyPpkNumber.value = snapshot.company_ppk_number || '';
    if (retryEditCompanyName) retryEditCompanyName.value = snapshot.company_name || '';
    if (retryEditCompanyEmail) retryEditCompanyEmail.value = snapshot.company_email || '';
    if (retryEditCompanyContactNumber) retryEditCompanyContactNumber.value = snapshot.company_contact_number || '';
    if (retryEditDirectorName) retryEditDirectorName.value = snapshot.director_full_name || '';
    if (retryEditDirectorIdentityNumber) retryEditDirectorIdentityNumber.value = snapshot.director_identity_number || '';
    if (retryEditCompanyReason) retryEditCompanyReason.value = snapshot.company_cancellation_reason || '';
  } else {
    if (retryEditState) retryEditState.value = snapshot.state || '';
    if (retryEditFullName) retryEditFullName.value = snapshot.full_name || '';
    if (retryEditIdentityNumber) retryEditIdentityNumber.value = snapshot.identity_number || '';
    if (retryEditMobile) retryEditMobile.value = snapshot.mobile || '';
    if (retryEditEmail) retryEditEmail.value = snapshot.email || '';
  }
}

function setRetryEditLoading(isLoading) {
  if (!retryEditSaveBtn) return;
  retryEditSaveBtn.disabled = isLoading;
  retryEditSaveBtn.textContent = isLoading
    ? (state.en ? 'Saving...' : 'Menyimpan...')
    : getRetryEditUi(state.en).saveLabel;
}

function openRetryEditModal() {
  if (!retryEditOverlay) return;
  syncRetryEditUi();
  setRetryEditValues();
  retryEditOverlay.classList.add('open');
}

function closeRetryEditModal(event) {
  if (event && event.target !== retryEditOverlay) {
    return;
  }

  if (!retryEditOverlay) return;
  retryEditOverlay.classList.remove('open');
  setRetryEditLoading(false);
}

function buildRetryEditPayload() {
  if (isCompanyService()) {
    const directorIdentity = buildIdentityPayload(String(retryEditDirectorIdentityNumber?.value || '').trim());
    return {
      session_id: state.sessionId,
      state: String(retryEditCompanyState?.value || '').trim(),
      company_ppk_number: String(retryEditCompanyPpkNumber?.value || '').trim(),
      company_name: String(retryEditCompanyName?.value || '').trim(),
      company_email: String(retryEditCompanyEmail?.value || '').trim(),
      company_contact_number: String(retryEditCompanyContactNumber?.value || '').trim(),
      director_full_name: String(retryEditDirectorName?.value || '').trim(),
      director_identity_number: String(retryEditDirectorIdentityNumber?.value || '').trim(),
      company_cancellation_reason: String(retryEditCompanyReason?.value || '').trim(),
      director_identity_type: directorIdentity?.identity_type || state.companyDirectorIdentityType || null,
    };
  }

  const identity = buildIdentityPayload(String(retryEditIdentityNumber?.value || '').trim());
  return {
    session_id: state.sessionId,
    state: String(retryEditState?.value || '').trim(),
    full_name: String(retryEditFullName?.value || '').trim(),
    identity_number: String(retryEditIdentityNumber?.value || '').trim(),
    mobile: String(retryEditMobile?.value || '').trim(),
    email: String(retryEditEmail?.value || '').trim(),
    identity_type: identity?.identity_type || state.identityType || null,
  };
}

async function saveRetryEdit() {
  if (!state.sessionId) {
    return;
  }

  setRetryEditLoading(true);
  try {
    const response = await apiRequest('/session/retry-edit', {
      method: 'POST',
      body: buildRetryEditPayload(),
    });

    const data = extractData(response);
    if (isPlainObject(data.session)) {
      updateSessionStateFromSession(data.session);
    } else if (isPlainObject(data)) {
      updateSessionStateFromSession(data.session || data);
    }

    closeRetryEditModal();
    await addMsg(state.en
      ? 'Your updated details have been saved. Resubmitting now...'
      : 'Butiran yang dikemas kini telah disimpan. Sedang menghantar semula...');
    await handleCancellationRetry();
  } catch (error) {
    setRetryEditLoading(false);
    await showApiError(error, state.en ? 'Unable to update retry data.' : 'Tidak dapat mengemas kini data percubaan semula.');
  }
}

function syncUploadPanelBranch() {
  const passport = isPassportIdentityType();
  const backSlot = document.getElementById('slot-back');
  const backInput = document.getElementById('file-back');
  const backThumb = document.getElementById('thumb-back');
  const backSub = document.getElementById('sub-back');
  const sigSlot = document.getElementById('slot-sig');
  const certSlot = document.getElementById('slot-certificate');
  const certInput = document.getElementById('file-certificate');
  const certThumb = document.getElementById('thumb-certificate');
  const certSub = document.getElementById('sub-certificate');

  if (backSlot) {
    backSlot.style.display = passport ? 'none' : 'flex';
  }

  if (sigSlot) {
    sigSlot.style.display = isCompanyService() ? 'none' : 'flex';
  }

  if (certSlot) {
    certSlot.style.display = isCompanyService() ? 'flex' : 'none';
  }

  if (passport) {
    state.uploads.back = null;
    state.files.back = null;
    if (backInput) backInput.value = '';
    if (backThumb) backThumb.removeAttribute('src');
    if (backSub) backSub.textContent = state.en ? 'Not required for passport' : 'Tidak diperlukan untuk pasport';
  } else if (backSub) {
    backSub.textContent = state.en ? 'Tap to upload' : 'Ketik untuk muat naik';
  }

  if (isCompanyService()) {
    state.uploads.signature = null;
    state.files.signature = null;
    state.sigDataUrl = null;
    if (sigSlot) sigSlot.classList.remove('has-file');
    if (document.getElementById('thumb-sig')) {
      document.getElementById('thumb-sig').removeAttribute('src');
    }
    if (document.getElementById('sub-sig')) {
      document.getElementById('sub-sig').textContent = state.en ? 'Not required for company' : 'Tidak diperlukan untuk syarikat';
    }
    if (certSub && !state.uploads.certificate) {
      certSub.textContent = state.en ? 'Tap to upload' : 'Ketik untuk muat naik';
    }
    if (certInput && state.uploads.certificate === null) {
      certInput.value = '';
    }
    if (certThumb && state.uploads.certificate === null) {
      certThumb.removeAttribute('src');
    }
  } else {
    state.uploads.certificate = null;
    state.files.certificate = null;
    if (certInput) certInput.value = '';
    if (certThumb) certThumb.removeAttribute('src');
    if (certSub) certSub.textContent = state.en ? 'Tap to upload' : 'Ketik untuk muat naik';
  }
}

let sigCtx = null;
let sigDrawing = false;
let sigHasStrokes = false;
let sigCanvasReady = false;
let submissionPollSequence = 0;
let pendingQuickReplyValue = null;
let pendingQuickReplyDisplay = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeApiBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function traceRpaFlow(event, details = {}) {
  if (!DEBUG_RPA_FLOW || typeof console === 'undefined' || typeof console.debug !== 'function') {
    return;
  }

  console.debug('[RPA FLOW]', event, {
    clientTimestamp: new Date().toISOString(),
    ...details,
  });
}

function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return normalizeApiBaseUrl(API_BASE_URL) + normalizedPath;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text !== '') return text;
  }
  return '';
}

function extractData(payload) {
  if (!isPlainObject(payload)) return {};
  if (isPlainObject(payload.data)) return payload.data;
  if (isPlainObject(payload.payload?.data)) return payload.payload.data;
  return {};
}

function extractEntityId(entity) {
  if (!isPlainObject(entity)) return '';
  return firstNonEmpty(
    entity.id,
    entity.session_id,
    entity.sessionId,
    entity.request_id,
    entity.requestId,
    entity.request_number,
    entity.requestNumber,
    entity.uuid
  );
}

function extractRequestNumber(entity) {
  if (!isPlainObject(entity)) return '';
  return firstNonEmpty(entity.request_number, entity.requestNumber, entity.reference_no, entity.referenceNo);
}

function resolveSubmissionIdentifier(requestNumber, submission) {
  const requestNo = firstNonEmpty(requestNumber, extractRequestNumber(submission));
  return requestNo;
}

function stripWrappingQuotes(text) {
  let value = String(text || '').trim();
  while (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'') || (first === '“' && last === '”')) {
      value = value.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return value;
}

function normalizeBotReplies(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (!isPlainObject(item)) return '';
      return firstNonEmpty(item.label, item.text, item.message, item.value);
    })
    .filter(Boolean);
}

function renderBackendMessage(message) {
  return escapeHtml(String(message || '')).replace(/\r?\n/g, '<br>');
}

function sanitizeBotHtml(html) {
  const allowedTags = new Set(['A', 'B', 'BR', 'EM', 'LI', 'OL', 'P', 'STRONG', 'UL']);
  const allowedProtocols = new Set(['http:', 'https:']);
  const template = document.createElement('template');
  template.innerHTML = String(html || '');

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = String(node.nodeValue || '');
      if (text.trim() === '') {
        return '';
      }
      return escapeHtml(text).replace(/\r?\n/g, '<br>');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tagName = node.tagName.toUpperCase();
    const children = Array.from(node.childNodes).map(sanitizeNode).join('');

    if (!allowedTags.has(tagName)) {
      return children;
    }

    if (tagName === 'BR') {
      return '<br>';
    }

    if (tagName === 'A') {
      const href = String(node.getAttribute('href') || '').trim();
      if (!href) {
        return children;
      }

      try {
        const parsed = new URL(href, window.location.href);
        if (!allowedProtocols.has(parsed.protocol)) {
          return children;
        }

        const safeHref = escapeHtml(parsed.toString());
        const safeChildren = children || safeHref;
        return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener">${safeChildren}</a>`;
      } catch (error) {
        return children;
      }
    }

    return `<${tagName.toLowerCase()}>${children}</${tagName.toLowerCase()}>`;
  };

  return Array.from(template.content.childNodes).map(sanitizeNode).join('');
}

function renderBotRichMessage(message) {
  return sanitizeBotHtml(String(message || '').replace(/\bRPA\b\s*/gi, ''));
}

function startWaitMessageSequence(en) {
  const typingBubble = startTypingBubble();
  return {
    stop() {
      typingBubble.stop();
    },
  };
}

function startDisplayMessageWaitSequence(en) {
  const bubble = document.createElement('div');
  bubble.className = 'msg bot wait-message';
  bubble.innerHTML = renderBackendMessage(SUBMISSION_HOLD_MESSAGE[en ? 'en' : 'ms']);
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  const typingBubble = startTypingBubble();

  return {
    stop() {
      typingBubble.stop();
    },
  };
}

function formatValidationErrors(errors) {
    if (!isPlainObject(errors)) return '';
    const parts = [];
    const appendValue = (prefix, value) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => appendValue(`${prefix}[${index}]`, item));
        return;
      }
      if (isPlainObject(value)) {
        const entries = Object.entries(value);
        if (entries.length === 0) {
          return;
        }
        entries.forEach(([childKey, childValue]) => appendValue(prefix ? `${prefix}.${childKey}` : childKey, childValue));
        return;
      }
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        parts.push(`${escapeHtml(prefix)}: ${escapeHtml(value)}`);
      }
    };

    for (const [key, value] of Object.entries(errors)) {
      appendValue(key, value);
    }

    return parts.join('<br>');
  }

function addMsg(html, type = 'bot') {
  return new Promise(resolve => {
    const div = document.createElement('div');
    div.className = 'msg ' + type;
    div.innerHTML = html;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    setTimeout(resolve, 0);
  });
}

function showTyping(ms = 900) {
  return new Promise(resolve => {
    const t = document.createElement('div');
    t.className = 'typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(t);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    setTimeout(() => {
      t.remove();
      resolve();
    }, ms);
  });
}

function startTypingBubble() {
  const bubble = document.createElement('div');
  bubble.className = 'typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  let stopped = false;
  return {
    bubble,
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      bubble.remove();
    },
  };
}

function setInput(on) {
  inputEl.disabled = !on;
  sendBtn.disabled = !on;
}

function isServiceOptionSet(opts) {
  return Array.isArray(opts)
    && opts.length === 3
    && opts.every(option =>
      isPlainObject(option)
      && ['individual', 'company', 'faq'].includes(String(option.value || ''))
      && typeof option.label === 'string');
}

function isStateOptionSet(opts) {
  return Array.isArray(opts)
    && opts.length >= 8
    && opts.every(option => MY_STATES.includes(String(isPlainObject(option) ? (option.display ?? option.label ?? option.value ?? '') : option).trim()));
}

let quickRepliesOverflowFrame = null;

function updateQuickRepliesOverflowState() {
  if (!quickRepliesShellEl || !quickRepliesEl) {
    return;
  }

  const hasOptions = quickRepliesEl.children.length > 0;
  quickRepliesShellEl.classList.toggle('has-options', hasOptions);

  if (!hasOptions) {
    quickRepliesShellEl.classList.remove('has-more-right');
    return;
  }

  const overflow = quickRepliesEl.scrollWidth > quickRepliesEl.clientWidth + 1;
  const hasMoreRight = overflow && (quickRepliesEl.scrollLeft + quickRepliesEl.clientWidth) < (quickRepliesEl.scrollWidth - 1);
  quickRepliesShellEl.classList.toggle('has-more-right', hasMoreRight);
}

function scheduleQuickRepliesOverflowStateUpdate() {
  if (quickRepliesOverflowFrame !== null) {
    cancelAnimationFrame(quickRepliesOverflowFrame);
  }

  quickRepliesOverflowFrame = requestAnimationFrame(() => {
    quickRepliesOverflowFrame = null;
    updateQuickRepliesOverflowState();
  });
}

if (quickRepliesEl) {
  quickRepliesEl.addEventListener('scroll', scheduleQuickRepliesOverflowStateUpdate, { passive: true });

  if (typeof MutationObserver !== 'undefined') {
    const quickRepliesObserver = new MutationObserver(() => scheduleQuickRepliesOverflowStateUpdate());
    quickRepliesObserver.observe(quickRepliesEl, { childList: true });
  }
}

if (quickRepliesIndicatorEl) {
  quickRepliesIndicatorEl.addEventListener('click', () => {
    if (!quickRepliesEl) {
      return;
    }
    quickRepliesEl.scrollBy({
      left: Math.max(180, Math.floor(quickRepliesEl.clientWidth * 0.8)),
      behavior: 'smooth',
    });
  });
}

window.addEventListener('resize', scheduleQuickRepliesOverflowStateUpdate);

function splitQuickReplyLabel(label) {
  const match = String(label || '').match(/^(\d+)\.\s*(.+)$/);
  if (match) {
    return { title: match[2] };
  }
  return { title: String(label || '') };
}

function getServiceOptionIcon(value) {
  const icons = {
    individual: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8" r="3.2"></circle>
        <path d="M5.5 19c.7-3.1 3.1-4.8 6.5-4.8s5.8 1.7 6.5 4.8"></path>
      </svg>
    `,
    company: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.5 19.5h15"></path>
        <path d="M6.5 19.5V6.8h5.2v12.7"></path>
        <path d="M11.7 19.5V4.5h5.8v15"></path>
        <path d="M8.1 9.2h1.2M8.1 12h1.2M8.1 14.8h1.2M13.2 7.4h1.2M13.2 10.2h1.2M13.2 13h1.2M13.2 15.8h1.2"></path>
      </svg>
    `,
    faq: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.5 4.8h8.9L18.5 8v11.2H6.5z"></path>
        <path d="M15.4 4.8V8h3.1"></path>
        <path d="M9.4 12.1c.2-1.5 1.4-2.5 2.8-2.5 1.3 0 2.3.8 2.3 2 0 1.1-.8 1.6-1.7 2-.8.3-1.2.8-1.2 1.6"></path>
        <circle cx="12.6" cy="17.5" r="0.9"></circle>
      </svg>
    `,
  };
  return icons[value] || icons.faq;
}

function getStateLocationIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11z"></path>
      <circle cx="12" cy="10" r="2.2"></circle>
    </svg>
  `;
}

function setQR(opts) {
  quickRepliesEl.innerHTML = '';
  quickRepliesEl.scrollLeft = 0;
  const stateOptions = isStateOptionSet(opts);
  const compactOptions = Array.isArray(opts) && opts.length > 0 && opts.length <= 2 && !stateOptions && !isServiceOptionSet(opts);
  quickRepliesEl.classList.toggle('service-options', isServiceOptionSet(opts));
  quickRepliesEl.classList.toggle('state-options', stateOptions);
  quickRepliesEl.classList.toggle('compact-options', compactOptions);
  quickRepliesShellEl.classList.toggle('state-options', stateOptions);
  quickRepliesShellEl.classList.toggle('compact-options', compactOptions);
  opts.forEach(option => {
    const button = document.createElement('button');
    button.className = 'qr-btn';
    if (isPlainObject(option)) {
      const label = String(option.label ?? option.text ?? option.value ?? '');
      const display = String(option.display ?? label);
      const value = String(option.value ?? option.label ?? '');
      button.dataset.value = value;
      button.dataset.display = display;
      if (quickRepliesEl.classList.contains('service-options')) {
        const parts = splitQuickReplyLabel(label);
        button.classList.add('qr-option');
        button.innerHTML = `
          <span class="qr-option-icon" aria-hidden="true">${getServiceOptionIcon(value)}</span>
          <span class="qr-option-copy">
            <span class="qr-option-title">${escapeHtml(parts.title || display)}</span>
          </span>
        `;
      } else if (quickRepliesEl.classList.contains('state-options')) {
        button.classList.add('qr-state-option');
        button.innerHTML = `
          <span class="qr-state-icon" aria-hidden="true">${getStateLocationIcon()}</span>
          <span class="qr-state-copy">
            <span class="qr-state-title">${escapeHtml(display)}</span>
          </span>
        `;
      } else {
        button.textContent = display;
      }
    } else {
      const display = String(option);
      button.dataset.value = display;
      button.dataset.display = display;
      if (quickRepliesEl.classList.contains('state-options')) {
        button.classList.add('qr-state-option');
        button.innerHTML = `
          <span class="qr-state-icon" aria-hidden="true">${getStateLocationIcon()}</span>
          <span class="qr-state-copy">
            <span class="qr-state-title">${escapeHtml(display)}</span>
          </span>
        `;
      } else {
        button.textContent = display;
      }
    }
    button.onclick = () => {
      quickRepliesEl.innerHTML = '';
      pendingQuickReplyValue = button.dataset.value || null;
      pendingQuickReplyDisplay = button.dataset.display || button.textContent || '';
      inputEl.value = pendingQuickReplyDisplay;
      sendMessage();
    };
    quickRepliesEl.appendChild(button);
  });
  scheduleQuickRepliesOverflowStateUpdate();
}

function setQuickReplyAction(label, handler) {
  quickRepliesEl.innerHTML = '';
  quickRepliesEl.scrollLeft = 0;
  const button = document.createElement('button');
  button.className = 'qr-btn';
  button.textContent = label;
  button.onclick = async () => {
    if (button.disabled) {
      return;
    }

    button.disabled = true;
    await handler(button);
  };
  quickRepliesEl.appendChild(button);
  scheduleQuickRepliesOverflowStateUpdate();
  return button;
}

function setQuickReplyActions(actions) {
  quickRepliesEl.innerHTML = '';
  quickRepliesEl.scrollLeft = 0;
  actions.forEach(action => {
    const button = document.createElement('button');
    button.className = 'qr-btn';
    button.textContent = action.label;
    button.onclick = async () => {
      if (button.disabled) {
        return;
      }

      button.disabled = true;
      try {
        await action.handler(button);
      } finally {
        button.disabled = false;
      }
    };
    quickRepliesEl.appendChild(button);
  });
  scheduleQuickRepliesOverflowStateUpdate();
}

function persistSubmissionContext(identifier) {
  if (!identifier) {
    return;
  }

  try {
    localStorage.setItem(SUBMISSION_CONTEXT_STORAGE_KEY, JSON.stringify({
      requestNumber: identifier,
      sessionId: state.sessionId || null,
    }));
  } catch (error) {
    traceRpaFlow('frontend persistSubmissionContext failed', {
      identifier,
      message: error?.message || 'Unknown error',
    });
  }
}

function loadSubmissionContext() {
  try {
    const raw = localStorage.getItem(SUBMISSION_CONTEXT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return null;
    }

    const requestNumber = firstNonEmpty(parsed.requestNumber, parsed.request_number);
    return requestNumber ? { requestNumber } : null;
  } catch (error) {
    return null;
  }
}

function clearSubmissionContext() {
  state.retryRequestIdentifier = null;
  state.cancellationRetryInFlight = false;

  try {
    localStorage.removeItem(SUBMISSION_CONTEXT_STORAGE_KEY);
  } catch (error) {
    traceRpaFlow('frontend clearSubmissionContext failed', {
      message: error?.message || 'Unknown error',
    });
  }
}

function setUploadLabels(en) {
  const passport = isPassportIdentityType();
  uploadTitle.textContent = isCompanyService()
    ? (en ? 'Upload company documents:' : 'Muat naik dokumen syarikat:')
    : passport
      ? (en ? 'Upload your documents (passport branch required):' : 'Muat naik dokumen anda (cawangan pasport diperlukan):')
      : (en ? 'Upload your documents (all required):' : 'Muat naik dokumen anda (semua diperlukan):');
  document.getElementById('lbl-front').innerHTML = getFrontDocumentLabel(en);
  document.getElementById('lbl-back').innerHTML = getBackDocumentLabel(en);
  document.getElementById('lbl-sig').innerHTML = en ? 'Signature' : 'Tandatangan';
  document.getElementById('lbl-certificate').innerHTML = getCertificateDocumentLabel(en);
  document.getElementById('sub-front').textContent = en ? 'Tap to upload' : 'Ketik untuk muat naik';
  document.getElementById('sub-back').textContent = en ? 'Tap to upload' : 'Ketik untuk muat naik';
  document.getElementById('sub-sig').textContent = getSignatureInstructionLabel(en);
  document.getElementById('sub-certificate').textContent = en ? 'Tap to upload' : 'Ketik untuk muat naik';
  if (sigUploadBtn) {
    sigUploadBtn.textContent = en
      ? 'Upload signature image instead (JPG / PNG)'
      : 'Muat naik imej tandatangan (JPG / PNG)';
  }
  document.getElementById('uploadBtn').textContent = en ? 'Submit' : 'Hantar';
  syncUploadPanelBranch();
  syncIdentityEditUi();
  updateIdentityEditVisibility();
}

function resetUploadSlot(slotId) {
  const fileInput = document.getElementById(`file-${slotId}`);
  const slot = document.getElementById(`slot-${slotId}`);
  const thumb = document.getElementById(`thumb-${slotId}`);
  const sub = document.getElementById(`sub-${slotId}`);
  fileInput.value = '';
  slot.classList.remove('has-file');
  thumb.removeAttribute('src');
  sub.textContent = state.en ? 'Tap to upload' : 'Ketik untuk muat naik';
}

function setSlotSuccess(slotId, file, previewUrl) {
  const slot = document.getElementById(`slot-${slotId}`);
  const thumb = document.getElementById(`thumb-${slotId}`);
  const sub = document.getElementById(`sub-${slotId}`);
  slot.classList.add('has-file');
  if (previewUrl && file.type.startsWith('image/')) {
    thumb.src = previewUrl;
  } else {
    thumb.removeAttribute('src');
  }
  sub.textContent = file.name.length > 20 ? `${file.name.slice(0, 19)}...` : file.name;
}

function setSignatureSlotSuccess(previewUrl) {
  const slot = document.getElementById('slot-sig');
  const thumb = document.getElementById('thumb-sig');
  const sub = document.getElementById('sub-sig');
  slot.classList.add('has-file');
  thumb.src = previewUrl;
  sub.textContent = state.en ? 'Signed' : 'Ditandatangani';
}

function allUploadsComplete() {
  if (isCompanyService()) {
    return Boolean(
      state.uploads.front
        && (!requiresBackDocument(state.companyDirectorIdentityType) || state.uploads.back)
        && state.uploads.certificate
        && state.companyPpkNumber
        && state.companyName
        && state.companyEmail
        && state.companyCategory
        && state.stateName
        && state.companyDirectorName
        && state.companyDirectorIdentityNumber
        && state.companyReason
    );
  }

  return Boolean(
    state.uploads.front
      && state.uploads.signature
      && (!requiresBackDocument() || state.uploads.back)
      && state.mobile
      && state.email
  );
}

function checkAllFilled() {
  uploadBtn.disabled = !allUploadsComplete();
}

function validateLocalFile(file, slotId = 'front') {
  if (!file) return { ok: false, message: state.en ? 'Please choose a file.' : 'Sila pilih fail.' };
  const name = String(file.name || '');
  const lowerName = name.toLowerCase();
  const ext = lowerName.includes('.') ? lowerName.split('.').pop() : '';
  const allowedExtensions = slotId === 'certificate'
    ? [...FILE_POLICY.allowedExtensions, 'pdf']
    : FILE_POLICY.allowedExtensions;
  const allowedMimeTypes = slotId === 'certificate'
    ? [...FILE_POLICY.allowedMimeTypes, 'application/pdf']
    : FILE_POLICY.allowedMimeTypes;
  if (!name.trim()) return { ok: false, message: state.en ? 'File name is missing.' : 'Nama fail tiada.' };
  if (/[\\/\x00]/.test(name)) return { ok: false, message: state.en ? 'File name contains invalid characters.' : 'Nama fail mengandungi aksara tidak sah.' };
  if (!allowedExtensions.includes(ext)) return { ok: false, message: state.en ? 'Unsupported file extension.' : 'Sambungan fail tidak disokong.' };
  if (!allowedMimeTypes.includes(file.type)) return { ok: false, message: state.en ? 'Unsupported file type.' : 'Jenis fail tidak disokong.' };
  if (file.size <= 0) return { ok: false, message: state.en ? 'Uploaded file is empty.' : 'Fail yang dimuat naik kosong.' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: state.en ? 'Uploaded file exceeds the size limit.' : 'Fail melebihi had saiz.' };
  if (lowerName.split('.').length > 2) {
    const dangerous = ['php', 'phtml', 'phar', 'cgi', 'pl', 'asp', 'aspx', 'js', 'exe', 'bat', 'cmd', 'sh', 'com', 'scr', 'jar'];
    const prefixSegments = lowerName.split('.').slice(0, -1);
    if (prefixSegments.some(segment => dangerous.includes(segment))) {
      return { ok: false, message: state.en ? 'Double extensions are not allowed.' : 'Sambungan berganda tidak dibenarkan.' };
    }
  }
  return { ok: true };
}

async function apiRequest(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const fetchOptions = { method, headers, credentials: 'omit', cache: options.cache || 'default' };

  if (options.body instanceof FormData) {
    fetchOptions.body = options.body;
    delete fetchOptions.headers['Content-Type'];
  } else if (options.body !== undefined && options.body !== null) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    fetchOptions.headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(apiUrl(path), fetchOptions);
  } catch (error) {
    const networkError = new Error('Unable to reach the backend service.');
    networkError.cause = error;
    networkError.status = 0;
    networkError.payload = {};
    throw networkError;
  }

  const raw = await response.text();
  let parsed = {};
  if (raw.trim() !== '') {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const parseError = new Error('Backend returned an invalid response.');
      parseError.status = response.status;
      parseError.payload = { raw };
      throw parseError;
    }
  }

  if (!response.ok || parsed.success === false) {
    const message = parsed.message || `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = parsed;
    error.errors = parsed.errors || {};
    error.errorCode = parsed.error_code || parsed.errorCode || null;
    throw error;
  }

  return parsed;
}

async function showApiError(error, fallbackMessage) {
  const message = error?.message || fallbackMessage || 'An unexpected error occurred.';
  const details = formatValidationErrors(error?.errors);
  await addMsg(`<strong>${escapeHtml(message)}</strong>${details ? `<br>${details}` : ''}`, 'error');
}

async function refreshSession() {
  if (!state.sessionId) return null;
  try {
    const response = await apiRequest(`/session/${encodeURIComponent(state.sessionId)}`, { cache: 'no-store' });
    return extractData(response);
  } catch (error) {
    return null;
  }
}

async function refreshSubmission(identifier) {
  if (!identifier) return null;
  try {
    const pollId = ++submissionPollSequence;
    const requestStartedAt = new Date().toISOString();
    const requestStartedMs = Date.now();
    traceRpaFlow('frontend refreshSubmission request start', {
      pollId,
      identifier,
      requestStartedAt,
    });

    const response = await apiRequest(`/submission/${encodeURIComponent(identifier)}`, { cache: 'no-store' });
    const requestFinishedAt = new Date().toISOString();
    const requestFinishedMs = Date.now();
    const data = extractData(response);
    const verification = isPlainObject(data.verification) ? data.verification : null;
    traceRpaFlow('frontend refreshSubmission request complete', {
      pollId,
      identifier,
      requestStartedAt,
      requestFinishedAt,
      durationMs: requestFinishedMs - requestStartedMs,
      verificationId: verification?.id ?? null,
      displayMessageLength: String(verification?.display_message ?? '').length,
      displayMessageIsEmpty: !String(verification?.display_message ?? '').trim(),
      resultStatus: verification?.result_status ?? null,
    });
    return data;
  } catch (error) {
    traceRpaFlow('frontend refreshSubmission request failed', {
      identifier,
      message: error?.message || 'Unknown error',
      status: error?.status ?? null,
    });
    return null;
  }
}

async function renderCancellationSubmissionState(data, { fromRetry = false, allowTerminal = false } = {}) {
  const en = state.en;
  const request = isPlainObject(data?.request) ? data.request : null;
  const verification = isPlainObject(data?.verification) ? data.verification : null;
  const session = isPlainObject(data?.session) ? data.session : null;
  const requestNumber = resolveSubmissionIdentifier(
    firstNonEmpty(data?.request_number, data?.requestNumber, extractRequestNumber(request), state.requestNumber),
    request
  );
  const nextAction = firstNonEmpty(data?.next_action, data?.nextAction, 'done').toLowerCase();
  const finalFailureType = firstNonEmpty(data?.final_failure_type, data?.finalFailureType, null);
  const message = resolveCancellationCustomerMessage(data, verification);
  const hasDisplayMessage = hasFinalVerificationDisplayMessage(verification);

  if (requestNumber) {
    state.requestNumber = requestNumber;
  }

  if (session) {
    state.sessionId = firstNonEmpty(session.id, state.sessionId);
    state.en = String(session.language_code || '').toLowerCase() !== 'ms';
    updateSessionStateFromSession(session);
  }

  if (isPlainObject(data?.submission)) {
    state.submission = data.submission;
  } else if (request) {
    state.submission = request;
  }

  if (hasDisplayMessage && data?.retry_available === true) {
    state.retryRequestIdentifier = requestNumber || state.requestNumber;
    state.step = 'awaiting_retry';
    uploadArea.style.display = 'none';
    setInput(false);
    if (requestNumber) {
      persistSubmissionContext(requestNumber);
    }

    await addMsg(renderBotRichMessage(message || (en
      ? 'Cancellation attempt 1 was unsuccessful. Click Retry to try again.'
      : 'Percubaan pertama pembatalan tidak berjaya. Klik Retry untuk mencuba semula.')), 'bot');
    setQuickReplyActions([
      {
        label: en ? 'Retry' : 'Retry',
        handler: async () => {
          await handleCancellationRetry();
        },
      },
      {
        label: en ? 'Edit Data Before Resubmitting' : 'Sunting Data Sebelum Hantar Semula',
        handler: async () => {
          openRetryEditModal();
        },
      },
    ]);
    return { handled: true, retry_available: true };
  }

  if (data?.retry_in_progress === true) {
    state.step = 'done';
    uploadArea.style.display = 'none';
    setInput(false);
    quickRepliesEl.innerHTML = '';
    await addMsg(renderBotRichMessage(message || (en
      ? 'Cancellation retry is already running. Please wait.'
      : 'Percubaan semula pembatalan sedang berjalan. Sila tunggu.')), 'bot');
    return { handled: true, retry_in_progress: true };
  }

  if (nextAction === 'poll') {
    state.step = 'done';
    uploadArea.style.display = 'none';
    quickRepliesEl.innerHTML = '';
    setInput(false);
    if (requestNumber) {
      persistSubmissionContext(requestNumber);
    }

    const identifier = requestNumber || state.requestNumber;
    if (!identifier) {
      return { handled: false, polling: true };
    }

    const displayWaitSequence = startDisplayMessageWaitSequence(en);
    try {
      const resolved = await waitForFinalVerificationMessage(identifier, verification);
      const resolvedMessage = firstNonEmpty(resolved.message, message, '');
      if (resolvedMessage) {
        await addMsg(renderBotRichMessage(resolvedMessage), 'bot');
      } else {
        await addMsg(
          en
            ? 'Thank you for waiting. We are still processing your request. Please check back shortly.'
            : 'Terima kasih kerana menunggu. Permintaan anda masih diproses. Sila semak semula sebentar lagi.'
        );
      }
      return { handled: true, polling: true };
    } finally {
      displayWaitSequence.stop();
    }
  }

  if (allowTerminal && (finalFailureType === 'cancellation' || finalFailureType === 'company_rejected')) {
    state.step = 'done';
    uploadArea.style.display = 'none';
    quickRepliesEl.innerHTML = '';
    setInput(false);
    clearSubmissionContext();
    await addMsg(renderBotRichMessage(message || (en
      ? 'We are unable to complete the cancellation at this time.'
      : 'Kami tidak dapat melengkapkan pembatalan pada masa ini.')), 'bot');
    return { handled: true, terminal: true };
  }

  if (allowTerminal && nextAction === 'done') {
    state.step = 'done';
    uploadArea.style.display = 'none';
    quickRepliesEl.innerHTML = '';
    setInput(false);
    clearSubmissionContext();
    if (message) {
      await addMsg(renderBotRichMessage(message), 'bot');
    }
    return { handled: true, terminal: true };
  }

  if (fromRetry && allowTerminal && message) {
    state.step = 'done';
    uploadArea.style.display = 'none';
    quickRepliesEl.innerHTML = '';
    setInput(false);
    clearSubmissionContext();
    await addMsg(renderBotRichMessage(message), 'bot');
    return { handled: true, terminal: true };
  }

  return { handled: false };
}

async function handleCancellationRetry() {
  if (!state.retryRequestIdentifier || state.cancellationRetryInFlight) {
    return;
  }

  state.cancellationRetryInFlight = true;
  state.step = 'done';
  setInput(false);
  quickRepliesEl.innerHTML = '';
  await addMsg(state.en
    ? 'Retrying cancellation now...'
    : 'Sedang cuba semula pembatalan...', 'bot');

  try {
    const response = await apiRequest(`/submission/${encodeURIComponent(state.retryRequestIdentifier)}/retry`, {
      method: 'POST',
      body: { session_id: state.sessionId },
    });
    const data = extractData(response);
    if (await renderCancellationSubmissionState(data, { fromRetry: true, allowTerminal: true })) {
      return;
    }

    await addMsg(renderBotRichMessage(firstNonEmpty(data?.message, state.en ? 'Cancellation retry completed.' : 'Percubaan semula pembatalan selesai.')), 'bot');
  } catch (error) {
    await showApiError(error, state.en ? 'Cancellation retry failed.' : 'Percubaan semula pembatalan gagal.');
    state.step = 'awaiting_retry';
    if (state.retryRequestIdentifier) {
      setQuickReplyActions([
        {
          label: state.en ? 'Retry' : 'Retry',
          handler: async () => {
            await handleCancellationRetry();
          },
        },
        {
          label: state.en ? 'Edit Data Before Resubmitting' : 'Sunting Data Sebelum Hantar Semula',
          handler: async () => {
            openRetryEditModal();
          },
        },
      ]);
    }
    return;
  } finally {
    state.cancellationRetryInFlight = false;
  }

  state.step = 'done';
  setInput(false);
}

async function startBackendSession() {
  const response = await apiRequest('/session/start', {
    method: 'POST',
    body: { workflow_code: WORKFLOW_CODE },
  });
  const data = extractData(response);
  const session = isPlainObject(data.session) ? data.session : data;
  const sessionId = extractEntityId(session);
  if (!sessionId) {
    throw new Error('Backend session did not return a session identifier.');
  }
  state.sessionId = sessionId;
  return { response, data, session };
}

function buildLanguagePayload(text) {
  const value = String(text || '').trim().toLowerCase();
  if (value === 'english' || value === 'en') return { language: 'en' };
  if (value === 'bahasa malaysia' || value === 'bahasa melayu' || value === 'malay' || value === 'bm' || value === 'ms') return { language: 'ms' };
  return null;
}

function buildServicePayload(text) {
  const value = String(text || '').trim().toLowerCase();
  if (value === '1' || value === 'individual' || value.includes('individual') || value.includes('individu')) {
    return { service_type: 'individual' };
  }
  if (value === '2' || value === 'company' || value.includes('company') || value.includes('syarikat')) {
    return { service_type: 'company' };
  }
  if (value === '3' || value.includes('faq') || value.includes('soalan lazim')) {
    return { service_type: 'faq' };
  }
  return null;
}

function isRenewalFaqQuery(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value) {
    return false;
  }

  return [
    'ppk',
    'spkk',
    'stb',
    'renewal',
    'renew',
    'pembaharuan',
    'perbaharui',
    'mcore',
    'score',
  ].some(keyword => value.includes(keyword));
}

function getStateSelectionOptions() {
  const priorityStates = PRIORITY_STATE_ORDER.filter(item => MY_STATES.includes(item));
  const remainingStates = MY_STATES.filter(item => !PRIORITY_STATE_SET.has(item));
  return [...priorityStates, ...remainingStates];
}

function getServiceQuickReplies() {
  return state.en ? SERVICE_OPTIONS.en : SERVICE_OPTIONS.ms;
}

function faqApplicantCategoryOptions() {
  return state.en ? ['Individual', 'Company'] : ['Individu', 'Syarikat'];
}

function buildFaqApplicantCategoryPayload(text) {
  const value = String(text || '').trim().toLowerCase();
  if (['individual', 'individu'].includes(value)) return { category: 'individual' };
  if (['company', 'syarikat'].includes(value)) return { category: 'company' };
  return null;
}

async function searchFaqQuestions(term, offset = 0) {
  const response = await apiRequest(`/faq/search?q=${encodeURIComponent(term)}&offset=${offset}`, { cache: 'no-store' });
  return extractData(response);
}

async function routeRenewalQueryToFaq(text) {
  const response = await apiRequest('/session/service', {
    method: 'POST',
    body: { session_id: state.sessionId, service_type: 'faq' },
  });
  const data = extractData(response);
  updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
  state.serviceType = 'faq';
  state.faqEnquiryTitle = '';
  state.faqApplicantCategory = '';
  // Remember what the user typed so finishFaqCustomerInfoCollection() can run the
  // search on it once their basic details have been collected.
  state.faqLastEnquiry = String(text || '').trim();
  await startFaqCustomerInfoCollection();
  await refreshSession();
  return true;
}

let faqAnswerIdCounter = 0;
const faqAnswerQuestionText = {};

// Free-text search now returns only the top 3 most relevant questions. This
// line sets that expectation and points users who don't see their answer at the
// "No" feedback button, which opens the assistance form.
function faqSearchIntroMessage() {
  return state.en
    ? 'Here are the closest matches to your question. If none of them help, tap <strong>No</strong> under an answer or <strong>Submit an enquiry</strong> to send us an enquiry.'
    : 'Berikut ialah padanan paling hampir dengan soalan anda. Jika tiada yang membantu, ketik <strong>Tidak</strong> di bawah sesuatu jawapan atau <strong>Hantar pertanyaan</strong> untuk menghantar pertanyaan kepada kami.';
}

function faqBackMenuLabel() {
  return state.en ? 'Back to menu' : 'Kembali ke menu';
}

function faqSubmitEnquiryLabel() {
  return state.en ? 'Submit an enquiry' : 'Hantar pertanyaan';
}

// Shared handler for free text typed at the ask_faq_enquiry step: search the FAQ
// knowledge base and render the closest answers (or a "did you mean" / "no match"
// fallback). Always leaves the user on ask_faq_enquiry with the option to keep
// typing or to submit an enquiry.
async function handleFaqEnquiryText(text) {
  state.faqLastEnquiry = String(text || '').trim();
  const enquiryQuickReplies = [faqSubmitEnquiryLabel(), faqBackMenuLabel()];
  try {
    const searchData = await searchFaqQuestions(state.faqLastEnquiry);
    const questions = Array.isArray(searchData.questions) ? searchData.questions : [];
    const suggestions = Array.isArray(searchData.suggestions) ? searchData.suggestions : [];

    if (questions.length > 0) {
      await showTyping(300);
      await addMsg(faqSearchIntroMessage());
      await addMsg(renderFaqQuestionList(questions));
      setQR(enquiryQuickReplies);
      setInput(true);
      return;
    }

    if (suggestions.length > 0) {
      await showTyping(300);
      await addMsg(state.en ? 'No exact match found. Did you mean one of these?' : 'Tiada padanan tepat dijumpai. Adakah anda maksudkan salah satu daripada ini?');
      await addMsg(renderFaqQuestionList(suggestions));
      setQR(enquiryQuickReplies);
      setInput(true);
      return;
    }
  } catch (error) {
    // fall through to the "no match" prompt below
  }

  await showTyping(300);
  await addMsg(state.en
    ? 'I couldn\'t find a matching answer. Try rephrasing your question, or tap <strong>Submit an enquiry</strong> to send it to our team.'
    : 'Saya tidak menemui jawapan yang sepadan. Cuba ubah ayat soalan anda, atau ketik <strong>Hantar pertanyaan</strong> untuk menghantarnya kepada pasukan kami.');
  setQR(enquiryQuickReplies);
  setInput(true);
}

// Kicks off the basic-details questions (name -> phone -> state -> category ->
// email -> [company email]) right after the user picks FAQ from the main menu.
async function startFaqCustomerInfoCollection() {
  state.step = 'ask_faq_customer_name';
  await showTyping(400);
  await addMsg(state.en
    ? 'To help us assist you more accurately, please provide the following information:<div class="info-box faq-customer-info-box">1. Full Name<br>2. Phone Number<br>3. State</div>'
    : 'Untuk membantu kami membantu anda dengan lebih tepat, sila berikan maklumat berikut:<div class="info-box faq-customer-info-box">1. Nama Penuh<br>2. Nombor Telefon<br>3. Negeri</div>');
  await showTyping(450);
  await addMsg(state.en ? 'May I have your <strong>full name</strong> please?' : 'Boleh saya dapatkan <strong>nama penuh</strong> anda?');
  setInput(true);
}

async function showFaqAssistanceForm() {
  await showTyping(400);
  await addMsg(renderAssistanceForm());
  setQR([]);
  setInput(false);
  state.step = 'faq_assistance_form';
}

// FAQ answers are authored in backend/migrations/data/faq_content.php as plain text
// where structure is expressed by blank lines (paragraphs), "1." / "2." lines
// (numbered steps) and "- " lines (bullets). This turns that convention into safe
// HTML: everything is escaped first, so the source text can never inject markup,
// then paragraphs / lists are rebuilt and bare http(s) URLs are linkified.
function renderFaqAnswerHtml(raw) {
  const text = String(raw == null ? '' : raw).replace(/\r\n/g, '\n').trim();
  if (text === '') return '';

  const linkify = (s) => s.replace(
    /(https?:\/\/[^\s<]+?)([.,;:)\]]*)(?=\s|$)/g,
    (_m, url, trail) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`
  );

  const lines = escapeHtml(text).split('\n');
  const blocks = [];
  let list = null;      // { tag: 'ol' | 'ul', items: [] }
  let para = [];
  const flushPara = () => { if (para.length) { blocks.push(`<p>${linkify(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { blocks.push(`<${list.tag}>${list.items.map(i => `<li>${linkify(i)}</li>`).join('')}</${list.tag}>`); list = null; } };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') { flushPara(); flushList(); continue; }
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    const ul = line.match(/^[-•*]\s+(.*)$/);
    if (ol) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(ol[1]); continue; }
    if (ul) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(ul[1]); continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks.join('');
}

function renderFaqQuestionList(questions) {
  const feedbackPrompt = state.en ? 'Did this resolve your query?' : 'Adakah ini menyelesaikan pertanyaan anda?';
  const yesLabel = state.en ? 'Yes' : 'Ya';
  const noLabel = state.en ? 'No' : 'Tidak';
  const itemsHtml = questions.map(question => {
    faqAnswerIdCounter += 1;
    const answerId = `faq-answer-${faqAnswerIdCounter}`;
    const questionText = state.en ? (question.question_en || '') : (question.question_ms || '');
    const answerText = state.en ? (question.answer_en || '') : (question.answer_ms || '');
    faqAnswerQuestionText[answerId] = questionText;
    return `<div class="faq-item">
      <button type="button" class="faq-question-btn" onclick="toggleFaqAnswer('${answerId}')">${escapeHtml(questionText)}</button>
      <div class="faq-answer" id="${answerId}">
        <div class="faq-answer-body">${renderFaqAnswerHtml(answerText)}</div>
        <div class="faq-feedback">
          <p>${escapeHtml(feedbackPrompt)}</p>
          <button type="button" class="faq-feedback-btn" onclick="handleFaqFeedback(true, '${answerId}')">${escapeHtml(yesLabel)}</button>
          <button type="button" class="faq-feedback-btn" onclick="handleFaqFeedback(false, '${answerId}')">${escapeHtml(noLabel)}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  return `<div class="faq-list">${itemsHtml}</div>`;
}

function toggleFaqAnswer(answerId) {
  const el = document.getElementById(answerId);
  if (!el) return;
  el.classList.toggle('open');
}

function endFaqConversation(message) {
  setQR([]);
  addMsg(message, 'bot').then(() => {
    setInput(false);
    state.step = 'done';
  });
}

async function finishFaqCustomerInfoCollection() {
  state.step = 'ask_faq_enquiry';
  await showTyping(400);

  // Reached FAQ by free-typing a renewal keyword at the service menu — run the
  // search on that text now instead of prompting again.
  if (String(state.faqLastEnquiry || '').trim() !== '') {
    await handleFaqEnquiryText(state.faqLastEnquiry);
    return;
  }

  await addMsg(state.en
    ? 'Thank you. Now please type your enquiry or question and I\'ll look for an answer.'
    : 'Terima kasih. Sekarang sila taip pertanyaan atau soalan anda dan saya akan mencari jawapan.');
  setQR([]);
  setInput(true);
}

async function handleFaqFeedback(resolved, answerId) {
  if (resolved) {
    const customerName = state.name;
    const message = state.en
      ? `Thank you, ${escapeHtml(customerName || '')}, for using CIDB BENA Chat.<br>Your chat session has ended.`
      : `Terima kasih, ${escapeHtml(customerName || '')}, kerana menggunakan CIDB BENA Chat.<br>Sesi chat anda telah tamat.`;
    endFaqConversation(message);
    return;
  }

  state.faqEnquiryTitle = faqAnswerQuestionText[answerId] || state.faqLastEnquiry || '';
  await showFaqAssistanceForm();
}

let assistanceFormIdCounter = 0;

// Case-classification values sent to CIMS via the RPA bot. The RPA only matches the
// Bahasa Malaysia dropdown strings, so these are stored/sent verbatim in BM regardless
// of the chat language. Single option each for now; add more entries to expand.
const ASSISTANCE_CLASSIFICATION_OPTIONS = {
  cases_category: ['Bantuan'],
  sub_category_1: ['Pendaftaran Kontraktor'],
  sub_category_2: ['Masalah Teknikal'],
};

// Renewal type sent to the RPA bot as sCustomerType. Codes only, no translation.
const ASSISTANCE_TOPIC_OPTIONS = ['PPK', 'SPKK', 'STB'];

function assistanceOptionListHtml(values, selectedValue = values[0]) {
  return values.map(value => {
    const selected = String(value) === String(selectedValue) ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
  }).join('');
}

function renderAssistanceForm() {
  assistanceFormIdCounter += 1;
  const formId = `assistance-form-${assistanceFormIdCounter}`;
  const isCompany = state.faqApplicantCategory === 'company';

  const labels = state.en ? {
    title: 'Assistance Form',
    sectionFeedback: 'Feedback Details',
    sectionPersonal: 'Personal Details',
    sectionClassification: 'Case Classification',
    sectionDocuments: 'Supporting Documents',
    state: 'State Involved',
    customerName: 'Name',
    category: 'Applicant Category',
    phone: 'Mobile Number',
    email: 'Email Address',
    enquiryTitle: 'Enquiry Title',
    topic: 'Renewal Type',
    enquiryDescription: 'Enquiry Description',
    idNumber: 'MyKad / Passport No.',
    companyName: 'Company Name',
    companyRegNo: 'Company Registration No.',
    casesCategory: 'Cases Category',
    subCategory1: 'Sub Category Level 1',
    subCategory2: 'Sub Category Level 2',
    document: 'Document',
    optional: 'if required',
    selectPlaceholder: 'Please select...',
    submit: 'Submit',
    individual: 'Individual',
    company: 'Company',
  } : {
    title: 'Borang Bantuan',
    sectionFeedback: 'Butiran Maklumbalas',
    sectionPersonal: 'Butiran Peribadi',
    sectionClassification: 'Kategori Kes',
    sectionDocuments: 'Dokumen Sokongan',
    state: 'Negeri Terlibat',
    customerName: 'Nama',
    category: 'Kategori Pelanggan',
    phone: 'No. Telefon Bimbit',
    email: 'Alamat E-mel',
    enquiryTitle: 'Tajuk Maklumbalas',
    topic: 'Jenis Pembaharuan',
    enquiryDescription: 'Huraian Maklumbalas',
    idNumber: 'No. MyKad / Pasport',
    companyName: 'Nama Syarikat',
    companyRegNo: 'No. Pendaftaran Syarikat',
    casesCategory: 'Kategori Kes',
    subCategory1: 'Sub Kategori Tahap 1',
    subCategory2: 'Sub Kategori Tahap 2',
    document: 'Dokumen',
    optional: 'jika perlu',
    selectPlaceholder: 'Sila pilih...',
    submit: 'Hantar',
    individual: 'Individu',
    company: 'Syarikat',
  };

  const stateOptionsHtml = `<option value="">${escapeHtml(labels.selectPlaceholder)}</option>`
    + getStateSelectionOptions().map(item => {
      const selected = item === (state.stateName || '') ? ' selected' : '';
      return `<option value="${escapeHtml(item)}"${selected}>${escapeHtml(item)}</option>`;
    }).join('');

  const categoryOptionsHtml = ['individual', 'company'].map(value => {
    const selected = value === (state.faqApplicantCategory || 'company') ? ' selected' : '';
    const text = value === 'company' ? labels.company : labels.individual;
    return `<option value="${value}"${selected}>${escapeHtml(text)}</option>`;
  }).join('');

  const topicOptionsHtml = `<option value="">${escapeHtml(labels.selectPlaceholder)}</option>`
    + ASSISTANCE_TOPIC_OPTIONS.map(code => {
      const selected = code === (state.faqTopicCode || '') ? ' selected' : '';
      return `<option value="${escapeHtml(code)}"${selected}>${escapeHtml(code)}</option>`;
    }).join('');

  const docSlotsHtml = [1, 2, 3].map(n => `<label>${escapeHtml(labels.document)} #${n} (${escapeHtml(labels.optional)})
      <input type="file" id="${formId}-doc-${n}" />
    </label>`).join('');

  return `<div class="assistance-form" id="${formId}">
    <h4>${escapeHtml(labels.title)}</h4>

    <h5>${escapeHtml(labels.sectionFeedback)}</h5>
    <label>${escapeHtml(labels.enquiryTitle)}
      <input type="text" id="${formId}-enquiry-title" value="${escapeHtml(state.faqEnquiryTitle || '')}" />
    </label>
    <label>${escapeHtml(labels.topic)}
      <select id="${formId}-topic">${topicOptionsHtml}</select>
    </label>
    <label>${escapeHtml(labels.state)}
      <select id="${formId}-state">${stateOptionsHtml}</select>
    </label>
    <label>${escapeHtml(labels.enquiryDescription)}
      <textarea id="${formId}-description" rows="3"></textarea>
    </label>

    <h5>${escapeHtml(labels.sectionPersonal)}</h5>
    <label>${escapeHtml(labels.customerName)}
      <input type="text" id="${formId}-customer-name" value="${escapeHtml(state.name || '')}" />
    </label>
    <label>${escapeHtml(labels.idNumber)}
      <input type="text" id="${formId}-id-number" value="${escapeHtml(state.identityNumber || '')}" />
    </label>
    <label>${escapeHtml(labels.category)}
      <select id="${formId}-category" onchange="toggleAssistanceCompanyFields('${formId}')">${categoryOptionsHtml}</select>
    </label>
    <div id="${formId}-company-fields" style="display:${isCompany ? '' : 'none'};flex-direction:column;gap:8px;">
      <label>${escapeHtml(labels.companyName)}
        <input type="text" id="${formId}-company-name" value="${escapeHtml(state.companyName || '')}" />
      </label>
      <label>${escapeHtml(labels.companyRegNo)}
        <input type="text" id="${formId}-company-reg-no" value="${escapeHtml(state.companyPpkNumber || '')}" />
      </label>
    </div>
    <label>${escapeHtml(labels.phone)}
      <input type="text" id="${formId}-phone" value="${escapeHtml(state.mobile || '')}" />
    </label>
    <label>${escapeHtml(labels.email)}
      <input type="text" id="${formId}-email" value="${escapeHtml(state.email || '')}" />
    </label>

    <h5>${escapeHtml(labels.sectionClassification)}</h5>
    <label>${escapeHtml(labels.casesCategory)}
      <select id="${formId}-cases-category">${assistanceOptionListHtml(ASSISTANCE_CLASSIFICATION_OPTIONS.cases_category)}</select>
    </label>
    <label>${escapeHtml(labels.subCategory1)}
      <select id="${formId}-sub-category-1">${assistanceOptionListHtml(ASSISTANCE_CLASSIFICATION_OPTIONS.sub_category_1)}</select>
    </label>
    <label>${escapeHtml(labels.subCategory2)}
      <select id="${formId}-sub-category-2">${assistanceOptionListHtml(ASSISTANCE_CLASSIFICATION_OPTIONS.sub_category_2)}</select>
    </label>

    <h5>${escapeHtml(labels.sectionDocuments)}</h5>
    ${docSlotsHtml}

    <button type="button" class="assistance-submit-btn" onclick="submitAssistanceForm('${formId}')">${escapeHtml(labels.submit)}</button>
  </div>`;
}

function toggleAssistanceCompanyFields(formId) {
  const categoryEl = document.getElementById(`${formId}-category`);
  const companyFieldsEl = document.getElementById(`${formId}-company-fields`);
  if (!categoryEl || !companyFieldsEl) return;
  companyFieldsEl.style.display = categoryEl.value === 'company' ? '' : 'none';
}

async function uploadAssistanceAttachment(file) {
  const form = new FormData();
  form.append('session_id', state.sessionId);
  form.append('document_type_code', 'ASSISTANCE_ATTACHMENT');
  form.append('file_field', 'file');
  form.append('file', file, file.name || 'attachment.bin');
  form.append('upload_source', 'user_upload');
  const response = await apiRequest('/documents/upload', { method: 'POST', body: form });
  return extractData(response);
}

async function submitAssistanceForm(formId) {
  const getValue = (suffix) => String(document.getElementById(`${formId}-${suffix}`)?.value || '').trim();

  const enquiryTitle = getValue('enquiry-title');
  const topicCode = getValue('topic');
  const stateName = getValue('state');
  const description = getValue('description');
  const customerName = getValue('customer-name');
  const idNumber = getValue('id-number');
  const applicantCategory = getValue('category') === 'company' ? 'company' : 'individual';
  const isCompany = applicantCategory === 'company';
  const companyName = getValue('company-name');
  const companyRegNo = getValue('company-reg-no');
  const phone = getValue('phone');
  const email = getValue('email');
  const casesCategory = getValue('cases-category');
  const subCategory1 = getValue('sub-category-1');
  const subCategory2 = getValue('sub-category-2');

  const requiredFields = [
    [enquiryTitle, state.en ? 'Enquiry Title' : 'Tajuk Maklumbalas'],
    [topicCode, state.en ? 'Renewal Type' : 'Jenis Pembaharuan'],
    [stateName, state.en ? 'State Involved' : 'Negeri Terlibat'],
    [description, state.en ? 'Enquiry Description' : 'Huraian Maklumbalas'],
    [customerName, state.en ? 'Name' : 'Nama'],
    [idNumber, state.en ? 'MyKad / Passport No.' : 'No. MyKad / Pasport'],
    [phone, state.en ? 'Mobile Number' : 'No. Telefon Bimbit'],
    [email, state.en ? 'Email Address' : 'Alamat E-mel'],
    [casesCategory, state.en ? 'Cases Category' : 'Kategori Kes'],
    [subCategory1, state.en ? 'Sub Category Level 1' : 'Sub Kategori Tahap 1'],
    [subCategory2, state.en ? 'Sub Category Level 2' : 'Sub Kategori Tahap 2'],
  ];
  if (isCompany) {
    requiredFields.push([companyName, state.en ? 'Company Name' : 'Nama Syarikat']);
    requiredFields.push([companyRegNo, state.en ? 'Company Registration No.' : 'No. Pendaftaran Syarikat']);
  }

  const missing = requiredFields.filter(([value]) => !value).map(([, label]) => label);
  if (missing.length) {
    await showApiError({
      message: (state.en ? 'Please complete: ' : 'Sila lengkapkan: ') + missing.join(', '),
    });
    return;
  }
  if (!buildEmailPayload(email) || !buildMobilePayload(phone)) {
    await showApiError({ message: state.en ? 'Please enter a valid phone number and email address.' : 'Sila masukkan nombor telefon dan alamat e-mel yang sah.' });
    return;
  }

  const formEl = document.getElementById(formId);
  const submitBtn = formEl ? formEl.querySelector('.assistance-submit-btn') : null;
  if (submitBtn) submitBtn.disabled = true;

  try {
    const documentIds = [null, null, null];
    for (let i = 0; i < 3; i += 1) {
      const input = document.getElementById(`${formId}-doc-${i + 1}`);
      const file = input && input.files ? input.files[0] : null;
      if (file) {
        const uploaded = await uploadAssistanceAttachment(file);
        documentIds[i] = uploaded?.document?.id || uploaded?.id || null;
      }
    }

    await apiRequest('/assistance/submit', {
      method: 'POST',
      body: {
        session_id: state.sessionId,
        state: stateName,
        customer_name: customerName,
        applicant_category: applicantCategory,
        topic_code: topicCode,
        language_code: state.languageCode || (state.en ? 'en' : 'ms'),
        phone,
        email,
        enquiry_title: enquiryTitle,
        enquiry_description: description,
        id_number: idNumber,
        company_name: isCompany ? companyName : null,
        company_registration_no: isCompany ? companyRegNo : null,
        cases_category: casesCategory,
        sub_category_1: subCategory1,
        sub_category_2: subCategory2,
        attachment_document_id: documentIds[0],
        attachment_document_id_2: documentIds[1],
        attachment_document_id_3: documentIds[2],
      },
    });

    const message = state.en
      ? 'Thank you. Our team will contact you via email within 2 working days.'
      : 'Terima kasih. Pasukan kami akan menghubungi anda melalui e-mel dalam tempoh 2 hari bekerja.';
    endFaqConversation(message);
  } catch (error) {
    await showApiError(error, state.en ? 'Unable to submit the assistance request.' : 'Tidak dapat menghantar permintaan bantuan.');
    if (submitBtn) submitBtn.disabled = false;
  }
}

function buildStatePayload(text) {
  const value = String(text || '').trim().toLowerCase();
  const match = MY_STATES.find(item => item.toLowerCase() === value);
  return match ? { state: match } : null;
}

function buildIdentityPayload(text) {
  const clean = String(text || '').replace(/[\s-]/g, '');
  const myKadMatch = /^\d{12}$/.test(clean);
  const passportMatch = /^[A-Za-z0-9]{6,20}$/.test(clean) && /\d/.test(clean);
  if (myKadMatch) {
    const normalized = clean.replace(/(\d{6})(\d{2})(\d{4})/, '$1-$2-$3');
    return { identity_type: 'MYKAD', identity_number: normalized, display: normalized };
  }
  if (passportMatch) {
    const normalized = clean.toUpperCase();
    return { identity_type: 'PASSPORT', identity_number: normalized, display: normalized };
  }
  return null;
}

function buildMobilePayload(text) {
  const normalized = String(text || '').trim().replace(/[\s()-]/g, '');
  if (!/^\+?\d{8,15}$/.test(normalized)) {
    return null;
  }
  return { mobile: normalized };
}

function buildEmailPayload(text) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    return null;
  }
  return { email: normalized };
}

function buildCompanyTextPayload(text) {
  const normalized = String(text || '').trim();
  return normalized ? { value: normalized } : null;
}

function buildCompanyPpkPayload(text) {
  const value = String(text || '').trim().toUpperCase();
  if (!value) return null;

  const modernMatch = /^(\d{4})(0[1-6])(\d{6})$/.exec(value);
  if (modernMatch) {
    return { value };
  }

  if (/^(?:[A-Z]{0,3})\d{7}-[A-Z]$/.test(value)) {
    return { value };
  }

  return null;
}

async function uploadDocument(slotId, file) {
  const form = new FormData();
  form.append('session_id', state.sessionId);
  form.append('document_type_code', SLOT_DOC_TYPES[slotId]);
  form.append('file_field', 'file');
  form.append('file', file, file.name || `${slotId}.bin`);
  form.append('upload_source', 'user_upload');
  const response = await apiRequest('/documents/upload', { method: 'POST', body: form });
  return extractData(response);
}

async function uploadSignature(dataUrl) {
  const form = new FormData();
  form.append('session_id', state.sessionId);
  form.append('signature_data_url', dataUrl);
  form.append('upload_source', 'signature_pad');
  const response = await apiRequest('/signature/upload', { method: 'POST', body: form });
  return extractData(response);
}

function validateSignatureFile(file) {
  if (!file) {
    return { ok: false, message: state.en ? 'Please choose a signature image.' : 'Sila pilih imej tandatangan.' };
  }
  const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/jpg', 'image/webp']);
  if (!allowedMimeTypes.has(file.type)) {
    return { ok: false, message: state.en ? 'Unsupported signature image format.' : 'Format imej tandatangan tidak disokong.' };
  }
  if (file.size <= 0) {
    return { ok: false, message: state.en ? 'Uploaded file is empty.' : 'Fail yang dimuat naik kosong.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: state.en ? 'Uploaded file exceeds the size limit.' : 'Fail melebihi had saiz.' };
  }
  return { ok: true };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function renderSummaryBox() {
  if (isCompanyService()) {
    const front = state.uploads.front?.document || state.uploads.front;
    const back = state.uploads.back?.document || state.uploads.back;
    const cert = state.uploads.certificate?.document || state.uploads.certificate;
    const showBackDocument = requiresBackDocument(state.companyDirectorIdentityType);
    return `<strong>${state.en ? 'Summary of your company submission:' : 'Ringkasan penghantaran syarikat anda:'}</strong>`
      + '<div class="info-box">'
      + `<strong>${state.en ? 'PPK / SSM Number' : 'No. PPK / SSM'}:</strong> ${escapeHtml(state.companyPpkNumber)}<br>`
      + `<strong>${state.en ? 'Company Name' : 'Nama Syarikat'}:</strong> ${escapeHtml(state.companyName)}<br>`
      + `<strong>${state.en ? 'Company Email' : 'Emel Syarikat'}:</strong> ${escapeHtml(state.companyEmail)}<br>`
      + `<strong>${state.en ? 'Company Contact Number' : 'Nombor Telefon Syarikat'}:</strong> ${escapeHtml(state.companyContactNumber)}<br>`
      + `<strong>${state.en ? 'Company State' : 'Negeri Syarikat'}:</strong> ${escapeHtml(state.stateName)}<br>`
      + `<strong>${state.en ? 'Category' : 'Kategori'}:</strong> ${escapeHtml(state.companyCategory)}<br>`
      + `<strong>${state.en ? 'Director Name' : 'Nama Pengarah'}:</strong> ${escapeHtml(state.companyDirectorName)}<br>`
      + `<strong>${state.en ? 'Director IC' : 'IC Pengarah'}:</strong> ${escapeHtml(state.companyDirectorIdentityNumber)}<br>`
      + `<strong>${state.en ? 'Reason' : 'Sebab'}:</strong> ${escapeHtml(state.companyReason)}<br>`
      + `<strong>${escapeHtml(getFrontDocumentLabel(state.en))}:</strong> ${escapeHtml(front?.original_filename || front?.file_name || front?.stored_filename || 'Uploaded')}<br>`
      + (showBackDocument ? `<strong>${escapeHtml(getBackDocumentLabel(state.en))}:</strong> ${escapeHtml(back?.original_filename || back?.file_name || back?.stored_filename || 'Uploaded')}<br>` : '')
      + `<strong>${escapeHtml(getCertificateDocumentLabel(state.en))}:</strong> ${escapeHtml(cert?.original_filename || cert?.file_name || cert?.stored_filename || 'Uploaded')}`
      + '</div>';
  }

  const front = state.uploads.front?.document || state.uploads.front;
  const back = state.uploads.back?.document || state.uploads.back;
  const signaturePreview = state.sigDataUrl
    ? `<img src="${state.sigDataUrl}" style="max-height:36px;border-radius:4px;border:1px solid #b7d7d6;vertical-align:middle;margin-left:4px;">`
    : '';
  const showBackDocument = requiresBackDocument();

  return `<strong>${state.en ? 'Summary of your submission:' : 'Ringkasan penghantaran anda:'}</strong>`
    + '<div class="info-box">'
    + `<strong>${state.en ? 'Name' : 'Nama'}:</strong> ${escapeHtml(state.name)}<br>`
    + `<strong>${state.en ? 'IC / Passport No.' : 'No. IC / Pasport'}:</strong> ${escapeHtml(state.identityNumber)}<br>`
    + `<strong>${state.en ? 'Mobile' : 'Telefon'}:</strong> ${escapeHtml(state.mobile)}<br>`
    + `<strong>${state.en ? 'Email' : 'Emel'}:</strong> ${escapeHtml(state.email)}<br>`
    + `<strong>${state.en ? 'State' : 'Negeri'}:</strong> ${escapeHtml(state.stateName)}<br>`
    + `<strong>${escapeHtml(getFrontDocumentLabel(state.en))}:</strong> ${escapeHtml(front?.original_filename || front?.file_name || front?.stored_filename || 'Uploaded')}<br>`
    + (showBackDocument ? `<strong>${escapeHtml(getBackDocumentLabel(state.en))}:</strong> ${escapeHtml(back?.original_filename || back?.file_name || back?.stored_filename || 'Uploaded')}<br>` : '')
    + `<strong>${state.en ? 'Signature' : 'Tandatangan'}:</strong> ${signaturePreview}`
    + '</div>';
}

function renderOcrVerificationBubble(ocrVerification) {
  if (!isPlainObject(ocrVerification)) return '';

  const message = firstNonEmpty(ocrVerification.message, ocrVerification.status, '');
  if (!message) return '';

  const status = String(ocrVerification.status || '').trim().toUpperCase();
  const heading = status === 'VERIFIED'
    ? (state.en ? 'ID verification completed successfully.' : 'Pengesahan ID berjaya diselesaikan.')
    : (state.en ? 'ID verification requires attention.' : 'Pengesahan ID memerlukan perhatian.');

  return `<strong>${escapeHtml(heading)}</strong><br>${escapeHtml(message)}`;
}

function renderFinalOutcome(outcome) {
  if (isCompanyService()) {
    const en = state.en;
    if (outcome === 'approved' || outcome === 'deleted') {
      return en
        ? '<strong>Good news!</strong> Your company email ID cancellation request has been processed successfully.<br><br>'
          + 'Thank you for contacting <strong>CIDB Livechat</strong>.'
        : '<strong>Berita baik!</strong> Permohonan pembatalan Email ID syarikat anda telah berjaya diproses.<br><br>'
          + 'Terima kasih kerana menghubungi <strong>CIDB Livechat</strong>.';
    }
    if (outcome === 'pending' || outcome === 'under_review') {
      return en
        ? 'Your company cancellation request is still being processed. Please check back shortly.'
        : 'Permohonan pembatalan syarikat anda masih diproses. Sila semak semula sebentar lagi.';
    }
    if (outcome === 'manual_review') {
      return en
        ? 'Your company cancellation request requires manual review. Our team will follow up if further action is needed.'
        : 'Permohonan pembatalan syarikat anda memerlukan semakan manual. Pasukan kami akan menghubungi anda jika tindakan lanjut diperlukan.';
    }
    if (outcome === 'rejected' || outcome === 'norecord') {
      return en
        ? 'We are unable to complete your company cancellation request at this time. Please review the submitted details and try again.'
        : 'Kami tidak dapat melengkapkan permohonan pembatalan syarikat anda buat masa ini. Sila semak semula butiran yang dihantar dan cuba lagi.';
    }
    return en
      ? 'We are unable to complete the company cancellation at this time. Please try again later or contact our support team.'
      : 'Kami tidak dapat melengkapkan pembatalan syarikat buat masa ini. Sila cuba lagi kemudian atau hubungi pasukan sokongan kami.';
  }

  const ic = escapeHtml(state.identityNumber || '');
  const en = state.en;
  if (outcome === 'deleted') {
    return en
      ? '<strong>Good news!</strong> We have successfully verified your details and your CIMS Individual Email ID has been <strong>cancelled</strong>.<br><br>'
        + 'You may register a new Email ID at any time via <a href="https://cims.cidb.gov.my" target="_blank" rel="noreferrer">cims.cidb.gov.my</a>.<br><br>'
        + 'Thank you for contacting <strong>CIDB Livechat</strong>. Have a wonderful day!'
      : '<strong>Berita baik!</strong> Kami telah berjaya mengesahkan maklumat anda dan Email ID CIMS Individu anda telah berjaya <strong>dibatalkan</strong>.<br><br>'
        + 'Anda boleh mendaftar Email ID baharu pada bila-bila masa melalui <a href="https://cims.cidb.gov.my" target="_blank" rel="noreferrer">cims.cidb.gov.my</a>.<br><br>'
        + 'Terima kasih kerana menghubungi <strong>CIDB Livechat</strong>. Selamat sejahtera!';
  }
  if (outcome === 'linked') {
    return en
      ? 'We are unable to cancel your Email ID at this time as your <strong>User ID is currently linked to a CIMS module</strong>.<br><br>'
        + 'Please ensure all active module links are removed before requesting cancellation, or contact our support team for further assistance.<br><br>'
        + 'Thank you for your patience.'
      : 'Kami tidak dapat membatalkan Email ID anda buat masa ini kerana <strong>ID Pengguna anda masih dikaitkan dengan modul CIMS</strong>.<br><br>'
        + 'Sila pastikan semua pautan modul aktif telah dibuang sebelum membuat permintaan pembatalan, atau hubungi pasukan sokongan kami untuk bantuan lanjut.<br><br>'
        + 'Terima kasih atas kesabaran anda.';
  }
  if (outcome === 'norecord') {
    return en
      ? `We were unable to locate an Email ID record under the IC / Passport number provided (<strong>${ic}</strong>).<br><br>`
        + 'If you wish to create a new Email ID, please visit <a href="https://cims.cidb.gov.my" target="_blank" rel="noreferrer">cims.cidb.gov.my</a> and register directly.<br><br>'
        + 'Thank you for contacting <strong>CIDB Livechat</strong>. Have a wonderful day!'
      : `Kami tidak dapat menjumpai rekod Email ID di bawah nombor IC / Pasport yang diberikan (<strong>${ic}</strong>).<br><br>`
        + 'Sekiranya anda ingin mencipta Email ID baharu, sila layari <a href="https://cims.cidb.gov.my" target="_blank" rel="noreferrer">cims.cidb.gov.my</a> dan daftar secara terus.<br><br>'
        + 'Terima kasih kerana menghubungi <strong>CIDB Livechat</strong>. Selamat sejahtera!';
  }
  return en
    ? 'We are unable to complete the verification at this time. Please try again later or contact our support team.'
    : 'Kami tidak dapat melengkapkan pengesahan buat masa ini. Sila cuba lagi kemudian atau hubungi pasukan sokongan kami.';
}

function looksLikeBotAcknowledgementText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('{')) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return isPlainObject(parsed)
      && String(parsed.status || '').toLowerCase() === 'inserted'
      && firstNonEmpty(parsed.schedule_id) !== '';
  } catch (error) {
    return false;
  }
}

function extractVerificationCustomerMessage(verification) {
  if (!isPlainObject(verification)) return '';
  const message = stripWrappingQuotes(verification.display_message);
  if (!message) {
    return '';
  }

  if (looksLikeBotAcknowledgementText(message)) {
    return '';
  }

  return message;
}

function resolveCancellationCustomerMessage(data, verification) {
  const candidates = [
    extractVerificationCustomerMessage(verification),
    stripWrappingQuotes(firstNonEmpty(data?.message, '')),
    stripWrappingQuotes(firstNonEmpty(isPlainObject(verification) ? verification.response_message : '', '')),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (looksLikeBotAcknowledgementText(candidate)) {
      continue;
    }

    return candidate;
  }

  return '';
}

function hasFinalVerificationDisplayMessage(verification) {
  return extractVerificationCustomerMessage(verification) !== '';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForFinalVerificationMessage(identifier, initialVerification, timeoutMs = FINAL_VERIFICATION_TIMEOUT_MS, intervalMs = 1000) {
  if (!firstNonEmpty(identifier)) {
    return {
      verification: isPlainObject(initialVerification) ? initialVerification : null,
      message: extractVerificationCustomerMessage(initialVerification),
    };
  }

  let verification = isPlainObject(initialVerification) ? initialVerification : null;
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;

  traceRpaFlow('frontend wait loop start', {
    identifier,
    timeoutMs,
    intervalMs,
    initialVerificationId: verification?.id ?? null,
    initialDisplayMessageLength: String(verification?.display_message ?? '').length,
    initialDisplayMessageIsEmpty: !String(verification?.display_message ?? '').trim(),
  });

  while (Date.now() <= deadline) {
    pollCount++;
    const message = extractVerificationCustomerMessage(verification);
    if (message) {
      traceRpaFlow('frontend wait loop resolved before timeout', {
        identifier,
        pollCount,
        verificationId: verification?.id ?? null,
        messageLength: message.length,
      });
      return { verification, message };
    }

    traceRpaFlow('frontend wait loop polling', {
      identifier,
      pollCount,
      verificationId: verification?.id ?? null,
      displayMessageLength: String(verification?.display_message ?? '').length,
      displayMessageIsEmpty: !String(verification?.display_message ?? '').trim(),
    });

    await delay(intervalMs);
    const refreshed = await refreshSubmission(identifier);
    if (isPlainObject(refreshed?.verification)) {
      verification = refreshed.verification;
      traceRpaFlow('frontend wait loop refreshed verification', {
        identifier,
        pollCount,
        verificationId: verification?.id ?? null,
        displayMessageLength: String(verification?.display_message ?? '').length,
        displayMessageIsEmpty: !String(verification?.display_message ?? '').trim(),
      });
    }
  }

  traceRpaFlow('frontend wait loop timed out', {
    identifier,
    pollCount,
    verificationId: verification?.id ?? null,
    finalDisplayMessageLength: String(verification?.display_message ?? '').length,
    finalDisplayMessageIsEmpty: !String(verification?.display_message ?? '').trim(),
  });

  return {
    verification,
    message: extractVerificationCustomerMessage(verification),
  };
}

function updateSessionStateFromSession(session) {
  if (!isPlainObject(session)) return;
  const draft = isPlainObject(session.draft_payload)
    ? session.draft_payload
    : (() => {
        try {
          return JSON.parse(String(session.draft_payload || '{}'));
        } catch (error) {
          return {};
        }
      })();

  state.languageCode = firstNonEmpty(session.language_code, session.languageCode, state.languageCode);
  state.stateName = firstNonEmpty(session.state_name, draft.state_name, session.stateName, state.stateName);
  state.stateCode = firstNonEmpty(session.state_code, draft.state_code, state.stateCode);
  state.name = firstNonEmpty(session.full_name, session.name, state.name);
  state.identityNumber = firstNonEmpty(session.identity_number, session.identityNumber, state.identityNumber);
  state.identityType = firstNonEmpty(session.identity_type, state.identityType);
  state.mobile = firstNonEmpty(session.mobile, session.mobileNumber, session.mobile_number, state.mobile);
  state.email = firstNonEmpty(session.email, session.email_address, session.emailAddress, state.email);
  state.serviceType = firstNonEmpty(draft.service_type, 'individual');
  state.companyPpkNumber = firstNonEmpty(draft.company_ppk_number, state.companyPpkNumber);
  state.companyName = firstNonEmpty(draft.company_name, state.companyName);
  state.companyEmail = firstNonEmpty(draft.company_email, state.companyEmail);
  state.companyContactNumber = firstNonEmpty(draft.company_contact_number, state.companyContactNumber);
  state.companyCategory = firstNonEmpty(draft.category, draft.company_category, state.companyCategory);
  state.companyDirectorName = firstNonEmpty(draft.director_full_name, state.companyDirectorName);
  state.companyDirectorIdentityType = firstNonEmpty(draft.director_identity_type, state.companyDirectorIdentityType);
  state.companyDirectorIdentityNumber = firstNonEmpty(draft.director_identity_number, state.companyDirectorIdentityNumber);
  state.companyReason = firstNonEmpty(draft.company_cancellation_reason, state.companyReason);

  if (!isCompanyService()) {
    state.companyPpkNumber = '';
    state.companyName = '';
    state.companyEmail = '';
    state.companyContactNumber = '';
    state.companyCategory = '';
    state.companyDirectorName = '';
    state.companyDirectorIdentityType = '';
    state.companyDirectorIdentityNumber = '';
    state.companyReason = '';
  }

  syncUploadPanelBranch();
  syncIdentityEditUi();
  syncRetryEditUi();
  updateIdentityEditVisibility();
}

async function bootstrapConversation() {
  state.serviceType = 'individual';
  state.uiMode = 'chatbot';
  state.stateName = '';
  state.stateCode = '';
  state.name = '';
  state.identityType = '';
  state.identityNumber = '';
  state.companyPpkNumber = '';
  state.companyName = '';
  state.companyEmail = '';
  state.companyContactNumber = '';
  state.companyCategory = '';
  state.companyDirectorName = '';
  state.companyDirectorIdentityType = '';
  state.companyDirectorIdentityNumber = '';
  state.companyReason = '';
  state.faqEnquiryTitle = '';
  state.faqLastEnquiry = '';
  state.faqApplicantCategory = '';
  state.sigDataUrl = null;
  state.uploads = { front: null, back: null, certificate: null, signature: null };
  state.files = { front: null, back: null, certificate: null };
  state.submission = null;
  state.requestNumber = null;
  state.retryRequestIdentifier = null;
  state.cancellationRetryInFlight = false;
  state.identityEditEnabled = false;
  updateIdentityEditVisibility();
  syncLiveAgentUi();
  closeChatWidget();
  initLiveAgentDockTracking();
  closeIdentityEditModal();
  closeRetryEditModal();
  setInput(false);
  quickRepliesEl.innerHTML = '';
  uploadArea.style.display = 'none';
  await showTyping(700);

  const savedContext = loadSubmissionContext();
  if (savedContext?.requestNumber) {
    const restored = await refreshSubmission(savedContext.requestNumber);
    if (restored) {
      const handled = await renderCancellationSubmissionState(restored, { fromRetry: false, allowTerminal: true });
      if (handled.handled) {
        return;
      }
    }

    clearSubmissionContext();
  }

  try {
    const { session } = await startBackendSession();
    updateSessionStateFromSession(session);
    await showTyping(500);
    await addMsg('Welcome to <strong>CIDB Livechat</strong>!<br>Selamat datang ke <strong>CIDB Livechat</strong>!');
    await showTyping(500);
    await addMsg('Please select your preferred language:<br>Sila pilih bahasa pilihan anda:');
    setQR(['English', 'Bahasa Malaysia']);
    state.step = 'ask_lang';
    setInput(true);
    await refreshSession();
  } catch (error) {
    await addMsg(`<strong>${escapeHtml(error?.message || 'Failed to start session.')}</strong>`, 'error');
    await addMsg('Please refresh the page to try again.', 'error');
    state.step = 'booting';
    setInput(false);
  }
}

async function sendMessage() {
  const displayText = inputEl.value.trim();
  if (!displayText) return;
  const text = pendingQuickReplyValue || displayText;
  pendingQuickReplyValue = null;
  pendingQuickReplyDisplay = null;
  inputEl.value = '';
  quickRepliesEl.innerHTML = '';
  setInput(false);
  await addMsg(escapeHtml(displayText), 'user');
  await handleStep(text);
}

async function handleStep(text) {
  if (!state.sessionId) {
    setInput(true);
    return;
  }

  if (state.step === 'ask_lang') {
    const payload = buildLanguagePayload(text);
    if (!payload) {
      await showApiError({ message: 'Unsupported language.', errors: { language: 'Language must be English or Bahasa Malaysia.' } }, 'Unsupported language.');
      await addMsg('Please select your preferred language:<br>Sila pilih bahasa pilihan anda:');
      setQR(['English', 'Bahasa Malaysia']);
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/language', { method: 'POST', body: { session_id: state.sessionId, language: payload.language } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.en = payload.language === 'en';
      state.languageCode = payload.language;
      state.step = 'ask_service';
      await showTyping(450);
      await addMsg(state.en ? 'Hi, I\'m <strong>Bena</strong>. How can I assist you today?' : 'Hai, saya <strong>Bena</strong>. Bagaimana saya boleh membantu anda hari ini?');
      setQR(getServiceQuickReplies());
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save language.');
      await addMsg('Please select your preferred language:<br>Sila pilih bahasa pilihan anda:');
      setQR(['English', 'Bahasa Malaysia']);
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_service') {
    const payload = buildServicePayload(text);
    if (!payload) {
      if (isRenewalFaqQuery(text)) {
        try {
          await routeRenewalQueryToFaq(text);
          return;
        } catch (error) {
          await showApiError(error, 'Unable to open FAQ search.');
          await addMsg(state.en ? 'Please choose a service above or try a different keyword.' : 'Sila pilih perkhidmatan di atas atau cuba kata kunci lain.');
          setQR(getServiceQuickReplies());
          setInput(true);
          return;
        }
      }
      await showApiError({ message: 'Invalid service selected.', errors: { service: 'Please choose a supported service.' } }, 'Invalid service selected.');
      await addMsg(state.en ? 'Hi, I\'m <strong>Bena</strong>. How can I assist you today?' : 'Hai, saya <strong>Bena</strong>. Bagaimana saya boleh membantu anda hari ini?');
      setQR(getServiceQuickReplies());
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/service', { method: 'POST', body: { session_id: state.sessionId, service_type: payload.service_type } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.serviceType = payload.service_type;
      if (payload.service_type === 'faq') {
        state.faqEnquiryTitle = '';
        state.faqLastEnquiry = '';
        state.faqApplicantCategory = '';
        await startFaqCustomerInfoCollection();
        await refreshSession();
        return;
      }

      if (payload.service_type === 'company') {
        state.step = 'ask_company_ppk';
        await showTyping(450);
        await addMsg(state.en
          ? 'To proceed with your <strong>Company Email ID Cancellation</strong> request, please provide the following:<div class="info-box">1. PPK / SSM number<br>2. Company name<br>3. Company email address<br>4. Company contact number<br>5. Company state<br>6. Director full name<br>7. Director IC number<br>8. Reason for cancellation<br>9. Director IC front and back<br>10. SSM / PPK certificate</div>'
          : 'Untuk meneruskan permohonan <strong>Pembatalan Email ID Syarikat</strong> anda, sila sediakan maklumat berikut:<div class="info-box">1. Nombor PPK / SSM<br>2. Nama syarikat<br>3. Alamat emel syarikat<br>4. Nombor telefon syarikat<br>5. Negeri syarikat<br>6. Nama penuh pengarah<br>7. Nombor IC pengarah<br>8. Sebab pembatalan<br>9. IC pengarah bahagian depan dan belakang<br>10. Sijil SSM / PPK</div>');
        await showTyping(350);
        await addMsg(state.en
          ? 'Please provide your <strong>PPK / SSM number</strong> to begin the company cancellation request.'
          : 'Sila berikan <strong>nombor PPK / SSM</strong> anda untuk memulakan permohonan pembatalan syarikat.');
        setInput(true);
        await refreshSession();
        return;
      }

      state.step = 'ask_state';
      await showTyping(450);
      await addMsg(state.en
        ? 'Before we begin, may I know which <strong>state</strong> you are contacting us from?'
        : 'Sebelum kita mulakan, bolehkah saya tahu dari <strong>negeri</strong> mana anda menghubungi kami?');
      setQR(getStateSelectionOptions());
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save service selection.');
      await addMsg(state.en ? 'Hi, I\'m <strong>Bena</strong>. How can I assist you today?' : 'Hai, saya <strong>Bena</strong>. Bagaimana saya boleh membantu anda hari ini?');
      setQR(getServiceQuickReplies());
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_faq_enquiry') {
    const trimmed = text.trim();

    if (trimmed === faqBackMenuLabel()) {
      state.step = 'ask_service';
      await showTyping(350);
      await addMsg(state.en ? 'Hi, I\'m <strong>Bena</strong>. How can I assist you today?' : 'Hai, saya <strong>Bena</strong>. Bagaimana saya boleh membantu anda hari ini?');
      setQR(getServiceQuickReplies());
      setInput(true);
      return;
    }

    if (trimmed === faqSubmitEnquiryLabel()) {
      state.faqEnquiryTitle = state.faqLastEnquiry || '';
      await showFaqAssistanceForm();
      return;
    }

    await handleFaqEnquiryText(text);
    return;
  }

  if (state.step === 'ask_faq_customer_name') {
    const trimmedName = String(text || '').trim();
    if (!trimmedName) {
      await showApiError({ message: 'Full name is required.', errors: { full_name: 'Please enter your full name.' } }, 'Full name is required.');
      await addMsg(state.en ? 'May I have your <strong>full name</strong> please?' : 'Boleh saya dapatkan <strong>nama penuh</strong> anda?');
      setInput(true);
      return;
    }
    state.name = trimmedName;
    state.step = 'ask_faq_customer_phone';
    await showTyping(400);
    await addMsg(state.en ? `Thank you, <strong>${escapeHtml(trimmedName)}</strong>! May I have your <strong>phone number</strong>?` : `Terima kasih, <strong>${escapeHtml(trimmedName)}</strong>! Boleh saya dapatkan <strong>nombor telefon</strong> anda?`);
    setInput(true);
    return;
  }

  if (state.step === 'ask_faq_customer_phone') {
    const payload = buildMobilePayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid phone number.', errors: { phone: 'Enter a valid phone number.' } }, 'Invalid phone number.');
      await addMsg(state.en ? 'Please enter a valid <strong>phone number</strong>.' : 'Sila masukkan <strong>nombor telefon</strong> yang sah.');
      setInput(true);
      return;
    }
    state.mobile = payload.mobile;
    state.step = 'ask_faq_customer_state';
    await showTyping(400);
    await addMsg(state.en ? 'Which <strong>state</strong> are you contacting us from?' : 'Dari <strong>negeri</strong> manakah anda menghubungi kami?');
    setQR(getStateSelectionOptions());
    setInput(true);
    return;
  }

  if (state.step === 'ask_faq_customer_state') {
    const payload = buildStatePayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid Malaysian state selected.', errors: { state: 'Please choose a valid Malaysian state.' } }, 'Invalid Malaysian state selected.');
      await addMsg(state.en ? 'Which <strong>state</strong> are you contacting us from?' : 'Dari <strong>negeri</strong> manakah anda menghubungi kami?');
      setQR(getStateSelectionOptions());
      setInput(true);
      return;
    }
    state.stateName = payload.state;
    await finishFaqCustomerInfoCollection();
    return;
  }

  if (state.step === 'ask_faq_customer_category') {
    await finishFaqCustomerInfoCollection();
    return;
  }

  if (state.step === 'ask_faq_customer_email') {
    await finishFaqCustomerInfoCollection();
    return;
  }

  if (state.step === 'ask_faq_customer_company_email') {
    await finishFaqCustomerInfoCollection();
    return;
  }

  if (state.step === 'ask_state') {
    const payload = buildStatePayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid Malaysian state selected.', errors: { state: 'Please choose a valid Malaysian state.' } }, 'Invalid Malaysian state selected.');
      await addMsg(state.en ? 'Before we continue, may I know which <strong>state</strong> you are contacting us from?' : 'Sebelum kita teruskan, bolehkah saya tahu dari <strong>negeri</strong> mana anda menghubungi kami?');
      setQR(getStateSelectionOptions());
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/state', { method: 'POST', body: { session_id: state.sessionId, state: payload.state } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.stateName = payload.state;
      state.step = 'ask_name';
      await showTyping(450);
      await addMsg(state.en ? `You are contacting us from <strong>${escapeHtml(payload.state)}</strong>.` : `Terima kasih! Anda menghubungi kami dari <strong>${escapeHtml(payload.state)}</strong>.`);
      await showTyping(650);
      await addMsg(state.en
        ? 'To proceed with your <strong>Individual Email ID Cancellation</strong> request, please provide the following:<div class="info-box">1. Full name (as per IC / Passport)<br>2. IC / Passport number<br>3. Mobile number<br>4. Email address<br>5. Identity document and signature after we collect your contact details</div>'
        : 'Untuk meneruskan permohonan <strong>Pembatalan Email ID Individu</strong> anda, sila sediakan maklumat berikut:<div class="info-box">1. Nama penuh (seperti dalam IC / Pasport)<br>2. Nombor IC / Pasport<br>3. Nombor telefon bimbit<br>4. Alamat emel<br>5. Dokumen pengenalan dan tandatangan selepas kami mengumpul maklumat hubungan anda</div>');
      await showTyping(450);
      await addMsg(state.en ? 'May I have your <strong>full name</strong> please?' : 'Boleh saya dapatkan <strong>nama penuh</strong> anda?');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save state.');
      await addMsg(state.en ? 'Before we continue, may I know which <strong>state</strong> you are contacting us from?' : 'Sebelum kita teruskan, bolehkah saya tahu dari <strong>negeri</strong> mana anda menghubungi kami?');
      setQR(getStateSelectionOptions());
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_ppk') {
    const payload = buildCompanyPpkPayload(text);
    if (!payload) {
      await showApiError({ message: 'Please enter a valid PPK / SSM number.', errors: { ppk_number: 'Please enter a valid PPK / SSM number.' } }, 'Please enter a valid PPK / SSM number.');
      await addMsg(state.en ? 'Please enter a valid <strong>PPK / SSM number</strong>.' : 'Sila masukkan <strong>nombor PPK / SSM</strong> yang sah.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-ppk', { method: 'POST', body: { session_id: state.sessionId, ppk_number: payload.value } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.companyPpkNumber = payload.value;
      state.step = 'ask_company_name';
      await showTyping(450);
      await addMsg(state.en ? 'Thank you. What is your <strong>company name</strong>?' : 'Terima kasih. Apakah <strong>nama syarikat</strong> anda?');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save company number.');
      await addMsg(state.en ? 'Please enter a valid <strong>PPK / SSM number</strong>.' : 'Sila masukkan <strong>nombor PPK / SSM</strong> yang sah.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_name') {
    const payload = buildCompanyTextPayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid company name.', errors: { company_name: 'Company name is required.' } }, 'Invalid company name.');
      await addMsg(state.en ? 'Please provide your <strong>company name</strong>.' : 'Sila berikan <strong>nama syarikat</strong> anda.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-name', { method: 'POST', body: { session_id: state.sessionId, company_name: payload.value } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.companyName = payload.value;
      state.step = 'ask_company_email';
      await showTyping(450);
      await addMsg(state.en ? 'Please provide the <strong>company email address</strong> to cancel.' : 'Sila berikan <strong>alamat emel syarikat</strong> yang ingin dibatalkan.');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save company name.');
      await addMsg(state.en ? 'Please provide your <strong>company name</strong>.' : 'Sila berikan <strong>nama syarikat</strong> anda.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_email') {
    const payload = buildEmailPayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid company email address.', errors: { company_email: 'Enter a valid email address.' } }, 'Invalid company email address.');
      await addMsg(state.en ? 'Please provide the <strong>company email address</strong>.' : 'Sila berikan <strong>alamat emel syarikat</strong>.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-email', { method: 'POST', body: { session_id: state.sessionId, company_email: payload.email } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.companyEmail = payload.email;
      state.companyCategory = state.companyCategory || 'company';
      state.step = 'ask_company_contact';
      await showTyping(450);
      await addMsg(state.en
        ? 'Please provide the <strong>company contact number</strong> so we can continue.'
        : 'Sila berikan <strong>nombor telefon syarikat</strong> untuk meneruskan.');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save company email.');
      await addMsg(state.en ? 'Please provide the <strong>company email address</strong>.' : 'Sila berikan <strong>alamat emel syarikat</strong>.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_contact') {
    const payload = buildMobilePayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid company contact number.', errors: { company_contact_number: 'Enter a valid contact number.' } }, 'Invalid company contact number.');
      await addMsg(state.en ? 'Please provide the <strong>company contact number</strong>.' : 'Sila berikan <strong>nombor telefon syarikat</strong>.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-contact', { method: 'POST', body: { session_id: state.sessionId, company_contact_number: payload.mobile } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.companyContactNumber = payload.mobile;
      state.step = 'ask_company_state';
      await showTyping(450);
      await addMsg(state.en
        ? 'Please provide the <strong>company state</strong> for verification.'
        : 'Sila berikan <strong>negeri syarikat</strong> untuk semakan.');
      setQR(getStateSelectionOptions());
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save company contact number.');
      await addMsg(state.en ? 'Please provide the <strong>company contact number</strong>.' : 'Sila berikan <strong>nombor telefon syarikat</strong>.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_state') {
    const payload = buildStatePayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid Malaysian state selected.', errors: { state: 'Please choose a valid Malaysian state.' } }, 'Invalid Malaysian state selected.');
      await addMsg(state.en
        ? 'Please provide the <strong>company state</strong> for verification.'
        : 'Sila berikan <strong>negeri syarikat</strong> untuk semakan.');
      setQR(getStateSelectionOptions());
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-state', { method: 'POST', body: { session_id: state.sessionId, state: payload.state } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.stateName = payload.state;
      state.step = 'ask_company_director_name';
      await showTyping(450);
      await addMsg(state.en ? 'What is the <strong>director full name</strong>?' : 'Apakah <strong>nama penuh pengarah</strong>?');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save company state.');
      await addMsg(state.en
        ? 'Please provide the <strong>company state</strong> for verification.'
        : 'Sila berikan <strong>negeri syarikat</strong> untuk semakan.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_director_name') {
    const payload = buildCompanyTextPayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid director name.', errors: { director_full_name: 'Director full name is required.' } }, 'Invalid director name.');
      await addMsg(state.en ? 'Please provide the <strong>director full name</strong>.' : 'Sila berikan <strong>nama penuh pengarah</strong>.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-director-name', { method: 'POST', body: { session_id: state.sessionId, director_full_name: payload.value } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.companyDirectorName = payload.value;
      state.step = 'ask_company_director_ic';
      await showTyping(450);
      await addMsg(state.en ? 'Please provide the <strong>director IC number</strong>.' : 'Sila berikan <strong>nombor IC pengarah</strong>.');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save director name.');
      await addMsg(state.en ? 'Please provide the <strong>director full name</strong>.' : 'Sila berikan <strong>nama penuh pengarah</strong>.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_director_ic') {
    const payload = buildIdentityPayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid director IC number.', errors: { director_identity_number: 'Use a valid MyKad or passport number.' } }, 'Invalid director IC number.');
      await addMsg(state.en ? 'Please provide the <strong>director IC number</strong>.' : 'Sila berikan <strong>nombor IC pengarah</strong>.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-director-identity', {
        method: 'POST',
        body: { session_id: state.sessionId, identity_type: payload.identity_type, director_identity_number: payload.identity_number },
      });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.companyDirectorIdentityType = payload.identity_type;
      state.companyDirectorIdentityNumber = payload.display;
      state.step = 'ask_company_reason';
      await showTyping(450);
      await addMsg(state.en ? 'Please tell us the <strong>reason for company email ID cancellation</strong>.' : 'Sila nyatakan <strong>sebab pembatalan Email ID syarikat</strong>.');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save director IC.');
      await addMsg(state.en ? 'Please provide the <strong>director IC number</strong>.' : 'Sila berikan <strong>nombor IC pengarah</strong>.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_company_reason') {
    const payload = buildCompanyTextPayload(text);
    if (!payload) {
      await showApiError({ message: 'Cancellation reason is required.', errors: { reason: 'Reason for company cancellation is required.' } }, 'Cancellation reason is required.');
      await addMsg(state.en ? 'Please tell us the <strong>reason for company email ID cancellation</strong>.' : 'Sila nyatakan <strong>sebab pembatalan Email ID syarikat</strong>.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/company-reason', { method: 'POST', body: { session_id: state.sessionId, reason: payload.value } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.companyReason = payload.value;
      state.step = 'ask_ic_copy';
      await showTyping(450);
await addMsg(buildUploadTipHtml(state.en
  ? 'Thank you. Please upload your <strong>directors</strong>\' <strong>IC front</strong>, <strong>IC back</strong>, and the <strong>SSM / PPK certificate</strong>. Make sure the images are <strong>clear and fully visible</strong>.<div class="warn-box">Photo tips:<br>- Place the documents on a flat, well-lit surface<br>- Avoid blur, shadows, or cropping<br>- Both front and back copies are required<br>- Please upload your NRIC with the \'Kegunaan CIDB Only\'</div>'
  : 'Terima kasih. Sila muat naik <strong>IC pengarah</strong> bahagian depan, <strong>IC belakang</strong>, dan <strong>sijil SSM / PPK</strong>. Pastikan imej <strong>jelas dan kelihatan sepenuhnya</strong>.<div class="warn-box">Petua foto:<br>- Letakkan dokumen di permukaan rata yang terang<br>- Elakkan kabur, bayang, atau pemotongan gambar<br>- Salinan depan dan belakang diperlukan<br>- Sila muat naik NRIC anda dengan \'Kegunaan CIDB Only\'</div>'));
      setUploadLabels(state.en);
      state.identityEditEnabled = false;
      state.sigDataUrl = null;
      state.uploads = { front: null, back: null, certificate: null, signature: null };
      state.files = { front: null, back: null, certificate: null };
      resetUploadSlot('front');
      resetUploadSlot('back');
      resetUploadSlot('certificate');
      const sigSlot = document.getElementById('slot-sig');
      if (sigSlot) sigSlot.classList.remove('has-file');
      const sigThumb = document.getElementById('thumb-sig');
      if (sigThumb) sigThumb.removeAttribute('src');
      const sigSub = document.getElementById('sub-sig');
      if (sigSub) sigSub.textContent = getSignatureInstructionLabel(state.en);
      uploadArea.style.display = 'flex';
      uploadBtn.disabled = true;
      syncUploadPanelBranch();
      setInput(false);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save cancellation reason.');
      await addMsg(state.en ? 'Please tell us the <strong>reason for company email ID cancellation</strong>.' : 'Sila nyatakan <strong>sebab pembatalan Email ID syarikat</strong>.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_name') {
    try {
      const response = await apiRequest('/session/name', { method: 'POST', body: { session_id: state.sessionId, full_name: text } });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.name = text;
      state.step = 'ask_ic';
      await showTyping(450);
      await addMsg(state.en ? `Thank you, <strong>${escapeHtml(text)}</strong>. May I have your <strong>IC / Passport number</strong>, please?` : `Terima kasih, <strong>${escapeHtml(text)}</strong>. Bolehkah saya dapatkan <strong>nombor IC / Pasport</strong> anda, sila?`);
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save name.');
      await addMsg(state.en ? 'Please enter your <strong>full name</strong> again.' : 'Sila masukkan semula <strong>nama penuh</strong> anda.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_ic') {
    const payload = buildIdentityPayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid IC / Passport number.', errors: { identity_number: 'Use a valid MyKad or passport number.' } }, 'Invalid IC / Passport number.');
      await addMsg(state.en ? 'Please enter your <strong>IC / Passport number</strong> again.' : 'Sila masukkan semula <strong>nombor IC / Pasport</strong> anda.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/identity', {
        method: 'POST',
        body: { session_id: state.sessionId, identity_type: payload.identity_type, identity_number: payload.identity_number },
      });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.identityType = payload.identity_type;
      state.identityNumber = payload.display;
      state.step = 'ask_mobile';
      await showTyping(500);
      await addMsg(state.en
        ? 'Before we continue, may I have your <strong>mobile number</strong> for verification purposes?'
        : 'Sebelum kita teruskan, boleh saya dapatkan <strong>nombor telefon bimbit</strong> anda untuk tujuan pengesahan?');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save identity.');
      await addMsg(state.en ? 'Please enter your <strong>IC / Passport number</strong> again.' : 'Sila masukkan semula <strong>nombor IC / Pasport</strong> anda.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_mobile') {
    const payload = buildMobilePayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid mobile number.', errors: { mobile: 'Enter a valid mobile number.' } }, 'Invalid mobile number.');
      await addMsg(state.en
        ? 'Please enter your <strong>mobile number</strong> again.'
        : 'Sila masukkan semula <strong>nombor telefon bimbit</strong> anda.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/mobile', {
        method: 'POST',
        body: { session_id: state.sessionId, mobile: payload.mobile },
      });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.mobile = payload.mobile;
      state.step = 'ask_email';
      await showTyping(450);
      await addMsg(state.en
        ? 'May I have your <strong>email address</strong>, please?'
        : 'Bolehkah saya dapatkan <strong>alamat emel</strong> anda, sila?');
      setInput(true);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save mobile number.');
      await addMsg(state.en
        ? 'Please enter your <strong>mobile number</strong> again.'
        : 'Sila masukkan semula <strong>nombor telefon bimbit</strong> anda.');
      setInput(true);
      return;
    }
  }

  if (state.step === 'ask_email') {
    const payload = buildEmailPayload(text);
    if (!payload) {
      await showApiError({ message: 'Invalid email address.', errors: { email: 'Enter a valid email address.' } }, 'Invalid email address.');
      await addMsg(state.en
        ? 'Please enter your <strong>email address</strong> again.'
        : 'Sila masukkan semula <strong>alamat emel</strong> anda.');
      setInput(true);
      return;
    }
    try {
      const response = await apiRequest('/session/email', {
        method: 'POST',
        body: { session_id: state.sessionId, email: payload.email },
      });
      const data = extractData(response);
      updateSessionStateFromSession(isPlainObject(data.session) ? data.session : data);
      state.email = payload.email;
      state.step = 'ask_ic_copy';
      await showTyping(500);
      if (isPassportIdentityType()) {
        await addMsg(buildUploadTipHtml(state.en
          ? 'Thank you. Please upload a clear copy of your <strong>Passport Information Page</strong>.<div class="warn-box">Photo tips:<br>- Keep the full page visible<br>- Avoid blur, shadows, or cropping<br>- Make sure all details are readable</div>'
          : 'Terima kasih. Sila muat naik salinan <strong>Muka Surat Maklumat Pasport</strong> yang jelas.<div class="warn-box">Petua foto:<br>- Pastikan keseluruhan muka surat kelihatan<br>- Elakkan kabur, bayang, atau gambar terpotong<br>- Pastikan semua butiran boleh dibaca</div>'));
      } else {
await addMsg(buildUploadTipHtml(state.en
  ? 'Thank you. Please upload your <strong>directors</strong>\' <strong>IC front</strong>, <strong>IC back</strong>, and the <strong>SSM / PPK certificate</strong>. Make sure the images are <strong>clear and fully visible</strong>.<div class="warn-box">Photo tips:<br>- Place the documents on a flat, well-lit surface<br>- Avoid blur, shadows, or cropping<br>- Both front and back copies are required<br>- Please upload your NRIC with the \'Kegunaan CIDB Only\'</div>'
  : 'Terima kasih. Sila muat naik <strong>IC pengarah</strong> bahagian depan, <strong>IC belakang</strong>, dan <strong>sijil SSM / PPK</strong>. Pastikan imej <strong>jelas dan kelihatan sepenuhnya</strong>.<div class="warn-box">Petua foto:<br>- Letakkan dokumen di permukaan rata yang terang<br>- Elakkan kabur, bayang, atau pemotongan gambar<br>- Salinan depan dan belakang diperlukan<br>- Sila muat naik NRIC anda dengan \'Kegunaan CIDB Only\'</div>'));
      }
      setUploadLabels(state.en);
      state.identityEditEnabled = false;
      state.sigDataUrl = null;
      state.uploads = { front: null, back: null, certificate: null, signature: null };
      state.files = { front: null, back: null, certificate: null };
      resetUploadSlot('front');
      resetUploadSlot('back');
      document.getElementById('slot-sig').classList.remove('has-file');
      document.getElementById('thumb-sig').removeAttribute('src');
      document.getElementById('sub-sig').textContent = getSignatureInstructionLabel(state.en);
      uploadArea.style.display = 'flex';
      uploadBtn.disabled = true;
      syncUploadPanelBranch();
      setInput(false);
      await refreshSession();
      return;
    } catch (error) {
      await showApiError(error, 'Unable to save email address.');
      await addMsg(state.en
        ? 'Please enter your <strong>email address</strong> again.'
        : 'Sila masukkan semula <strong>alamat emel</strong> anda.');
      setInput(true);
      return;
    }
  }

  setInput(true);
}

async function slotChanged(slotId) {
  if (slotId === 'back' && !requiresBackDocument()) {
    return;
  }
  if (slotId === 'certificate' && !isCompanyService()) {
    return;
  }
  if (slotId === 'signature' && isCompanyService()) {
    return;
  }
  const fileInput = document.getElementById(`file-${slotId}`);
  const file = fileInput.files[0];
  const slot = document.getElementById(`slot-${slotId}`);
  const thumb = document.getElementById(`thumb-${slotId}`);
  const sub = document.getElementById(`sub-${slotId}`);

  if (!file) {
    state.uploads[slotId] = null;
    state.files[slotId] = null;
    slot.classList.remove('has-file');
    sub.textContent = state.en ? 'Tap to upload' : 'Ketik untuk muat naik';
    checkAllFilled();
    return;
  }

  const localValidation = validateLocalFile(file, slotId);
  if (!localValidation.ok) {
    state.uploads[slotId] = null;
    state.files[slotId] = null;
    resetUploadSlot(slotId);
    await showApiError({ message: localValidation.message, errors: { file: localValidation.message } }, localValidation.message);
    checkAllFilled();
    return;
  }

  state.files[slotId] = file;
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
  setSlotSuccess(slotId, file, previewUrl);

  try {
    const data = await uploadDocument(slotId, file);
    state.uploads[slotId] = data.document || data;
    if (previewUrl) setTimeout(() => URL.revokeObjectURL(previewUrl), 0);
    await addMsg(state.en
      ? `Uploaded <strong>${escapeHtml(slotId === 'front' ? 'IC Front' : 'IC Back')}</strong>: ${escapeHtml(file.name)}`
      : `Berjaya dimuat naik <strong>${escapeHtml(slotId === 'front' ? 'IC Depan' : 'IC Belakang')}</strong>: ${escapeHtml(file.name)}`, 'bot');
    checkAllFilled();
  } catch (error) {
    state.uploads[slotId] = null;
    state.files[slotId] = null;
    if (previewUrl) setTimeout(() => URL.revokeObjectURL(previewUrl), 0);
    resetUploadSlot(slotId);
    await showApiError(error, 'Document upload failed.');
    checkAllFilled();
  }
}

function openSigPad() {
  const en = state.en;
  document.getElementById('sigTitle').textContent = en ? 'Draw your signature' : 'Lukis tandatangan anda';
  document.getElementById('sigSub').textContent = en ? 'Sign inside the box using your finger or mouse' : 'Lukis di dalam kotak menggunakan jari atau tetikus';
  document.getElementById('sigClearBtn').textContent = en ? 'Clear' : 'Padam';
  document.getElementById('sigCancelLink').textContent = en ? 'Cancel' : 'Batal';
  if (sigUploadBtn) {
    sigUploadBtn.textContent = en
      ? 'Upload signature image instead (JPG / PNG)'
      : 'Muat naik imej tandatangan (JPG / PNG)';
  }
  sigOverlay.classList.add('open');
  const rect = sigCanvas.getBoundingClientRect();
  sigCanvas.width = rect.width * (window.devicePixelRatio || 1);
  sigCanvas.height = rect.height * (window.devicePixelRatio || 1);
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  sigCtx.strokeStyle = '#165f66';
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigHasStrokes = false;
  sigCanvasReady = true;
  if (state.sigDataUrl) {
    const image = new Image();
    image.onload = () => sigCtx.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = state.sigDataUrl;
    sigHasStrokes = true;
  }
}

async function sigFileUploaded() {
  const file = sigFileInput?.files?.[0];
  const en = state.en;
  if (!file) {
    return;
  }

  const validation = validateSignatureFile(file);
  if (!validation.ok) {
    if (sigFileInput) {
      sigFileInput.value = '';
    }
    await showApiError({ message: validation.message, errors: { signature: validation.message } }, validation.message);
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const data = await uploadSignature(dataUrl);
    state.sigDataUrl = dataUrl;
    state.uploads.signature = data.signature || data;
    setSignatureSlotSuccess(dataUrl);
    checkAllFilled();
    closeSigPad();
    if (sigFileInput) {
      sigFileInput.value = '';
    }
    await addMsg(state.en ? 'Signature uploaded successfully.' : 'Tandatangan berjaya dimuat naik.', 'bot');
  } catch (error) {
    state.uploads.signature = null;
    state.sigDataUrl = null;
    if (sigFileInput) {
      sigFileInput.value = '';
    }
    const sub = document.getElementById('sigSub');
    if (sub) {
      sub.style.color = '#c85a57';
      sub.textContent = error?.message || (en ? 'Signature upload failed.' : 'Muat naik tandatangan gagal.');
    }
    await showApiError(error, 'Signature upload failed.');
    setTimeout(() => {
      if (!sub) return;
      sub.style.color = '';
      sub.textContent = en ? 'Sign inside the box using your finger or mouse' : 'Lukis di dalam kotak menggunakan jari atau tetikus';
    }, 2500);
    checkAllFilled();
  }
}

function closeSigPad() {
  sigOverlay.classList.remove('open');
}

function clearSig() {
  if (!sigCanvasReady || !sigCtx) return;
  const rect = sigCanvas.getBoundingClientRect();
  sigCtx.clearRect(0, 0, rect.width, rect.height);
  sigHasStrokes = false;
}

function getPos(e) {
  const rect = sigCanvas.getBoundingClientRect();
  if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

sigCanvas.addEventListener('mousedown', e => {
  if (!sigCanvasReady) return;
  sigDrawing = true;
  const p = getPos(e);
  sigCtx.beginPath();
  sigCtx.moveTo(p.x, p.y);
});
sigCanvas.addEventListener('mousemove', e => {
  if (!sigDrawing || !sigCanvasReady) return;
  const p = getPos(e);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
  sigHasStrokes = true;
});
sigCanvas.addEventListener('mouseup', () => { sigDrawing = false; });
sigCanvas.addEventListener('mouseleave', () => { sigDrawing = false; });
sigCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!sigCanvasReady) return;
  sigDrawing = true;
  const p = getPos(e);
  sigCtx.beginPath();
  sigCtx.moveTo(p.x, p.y);
}, { passive: false });
sigCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!sigDrawing || !sigCanvasReady) return;
  const p = getPos(e);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
  sigHasStrokes = true;
}, { passive: false });
sigCanvas.addEventListener('touchend', () => { sigDrawing = false; });
sigOverlay.addEventListener('click', e => { if (e.target === sigOverlay) closeSigPad(); });

async function confirmSig() {
  const en = state.en;
  if (!sigHasStrokes || !sigCanvasReady) {
    const sub = document.getElementById('sigSub');
    sub.style.color = '#c85a57';
    sub.textContent = en ? 'Please draw your signature first.' : 'Sila lukis tandatangan anda terlebih dahulu.';
    setTimeout(() => {
      sub.style.color = '';
      sub.textContent = en ? 'Sign inside the box using your finger or mouse' : 'Lukis di dalam kotak menggunakan jari atau tetikus';
    }, 2000);
    return;
  }
  const dataUrl = sigCanvas.toDataURL('image/png');
  try {
    const data = await uploadSignature(dataUrl);
    state.sigDataUrl = dataUrl;
    state.uploads.signature = data.signature || data;
    setSignatureSlotSuccess(dataUrl);
    checkAllFilled();
    closeSigPad();
    await addMsg(state.en ? 'Signature uploaded successfully.' : 'Tandatangan berjaya dimuat naik.', 'bot');
  } catch (error) {
    state.uploads.signature = null;
    state.sigDataUrl = null;
    const sub = document.getElementById('sigSub');
    sub.style.color = '#c85a57';
    sub.textContent = error?.message || (en ? 'Signature upload failed.' : 'Muat naik tandatangan gagal.');
    await showApiError(error, 'Signature upload failed.');
    setTimeout(() => {
      sub.style.color = '';
      sub.textContent = en ? 'Sign inside the box using your finger or mouse' : 'Lukis di dalam kotak menggunakan jari atau tetikus';
    }, 2500);
    checkAllFilled();
  }
}

async function submitIC() {
  const en = state.en;
  if (!state.sessionId) {
    await addMsg(en ? 'Session is not ready yet.' : 'Sesi belum sedia lagi.', 'error');
    return;
  }

  if (isCompanyService()) {
    if (!state.companyPpkNumber || !state.companyName || !state.companyEmail || !state.companyContactNumber || !state.stateName || !state.companyCategory || !state.companyDirectorName || !state.companyDirectorIdentityNumber || !state.companyReason) {
      await addMsg(en ? 'Please complete the company details before submitting.' : 'Sila lengkapkan butiran syarikat sebelum menghantar.', 'error');
      return;
    }
    if (!state.uploads.front || (requiresBackDocument(state.companyDirectorIdentityType) && !state.uploads.back) || !state.uploads.certificate) {
      await addMsg(en ? 'Please upload the required company documents before submitting.' : 'Sila muat naik dokumen syarikat yang diperlukan sebelum menghantar.', 'error');
      return;
    }
  } else {
    if (!state.name || !state.identityNumber || !state.stateName) {
      await addMsg(en ? 'Please complete the previous steps before submitting.' : 'Sila lengkapkan langkah sebelumnya sebelum menghantar.', 'error');
      return;
    }
    if (!state.mobile || !state.email) {
      await addMsg(en ? 'Please complete your mobile number and email address before submitting.' : 'Sila lengkapkan nombor telefon bimbit dan alamat emel anda sebelum menghantar.', 'error');
      return;
    }
    if (!state.uploads.front || (requiresBackDocument() && !state.uploads.back) || !state.uploads.signature) {
      await addMsg(
        en
          ? (requiresBackDocument() ? 'Please upload the required documents and your signature before submitting.' : 'Please upload the passport page and your signature before submitting.')
          : (requiresBackDocument() ? 'Sila muat naik dokumen yang diperlukan dan tandatangan anda sebelum menghantar.' : 'Sila muat naik muka surat pasport dan tandatangan anda sebelum menghantar.'),
        'error'
      );
      return;
    }
  }

  uploadArea.style.display = 'none';
  uploadBtn.disabled = true;
  updateIdentityEditVisibility();

  const front = state.uploads.front?.document || state.uploads.front;
  const back = state.uploads.back?.document || state.uploads.back;
  const cert = state.uploads.certificate?.document || state.uploads.certificate;
  const names = [];

  if (isCompanyService()) {
    names.push(`${escapeHtml(getFrontDocumentLabel(en))}: <strong>${escapeHtml(front?.original_filename || front?.file_name || state.files.front?.name || 'Uploaded')}</strong>`);
    names.push(`${escapeHtml(getBackDocumentLabel(en))}: <strong>${escapeHtml(back?.original_filename || back?.file_name || state.files.back?.name || 'Uploaded')}</strong>`);
    names.push(`${escapeHtml(getCertificateDocumentLabel(en))}: <strong>${escapeHtml(cert?.original_filename || cert?.file_name || state.files.certificate?.name || 'Uploaded')}</strong>`);
  } else {
    const sigThumbHtml = state.sigDataUrl
      ? `<img src="${state.sigDataUrl}" style="max-height:36px;border-radius:4px;border:1px solid #b7d7d6;vertical-align:middle;margin-left:4px;">`
      : '';
    names.push(`${escapeHtml(getFrontDocumentLabel(en))}: <strong>${escapeHtml(front?.original_filename || front?.file_name || state.files.front?.name || 'Uploaded')}</strong>`);
    if (requiresBackDocument()) {
      names.push(`${escapeHtml(getBackDocumentLabel(en))}: <strong>${escapeHtml(back?.original_filename || back?.file_name || state.files.back?.name || 'Uploaded')}</strong>`);
    }
    names.push(`Signature: ${sigThumbHtml}`);
  }

  await addMsg(`Documents submitted:<br>${names.join('<br>')}`, 'user');
  await showTyping(900);
  await addMsg(isCompanyService()
    ? (en ? 'Thank you. We\'ve received your company documents and are reviewing them.' : 'Terima kasih. Kami telah menerima dokumen syarikat anda dan sedang menyemaknya.')
    : (en ? 'Thank you. We\'ve received your documents and are reviewing them.' : 'Terima kasih. Kami telah menerima dokumen anda dan sedang menyemaknya.'));
  await showTyping(650);
  await addMsg(isCompanyService()
    ? (en
      ? 'Please <strong>stay on the line</strong> while we verify your company details. This will only take a moment...'
      : 'Sila <strong>tunggu sebentar</strong> sementara kami mengesahkan maklumat syarikat anda. Ini hanya mengambil masa sebentar...')
    : (en
      ? 'Please <strong>stay on the line</strong> while we verify your details. This will only take a moment...'
      : 'Sila <strong>tunggu sebentar</strong> sementara kami mengesahkan maklumat anda dalam <strong>portal CIMS</strong>. Ini hanya mengambil masa sebentar...'));

  const ocrWaitSequence = startWaitMessageSequence(en);
  let displayWaitSequence = null;
  try {
    const response = await apiRequest('/submission', {
      method: 'POST',
      body: { session_id: state.sessionId },
    });
    const data = extractData(response);
    const nextAction = firstNonEmpty(data.next_action, data.nextAction, 'done').toLowerCase();
    const request = isPlainObject(data.request) ? data.request : null;
    const requestNumber = resolveSubmissionIdentifier(firstNonEmpty(data.request_number, data.requestNumber, extractRequestNumber(request)), request);
    state.submission = request || data.submission || data;
    const ocrVerification = isPlainObject(data.ocr_verification) ? data.ocr_verification : null;
    const ocrShouldContinue = ocrVerification ? ocrVerification.should_continue !== false : true;
    state.requestNumber = requestNumber;
    if (requestNumber) {
      persistSubmissionContext(requestNumber);
    }
    const verification = isPlainObject(data.verification) ? data.verification : null;
    const finalFailureType = firstNonEmpty(data.final_failure_type, data.finalFailureType, state.submission?.final_failure_type);
    traceRpaFlow('frontend submit response received', {
      identifier: requestNumber,
      submissionRequestNumber: extractRequestNumber(request),
      nextAction,
      verificationId: verification?.id ?? null,
      displayMessageLength: String(verification?.display_message ?? '').length,
      displayMessageIsEmpty: !String(verification?.display_message ?? '').trim(),
      resultStatus: verification?.result_status ?? null,
    });

    if (finalFailureType === 'ocr') {
      ocrWaitSequence.stop();
      displayWaitSequence?.stop?.();
      const finalMessage = firstNonEmpty(data.message, ocrVerification?.message, ocrVerification?.display_message, en
        ? 'We are unable to complete the ID verification after two attempts. Your request has been forwarded for further processing. Please wait for further updates.'
        : 'Kami tidak dapat melengkapkan pengesahan ID selepas dua percubaan. Permohonan anda telah dihantar untuk tindakan lanjut. Sila tunggu maklum balas seterusnya.');
      await addMsg(finalMessage, 'bot');
      uploadArea.style.display = 'none';
      uploadBtn.disabled = true;
      state.step = 'done';
      setInput(false);
      clearSubmissionContext();
      updateIdentityEditVisibility();
      return;
    }

    if (nextAction === 'reupload' || (ocrVerification && ocrShouldContinue === false)) {
      ocrWaitSequence.stop();
      const ocrMessage = firstNonEmpty(
        ocrVerification?.message,
        data.message,
        en
          ? 'ID verification failed. Please re-upload the documents.'
          : 'Pengesahan ID gagal. Sila muat naik semula dokumen.'
      );
      await addMsg(renderOcrVerificationBubble({ ...ocrVerification, message: ocrMessage }), 'error');
      state.step = 'ask_ic_copy';
      state.identityEditEnabled = true;
      uploadArea.style.display = 'flex';
      setInput(false);
      checkAllFilled();
      updateIdentityEditVisibility();
      return;
    }

    if (!requestNumber) {
      ocrWaitSequence.stop();
      await showApiError({
        message: 'Submission request is missing.',
        errors: { submission: 'The backend did not return a request number.' },
      }, 'Submission request is missing.');
      state.step = 'ask_ic_copy';
      state.identityEditEnabled = false;
      uploadArea.style.display = 'flex';
      setInput(false);
      checkAllFilled();
      updateIdentityEditVisibility();
      return;
    }

    ocrWaitSequence.stop();

    if (ocrVerification) {
      await addMsg(renderOcrVerificationBubble(ocrVerification), 'bot');
    }

    await addMsg(renderSummaryBox());

    if (data?.retry_available === true || data?.retry_in_progress === true || nextAction === 'retry_available') {
      const cancellationState = await renderCancellationSubmissionState(data, { fromRetry: false });
      if (cancellationState.handled) {
        displayWaitSequence?.stop?.();
        return;
      }
    }

    const outcome = firstNonEmpty(
      verification?.result_status,
      verification?.status,
      data?.result_status,
      state.submission?.verification_result,
      'error'
    );
    const identifier = requestNumber;
    let resolvedVerification = verification;
    let botMessage = extractVerificationCustomerMessage(verification);

    if (!botMessage) {
      displayWaitSequence = startDisplayMessageWaitSequence(en);
      const resolved = await waitForFinalVerificationMessage(identifier, verification);
      resolvedVerification = resolved.verification;
      botMessage = resolved.message;
      displayWaitSequence.stop();
      displayWaitSequence = null;
    }

    traceRpaFlow('frontend bot message resolution', {
      identifier,
      nextAction,
      resolvedVerificationId: resolvedVerification?.id ?? null,
      botMessageLength: String(botMessage || '').length,
      botMessageIsEmpty: !String(botMessage || '').trim(),
      resolvedDisplayMessageLength: String(resolvedVerification?.display_message ?? '').length,
      resolvedDisplayMessageIsEmpty: !String(resolvedVerification?.display_message ?? '').trim(),
    });

    if (botMessage && hasFinalVerificationDisplayMessage(resolvedVerification) && resolvedVerification?.retry_available === true) {
      const retryReadyState = {
        ...data,
        verification: resolvedVerification,
        retry_available: true,
        next_action: 'retry_available',
      };
      const cancellationState = await renderCancellationSubmissionState(retryReadyState, { fromRetry: false });
      if (cancellationState.handled) {
        displayWaitSequence?.stop?.();
        return;
      }
    }

    if (botMessage) {
      const refreshed = await refreshSubmission(identifier);
      if (isPlainObject(refreshed?.submission)) {
        state.submission = refreshed.submission;
      }
      if (refreshed && await renderCancellationSubmissionState(refreshed, { fromRetry: false })) {
        displayWaitSequence?.stop?.();
        return;
      }
    }

    if (botMessage) {
      const botReplies = normalizeBotReplies(resolvedVerification?.quick_replies || resolvedVerification?.options || resolvedVerification?.choices);
      const botResponseLines = [renderBotRichMessage(botMessage)];
      if (botReplies.length > 0) {
        botResponseLines.push('<br><strong>Options:</strong><br>' + botReplies.map(option => '- ' + escapeHtml(option)).join('<br>'));
      }
      traceRpaFlow('frontend rendering backend message', {
        identifier,
        botMessageLength: botMessage.length,
        botRepliesCount: botReplies.length,
      });
      await addMsg(botResponseLines.join(''), 'bot');
    } else {
      traceRpaFlow('frontend rendering pending message', {
        identifier,
        nextAction,
        outcome,
        resolvedVerificationId: resolvedVerification?.id ?? null,
        resolvedDisplayMessageLength: String(resolvedVerification?.display_message ?? '').length,
        resolvedDisplayMessageIsEmpty: !String(resolvedVerification?.display_message ?? '').trim(),
      });
      await addMsg(
        en
          ? 'Thank you for waiting. We are still processing your request. Please check back shortly.'
          : 'Terima kasih kerana menunggu. Permintaan anda masih diproses. Sila semak semula sebentar lagi.'
      );
    }
    state.step = 'done';
    state.identityEditEnabled = false;
    setInput(false);
    clearSubmissionContext();
    updateIdentityEditVisibility();
  } catch (error) {
    ocrWaitSequence.stop();
    if (displayWaitSequence) {
      displayWaitSequence.stop();
    }
    await showApiError(error, 'Submission failed.');
    state.step = 'ask_ic_copy';
    state.identityEditEnabled = false;
    uploadArea.style.display = 'flex';
    setInput(false);
    checkAllFilled();
    updateIdentityEditVisibility();
  }
}

bootstrapConversation();
