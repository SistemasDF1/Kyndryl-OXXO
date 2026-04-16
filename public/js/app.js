// Kyndryl Rally - Shared Utilities

// Participant state management
function getParticipantUuid() {
  return localStorage.getItem('participantUuid');
}

function setParticipantUuid(uuid) {
  localStorage.setItem('participantUuid', uuid);
}

function getParticipantName() {
  return localStorage.getItem('participantName') || '';
}

function setParticipantName(name) {
  localStorage.setItem('participantName', name);
}

function requireRegistration() {
  if (!getParticipantUuid()) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

// Toast notifications
function showToast(message, type = 'success', duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(30px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Loading overlay
function showLoading(message = 'Procesando...') {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    const text = overlay.querySelector('p');
    if (text) text.textContent = message;
    overlay.classList.add('active');
  }
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

// API helper
async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Error en la solicitud');
    }
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Stage names
const STAGE_NAMES = {
  1: 'Foto con IA',
  2: 'Sesión con Ventas',
  3: 'Memorama',
  4: 'Conferencia',
  5: 'Interacción Partner'
};

const STAGE_ICONS = {
  1: '📸',
  2: '🤝',
  3: '🧩',
  4: '🎤',
  5: '🏢'
};

const STAGE_DESCRIPTIONS = {
  1: 'Genera tu foto con IA y compártela en LinkedIn',
  2: 'Visita al equipo de ventas y muestra tu QR',
  3: 'Completa el memorama de asociación',
  4: 'Asiste a una conferencia y muestra tu QR',
  5: 'Interactúa con un partner y muestra tu QR'
};
