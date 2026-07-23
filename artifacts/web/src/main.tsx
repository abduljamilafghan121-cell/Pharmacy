import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Wire the API client's auth token getter to localStorage so every request
// automatically includes "Authorization: Bearer <token>"
setAuthTokenGetter(() => localStorage.getItem("pharma_token"));

createRoot(document.getElementById('root')!).render(<App />);
