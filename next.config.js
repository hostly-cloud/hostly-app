/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.135"],
  transpilePackages: ["jwks-rsa", "jose"],
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
