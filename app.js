/*
  app.js
  - Modo demo (por defecto si no configuras Firebase): muestra videos de ejemplo para pruebas.
  - Si configuras FIREBASE_CONFIG (reemplazando los valores "REPLACE_..."), la aplicación intentará usar Firestore.
  - Para subir a Cloudinary necesitas configurar CLOUDINARY_CLOUD_NAME y CLOUDINARY_UPLOAD_PRESET. En producción firma las cargas.
*/

(function () {
  'use strict';

  // ---------- CONFIG (reemplaza si vas a usar Firebase/Cloudinary) ----------
  const FIREBASE_CONFIG = {
    apiKey: 'REPLACE_FIREBASE_API_KEY',
    authDomain: 'REPLACE_FIREBASE_AUTH_DOMAIN',
    projectId: 'REPLACE_FIREBASE_PROJECT_ID',
    storageBucket: 'REPLACE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'REPLACE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'REPLACE_FIREBASE_APP_ID',
  };

  const CLOUDINARY_CLOUD_NAME = 'REPLACE_CLOUD_NAME';
  const CLOUDINARY_UPLOAD_PRESET = 'REPLACE_UNSIGNED_PRESET';
  // ---------------------------------------------------------------------------

  const DEMO_VIDEOS = [
    {
      id: 'demo-1',
      title: 'Flower (demo)',
      url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      likes: 12,
      category: 'motivacional',
      createdAt: Date.now() - 1000,
    },
    {
      id: 'demo-2',
      title: 'Big Buck Bunny (demo)',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      likes: 3,
      category: 'educativo',
      createdAt: Date.now() - 2000,
    },
  ];

  function isFirebaseConfigured() {
    return (
      FIREBASE_CONFIG &&
      typeof FIREBASE_CONFIG.apiKey === 'string' &&
      FIREBASE_CONFIG.apiKey.length > 10 &&
      !FIREBASE_CONFIG.apiKey.includes('REPLACE')
    );
  }

  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const videosContainer = document.getElementById('videosContainer');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const uploadLabel = document.getElementById('uploadLabel');

    let videos = [];
    let currentIndex = 0;
    let liveDb = null; // firestore reference when configured
    let demoMode = !isFirebaseConfigured();

    if (demoMode) {
      console.info('Virox: DEMO MODE — usando videos de ejemplo.');
      videos = DEMO_VIDEOS.slice().sort((a, b) => b.createdAt - a.createdAt);
      uploadLabel.style.opacity = '0.6';
      uploadLabel.title = 'Subida deshabilitada en modo demo';
      fileInput.disabled = true;
      renderVideos();
    } else {
      try {
        firebase.initializeApp(FIREBASE_CONFIG);
        liveDb = firebase.firestore();
        console.info('Virox: Firebase inicializado, suscribiendo a Firestore...');
        subscribeVideosLive();
      } catch (err) {
        console.error('Error inicializando Firebase:', err);
        // fallback a demo
        demoMode = true;
        videos = DEMO_VIDEOS.slice();
        renderVideos();
      }
    }

    // Renderizado
    function renderVideos() {
      videosContainer.innerHTML = '';
      if (!videos || videos.length === 0) {
        videosContainer.innerHTML = '<div style="color:#999;padding:20px">No hay videos aún. Sube el primero.</div>';
        return;
      }

      videos.forEach((v, idx) => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.style.transform = `translateY(${(idx - currentIndex) * 100}%)`;

        const vid = document.createElement('video');
        vid.src = v.url;
        vid.controls = true;
        vid.playsInline = true;
        vid.setAttribute('preload', 'metadata');

        // autoplay only on visible index
        if (idx === currentIndex) {
          vid.autoplay = true;
          vid.muted = false;
          vid.loop = true;
          // intenta reproducir (puede fallar si el navegador lo bloquea)
          vid.play().catch(() => {});
        }

        const meta = document.createElement('div');
        meta.className = 'video-meta';
        meta.innerHTML = `<h3>${escapeHtml(v.title || 'Sin título')}</h3><p>${escapeHtml(v.category || '')} • ❤️ <span class=\"likes\">${v.likes || 0}</span></p>`;

        // like (demo or live)
        meta.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (demoMode) {
            v.likes = (v.likes || 0) + 1;
            renderVideos();
            return;
          }
          try {
            const ref = liveDb.collection('videos').doc(v.id);
            await ref.update({ likes: firebase.firestore.FieldValue.increment(1) });
          } catch (err) {
            console.error('Error liking', err);
          }
        });

        card.appendChild(vid);
        card.appendChild(meta);
        videosContainer.appendChild(card);
      });
    }

    function escapeHtml(s) {
      if (!s) return '';
      return s.replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }

    // Navegación
    nextBtn.addEventListener('click', () => {
      if (currentIndex < videos.length - 1) currentIndex++;
      renderVideos();
    });
    prevBtn.addEventListener('click', () => {
      if (currentIndex > 0) currentIndex--;
      renderVideos();
    });

    // Subida a Cloudinary (only when not demo and cloud config present)
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (demoMode) return;
      if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.includes('REPLACE')) {
        alert('Cloudinary no está configurado. Configura CLOUDINARY_CLOUD_NAME y CLOUDINARY_UPLOAD_PRESET en app.js.');
        return;
      }

      uploadStatus.textContent = 'Subiendo...';
      try {
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
        const form = new FormData();
        form.append('file', file);
        form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const res = await fetch(url, { method: 'POST', body: form });
        const data = await res.json();
        if (data.secure_url) {
          // guardar en Firestore
          await liveDb.collection('videos').add({
            title: file.name,
            url: data.secure_url,
            cloudinaryId: data.public_id,
            likes: 0,
            category: 'motivacional',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          uploadStatus.textContent = 'Subida completa';
        } else {
          console.error('Cloudinary error', data);
          uploadStatus.textContent = 'Error en subida';
        }
      } catch (err) {
        console.error(err);
        uploadStatus.textContent = 'Error en subida';
      } finally {
        setTimeout(() => (uploadStatus.textContent = ''), 3000);
        e.target.value = null;
      }
    });

    // Suscripción a Firestore (modo live)
    function subscribeVideosLive() {
      if (!liveDb) return;
      try {
        liveDb.collection('videos').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
          const arr = [];
          snapshot.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
          videos = arr;
          currentIndex = Math.min(currentIndex, Math.max(0, videos.length - 1));
          renderVideos();
        });
      } catch (err) {
        console.error('Error suscribiendo a videos:', err);
      }
    }

    // Inicial: si estamos en demo ya llamamos render en el bloque anterior
  });
})();