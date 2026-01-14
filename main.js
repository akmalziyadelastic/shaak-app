import './style.css';

// DOM Elements
const newKeyAlias = document.getElementById('new-key-alias');
const newKeyValue = document.getElementById('new-key-value');
const addKeyBtn = document.getElementById('add-key-btn');
const keySelect = document.getElementById('key-select');
const inputText = document.getElementById('input-text');
const outputText = document.getElementById('output-text');
const encryptBtn = document.getElementById('encrypt-btn');
const decryptBtn = document.getElementById('decrypt-btn');
const pasteBtn = document.getElementById('paste-btn');
const copyBtn = document.getElementById('copy-btn');
const settingsBtn = document.getElementById('settings-btn');
const modal = document.getElementById('key-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const keyListContainer = document.getElementById('key-list');
const themeDarkBtn = document.getElementById('theme-dark');
const themeLightBtn = document.getElementById('theme-light');

// Constants
const STORAGE_KEYS = 'shaak_keys';
const STORAGE_LAST_KEY = 'shaak_last_key';
const STORAGE_THEME = 'shaak_theme';

// Utility: ArrayBuffer to/from Base64
const bufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBuffer = (base64) => {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// --- Crypto Logic ---

async function getKeyMaterial(password) {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
}

async function getKey(keyMaterial, salt) {
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(content, password) {
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await getKeyMaterial(password);
    const key = await getKey(keyMaterial, salt);
    
    const encoded = new TextEncoder().encode(content);
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoded
    );

    // Combine: Salt + IV + Ciphertext
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return bufferToBase64(combined.buffer);
  } catch (e) {
    console.error(e);
    alert('Encryption failed: ' + e.message);
    return null;
  }
}

async function decrypt(cipherTextBase64, password) {
  try {
    const combined = new Uint8Array(base64ToBuffer(cipherTextBase64));
    
    // Extract parts
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);

    const keyMaterial = await getKeyMaterial(password);
    const key = await getKey(keyMaterial, salt);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error(e);
    alert('Decryption failed! Wrong key or corrupted data.');
    return null;
  }
}

// --- Key Management ---

function loadKeys() {
  const keysStr = localStorage.getItem(STORAGE_KEYS);
  return keysStr ? JSON.parse(keysStr) : [];
}

function saveKey(alias, value) {
  const keys = loadKeys();
  if (keys.find(k => k.alias === alias)) {
    alert('Key alias already exists!');
    return false;
  }
  keys.push({ alias, value });
  localStorage.setItem(STORAGE_KEYS, JSON.stringify(keys));
  return true;
}

function deleteKey(alias) {
  if(!confirm(`Are you sure you want to delete key "${alias}"? This cannot be undone.`)) return;
  let keys = loadKeys();
  keys = keys.filter(k => k.alias !== alias);
  localStorage.setItem(STORAGE_KEYS, JSON.stringify(keys));
  updateKeyDropdown();
  renderKeyList();
  
  // If we deleted the currently selected key, reset selection
  if (keySelect.options[keySelect.selectedIndex].text === alias) {
      keySelect.value = "";
      localStorage.removeItem(STORAGE_LAST_KEY);
  }
}

function updateKeyDropdown() {
  const keys = loadKeys();
  const lastKey = localStorage.getItem(STORAGE_LAST_KEY);
  
  keySelect.innerHTML = '<option value="" disabled selected>Select a Key</option>';
  
  keys.forEach(k => {
    const option = document.createElement('option');
    option.value = k.value;
    option.textContent = k.alias;
    keySelect.appendChild(option);
  });

  if (lastKey) {
    const exists = keys.find(k => k.value === lastKey);
    if (exists) {
      keySelect.value = lastKey;
    }
  }
}

function renderKeyList() {
    const keys = loadKeys();
    keyListContainer.innerHTML = '';
    
    if (keys.length === 0) {
        keyListContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); opacity: 0.5;">No keys saved yet.</p>';
        return;
    }

    keys.forEach(k => {
        const item = document.createElement('div');
        item.className = 'key-item';
        
        const name = document.createElement('span');
        name.textContent = k.alias;
        
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.className = 'delete-key-btn';
        delBtn.onclick = () => deleteKey(k.alias);
        
        item.appendChild(name);
        item.appendChild(delBtn);
        keyListContainer.appendChild(item);
    });
}

function toggleModal(show) {
    if (show) {
        modal.classList.remove('hidden');
        renderKeyList();
    } else {
        modal.classList.add('hidden');
    }
}

// --- Event Listeners ---

settingsBtn.addEventListener('click', () => toggleModal(true));
closeModalBtn.addEventListener('click', () => toggleModal(false));
// Close modal if clicking outside content
modal.addEventListener('click', (e) => {
    if (e.target === modal) toggleModal(false);
});

addKeyBtn.addEventListener('click', () => {
  const alias = newKeyAlias.value.trim();
  const value = newKeyValue.value.trim();
  
  if (!alias || !value) {
    alert('Please enter both a name and a key.');
    return;
  }
  
  if (saveKey(alias, value)) {
    newKeyAlias.value = '';
    newKeyValue.value = '';
    updateKeyDropdown();
    renderKeyList(); // Re-render list
    
    // Auto select new key and close modal if it's the first key, or just notify
    keySelect.value = value;
    localStorage.setItem(STORAGE_LAST_KEY, value);
    
    // If user has keys now, maybe close modal automatically?
    // "Once the first key is added don't show the add key option"
    toggleModal(false); 
    
    alert('Key added securely!');
  }
});

keySelect.addEventListener('change', () => {
  localStorage.setItem(STORAGE_LAST_KEY, keySelect.value);
});

encryptBtn.addEventListener('click', async () => {
  const content = inputText.value;
  const password = keySelect.value;
  
  if (!password) {
    alert('Please select a key first!');
    toggleModal(true); // Open modal if no key selected
    return;
  }
  if (!content) {
    alert('Please enter text to encrypt.');
    return;
  }

  const result = await encrypt(content, password);
  if (result) {
    outputText.value = result;
  }
});

decryptBtn.addEventListener('click', async () => {
  const content = inputText.value;
  const password = keySelect.value;

  if (!password) {
    alert('Please select a key first!');
    toggleModal(true);
    return;
  }
  if (!content) {
    alert('Please enter content to decrypt.');
    return;
  }

  const result = await decrypt(content, password);
  if (result) {
    outputText.value = result;
  }
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    inputText.value = text;
  } catch (err) {
    alert('Failed to read clipboard: ' + err);
  }
});

copyBtn.addEventListener('click', async () => {
  if (!outputText.value) return;
  try {
    await navigator.clipboard.writeText(outputText.value);
    const originalText = copyBtn.textContent;
    copyBtn.textContent = '✅';
    setTimeout(() => copyBtn.textContent = originalText, 1500);
  } catch (err) {
    alert('Failed to copy: ' + err);
  }
});

// --- Theme Management ---

function setTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeLightBtn.classList.add('active');
    themeDarkBtn.classList.remove('active');
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeDarkBtn.classList.add('active');
    themeLightBtn.classList.remove('active');
  }
  localStorage.setItem(STORAGE_THEME, theme);
}

// Theme Listeners
themeDarkBtn.addEventListener('click', () => setTheme('dark'));
themeLightBtn.addEventListener('click', () => setTheme('light'));

// Init
const savedTheme = localStorage.getItem(STORAGE_THEME);
if (savedTheme) {
  setTheme(savedTheme);
} else {
  setTheme('light');
}

updateKeyDropdown();

// Auto-open modal if no keys exist
if (loadKeys().length === 0) {
    toggleModal(true);
}


// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

