import '@/styles/tokens.css';
import '@/styles/paper.css';
import '@/styles/settings.css';
import { mount } from 'svelte';
import { applyCachedAppearance } from '@/lib/appearance';
import App from './App.svelte';

applyCachedAppearance();
mount(App, { target: document.getElementById('app')! });
