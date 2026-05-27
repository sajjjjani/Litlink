const localOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5001',
  'http://127.0.0.1:5001',
  'http://localhost:5002',
  'http://127.0.0.1:5002',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

function normalizeOrigin(origin) {
  return origin ? origin.trim().replace(/\/$/, '') : '';
}

function getAllowedOrigins() {
  return Array.from(new Set([
    ...localOrigins,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_URL,
    process.env.RENDER_EXTERNAL_URL
  ].map(normalizeOrigin).filter(Boolean)));
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  return (
    getAllowedOrigins().includes(normalized) ||
    /^http:\/\/localhost:\d+$/.test(normalized) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(normalized)
  );
}

function corsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin not allowed by CORS: ${origin}`));
}

module.exports = {
  corsOrigin,
  getAllowedOrigins,
  isAllowedOrigin
};
