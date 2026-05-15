/**
 * CampusFind — Lost & Found System
 * app.js
 */

console.log("File app.js berjalan dengan struktur SQL dan Chat Dinamis!");

// =====================
// 1. FUNGSI UI & NAVIGASI
// =====================
function showPage(id, tabEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (target) target.classList.add('active');

  if (tabEl) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
  }
}

function openModal(idx) {
  const item = items[idx];
  if (!item) return;
  const statusDesc = {
    'Published': 'Available — contact finder directly',
    'claimed': 'Already claimed',
    'security': 'Currently held at security post'
  };

  const modalImgContainer = document.getElementById('m-img');
  if (item.image_url) {
    modalImgContainer.innerHTML = `<img src="${item.image_url}" onclick="openImageViewer('${item.image_url}')" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--border-radius-md); cursor: zoom-in;">`;
  } else {
    modalImgContainer.textContent = '📦'; 
  }

  const actionBtn = document.querySelector('.modal-chat-btn');
  if (actionBtn) {
    actionBtn.onclick = function() { goToVerify(idx); };
  }

  document.getElementById('m-name').textContent = item.title;
  document.getElementById('m-desc').innerHTML = `<strong>Description:</strong> ${item.description || '-'}`;
  document.getElementById('m-loc').innerHTML = `<strong>Found at:</strong> ${item.lokasi_ditemukan}`;
  document.getElementById('m-date').innerHTML = `<strong>Date:</strong> ${item.find_date}`;
  document.getElementById('m-status').innerHTML = `<strong>Status:</strong> ${statusDesc[item.status] || item.status}`;
  document.getElementById('modal').classList.add('open');
}

// =====================
// DARK MODE LOGIC
// =====================
function toggleDarkMode() {
  const body = document.body;
  const themeBtn = document.getElementById('theme-toggle');
  
  // Toggle class 'dark-mode' di body
  body.classList.toggle('dark-mode');
  
  // Cek apakah sekarang mode gelap aktif
  const isDarkMode = body.classList.contains('dark-mode');
  
  // Ubah ikon tombol (Bulan untuk terang, Matahari untuk gelap)
  if (isDarkMode) {
    themeBtn.textContent = '☀️';
    // Simpan pilihan user di browser
    localStorage.setItem('campusfind_theme', 'dark');
  } else {
    themeBtn.textContent = '🌙';
    localStorage.setItem('campusfind_theme', 'light');
  }
}

function loadTheme() {
  const savedTheme = localStorage.getItem('campusfind_theme');
  const themeBtn = document.getElementById('theme-toggle');
  
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if(themeBtn) themeBtn.textContent = '☀️';
  }
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

window.openImageViewer = function(url) {
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('iv-img');
  
  if (viewer && viewerImg) {
    viewerImg.src = url;
    viewer.classList.add('show');
    
    if (pzInstance) {
      pzInstance.destroy();
    }
    
    pzInstance = Panzoom(viewerImg, {
      maxScale: 5,
      minScale: 1, 
      step: 0.3
    });
    
    viewerImg.parentElement.addEventListener('wheel', (event) => {
      pzInstance.zoomWithWheel(event);
      if (pzInstance.getScale() <= 1) {
        pzInstance.pan(0, 0);
      }
    });

    viewerImg.addEventListener('panzoomend', () => {
      if (pzInstance.getScale() <= 1) {
        pzInstance.pan(0, 0, { animate: true }); 
      }
    });
  }
};

window.closeImageViewer = function() {
  const viewer = document.getElementById('image-viewer');
  const viewerImg = document.getElementById('iv-img');
  
  if (viewer) {
    viewer.classList.remove('show');
    
    if (pzInstance) {
      pzInstance.destroy();
      pzInstance = null;
    }
    if(viewerImg && viewerImg.parentElement) {
      viewerImg.parentElement.removeEventListener('wheel', pzInstance.zoomWithWheel);
    }
  }
};

function goToChat() {
  closeModal();
  showPage('chat', null);
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 2));
}

