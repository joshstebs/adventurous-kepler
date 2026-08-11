// Central API base URL for the frontend.
// Dev: empty string = same-origin — Vite's dev server proxies /api to the
// backend (see vite.config.js). Override with VITE_API_URL when deploying.
const API_URL = import.meta.env.VITE_API_URL || '';

export default API_URL;
