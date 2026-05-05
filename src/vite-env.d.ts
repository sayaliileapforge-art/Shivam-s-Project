/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_BASE_URL?: string;
	readonly VITE_API_URL?: string;
	/** Separate origin for /uploads/ assets (e.g. http://72.62.241.170). Falls back to VITE_API_BASE_URL origin. */
	readonly VITE_UPLOADS_BASE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