function toggleSecurity(el) {
  el.classList.toggle('off');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

window.handleFileSelect = function(input) {
  const icon = document.getElementById('upload-icon');
  const text = document.getElementById('upload-text');
  const zone = document.getElementById('upload-zone-label');
  
  if (input.files && input.files[0]) {
    icon.textContent = '✅';
    text.textContent = input.files[0].name;
    zone.style.borderColor = 'var(--brand)';
    zone.style.background = 'var(--brand-light)';
  } else {
    icon.textContent = '📎';
    text.textContent = 'Click to upload photo';
    zone.style.borderColor = 'var(--color-border-secondary)';
    zone.style.background = 'var(--color-background-secondary)';
  }
};

// =====================
// 2. SETUP DATABASE SUPABASE
// =====================
const dbUrl = CONFIG.SUPABASE_URL; 
const dbKey = CONFIG.SUPABASE_ANON_KEY; 

let myDatabase = null;
if (window.supabase) {
  myDatabase = window.supabase.createClient(dbUrl, dbKey);
}

let items = [];
let currentFilter = 'all';
let searchQuery = '';
let pzInstance = null;

// =====================
// 3. FETCH & RENDER DATA
// =====================
async function fetchItemsFromDB() {
  if (!myDatabase) return;

  const { data, error } = await myDatabase
    .from('items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }
  
  items = data || [];
  renderItems(currentFilter);
  renderSecurityTable();
  updateBrowseStats();
  renderVerifySidebar();
  
  // Buka percakapan pertama secara otomatis jika ada
  setTimeout(() => {
    const firstChat = document.querySelector('.chat-item');
    if (firstChat) firstChat.click();
  }, 100);
}

function renderItems(filter) {
  const grid = document.getElementById('item-grid');
  if (!grid) return;

  // KUNCI: Buang semua barang yang statusnya 'claimed' sebelum ditampilkan ke layar
  const activeItems = items.filter(i => i.status !== 'claimed');

  // Lakukan filter tab (All, Available, Security) hanya pada barang yang masih aktif
  let filtered = filter === 'all' 
    ? activeItems 
    : activeItems.filter(i => {
        if (filter === 'available') return i.status === 'Published' || i.status === 'available';
        return i.status === filter;
      });

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(i =>
      (i.title && i.title.toLowerCase().includes(q)) ||
      (i.lokasi_ditemukan && i.lokasi_ditemukan.toLowerCase().includes(q)) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      (i.category && i.category.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:40px 20px; color:var(--color-text-tertiary); font-size:13px;">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        No items found matching your search.
      </div>`;
    return;
  }

  const statusLabel = { 'Published': 'Available', 'claimed': 'Claimed', 'security': 'At Security' };
  const statusClass = { 'Published': 's-available', 'claimed': 's-claimed', 'security': 's-security' };

  grid.innerHTML = filtered.map((item) => {
    // Kita harus mencari index ASLI dari array 'items' induk agar saat diklik modalnya tidak tertukar
    const originalIdx = items.indexOf(item);
    const imageContent = item.image_url 
      ? `<img src="${item.image_url}" alt="${item.title}" style="width: 100%; height: 100%; object-fit: cover;">`
      : `<span class="item-emoji">📦</span>`;

    return `
      <div class="item-card" onclick="openModal(${originalIdx})">
        <div class="item-img">
          ${imageContent}
          <span class="status-badge ${statusClass[item.status] || 's-available'}">${statusLabel[item.status] || item.status}</span>
        </div>
        <div class="item-body">
          <div class="item-name">${item.title}</div>
          <div class="item-loc">📍 ${item.lokasi_ditemukan}</div>
          <div class="item-footer">
            <span class="item-date">${item.find_date}</span>
            <button class="contact-btn" onclick="event.stopPropagation(); goToVerify(${originalIdx})">Verify</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function filterItems(f, btn) {
  currentFilter = f;
  renderItems(f);
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-f'));
  if (btn) btn.classList.add('active-f');
}

function initSearch() {
  const input = document.querySelector('.search-wrap input');
  if (!input) return;
  input.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderItems(currentFilter);
  });
}

// =====================
// 4. SUBMIT FORM (UPLOAD FOTO & INSERT DATA)
// =====================
async function submitForm() {
  if (!myDatabase) return;

  // AMBIL SEMUA ELEMEN INPUT
  const nameInput = document.querySelector('#page-report input[placeholder*="Black wallet"]');
  const descInput = document.querySelector('#page-report .form-textarea');
  const locInput = document.querySelector('#page-report input[placeholder*="Library"]');
  const catInput = document.querySelector('#page-report select.form-input');
  const dateInput = document.querySelector('#page-report input[type="date"]');
  const contactInput = document.querySelector('#page-report input[placeholder*="WhatsApp"]'); 
  const photoInput = document.getElementById('item-photo');
  const secToggle = document.getElementById('sec-toggle');
  
  const finalStatus = (secToggle && !secToggle.classList.contains('off')) ? 'security' : 'Published';
  const file = photoInput ? photoInput.files[0] : null;

  // ==========================================
  // 1. FORMATTING KONTAK OTOMATIS
  // ==========================================
  let formattedContact = '';
  if (contactInput && contactInput.value.trim()) {
    const rawContact = contactInput.value.trim();
    // Cek apakah input hanya berisi angka, spasi, tanda plus (+), atau strip (-)
    const isPhoneNumber = /^[0-9+\-\s]+$/.test(rawContact);
    
    if (isPhoneNumber) {
      formattedContact = `Phone Number: ${rawContact} | ID LINE: -`;
    } else {
      formattedContact = `Phone Number: - | ID LINE: ${rawContact}`;
    }
  }

  // ==========================================
  // 2. BLOK VALIDASI (KONDISIONAL)
  // ==========================================
  let isFormValid = true;

  // Kumpulkan semua kolom teks/pilihan yang SELALU wajib diisi
  let requiredFields = [nameInput, descInput, locInput, catInput, dateInput];

  // Logika Opsional: Jika barang TIDAK di satpam (Published), kontak WAJIB diisi!
  if (finalStatus === 'Published' && contactInput) {
    requiredFields.push(contactInput);
  }

  // Cek kolom input (merah jika kosong)
  requiredFields.forEach(input => {
    if (input && !input.value.trim()) {
      input.style.borderColor = '#e55'; 
      setTimeout(() => { input.style.borderColor = ''; }, 1500); 
      isFormValid = false;
    }
  });

  // Cek khusus untuk foto
  if (!file) {
    const uploadZone = document.getElementById('upload-zone-label');
    if (uploadZone) {
      uploadZone.style.borderColor = '#e55';
      setTimeout(() => { uploadZone.style.borderColor = 'var(--color-border-secondary)'; }, 1500);
    }
    isFormValid = false;
  }

  // Jika tidak valid, batalkan eksekusi
  if (!isFormValid) {
    console.log("Validasi gagal: Ada form yang masih kosong.");
    return; 
  }

  // ==========================================
  // 3. PROSES UPLOAD & INSERT KE DATABASE
  // ==========================================
  const submitBtn = document.querySelector('.submit-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Uploading...';
  submitBtn.disabled = true;

  let imageUrl = null;

  try {
    // Upload file gambar ke storage
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await myDatabase.storage
        .from('Item Photos') 
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = myDatabase.storage
        .from('Item Photos')
        .getPublicUrl(fileName);
        
      imageUrl = publicUrlData.publicUrl;
    }

    submitBtn.textContent = 'Saving data...';
    
    const findDate = (dateInput && dateInput.value) 
      ? dateInput.value 
      : new Date().toISOString().split('T')[0];

    // Insert data ke tabel items
    const { data, error } = await myDatabase
      .from('items')
      .insert([
        {
          title: nameInput.value.trim(),
          description: descInput ? descInput.value.trim() : '',
          lokasi_ditemukan: locInput ? locInput.value.trim() : '',
          category: catInput ? catInput.value : 'Other',
          find_date: findDate,
          image_url: imageUrl,
          status: finalStatus,
          contact_info: formattedContact // Memasukkan variabel yang sudah diformat di langkah 1
        }
      ]);

    if (error) throw error;

    // Bersihkan form
    nameInput.value = '';
    if (descInput) descInput.value = '';
    if (locInput) locInput.value = '';
    if (catInput) catInput.value = '';
    if (dateInput) dateInput.value = '';
    if (contactInput) contactInput.value = '';
    if (photoInput) photoInput.value = '';

    if (secToggle && !secToggle.classList.contains('off')) {
      secToggle.classList.add('off');
    }

    const uploadIcon = document.getElementById('upload-icon');
    const uploadText = document.getElementById('upload-text');
    const uploadZone = document.getElementById('upload-zone-label');
    if(uploadIcon) uploadIcon.textContent = '📎';
    if(uploadText) uploadText.textContent = 'Click to upload photo';
    if(uploadZone) {
      uploadZone.style.borderColor = 'var(--color-border-secondary)';
      uploadZone.style.background = 'var(--color-background-secondary)';
    }

    // Tampilkan notifikasi sukses
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      showPage('browse', null);
      document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
      fetchItemsFromDB(); 
    }, 2000);

  } catch (err) {
    console.error('Error saat submit:', err);
    alert('Gagal menyimpan ke database. Cek Console log.');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// =====================
// 5. VERIFY CLAIM LOGIC
// =====================

// Navigasi ke tab Verify dan otomatis buka form barang
window.goToVerify = function(idx) {
  closeModal(); // Tutup modal jika sedang terbuka
  showPage('verify', null); // Pindah ke halaman Verify
  
  // Ubah sorotan (highlight) di Navbar ke tab Verify (asumsi tab ke-3 / index 2)
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 2));

  // Jika tombol diklik dari barang tertentu, otomatis buka formnya!
  if (idx !== undefined && items[idx]) {
    // Beri jeda sangat singkat agar HTML selesai merender halaman baru
    setTimeout(() => {
      openVerify(null, idx);
    }, 50);
  }
};

// Render Sidebar (Hanya tampilkan barang yang belum di-claim)
function renderVerifySidebar() {
  const sidebarList = document.getElementById('verify-sidebar-list');
  if (!sidebarList) return;

  const unclaimedItems = items.filter(i => i.status !== 'claimed');

  if (unclaimedItems.length === 0) {
    sidebarList.innerHTML = '<div style="padding:20px; font-size:12px; color:var(--color-text-tertiary); text-align:center;">All items claimed!</div>';
    return;
  }

  sidebarList.innerHTML = items.map((item, idx) => {
    if (item.status === 'claimed') return ''; // Sembunyikan yang sudah diclaim
    
    return `
      <div class="chat-item" onclick="openVerify(this, ${idx})">
        <div class="chat-name">${item.title}</div>
        <div class="chat-preview">📍 ${item.lokasi_ditemukan || '-'}</div>
        <div class="chat-time">${item.find_date || ''}</div>
      </div>
    `;
  }).join('');
}

// Buka Form Verifikasi
window.openVerify = function(el, idx) {
  const item = items[idx];
  if (!item) return;

  // Aktifkan highlight sidebar
  document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('active-c'));
  if (el) el.classList.add('active-c');

  // Sembunyikan pesan kosong, tampilkan form
  document.getElementById('verify-empty').style.display = 'none';
  document.getElementById('verify-main').style.display = 'block';

  // Isi data barang di bagian atas
  document.getElementById('v-item-img').src = item.image_url || '';
  document.getElementById('v-item-name').textContent = item.title;
  document.getElementById('v-item-idx').value = idx; // Simpan index
  
  const badge = document.getElementById('v-item-status');
  badge.textContent = item.status === 'security' ? 'At Security' : 'Available';
  badge.className = 'status-badge ' + (item.status === 'security' ? 's-security' : 's-available');

  // Logika Kontak
  const contactDiv = document.getElementById('v-item-contact');
  const contactInfo = document.getElementById('v-contact-info');
  
  if (item.status === 'security') {
    contactDiv.style.display = 'none'; // Sembunyikan jika di satpam
  } else {
    contactDiv.style.display = 'block'; // Tampilkan jika dengan penemu
    
    // Ambil data kontak yang sudah diformat dari database
    const actualContact = item.contact_info || "Data kontak tidak tersedia"; 
    
    // 1. Tampilan Awal (Disembunyikan / Masked)
    contactInfo.textContent = "Lihat Finder Contact";
    contactInfo.style.textDecoration = "underline";
    contactInfo.style.cursor = "pointer";
    contactInfo.style.color = "var(--brand)";
    
    // 2. Aksi saat tulisan diklik (Unmask)
    contactInfo.onclick = function() {
      // Munculkan teks aslinya (Phone Number: --- | ID LINE: ---)
      contactInfo.textContent = actualContact; 
      
      // Hilangkan efek klik (underline & pointer) agar terlihat seperti teks biasa
      contactInfo.style.textDecoration = "none";
      contactInfo.style.cursor = "text";
      
      // Matikan fungsi klik agar tidak terpicu lagi
      contactInfo.onclick = null; 
    };
  }
};

