import React from 'react';
import {createRoot} from 'react-dom/client';
import ChecklistApp from '../app/checklist-app.jsx';
createRoot(document.getElementById('your-checklist-preview')).render(<ChecklistApp initialItemId="fridge" initialDetailTab="offers"/>);
