import { resolve } from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: resolve(import.meta.dirname, 'docs'),
  outDir: resolve(import.meta.dirname, 'doc_build'),
  base: process.env.DOCS_BASE ?? '/Form/',
  lang: 'zh',
  title: 'A3S Form',
  description: 'A3S Form 产品与开发文档',
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
    nav: [
      { text: '使用指南', link: '/guide/' },
      {
        text: '在线 Playground',
        link: 'https://a3s-lab.github.io/Form/playground/',
      },
    ],
    sidebar: {
      '/': [
        { text: '概览', link: '/' },
        {
          text: '使用指南',
          link: '/guide/',
          collapsed: false,
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: 'Playground', link: '/guide/playground' },
            { text: '自定义表单节点', link: '/guide/custom-nodes' },
            { text: 'WASM 加速', link: '/guide/wasm' },
          ],
        },
        { text: '架构设计', link: '/architecture' },
      ],
      '/next/': [
        { text: '开发预览', link: '/next/' },
        { text: '开发指南', link: '/next/guide/' },
      ],
    },
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
      message: 'A3S Form · 浏览器表单基础设施',
    },
  },
});
