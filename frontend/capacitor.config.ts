import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sudhanshunaik.amrit',
  appName: 'Amrit',
  webDir: 'dist',
  server: {
    url: 'https://amrit.187.127.157.52.sslip.io',
    cleartext: false,
    allowNavigation: ['n8n.187.127.157.52.sslip.io']
  }
};

export default config;
