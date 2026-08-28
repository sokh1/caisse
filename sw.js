// Service worker de l'application Caisse.
//
// Stratégie volontairement "réseau d'abord" (network-first) pour tous les
// fichiers de l'application (HTML/CSS/JS/manifest) : on essaie toujours de
// récupérer la dernière version sur le réseau, et on ne se rabat sur le
// cache que si le réseau échoue (hors-ligne). Cela évite de servir une
// version de l'appli figée/périmée après une mise à jour — un problème déjà
// rencontré plusieurs fois sur ce projet avec le cache du navigateur.
//
// IMPORTANT : les données (Google Sheets / Apps Script) ne sont JAMAIS mises
// en cache ici : seules les requêtes vers la même origine (les fichiers de
// l'appli) sont concernées. Sans connexion, l'appli s'ouvre donc (grâce au
// cache), mais reste en mode démo / lecture des dernières données chargées :
// il faut une connexion pour lire/écrire dans la Google Sheet.

const CACHE_NAME = 'caisse-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/api.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // Si une ressource manque (ex : test local), ne bloque pas l'installation.
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne s'occupe que des requêtes GET, même origine (fichiers de l'appli).
  // Toutes les requêtes vers Google Apps Script / Google Sheets (autre
  // origine) passent directement au réseau, sans jamais être mises en cache.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
