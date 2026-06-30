import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function throw404OnError<T extends (...args: any[]) => any>(func: T): T {
	return ((...args: any[]) => {
		try {
			return func(...args);
		} catch {
			throw new Error("404 Not Found");
		}
	}) as T;
}

export function getInitials(name: string) {
	const parts = name.split(" ");
	const initials = parts.slice(0, 3).map((part) => part.charAt(0).toUpperCase());
	return initials.join("");
}
