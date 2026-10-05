import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AgentGate from './components/AgentGate.tsx';
import { initUiVersion } from './shell/uiVersion';
import './index.css';

initUiVersion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentGate>
      <App />
    </AgentGate>
  </StrictMode>,
);
