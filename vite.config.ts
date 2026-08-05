import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH is set by CI so one source tree can ship to GitHub Pages
// ("/medicaid-dent-policy/") and to SHARE ("/", the domain root).
const base = process.env.BASE_PATH ?? "/medicaid-dent-policy/";

export default defineConfig({
    plugins: [react()],
    base,
});
