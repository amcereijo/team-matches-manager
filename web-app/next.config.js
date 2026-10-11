/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = async () => {
  const withSerwist = (await import('@serwist/next')).default;
  return withSerwist({
    swSrc: 'src/app/sw.ts',
    swDest: 'public/sw.js',
    additionalPrecacheEntries: [
      { url: '/offline.html', revision: '1' },
      { url: '/login', revision: '1' },
    ],
  })(nextConfig);
};
