import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Note: the auth token getter is configured inside AuthProvider (use-auth.tsx)
// using a React ref so it always has the current in-memory token, even when
// localStorage is restricted (e.g. in Replit's sandboxed preview iframe).

createRoot(document.getElementById('root')!).render(<App />);