// UI File Input untuk Verify
window.handleClaimFileSelect = function(input) {
  const icon = document.getElementById('claim-upload-icon');
  const text = document.getElementById('claim-upload-text');
  const zone = document.getElementById('claim-upload-zone-label');
  
  if (input.files && input.files[0]) {
    icon.textContent = '✅';
    text.textContent = input.files[0].name;
    zone.style.borderColor = 'var(--brand)';
    zone.style.background = 'var(--brand-light)';
  } else {
    icon.textContent = '📎';
    text.textContent = 'Click to upload photo';
    zone.style.borderColor = 'var(--color-border-secondary)';
    zone.style.background = 'var(--color-background-secondary)';
  }
};

// Kirim Perubahan Status ke Supabase
window.submitClaim = async function() {
  if (!myDatabase) return;

  const idx = document.getElementById('v-item-idx').value;
  const item = items[idx];
  if (!item) return;

  const photoInput = document.getElementById('claim-photo');
  const nameInput = document.getElementById('claim-name');
  const dateInput = document.getElementById('claim-date');
  const file = photoInput ? photoInput.files[0] : null;

  // Validasi Merah-Merah persis seperti di Report
  let isFormValid = true;
  const requiredFields = [nameInput, dateInput];

  requiredFields.forEach(input => {
    if (input && !input.value.trim()) {
      input.style.borderColor = '#e55';
      setTimeout(() => { input.style.borderColor = ''; }, 1500);
      isFormValid = false;
    }
  });

  if (!file) {
    const uploadZone = document.getElementById('claim-upload-zone-label');
    if (uploadZone) {
      uploadZone.style.borderColor = '#e55';
      setTimeout(() => { uploadZone.style.borderColor = 'var(--color-border-secondary)'; }, 1500);
    }
    isFormValid = false;
  }

  if (!isFormValid) return;

  const submitBtn = document.getElementById('claim-submit-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Verifying...';
  submitBtn.disabled = true;

  try {
    // 1. (Opsional) Upload foto bukti ke Supabase Storage (Menggunakan bucket yang sama)
    // 2. Update status barang di tabel items menggunakan ID Supabase-nya
    const { data, error } = await myDatabase
      .from('items')
      .update({ status: 'claimed' })
      .eq('id', item.id); // HARUS ADA kolom 'id' di tabel Supabase kamu

    if (error) throw error;

    // Bersihkan form
    nameInput.value = '';
    dateInput.value = '';
    photoInput.value = '';
    handleClaimFileSelect(photoInput);

    // Tampilkan Toast Sukses
    const toast = document.getElementById('toast');
    toast.textContent = "✅ Item successfully claimed!";
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
      toast.textContent = "✅ Item reported successfully!"; // Kembalikan teks asli
      document.getElementById('verify-main').style.display = 'none';
      document.getElementById('verify-empty').style.display = 'flex';
      
      // Refresh layar untuk memuat ulang data terbaru
      fetchItemsFromDB(); 
    }, 2000);

  } catch (err) {
    console.error('Error saat update claim:', err);
    alert('Gagal memverifikasi. Cek Console log.');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
};

