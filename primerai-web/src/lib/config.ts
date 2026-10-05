export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");

export const downloads = {
  android: process.env.NEXT_PUBLIC_DOWNLOAD_ANDROID ?? "",
  ios: process.env.NEXT_PUBLIC_DOWNLOAD_IOS ?? "",
  windows: process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS ?? "",
  macos: process.env.NEXT_PUBLIC_DOWNLOAD_MACOS ?? "",
  linux: process.env.NEXT_PUBLIC_DOWNLOAD_LINUX ?? "",
};
