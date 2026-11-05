import { defineManifest } from "@crxjs/vite-plugin";

const prmOrigin = process.env.VITE_PRM_ORIGIN ?? "https://dydoprm.visionplus.com.tr/*";

export default defineManifest({
  manifest_version: 3,
  name: "PRM Assistant",
  description: "PRM siparişlerini güvenli biçimde izler ve teslimatçı atamalarına yardımcı olur.",
  version: "1.4.0",
  minimum_chrome_version: "116",
  permissions: ["storage", "unlimitedStorage", "notifications", "tabs", "tts", "offscreen", "alarms"],
  host_permissions: [prmOrigin, "https://web.whatsapp.com/*"],
  background: { service_worker: "src/background/background.ts", type: "module" },
  icons: {
    "16": "icon16.png",
    "32": "icon32.png",
    "48": "icon48.png",
    "128": "icon128.png",
  },
  action: {
    default_popup: "popup.html",
    default_title: "PRM Assistant",
    default_icon: { "16": "icon16.png", "32": "icon32.png", "48": "icon48.png" },
  },
  options_page: "options.html",
  content_scripts: [
    {
      matches: [prmOrigin],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://web.whatsapp.com/*"],
      js: ["src/whatsapp/index.ts"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    { resources: ["icon.svg"], matches: [prmOrigin] },
  ],
});
