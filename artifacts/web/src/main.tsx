import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Session auth is handled entirely via the httpOnly pharma_token cookie: the
// API sets it on login/register and the browser sends it with same-origin
// /api calls, so no auth token getter needs to be configured here. The
// token never touches localStorage (see hooks/use-auth.tsx).

createRoot(document.getElementById('root')!).render(<App />);
