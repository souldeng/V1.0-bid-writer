/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14.x：serverExternalPackages 的正确位置在 experimental 下
  // 告知 webpack 不要打包这些 Node.js 原生依赖，由运行时直接 require
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', '@vercel/kv'],
  },
}
module.exports = nextConfig
