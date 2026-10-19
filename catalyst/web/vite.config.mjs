import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('./',import.meta.url)),base:'./',plugins:[react()],resolve:{alias:{'cloudflare:workers':fileURLToPath(new URL('./runtime.ts',import.meta.url)),'next/headers':fileURLToPath(new URL('./headers.ts',import.meta.url))}},build:{target:'esnext',outDir:fileURLToPath(new URL('../hosted-client/',import.meta.url)),emptyOutDir:true}});