function handleRelease(btn) {
  const statusCell = btn.closest('tr').querySelector('.status-badge');
  statusCell.textContent = 'Released';
  statusCell.className = 'status-badge s-claimed';
  btn.textContent = 'Done';
  btn.disabled = true;
  btn.style.opacity = '0.5';
}

function handleHold(btn) {
  const statusCell = btn.closest('tr').querySelector('.status-badge');
  statusCell.textContent = 'Flagged';
  statusCell.className = 'status-badge s-security';
  btn.textContent = 'Flagged';
  btn.disabled = true;
  btn.style.opacity = '0.5';
}

function exportLog() {
  alert('Export feature: in a real implementation this would download a CSV.');
}

// =====================
// 6. EVENT LISTENERS INIT
// =====================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeImageViewer();
    closeModal();
  }
  if (e.key === 'Enter' && document.activeElement.id === 'chat-input') {
    sendMsg();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const modalBg = document.getElementById('modal');
  if (modalBg) {
    modalBg.addEventListener('click', (e) => { 
      if (e.target === modalBg) closeModal(); 
    });
  }
  
  const imageViewer = document.getElementById('image-viewer');
  if (imageViewer) {
    imageViewer.addEventListener('click', (e) => {
      if (e.target === imageViewer) {
        closeImageViewer();
      }
    });
  }
  
  loadTheme();
  initSearch();
  fetchItemsFromDB();
});

