import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    // Change this to your GitHub repo name when deploying
    // e.g. if your repo is github.com/yourname/dental-map
    // set base: '/dental-map/'
    base: "/medicaid-dent-policy/",
});
