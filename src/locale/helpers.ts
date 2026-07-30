import { getLanguage } from "obsidian";
import en from "./lang/en";
import zh from "./lang/zh";
import zhTw from "./lang/zh-tw";

const localeMap: Record<string, Record<string, string>> = {
    en,
    zh,
    "zh-cn": zh,
    "zh-tw": zhTw,
    "zh-hk": zhTw
};

const getLocale = (): Record<string, string> => {
    const detectedLanguage = typeof getLanguage === "function"
        ? getLanguage()
        : window.localStorage?.getItem("language") || "en";
    const language = detectedLanguage.trim().toLowerCase();
    return localeMap[language] || localeMap[language.split("-")[0]] || en;
};

export function t(key: string): string {
    const currentLocale = getLocale();
    return currentLocale[key] || en[key as keyof typeof en] || key;
}
