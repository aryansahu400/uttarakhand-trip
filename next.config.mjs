/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a production build run alongside `next dev` (NEXT_DIST_DIR=.next-build npm run build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverComponentsExternalPackages: ["@electric-sql/pglite"] },
};
export default nextConfig;
