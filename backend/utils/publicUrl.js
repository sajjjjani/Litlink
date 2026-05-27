function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function getPublicBaseUrl() {
  return trimTrailingSlash(
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'http://localhost:5002'
  );
}

function getHomepageUrl(page, params = {}) {
  const baseUrl = getPublicBaseUrl();
  const homepageBase = /\/Homepage$/i.test(baseUrl) ? baseUrl : `${baseUrl}/Homepage`;
  const searchParams = new URLSearchParams(params);
  const query = searchParams.toString();

  return `${homepageBase}/${page}${query ? `?${query}` : ''}`;
}

function toAbsoluteUrl(url) {
  if (!url || /^https?:\/\//i.test(url)) return url;

  const path = String(url).startsWith('/') ? String(url) : `/${url}`;
  return `${getPublicBaseUrl()}${path}`;
}

module.exports = {
  getHomepageUrl,
  getPublicBaseUrl,
  toAbsoluteUrl
};
