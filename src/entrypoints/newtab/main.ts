performance.mark('dt:script');
import '@/styles/fonts.css';
import '@/styles/tokens.css';
import '@/styles/paper.css';
import { mount } from 'svelte';
import { applyCachedAppearance } from '@/lib/appearance';
import App from './App.svelte';

// Before the first paint: pick day/night paper from the last known settings.
applyCachedAppearance();
mount(App, { target: document.getElementById('app')! });
