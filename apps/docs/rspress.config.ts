import { resolve } from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: resolve(import.meta.dirname, 'docs'),
  outDir: resolve(import.meta.dirname, 'doc_build'),
  base: process.env.DOCS_BASE ?? '/Form/',
  lang: 'zh',
  title: 'A3S Form',
  description: 'AI Native Form Designer 的中文产品与开发文档',
  logoText: 'A3S Form',
  globalStyles: resolve(import.meta.dirname, 'styles.css'),
  multiVersion: {
    default: 'v0.1.0',
    versions: ['v0.1.0', 'next'],
  },
  themeConfig: {
    darkMode: false,
    search: true,
    lastUpdated: true,
    editLink: {
      docRepoBaseUrl: 'https://github.com/A3S-Lab/Form/tree/main/apps/docs/docs',
      text: '在 GitHub 上编辑此页',
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/A3S-Lab/Form',
      },
    ],
    footer: {
      message: 'A3S Form · AI Native Form Designer',
    },
  },
});
