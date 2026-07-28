import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [svelte()],

    define: {
        "process.env.NODE_ENV": JSON.stringify(mode),
    },

    build: {
        target: "esnext",

        modulePreload: {
            polyfill: false,
        },

        minify: "oxc",
        sourcemap: mode !== "production",
    },

    server: {
        proxy: {
            "/api": "http://localhost:36500",
        },
    },
}));
