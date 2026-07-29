import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [svelte()],

    resolve: {
        alias: {
            $lib: fileURLToPath(new URL("./frontend/lib", import.meta.url)),
            $components: fileURLToPath(
                new URL("./frontend/components", import.meta.url),
            ),
            $shared: fileURLToPath(new URL("./shared", import.meta.url)),
        },
    },

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
