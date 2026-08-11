import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH is set by CI so one source tree can ship to the GitHub Pages
// staging site ("/CHOMP/") and the Harvard production site ("/", the domain root).
const base = process.env.BASE_PATH ?? "/CHOMP/";

export default defineConfig({
    plugins: [react()],
    base,
});
