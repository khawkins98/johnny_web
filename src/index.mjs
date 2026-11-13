import '@fontsource/vt323';
// Both weights: 700 for headings, 400 for the island map's handwritten diary. With only the
// bold loaded, regular-weight text was drawn in bold too.
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import { runJohnnyCastaway } from './games/johnny/browser-app.mjs';
import { runLoadingScreen } from './games/johnny/ui/loading-screen.mjs';

// Before the app starts, so it sees the title screen (or the missing-data card) appear.
runLoadingScreen();
runJohnnyCastaway();
