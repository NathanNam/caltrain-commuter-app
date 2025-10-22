export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initOtel } = await import("./otel-server");
    initOtel();

    // Warm caches at startup for better performance
    try {
      console.log('Starting cache warming at application startup...');

      // Import and warm GTFS cache
      const { warmGTFSCache } = await import("./lib/gtfs-static");
      await warmGTFSCache();

      console.log('Cache warming completed successfully');
    } catch (error) {
      console.error('Cache warming failed:', error);
      // Don't fail startup if cache warming fails
    }
  }
}
