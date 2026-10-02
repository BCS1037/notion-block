import en from "./lang/en";
import zh from "./lang/zh";
import zhTw from "./lang/zh-tw";
import { getLanguage } from "obsidian";

const localeMap: Record<string, Record<string, string>> = {
    en,
    zh,
    "zh-cn": zh,
    "zh-tw": zhTw,
    "zh-hk": zhTw
};

const getLocale = (): Record<string, string> => {
    const lang = getLanguage() || "en";
    return localeMap[lang] || localeMap[lang.split("-")[0]] || en;
};

export function t(key: string): string {
    const currentLocale = getLocale();
    return currentLocale[key] || en[key as keyof typeof en] || key;
}
