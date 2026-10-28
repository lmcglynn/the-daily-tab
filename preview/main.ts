import '@/styles/fonts.css';
import '@/styles/tokens.css';
import '@/styles/paper.css';
import { mount } from 'svelte';
import Preview from './Preview.svelte';

mount(Preview, { target: document.getElementById('app')! });