// =====================
// UPDATE BROWSE STATS
// =====================
function updateBrowseStats() {
  const statTotal = document.getElementById('stat-total');
  const statReturned = document.getElementById('stat-returned');
  const statSecurity = document.getElementById('stat-security');

  if (!statTotal || !statReturned || !statSecurity) return;

  const total = items.length;
  const returned = items.filter(i => i.status === 'claimed').length;
  const atSecurity = items.filter(i => i.status === 'security').length;

  statTotal.textContent = total;
  statReturned.textContent = returned;
  statSecurity.textContent = atSecurity;
}

// =====================
// RENDER SECURITY TABLE
// =====================
function renderSecurityTable() {
  const tbody = document.getElementById('security-table-body');
  if (!tbody) return;

  tbody.innerHTML = items.map(item => {
    const icon = item.image_url ? '🖼️' : '📦';
    
    let statusBadge = '';
    let actionBtn = ''; // Variabel baru untuk tombol aksi

    // Logika render tombol dan badge berdasarkan status
    if (item.status === 'Published') {
      statusBadge = '<span class="status-badge s-available">Available</span>';
      actionBtn = '<button class="sec-action sec-release" onclick="handleRelease(this)">Release</button>';
    } else if (item.status === 'claimed') {
      statusBadge = '<span class="status-badge s-claimed">Claimed</span>';
      // Tombol berubah jadi 'Done' dan meredup jika sudah selesai
      actionBtn = '<button class="sec-action" disabled style="opacity: 0.5;">Done</button>'; 
    } else if (item.status === 'security') {
      statusBadge = '<span class="status-badge s-security">At Security</span>';
      actionBtn = '<button class="sec-action sec-release" onclick="handleRelease(this)">Release</button>';
    } else {
      statusBadge = `<span class="status-badge">${item.status}</span>`;
      actionBtn = '-';
    }

    return `
      <tr>
        <td>${icon} ${item.title}</td>
        <td>-</td> <td>${item.lokasi_ditemukan}</td>
        <td>${item.find_date}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');

  const totalItems = items.length;
  const heldItems = items.filter(i => i.status === 'Published' || i.status === 'security').length;
  const releasedItems = items.filter(i => i.status === 'claimed').length;

  const stats = document.querySelectorAll('.sec-stat-num');
  if (stats.length >= 4) {
    stats[0].textContent = heldItems;       
    stats[1].textContent = releasedItems;   
    stats[2].textContent = '0';             
    stats[3].textContent = totalItems;      
  }
}