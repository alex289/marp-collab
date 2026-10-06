import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ScriptOnce } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	resolvedTheme: "dark" | "light";
	setTheme: (theme: Theme) => void;
};

function getThemeScript(storageKey: string, defaultTheme: Theme) {
	const key = JSON.stringify(storageKey);
	const fallback = JSON.stringify(defaultTheme);

	return `(function(){try{var t=localStorage.getItem(${key});if(t!=='light'&&t!=='dark'&&t!=='system'){t=${fallback}}var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`;
}

const ThemeProviderContext = createContext<ThemeProviderState>({
	theme: "system",
	resolvedTheme: "light",
	setTheme: () => {
		/* empty */
	},
});

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function isTheme(value: string | null): value is Theme {
	return value === "light" || value === "dark" || value === "system";
}

function subscribeToColorScheme(onChange: () => void) {
	const media = window.matchMedia(DARK_SCHEME_QUERY);
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

function getPrefersDark() {
	return window.matchMedia(DARK_SCHEME_QUERY).matches;
}

function applyTheme(resolved: "dark" | "light") {
	const root = document.documentElement;
	root.classList.remove("light", "dark");
	root.classList.add(resolved);
	root.style.colorScheme = resolved;
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "theme",
}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(() => {
		const stored = localStorage.getItem(storageKey);
		return isTheme(stored) ? stored : defaultTheme;
	});
	const prefersDark = useSyncExternalStore(subscribeToColorScheme, getPrefersDark);
	const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

	const setTheme = (next: Theme) => {
		localStorage.setItem(storageKey, next);
		setThemeState(next);
	};

	useHotkey("D", () => setTheme(theme === "dark" ? "light" : "dark"));

	useEffect(() => {
		applyTheme(resolvedTheme);
	}, [resolvedTheme]);

	return (
		<ThemeProviderContext value={{ theme, resolvedTheme, setTheme }}>
			<ScriptOnce>{getThemeScript(storageKey, defaultTheme)}</ScriptOnce>
			{children}
		</ThemeProviderContext>
	);
}

export function useTheme() {
	const context = useContext(ThemeProviderContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
