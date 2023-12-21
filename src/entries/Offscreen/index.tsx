import React from 'react';
import { createRoot } from 'react-dom/client';

import Offscreen from './Offscreen';

const container = document.getElementById('app-container');
const root = createRoot(container!);
root.render(<Offscreen />);
