const isProd = process.env.NODE_ENV === "production";

export const logger = {
  debug(message: string, ...args: unknown[]) {
    if (!isProd) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  info(message: string, ...args: unknown[]) {
    console.log(`[INFO] ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]) {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]) {
    console.error(`[ERROR] ${message}`, ...args);
  },
};
