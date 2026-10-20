import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { App, NONCE } from './app';

const root = document.getElementById('root');
if (root) hydrateRoot(root, createElement(App, { nonce: NONCE }));
